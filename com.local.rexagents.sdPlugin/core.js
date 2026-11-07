'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path');
const P=require('./presets');
const REX='/Applications/Rex Beta.app/Contents/Helpers/Rex Server.rex/Contents/MacOS/rex';
function cli(args,input){return new Promise((resolve,reject)=>{
  const p=execFile(REX,['--autostart=false','--timeout','2s',...args],{timeout:3500,maxBuffer:2e6,env:{...process.env,REX_SESSION:'',REX_BLOCK:'',REX_CLIENT:''}},(e,out)=>{
    if(e)return reject(new Error('Rex command failed'));
    try{resolve(out.trim()?JSON.parse(out):null);}catch{resolve(out.trim());}
  }); if(input!==undefined)p.stdin.end(input);
});}
function activateRex(){return new Promise((resolve,reject)=>{
  execFile('/usr/bin/open',['-a','/Applications/Rex Beta.app'],{timeout:5000},e=>e?reject(new Error('Could not bring Rex to front')):resolve());
});}
function visiblePane(clientId){return new Promise((resolve,reject)=>{
  execFile(path.join(__dirname,'bin','visible-pane'),[REX,clientId],{timeout:4500,maxBuffer:2048},(e,out)=>{
    if(e)return reject(new Error('Visible pane query failed; no input sent'));
    try{const r=JSON.parse(out);if(!/^block:[0-9a-f-]{36}$/i.test(r.block_id)||r.clipboard_restored!==true)throw Error();resolve(r.block_id);}catch{reject(new Error('Invalid visible pane result'));}
  });
});}
function identify(p){
  const f=p.foreground;if(!f||f.user_id!==process.getuid())return null;
  const n=path.basename(f.path||'');const s=f.script||'';
  if(n==='codex')return {app:'codex',pid:f.pid,name:f.name,cwd:f.cwd};
  if(n==='claude'||(/\/claude\/versions\/\d+\.\d+\.\d+$/.test(f.path||'')&&(/^claude(?:-|$)/.test(f.name)||f.name===n)))return {app:'claude-code',pid:f.pid,name:f.name,cwd:f.cwd};
  if(['node','bun'].includes(n)&&/\/(?:@anthropic-ai\/claude-code\/cli\.js|@openai\/codex\/bin\/codex\.js)$/.test(s))return {app:s.includes('anthropic')?'claude-code':'codex',pid:f.pid,name:f.name,cwd:f.cwd};
  return null; // Never infer input safety from an ancestor or a status record.
}
function state(records,agent,now=Date.now(),maxAge=86400000){
  const valid=records.filter(r=>(r.effective_app||r.app)===agent.app&&r.owner?.pid===agent.pid&&r.owner?.name===agent.name&&Number.isFinite(Date.parse(r.updated_at))&&now-Date.parse(r.updated_at)<=maxAge&&Date.parse(r.updated_at)<=now+60000);
  const priority=['blocked','error','working','done','idle'];
  for(const s of priority){const r=valid.find(r=>r.state===s);if(r)return {state:s,kind:r.kind,statusAt:r.updated_at};}
  return {state:'unknown'};
}
const focusError=message=>Object.assign(Error(message),{code:'SELECTION_CHANGED'});
const token=t=>[t.session,t.block,t.app,t.pid,t.name].join('|');
class Bridge{
  constructor(config,run=cli,activate=activateRex,readVisible=visiblePane){this.config=config;this.run=run;this.activate=activate;this.readVisible=readVisible;this.slots=[];this.draft=null;this.claude=new(require('./claude-controls').ClaudeControls)(this);}
  async client(){
    const {clients=[]}=await this.run(['client','ls','--json']);
    const apps=clients.filter(c=>c.info?.kind==='app'&&c.info?.platform==='macos'&&c.info?.name==='Rex Beta'&&c.connection_state==='connected'&&(!this.config.clientLabel||c.info.label===this.config.clientLabel));
    if(apps.length!==1)throw new Error('Rex app ambiguous or offline');return apps[0];
  }
  method(t,m){return this.run(['block','call','-s',t.session,'-b',t.block,m]);}
  async agent(t){let p=await this.method(t,'process');if(!p||!Object.hasOwn(p,'foreground'))throw Error('Incomplete terminal process metadata');
    const processIdentity=require('./rex-process');
    if(processIdentity.candidate(p.foreground)){
      const before=p.foreground;let file;try{file=await (this.resolveExecutable||processIdentity.executable)(before.pid);}catch{return null;}
      const current=await this.method(t,'process');if(!processIdentity.sameForeground(before,current?.foreground))return null;
      p={...current,foreground:{...current.foreground,path:file}};
    }
    const a=identify(p);if(!a)return null;let status={state:'unknown'};try{status=state((await this.method(t,'program_status')).records||[],a,Date.now(),this.config.statusMaxAgeMs);}catch{}const agent={...t,...a,...status,project:path.basename(a.cwd||'')||a.app};return a.app==='claude-code'?this.claude.enrich(agent):agent;}
  async discover(){
    const client=await this.client(),listing=await this.run(['ls','--json']);const agents=[];
    if(!Array.isArray(listing?.sessions))throw Error('Incomplete Rex session list');
    for(const s of listing.sessions){if(typeof s.session_id!=='string')throw Error('Incomplete Rex session identity');const ins=await this.run(['session','inspect',s.session_id,'--json']);
     if(!Array.isArray(ins?.windows))throw Error('Incomplete Rex window list');
     for(const w of ins.windows){if(typeof w.window_id!=='string'||!Array.isArray(w.layers))throw Error('Incomplete Rex window');for(const l of w.layers){if(!Array.isArray(l.blocks))throw Error('Incomplete Rex layer');for(const b of l.blocks){
      if(b.creator_name!=='com.superlogical.terminal')continue;
      if(typeof b.block_id!=='string')throw Error('Incomplete Rex pane identity');
      const t={session:s.session_id,sessionLabel:s.label,window:w.window_id,block:b.block_id};
      const a=await this.agent(t);if(a)agents.push(a);
    }}}}
    // Keep slot identities stable, including closed-agent holes until restart.
    for(const a of agents)if(!this.slots.some(s=>s.block===a.block&&s.session===a.session))this.slots.push({session:a.session,block:a.block});
    this.agents=agents;this.lastClient=client;this.claude.prune(agents);if(this.lastTarget?.app==='claude-code'&&!agents.some(a=>require('./agent-labels').sameTarget(a,this.lastTarget))){this.lastTarget=null;this.draft=null;this.picker=null;this.selectionNotice=true;}return agents;
  }
  slotGaps(){return this.slots.filter(s=>!this.agents?.some(a=>a.session===s.session&&a.block===s.block)).length;}
  async collapse(){
    // Refresh first: an offline/partial discovery must never discard known slots.
    await this.discover();
    const removed=this.slotGaps();
    this.slots=this.slots.filter(s=>this.agents.some(a=>a.session===s.session&&a.block===s.block));
    // Keep the existing relative order, selected agent, draft and picker untouched.
    return{removed,label:removed?`${removed} gap${removed===1?'':'s'} removed`:'No gaps'};
  }
  async focused(){
    if(!this.config.allowClipboardFocus)throw new Error('Clipboard focus query not authorized; input disabled');
    const c=await this.client();
    const block=await this.readVisible(c.client_id);
    // Resolve the app-selected block across sessions, never session.active_window_id.
    const {sessions=[]}=await this.run(['ls','--json']);const matches=[];
    for(const session of sessions){const ins=await this.run(['session','inspect',session.session_id,'--json']);
      for(const w of ins.windows||[])for(const l of w.layers||[])for(const b of l.blocks||[])
        if(b.block_id===block&&b.creator_name==='com.superlogical.terminal')matches.push({session:session.session_id,window:w.window_id,block});
    }
    if(matches.length!==1)throw focusError('Visible pane is closed or ambiguous');
    const a=await this.agent(matches[0]);if(!a)throw focusError('Visible pane is not a supported agent');
    if(this.actionContext){
      require('./context-controls').assertContext(this.actionContext,a);
      if(this.actionContext.verifyChat){
        if(!this.actionContext.target.chatId)throw Error('Chat metadata loading; try again');
        if(a.app==='claude-code')this.claude.assert(this.actionContext.target,a);
        else if(await require('./daemon-controls').readFooter(this,a)!==this.actionContext.target.chatId)throw Error('Selected chat changed');
      }
    }
    this.lastTarget={session:a.session,block:a.block,pid:a.pid,app:a.app,name:a.name,...a.app==='claude-code'?{app:a.app,name:a.name,chatId:a.chatId,nativeIdentity:a.nativeIdentity}: {}};return a;
  }
  async contextPreflight(){return this.focused();}
  async withContext(context,action){
    if(this.actionContext)throw Error('Another action is in progress');this.actionContext=context;
    try{this.actionPreflight=await this.contextPreflight(context);return await action();}
    catch(error){if(error.code==='SELECTION_CHANGED'){this.lastTarget=null;this.draft=null;this.picker=null;this.selectionNotice=true;}throw error;}
    finally{this.actionContext=null;this.actionPreflight=null;}
  }
  async providerAgent(){if(this.actionPreflight?.app==='claude-code'){const agent=this.actionPreflight;this.actionPreflight=null;return agent;}return this.focused();}
  async checked(t,ready=false){const a=await this.focused();if(token(a)!==token(t))throw focusError('Focus or process changed');if(ready&&!['idle','done','error'].includes(a.state))throw new Error('Agent not ready for a prompt');return a;}
  async focus(t){
    const c=await this.client();const a=await this.agent(t);if(!a)throw new Error('Agent closed');if(t.pid!==undefined&&(t.pid!==a.pid||t.app&&t.app!==a.app||t.name&&t.name!==a.name))throw Error('Agent process changed');
    await this.run(['-C',c.client_id,'do','session.select',`session_id=${t.session}`,`window_id=${t.window}`]);
    await this.run(['focus','-s',t.session,t.block]);this.draft=null;this.picker=null;this.selectionNotice=false;
    this.lastTarget={session:a.session,block:a.block,pid:a.pid,app:a.app,name:a.name,...a.app==='claude-code'?{app:a.app,name:a.name,chatId:a.chatId,nativeIdentity:a.nativeIdentity}: {}};
    if(this.config.bringToFront!==false)await this.activate();
  }
  async navigate(delta){await this.discover();const a=await this.focused();const i=this.agents.findIndex(x=>token(x)===token(a));if(i<0||!this.agents.length)throw new Error('No agents');await this.focus(this.agents[(i+delta+this.agents.length)%this.agents.length]);}
  async stage(action){
    const a=await this.focused();if(a.app==='claude-code')return this.claude.stage(action);await this.checked(a,true);
    if(this.picker)throw new Error('Close the model picker first');
    if(this.draft)throw new Error('Draft already staged; review or cancel first');
    const text=action==='model'?'/model':action==='effort'?(a.app==='codex'?'/model':'/effort'):this.config.prompts[action];if(typeof text!=='string'||!text||/[\x00-\x1f\x7f]/.test(text)||text.length>4000)throw new Error('Invalid single-line prompt');
    const control=['model','effort'].includes(action),read=this.readStagedComposer||require('./native-input').readIdleComposer;
    if(!control&&/^\s*[!\/]/.test(text))throw Error('Prompt shortcuts require plain text');
    if(!control&&(a.app!=='codex'||!this.config.controlVerified?.codex))throw Error('Prompt controls verified for Codex only');
    const before=control?null:await read(this,a,{allowEmpty:true});
    const modes=await this.method(a,'modes');if(!modes.modes?.some(m=>m.number===2004&&m.set))throw new Error('Bracketed paste unavailable');
    await this.checked(a,true);
    // stdin keeps prompts out of process argument listings; no clipboard or logs.
    await this.run(['send','-s',a.session,'-b',a.block],`\x1b[200~${text}\x1b[201~`);
    let snapshot;
    if(!control){
      const deadline=Date.now()+1800;
      for(let attempt=0;attempt<5;attempt++){
        snapshot=await read(this,a,{allowEmpty:true});
        if(snapshot.chatId!==before.chatId||snapshot.turnStamp!==before.turnStamp)throw Error('Chat changed; review text in Rex');
        if(!snapshot.empty&&snapshot.hash!==before.hash)break;
        snapshot=null;if(Date.now()>=deadline)break;await new Promise(resolve=>setTimeout(resolve,60));
      }
      if(!snapshot)throw Error('Paste not confirmed; review text in Rex');
      await this.checked(a,true);
    }
    this.draft={target:a,at:Date.now(),action,...snapshot?{snapshot}:{}};return a;
  }
  async send(){
    if(this.draft?.target.app==='claude-code')return this.claude.send();
    if(this.picker)return this.applyPicker();
    const d=this.draft;if(!d||Date.now()-d.at>this.config.draftMaxAgeMs){this.draft=null;throw new Error('No recent staged draft');}
    await this.checked(d.target,true);
    const control=['model','effort'].includes(d.action);
    const key=control?'enter':this.config.sendKeys[d.target.app];if(!['tab','enter'].includes(key))throw new Error('Send binding unavailable');
    if(!control){
      try{
        if(!d.snapshot)throw Error('Draft not verified; use Rex');
        const {sameComposer,readIdleComposer}=require('./native-input'),read=this.readStagedComposer||readIdleComposer;
        const before=await read(this,d.target);await this.checked(d.target,true);const after=await read(this,d.target);
        if(before.empty||after.empty||!sameComposer(d.snapshot,before)||!sameComposer(before,after))throw Error('Draft changed; review in Rex');
        await this.checked(d.target,true);
      }catch(error){this.draft=null;throw error;}
    }
    // Consume before sending: a timeout must never trigger a duplicate retry.
    this.draft=null;
    await this.run(['send-key','-s',d.target.session,'-b',d.target.block,key]);
    if(control)this.picker={target:d.target,phase:d.target.app==='codex'?'model':d.action,at:Date.now()};
  }
  async pickerTarget(){
    const p=this.picker;if(!p||Date.now()-p.at>60000){this.picker=null;throw new Error('Picker expired; use the Rex keyboard');}
    try{await this.checked(p.target,true);}catch(e){this.picker=null;throw e;}p.at=Date.now();return p;
  }
  async pickerKey(p,key){await this.run(['send-key','-s',p.target.session,'-b',p.target.block,key]);}
  async cyclePicker(kind){
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
  async cycleControl(kind){
    if(!['model','effort','permissions'].includes(kind))throw new Error('Unsupported cycle');
    const a=await this.providerAgent();
    if(a.app==='claude-code'){if(kind==='permissions')throw Error('Use Claude keyboard for permission modes');return this.claude.cycle(kind,a);}
    if(a.app!=='codex'||!this.config.controlVerified?.codex)throw new Error('Cycle controls not verified for this agent');
    if(this.picker)throw new Error('Close the native picker first');
    if(kind==='effort'){if(!this.config.daemonControls?.enabled)throw Error('Effort daemon unavailable');return new (require('./daemon-controls').DaemonControls)(this).cycleEffort(a);}
    if(kind==='model'&&this.config.daemonControls?.enabled)return new (require('./daemon-controls').DaemonControls)(this).cycle(a);
    if(kind==='permissions'&&this.config.daemonControls?.enabled&&this.config.daemonControls.permissionsEnabled)return new (require('./daemon-controls').DaemonControls)(this).cyclePermissions(a);
    await this.checked(a,true);
    const file=path.join(__dirname,'state','native-presets.json');
    if(kind!=='permissions'&&this.config.modelDiscovery?.enabled)return new (require('./model-controls').ModelControls)(this).cycle(kind,a,file);
    let registry=P.readRegistry(file),record=registry.agents[token(a)];
    if(!record&&this.config.cycles?.autoSetupNewSessions){await new (require('./setup-presets').Setup)(this).configure(a,this.config.cycles,file);registry=P.readRegistry(file);record=registry.agents[token(a)];}
    if(!record||record.signature!==P.signature(this.config.cycles))throw new Error('Native presets need setup in this session');
    const entries=record.entries.filter(e=>e.kind===kind);if(!entries.length)throw new Error('No cycle entries');P.validateOnDisk(entries);
    const i=(record.indices[kind]||0)%entries.length,entry=entries[i];await this.checked(a,true);
    await this.run(['send-key','-s',a.session,'-b',a.block,'ctrl+x','p',entry.slot]);
    record.indices[kind]=(i+1)%entries.length;P.saveRegistry(file,registry);return {kind,label:entry.label};
  }
  async adjustEffort(direction){
    if(!['increase','decrease'].includes(direction))throw new Error('Unsupported effort direction');
    const a=await this.focused();
    if(a.app!=='codex'||!this.config.controlVerified?.codex)throw new Error('Effort shortcuts not verified for this agent');
    if(this.picker)throw new Error('Close the native picker first');
    const key=this.config.effortKeys?.[direction];
    if(!['shift+up','shift+down','alt+.','alt+,'].includes(key))throw new Error('Effort shortcut unavailable');
    await this.checked(a,true);
    await this.run(['send-key','-s',a.session,'-b',a.block,key]);
    return {kind:'effort',label:direction==='increase'?'Increase sent':'Decrease sent'};
  }
  async togglePlan(){
    const a=await this.focused();await this.checked(a,true);
    if(a.app!=='codex'||!this.config.controlVerified?.codex)throw new Error('Plan toggle not verified for this agent');
    if(this.picker)throw new Error('Close the native picker first');
    this.lastModeRequest={...a,at:Date.now()};
    await this.run(['send-key','-s',a.session,'-b',a.block,'shift+tab']);return {kind:'plan',label:'Toggle sent'};
  }
  async applyPicker(){
    const p=await this.pickerTarget();
    if(p.target.app==='codex'&&p.phase==='model'){await this.pickerKey(p,'enter');p.phase='effort';return;}
    this.picker=null;await this.pickerKey(p,'s'); // Native session-only apply, never permission approval.
  }
  async cancelPicker(){const p=await this.pickerTarget();await this.pickerKey(p,'escape');if(p.target.app==='codex'&&p.phase==='effort')p.phase='model';else this.picker=null;}
  async interrupt(){const a=await this.focused();if(a.app==='claude-code')return this.claude.interrupt();if(a.state!=='working')throw new Error('Interrupt only while working');if(a.app==='codex')await (this.verifyRunning?this.verifyRunning(a):new(require('./background-controls').BackgroundControls)(this).running(a));const current=await this.checked(a);if(current.state!=='working')throw Error('Run ended; no interrupt sent');this.draft=null;await this.run(['send-key','-s',a.session,'-b',a.block,'escape']);}
  async stopTerminals(){const a=await this.focused(),target=this.actionContext?.target;if(!target||!require('./context-controls').isBackground(target))throw Error('Select the background-terminal control');await this.checked(a);return new(require('./background-controls').BackgroundControls)(this).stop(target);}
  async menu(key){if(!['up','down','left','right','escape'].includes(key))throw new Error('Unsupported menu key');const a=await this.focused();if(a.state!=='blocked')throw new Error('No native waiting menu');await this.checked(a);this.draft=null;await this.run(['send-key','-s',a.session,'-b',a.block,key]);}
  async questionKey(key){
    if(!['up','down','left','right','escape','tab','shift+tab','enter','space'].includes(key))throw Error('Unsupported question key');
    const waiting=a=>a.app==='codex'&&this.config.controlVerified?.codex&&a.state==='blocked'&&a.kind==='question';
    const agent=await this.providerAgent();if(agent.app==='claude-code')return this.claude.waiting(key,'question',agent);if(key==='space')throw Error('Space is a Claude multi-select control');if(!waiting(agent))throw Error('No native question waiting');
    const current=await this.checked(agent);if(!waiting(current))throw Error('Question changed; no input sent');
    // Only explicit user presses reach a native question. Never a composer or approval.
    await this.run(['send-key','-s',current.session,'-b',current.block,key]);
  }
  async approvalKey(key){
    if(!['up','down','enter','escape'].includes(key))throw Error('Unsupported approval key');
    const waiting=a=>a.app==='codex'&&this.config.controlVerified?.codex&&a.state==='blocked'&&a.kind==='permission';
    const agent=await this.providerAgent();if(agent.app==='claude-code')return this.claude.waiting(key,'permission',agent);if(!waiting(agent))throw Error('No native approval waiting');
    const read=this.readRequest||require('./native-input').requestSnapshot;
    const before=await read(this,agent),current=await this.checked(agent);
    if(!waiting(current)||agent.statusAt!==current.statusAt||!agent.statusAt)throw Error('Approval request changed');
    if(await read(this,current)!==before)throw Error('Approval view changed; press again');
    await this.run(['send-key','-s',current.session,'-b',current.block,key]);
  }
  async submitRunning(kind){
    if(!['steer','queue'].includes(kind))throw Error('Unsupported running action');
    const running=a=>a.app==='codex'&&this.config.controlVerified?.codex&&a.state==='working';
    const agent=await this.focused();if(agent.app==='claude-code')return this.claude.running(kind);if(!running(agent))throw Error('Agent is not running');
    const read=this.readComposer||require('./native-input').readComposer,before=await read(this,agent),current=await this.checked(agent);
    if(!running(current))throw Error('Run ended; no input sent');
    const after=await read(this,current);
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Typed message changed; press again');
    const identity=token(current)+'|'+before.chatId+'|'+before.hash;
    if(this.submittedInput?.identity===identity&&Date.now()-this.submittedInput.at<10000)throw Error('Already submitted; check Codex');
    this.submittedInput={identity,at:Date.now()};this.draft=null;
    await this.run(['send-key','-s',current.session,'-b',current.block,kind==='steer'?'enter':'tab']);
    return{kind,label:kind==='steer'?'Steer sent':'Message queued'};
  }
  async zoom(){const a=await this.focused();await this.checked(a);await this.run(['zoom','-s',a.session,a.block]);}
}
module.exports={Bridge,identify,state,token,cli};
