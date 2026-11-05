'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path');
const REX='/Applications/Rex Beta.app/Contents/Helpers/Rex Server.rex/Contents/MacOS/rex';
function cli(args,input){return new Promise((resolve,reject)=>{
  const p=execFile(REX,['--autostart=false','--timeout','2s',...args],{timeout:3500,maxBuffer:2e6,env:{...process.env,REX_SESSION:'',REX_BLOCK:'',REX_CLIENT:''}},(e,out)=>{
    if(e)return reject(new Error('Rex command failed'));
    try{resolve(out.trim()?JSON.parse(out):null);}catch{resolve(out.trim());}
  }); if(input!==undefined)p.stdin.end(input);
});}
function identify(p){
  const f=p.foreground;if(!f||f.user_id!==process.getuid())return null;
  const n=path.basename(f.path||'');const s=f.script||'';
  if(n==='codex')return {app:'codex',pid:f.pid,name:f.name,cwd:f.cwd};
  if(n==='claude'||(/^claude(?:-|$)/.test(f.name)&&/\/claude\/versions\//.test(f.path||'')))return {app:'claude-code',pid:f.pid,name:f.name,cwd:f.cwd};
  if(['node','bun'].includes(n)&&/\/(?:@anthropic-ai\/claude-code\/cli\.js|@openai\/codex\/bin\/codex\.js)$/.test(s))return {app:s.includes('anthropic')?'claude-code':'codex',pid:f.pid,name:f.name,cwd:f.cwd};
  return null; // Never infer input safety from an ancestor or a status record.
}
function state(records,agent,now=Date.now(),maxAge=86400000){
  const valid=records.filter(r=>(r.effective_app||r.app)===agent.app&&r.owner?.pid===agent.pid&&r.owner?.name===agent.name&&Number.isFinite(Date.parse(r.updated_at))&&now-Date.parse(r.updated_at)<=maxAge&&Date.parse(r.updated_at)<=now+60000);
  const priority=['blocked','error','working','done','idle'];
  for(const s of priority){const r=valid.find(r=>r.state===s);if(r)return {state:s,kind:r.kind};}
  return {state:'unknown'};
}
const token=t=>[t.session,t.block,t.app,t.pid,t.name].join('|');
class Bridge{
  constructor(config,run=cli){this.config=config;this.run=run;this.slots=[];this.draft=null;}
  async client(){
    const {clients=[]}=await this.run(['client','ls','--json']);
    const apps=clients.filter(c=>c.info?.kind==='app'&&c.info?.platform==='macos'&&c.info?.name==='Rex Beta'&&c.connection_state==='connected'&&(!this.config.clientLabel||c.info.label===this.config.clientLabel));
    if(apps.length!==1)throw new Error('Rex app ambiguous or offline');return apps[0];
  }
  method(t,m){return this.run(['block','call','-s',t.session,'-b',t.block,m]);}
  async agent(t){const p=await this.method(t,'process');const a=identify(p);if(!a)return null;let status={state:'unknown'};try{status=state((await this.method(t,'program_status')).records||[],a,Date.now(),this.config.statusMaxAgeMs);}catch{}return {...t,...a,...status,project:path.basename(a.cwd||'')||a.app};}
  async discover(){
    const client=await this.client();const {sessions=[]}=await this.run(['ls','--json']);const agents=[];
    for(const s of sessions){const ins=await this.run(['session','inspect',s.session_id,'--json']);for(const w of ins.windows||[])for(const l of w.layers||[])for(const b of l.blocks||[]){
      if(b.creator_name!=='com.superlogical.terminal')continue;
      const t={session:s.session_id,sessionLabel:s.label,window:w.window_id,block:b.block_id};
      const a=await this.agent(t);if(a)agents.push(a);
    }}
    // Keep slot identities stable, including closed-agent holes until restart.
    for(const a of agents)if(!this.slots.some(s=>s.block===a.block&&s.session===a.session))this.slots.push({session:a.session,block:a.block});
    this.agents=agents;this.lastClient=client;return agents;
  }
  async focused(){
    if(!this.config.focusRoutingVerified)throw new Error('Visible Rex focus is not verified; input disabled');
    const c=await this.client();
    // This Rex version exposes attachments, not the client's selected session.
    // Never guess when several sessions are attached.
    if(c.session_ids?.length!==1)throw new Error('Multiple sessions: select one Rex session / detach others');
    const session=c.session_ids[0];const ins=await this.run(['session','inspect',session,'--json']);
    const w=ins.windows.find(w=>w.window_id===ins.active_window_id);
    if(!w?.focused_block_id)throw new Error('No focused Rex pane');
    const a=await this.agent({session,window:w.window_id,block:w.focused_block_id});
    if(!a)throw new Error('Focused pane is not an agent');return a;
  }
  async checked(t,ready=false){const a=await this.focused();if(token(a)!==token(t))throw new Error('Focus or process changed');if(ready&&!['idle','done','error'].includes(a.state))throw new Error('Agent not ready for a prompt');return a;}
  async focus(t){
    const c=await this.client();const a=await this.agent(t);if(!a)throw new Error('Agent closed');
    await this.run(['-C',c.client_id,'do','session.select',`session_id=${t.session}`,`window_id=${t.window}`]);
    await this.run(['focus','-s',t.session,t.block]);this.draft=null;this.picker=null;
  }
  async navigate(delta){await this.discover();const a=await this.focused();const i=this.agents.findIndex(x=>token(x)===token(a));if(i<0||!this.agents.length)throw new Error('No agents');await this.focus(this.agents[(i+delta+this.agents.length)%this.agents.length]);}
  async stage(action){
    const a=await this.focused();await this.checked(a,true);
    if(this.picker)throw new Error('Close the model picker first');
    if(this.draft)throw new Error('Draft already staged; review or cancel first');
    const text=action==='model'?'/model':action==='effort'?(a.app==='codex'?'/model':'/effort'):this.config.prompts[action];if(typeof text!=='string'||!text||/[\x00-\x1f\x7f]/.test(text)||text.length>4000)throw new Error('Invalid single-line prompt');
    const modes=await this.method(a,'modes');if(!modes.modes?.some(m=>m.number===2004&&m.set))throw new Error('Bracketed paste unavailable');
    await this.checked(a,true);
    // stdin keeps prompts out of process argument listings; no clipboard or logs.
    await this.run(['send','-s',a.session,'-b',a.block],`\x1b[200~${text}\x1b[201~`);
    this.draft={target:a,at:Date.now(),action};return a;
  }
  async send(){
    if(this.picker)return this.applyPicker();
    const d=this.draft;if(!d||Date.now()-d.at>this.config.draftMaxAgeMs){this.draft=null;throw new Error('No recent staged draft');}
    await this.checked(d.target,true);
    // Consume before sending: a timeout must never trigger a duplicate retry.
    this.draft=null;
    const control=['model','effort'].includes(d.action);
    const key=control?'enter':this.config.sendKeys[d.target.app];if(!['tab','enter'].includes(key))throw new Error('Send binding unavailable');
    await this.run(['send-key','-s',d.target.session,'-b',d.target.block,key]);
    if(control)this.picker={target:d.target,phase:d.target.app==='codex'?'model':d.action,at:Date.now()};
  }
  async pickerTarget(){
    const p=this.picker;if(!p||Date.now()-p.at>60000){this.picker=null;throw new Error('Picker expired; use the Rex keyboard');}
    try{await this.checked(p.target,true);}catch(e){this.picker=null;throw e;}p.at=Date.now();return p;
  }
  async pickerKey(p,key){await this.run(['send-key','-s',p.target.session,'-b',p.target.block,key]);}
  async cycleControl(kind){
    const a=await this.focused();
    if(!this.config.controlVerified?.[a.app])throw new Error('Verify model controls on this agent first');
    if(!this.picker){await this.stage(kind);return;}
    const p=await this.pickerTarget();
    if(p.target.app==='codex'){
      if(kind==='model'&&p.phase==='effort'){await this.pickerKey(p,'escape');p.phase='model';}
      if(kind==='effort'&&p.phase==='model'){await this.pickerKey(p,'enter');p.phase='effort';return;}
      await this.pickerKey(p,'down');
    }else await this.pickerKey(p,kind==='effort'?'right':'down');
  }
  async applyPicker(){
    const p=await this.pickerTarget();
    if(p.target.app==='codex'&&p.phase==='model'){await this.pickerKey(p,'enter');p.phase='effort';return;}
    this.picker=null;await this.pickerKey(p,'s'); // Native session-only apply, never permission approval.
  }
  async cancelPicker(){const p=await this.pickerTarget();await this.pickerKey(p,'escape');if(p.target.app==='codex'&&p.phase==='effort')p.phase='model';else this.picker=null;}
  async interrupt(){const a=await this.focused();if(a.state!=='working')throw new Error('Interrupt only while working');await this.checked(a);this.draft=null;await this.run(['send-key','-s',a.session,'-b',a.block,'escape']);}
  async menu(key){if(!['up','down','left','right','escape'].includes(key))throw new Error('Unsupported menu key');const a=await this.focused();if(a.state!=='blocked')throw new Error('No native waiting menu');await this.checked(a);this.draft=null;await this.run(['send-key','-s',a.session,'-b',a.block,key]);}
  async zoom(){const a=await this.focused();await this.checked(a);await this.run(['zoom','-s',a.session,a.block]);}
}
module.exports={Bridge,identify,state,token,cli};
