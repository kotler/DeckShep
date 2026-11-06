'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const {Bridge}=require('./core'),C=require('./context-controls'),D=require('./daemon-controls'),{latestTurn,backgroundState}=require('./background-controls'),{HerdrRpc,paneId}=require('./herdr-rpc');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const changed=()=>Object.assign(Error('Reselect agent on deck'),{code:'SELECTION_CHANGED'});
const isFocused=(s,a)=>a?.serverFocused===true&&s.focused_pane_id===a.block&&s.focused_tab_id===a.window&&s.focused_workspace_id===a.workspaceId;
const target=a=>Object.fromEntries(['session','window','block','app','pid','name','terminalId'].map(k=>[k,a[k]]));
function ownProcess(pid){return new Promise((resolve,reject)=>execFile('/bin/ps',['-p',String(pid),'-o','uid='],{timeout:1500,maxBuffer:256},(error,out)=>{if(error||!/^\d+$/.test(out.trim()))reject(Error('Herdr foreground owner unavailable'));else resolve(out.trim()===String(process.getuid()));}));}
function nativeReference(info){const ref=info.agent_session;return info.agent==='codex'&&ref?.source==='herdr:codex'&&ref.agent==='codex'&&ref.kind==='id'&&uuid(ref.value)?ref.value.toLowerCase():null;}
function foreground(info,processInfo){
 if(processInfo?.pane_id!==info.pane_id||!Array.isArray(processInfo.foreground_processes))throw Error('Herdr foreground metadata incomplete');
 const candidates=processInfo.foreground_processes.filter(p=>{
  const name=path.basename(p.name||'');
  return info.agent==='codex'?name==='codex':info.agent==='claude'?name==='claude'||/^claude-/.test(name):name===info.agent;
 });
 if(candidates.length>1)throw Error('Herdr foreground process is ambiguous');if(!candidates.length)return null;const p=candidates[0];
 if(!Number.isSafeInteger(p.pid)||p.pid<=0||typeof p.name!=='string')throw Error('Herdr process identity unavailable');
 const cwd=p.cwd||info.foreground_cwd;
 if(typeof cwd!=='string'||!path.isAbsolute(cwd))throw Error('Herdr foreground directory unavailable');
 return{pid:p.pid,name:p.name,cwd};
}
async function nativeState(agent){
 if(!agent.herdrChatId)return null;
 const e=await D.socketFor(agent.pid),rpc=new D.DaemonRpc(e.socket);
 try{await rpc.connect();const t=(await rpc.request('thread/read',{threadId:agent.herdrChatId,includeTurns:false}))?.thread;
  if(t?.id!==agent.herdrChatId||t.cwd!==agent.cwd)throw Error('Herdr and Codex chat identity differ');
  if(!['idle','active','systemError'].includes(t.status?.type))throw Error('Codex chat unavailable');
  const status={...t.status};
  if(t.status.type==='idle'||t.status.type==='active'&&Array.isArray(t.status.activeFlags)&&t.status.activeFlags.length===0)try{const turn=await latestTurn(rpc,agent.herdrChatId);if(turn.status==='inProgress')status.runId=turn.id;else Object.assign(status,await backgroundState(rpc,agent.herdrChatId,t,turn)||{});}catch{}
  return status;
 }finally{rpc.close();}
}
function validateInfo(info){
 if(!info||!paneId(info.pane_id)||typeof info.terminal_id!=='string'||!info.terminal_id||typeof info.workspace_id!=='string'||typeof info.tab_id!=='string'||typeof info.focused!=='boolean'||!Number.isSafeInteger(info.revision)||(info.agent!=null&&(typeof info.agent!=='string'||!/^[-a-z0-9_]{1,64}$/.test(info.agent)))||!['idle','working','blocked','done','unknown'].includes(info.agent_status))throw Error('Herdr agent metadata incomplete');
 return info;
}
class HerdrBridge extends Bridge{
 constructor(config,deps={}){
  super(config);this.backend='herdr';this.composerSupported=false;
  this.connect=deps.connect||(()=>new HerdrRpc(this.config.herdr?.socketPath||'').connect());this.owner=deps.owner||ownProcess;this.nativeState=deps.nativeState||nativeState;
  this.run=this.translate.bind(this);this.readRequest=async(_bridge,a)=>this.requestHash(a);
 }
 async use(callback){const rpc=await this.connect();try{return await callback(rpc);}finally{rpc.close();}}
 async snapshot(rpc){const response=await rpc.request('session.snapshot',{}),s=response?.snapshot;
  if(response?.type!=='session_snapshot'||s?.protocol!==22||!/^0\.9\.5(?:[-+].*)?$/.test(s.version||'')||!['agents','panes','tabs','workspaces','layouts'].every(k=>Array.isArray(s[k])))throw Error('Herdr snapshot incomplete or unsupported');return s;
 }
 async readAgent(rpc,pane,initial){
  const info=validateInfo(initial||(await rpc.request('agent.get',{target:pane}))?.agent);
  if(info.pane_id!==pane)throw changed();if(info.agent==null)return null;
  const processInfo=(await rpc.request('pane.process_info',{pane_id:pane}))?.process_info,p=foreground(info,processInfo);if(!p||!await this.owner(p.pid))return null;
  const paneInfo=(await rpc.request('pane.get',{pane_id:pane}))?.pane;
  if(paneInfo?.pane_id!==pane||paneInfo.terminal_id!==info.terminal_id||paneInfo.tab_id!==info.tab_id||paneInfo.workspace_id!==info.workspace_id)throw changed();
  const a={backend:'herdr',session:rpc.endpoint.scope,window:info.tab_id,block:pane,terminalId:info.terminal_id,workspaceId:info.workspace_id,...p,app:info.agent==='claude'?'claude-code':info.agent,state:info.agent_status,statusAt:String(info.state_change_seq??0)+':'+info.revision,project:path.basename(p.cwd),chatName:info.title||info.terminal_title_stripped||info.name||'Untitled agent',herdrChatId:nativeReference(info),composerSupported:false,serverFocused:info.focused===true&&paneInfo.focused===true,atBottom:paneInfo.scroll?.offset_from_bottom===0};
  if(a.herdrChatId)a.chatId=a.herdrChatId;
  if(a.app==='codex'){
   let status;try{status=a.herdrChatId?await this.nativeState(a):null;}catch{status=null;}
   a.nativeVerified=!!status;
   if(status?.type==='active'){
    const flags=status.activeFlags;
    if(!Array.isArray(flags)||flags.some(f=>!['waitingOnApproval','waitingOnUserInput'].includes(f))||flags.length>1){a.state='unknown';}
    else if(flags.length){a.state='blocked';a.kind=flags[0]==='waitingOnApproval'?'permission':'question';}
    else a.state='working';
   }else if(status?.type==='systemError')a.state='error';
   else if(status?.type==='idle')a.state=a.state==='done'?'done':'idle';
   if(status?.runId)a.runId=status.runId;
   if(status?.backgroundOnly&&Array.isArray(status.backgroundIds)&&status.backgroundIds.length&&status.backgroundTurnId){a.state='working';a.backgroundOnly=true;a.backgroundIds=[...status.backgroundIds];a.backgroundTurnId=status.backgroundTurnId;a.activityStatusAt=a.statusAt;}
  }
  return a;
 }
 async agent(t){return this.use(async rpc=>{if(t.session&&t.session!==rpc.endpoint.scope)throw changed();const a=await this.readAgent(rpc,t.block);if(t.terminalId&&a?.terminalId!==t.terminalId)throw changed();return a;});}
 async discover(){
  const agents=await this.use(async rpc=>{const s=await this.snapshot(rpc),paneIds=s.panes.map(p=>p.pane_id),seen=new Set();
   if(new Set(paneIds).size!==paneIds.length)throw Error('Duplicate Herdr panes');
   const ordered=[];
   for(const w of [...s.workspaces].sort((a,b)=>a.number-b.number))for(const tab of s.tabs.filter(t=>t.workspace_id===w.workspace_id).sort((a,b)=>a.number-b.number)){
    const layout=s.layouts.find(l=>l.tab_id===tab.tab_id);if(!layout||!Array.isArray(layout.panes))throw Error('Herdr layout incomplete');
    for(const p of layout.panes){if(seen.has(p.pane_id)||!paneIds.includes(p.pane_id))throw Error('Herdr topology incomplete');seen.add(p.pane_id);const info=s.agents.find(a=>a.pane_id===p.pane_id);if(info){if(info.tab_id!==tab.tab_id||info.workspace_id!==w.workspace_id)throw Error('Herdr agent location changed');const a=await this.readAgent(rpc,p.pane_id,info);if(a)ordered.push(a);}}
   }
   if(s.agents.some(a=>!seen.has(a.pane_id))||new Set(s.agents.map(a=>a.pane_id)).size!==s.agents.length)throw Error('Herdr agent list incomplete');return ordered;
  });
  for(const a of agents)if(!this.slots.some(s=>s.session===a.session&&s.block===a.block))this.slots.push({session:a.session,block:a.block});
  this.agents=agents;
  if(this.lastTarget&&!agents.some(a=>C.actor(a)===C.actor(this.lastTarget))){this.lastTarget=null;this.selectionNotice=true;this.draft=null;}
  return agents;
 }
 async focused(){return this.use(async rpc=>{const s=await this.snapshot(rpc);if(!paneId(s.focused_pane_id))throw changed();const a=await this.readAgent(rpc,s.focused_pane_id);if(!a||!isFocused(s,a))throw changed();
  if(this.actionContext){C.assertContext(this.actionContext,a);if(this.actionContext.verifyChat&&(!a.herdrChatId||a.herdrChatId!==this.actionContext.target.chatId))throw Error('Selected chat changed');}
  this.lastTarget=target(a);this.lastChecked=a;return a;
 });}
 async checked(t,ready=false){const a=await this.focused();if(C.actor(a)!==C.actor(t))throw changed();if(ready&&!['idle','done','error'].includes(a.state))throw Error('Agent not ready');return a;}
 async focus(t){return this.use(async rpc=>{if(t.session!==rpc.endpoint.scope)throw changed();const a=await this.readAgent(rpc,t.block);if(!a||C.actor(a)!==C.actor(t))throw changed();await rpc.request('agent.focus',{target:a.block});const s=await this.snapshot(rpc);if(s.focused_pane_id!==a.block)throw Error('Herdr focus unconfirmed');const confirmed=await this.readAgent(rpc,a.block);if(C.actor(a)!==C.actor(confirmed)||!isFocused(s,confirmed))throw changed();this.lastTarget=target(confirmed);this.lastChecked=confirmed;this.draft=null;this.picker=null;this.selectionNotice=false;});}
 async nativeChatId(t){const a=await this.agent(t);if(!a||C.actor(a)!==C.actor(t)||!a.herdrChatId)throw Error('Herdr Codex session ID unavailable; enable its integration');return a.herdrChatId;}
 async readView(rpc,a,format='ansi'){
  const result=await rpc.request('agent.read',{target:a.block,source:'visible',format,strip_ansi:format==='text'}),r=result?.read;
  if(result?.type!=='pane_read'||r?.pane_id!==a.block||r.workspace_id!==a.workspaceId||r.tab_id!==a.window||r.source!=='visible'||r.format!==format||r.truncated!==false||typeof r.text!=='string'||!r.text||Buffer.byteLength(r.text)>960000)throw Error('Herdr viewport incomplete');return r.text;
 }
 async requestHash(t){return this.use(async rpc=>{const a=await this.readAgent(rpc,t.block);if(!a||C.actor(a)!==C.actor(t)||!a.atBottom||a.state!=='blocked'||!a.nativeVerified)throw Error('Native waiting UI unavailable');return crypto.createHash('sha256').update(await this.readView(rpc,a)).digest('hex');});}
 async translate(args){
  if(args[0]!=='send-key'||args.length!==6||args[1]!=='-s'||args[3]!=='-b')throw Error('Herdr does not expose a verified composer cursor; use its keyboard');
  const key=args[5]==='escape'?'esc':args[5],expected=this.actionContext?.target||this.lastChecked;
  return this.use(async rpc=>{if(!expected||args[2]!==rpc.endpoint.scope||args[4]!==expected.block)throw changed();const s=await this.snapshot(rpc);if(s.focused_pane_id!==expected.block)throw changed();const a=await this.readAgent(rpc,expected.block);if(!a||C.actor(a)!==C.actor(expected)||!isFocused(s,a))throw changed();if(!a.nativeVerified)throw Error('Codex state unavailable');if(!a.atBottom)throw Error('Scroll the Herdr pane to bottom');if(this.actionContext)C.assertContext(this.actionContext,a);
   const allowed=a.state==='blocked'?(a.kind==='permission'?['up','down','enter','esc']:a.kind==='question'?['up','down','left','right','enter','esc','tab','shift+tab']:[]):a.state==='working'?['esc']:['idle','done','error'].includes(a.state)?['shift+tab']:[];
   if(!allowed.includes(key))throw Error('Native control does not match the Herdr agent state');
   await rpc.request('agent.send_keys',{target:a.block,keys:[key]});
  });
 }
 async zoom(){const a=await this.focused();await this.checked(a);return this.use(async rpc=>{const current=await this.readAgent(rpc,a.block),s=await this.snapshot(rpc);if(!current||C.actor(current)!==C.actor(a)||!isFocused(s,current))throw changed();const r=await rpc.request('pane.zoom',{pane_id:a.block,mode:'toggle'});if(r?.type!=='pane_zoom'||r.zoom?.pane_id!==a.block)throw Error('Herdr zoom unconfirmed');});}
 async cycleControl(kind){if(!this.config.daemonControls?.enabled||kind==='permissions'&&!this.config.daemonControls.permissionsEnabled)throw Error('Herdr requires native daemon controls');return super.cycleControl(kind);}
 async stage(){throw Error('Use the Herdr keyboard; verified draft cursor unavailable');}
 async send(){throw Error('Use the Herdr keyboard; verified draft cursor unavailable');}
 async submitRunning(){throw Error('Herdr Steer/Queue need a verified composer cursor');}
 async adjustEffort(){throw Error('Use the cycling native Effort control');}
}
module.exports={HerdrBridge,foreground,nativeReference,validateInfo,nativeState};
