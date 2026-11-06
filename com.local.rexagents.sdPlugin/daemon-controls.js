'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {execFile}=require('node:child_process');
const {isDeepStrictEqual}=require('node:util');
const WebSocket=require('ws');
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const permissionVersionVerified=version=>['0.166.0','0.167.0'].includes(version);

function socketFromListing(listing,pid){
 const rows=listing.split('\n').map(line=>{
  const m=/^codex\s+(\d+)\s+\S+\s+\S+\s+unix\s+(0x[0-9a-f]+)\s+\S+\s+(.+)$/.exec(line);
  return m?{pid:Number(m[1]),address:m[2],name:m[3].trim()}:null;
 }).filter(Boolean);
 const peers=new Set(rows.filter(r=>r.pid===pid&&/^->0x[0-9a-f]+$/.test(r.name)).map(r=>r.name.slice(2)));
 const found=rows.filter(r=>peers.has(r.address)&&path.isAbsolute(r.name));
 const unique=[...new Map(found.map(r=>[r.pid+'|'+r.name,{pid:r.pid,socket:r.name}])).values()];
 if(unique.length!==1)throw Error('CLI daemon connection unavailable or ambiguous');
 return unique[0];
}
function safeSocket(file){
 const uid=process.getuid(),parent=fs.lstatSync(path.dirname(file)),socket=fs.lstatSync(file);
 if(!parent.isDirectory()||parent.uid!==uid||(parent.mode&0o022)||!socket.isSocket()||socket.uid!==uid||(socket.mode&0o077))throw Error('Unsafe CLI daemon socket');
}
async function socketFor(pid){
 const listing=await new Promise((resolve,reject)=>execFile('/usr/sbin/lsof',['-n','-a','-U','-u',String(process.getuid())],{timeout:4000,maxBuffer:4e6},(error,out)=>error?reject(Error('Cannot inspect CLI daemon connection')):resolve(out)));
 const endpoint=socketFromListing(listing,pid);safeSocket(endpoint.socket);return endpoint;
}
function footerId(view,cursorRow){
 const lines=view.split('\n'),nonempty=lines.map((text,index)=>({text,row:index+1})).filter(l=>l.text.trim());
 // Codex may render shortcut hints below its footer. Inspect only the final two rendered lines,
 // below the input cursor, rather than searching the composer or historical transcript for UUIDs.
 const candidates=nonempty.slice(-2).map(l=>({row:l.row,match:new RegExp('^\\s{0,4}('+UUID+')\\s*·\\s*(?:GPT-|gpt-).*$','i').exec(l.text)})).filter(l=>l.match);
 if(candidates.length!==1||!Number.isInteger(cursorRow)||candidates[0].row<cursorRow+2)throw Error('Session-ID footer missing; run daemon setup');
 return candidates[0].match[1].toLowerCase();
}
async function readFooter(bridge,agent){
 if(bridge.backend==='herdr')return bridge.nativeChatId(agent);
 const args=['block','call','-s',agent.session,'-b',agent.block,'format',JSON.stringify({format:'vt',extra_cursor:true,max_bytes:960000})];
 const deadline=Date.now()+4000;
 for(let attempt=0;attempt<40;attempt++){
  const before=await bridge.run(args);
  if(before?.id||typeof before?.content!=='string')throw Error('Terminal metadata incomplete');
  const cursor=/\x1b\[(\d+);(\d+)H$/.exec(before.content);
  if(!cursor)throw Error('Terminal cursor metadata unavailable');
  const view=await new (require('./setup-presets').Setup)(bridge).screen(agent),after=await bridge.run(args);
  if(after?.id||typeof after?.content!=='string')throw Error('Terminal metadata incomplete');
  // Cursor and text are separate Rex reads. A settings redraw can briefly hide
  // the footer or move the cursor. Max/Ultra also animate over this line.
  // Wait up to four seconds for a verified footer; never retry a mutation.
  if(before.content===after.content){try{return footerId(view,Number(cursor[1]));}catch{}}
  if(Date.now()>=deadline)break;
  if(attempt<39)await pause(100);
 }
 throw Error('Session footer unavailable; check Rex');
}

class DaemonRpc{
 constructor(socket,makeSocket=()=>new WebSocket('ws://localhost/',{createConnection:()=>net.createConnection(socket),handshakeTimeout:3000,maxPayload:4e6,perMessageDeflate:false})){
  this.ws=makeSocket();this.pending=new Map();this.nextId=0;this.watchedSettings=new Set();this.settingsByThread=new Map();this.settingsSequence=0;
  this.opened=new Promise((resolve,reject)=>{this.ws.once('open',resolve);this.ws.once('error',()=>reject(Error('CLI daemon unavailable')));});
  this.ws.on('message',raw=>{let message;try{message=JSON.parse(raw.toString());}catch{return this.fail();}
   if(message.method==='thread/settings/updated'&&this.watchedSettings.has(message.params?.threadId)){
    let state=null;try{state=permissionSnapshot(message.params.threadSettings,false);}catch{}
    this.settingsByThread.set(message.params.threadId,{state,sequence:++this.settingsSequence});return;
   }
   if(message.method||(!Object.hasOwn(message,'result')&&!Object.hasOwn(message,'error')))return;
   const p=this.pending.get(message.id);if(!p)return;this.pending.delete(message.id);clearTimeout(p.timer);
   if(message.error){const error=Error('CLI daemon rejected '+p.method);error.code='DAEMON_REJECTED';if(String(message.error.message).startsWith('no rollout found for thread id '))error.kind='NO_ROLLOUT';p.reject(error);}else p.resolve(message.result);
  });
  this.ws.on('error',()=>this.fail());this.ws.on('close',()=>this.fail());
 }
 fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('CLI daemon disconnected; verify any requested change'));}this.pending.clear();}
 async connect(){await this.opened;const initialized=await this.request('initialize',{clientInfo:{name:'agent_switchboard',title:'Agent Switchboard',version:'1.2.1'},capabilities:{experimentalApi:true}});this.serverVersion=/^[^\s/]+\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(initialized?.userAgent||'')?.[1]||null;this.ws.send(JSON.stringify({method:'initialized',params:{}}));}
 request(method,params){
  if(!['initialize','thread/loaded/list','thread/read','thread/turns/list','thread/resume','model/list','thread/settings/update','thread/backgroundTerminals/list','thread/backgroundTerminals/terminate'].includes(method))return Promise.reject(Error('Unsupported daemon method'));
  if(method.startsWith('thread/backgroundTerminals/')){
   const keys=Object.keys(params||{}).sort().join(','),validId=new RegExp('^'+UUID+'$','i').test(params?.threadId);
   const list=method.endsWith('/list')&&validId&&['limit,threadId','cursor,limit,threadId'].includes(keys)&&params.limit===100&&(!Object.hasOwn(params,'cursor')||typeof params.cursor==='string'&&params.cursor.length>0);
   const terminate=method.endsWith('/terminate')&&validId&&keys==='processId,threadId'&&typeof params.processId==='string'&&params.processId.length>0&&params.processId.length<=256&&!/[\x00-\x1f\x7f]/.test(params.processId);
   if(!list&&!terminate)return Promise.reject(Error('Only scoped background-terminal requests are allowed'));
  }
  if(method==='thread/turns/list'&&(!params||Object.keys(params).sort().join(',')!=='itemsView,limit,sortDirection,threadId'||params.itemsView!=='notLoaded'||params.limit!==1||params.sortDirection!=='desc'||!new RegExp('^'+UUID+'$','i').test(params.threadId)))return Promise.reject(Error('Only latest-turn metadata reads are allowed'));
  if(method==='thread/resume'&&(!params||Object.keys(params).sort().join(',')!=='excludeTurns,threadId'||params.excludeTurns!==true||!new RegExp('^'+UUID+'$','i').test(params.threadId)))return Promise.reject(Error('Only metadata-only settings subscriptions are allowed'));
  // Never use a settings update as a read probe. Only these explicit,
  // independently tested mutations are allowed; they cannot contain policy/sandbox fields.
  if(method==='thread/settings/update'){
   const keys=Object.keys(params||{}).sort().join(',');
   const model=keys==='model,threadId'&&typeof params.model==='string'&&params.model;
   const reviewer=keys==='approvalsReviewer,threadId'&&['user','auto_review'].includes(params.approvalsReviewer);
   const effort=keys==='effort,threadId'&&typeof params.effort==='string'&&/^[a-z][a-z0-9_]{0,31}$/.test(params.effort);
   if(!model&&!reviewer&&!effort)return Promise.reject(Error('Only explicit model, effort or reviewer updates are allowed'));
  }
  if(this.ws.readyState!==1)return Promise.reject(Error('CLI daemon is offline'));
  const id=++this.nextId;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CLI daemon timeout; verify any requested change'));},4000);
   this.pending.set(id,{resolve,reject,timer,method});
   try{this.ws.send(JSON.stringify({id,method,params}));}catch{clearTimeout(timer);this.pending.delete(id);reject(Error('CLI daemon write failed'));}
  });
 }
 watchSettings(id){this.watchedSettings.add(id);return this.settingsSequence;}
 latestSettings(id){return this.settingsByThread.get(id)||null;}
 close(){this.fail();this.watchedSettings.clear();this.settingsByThread.clear();this.ws.terminate();}
}
function permissionSnapshot(raw,resumed){
 if(!raw||!['user','auto_review'].includes(raw.approvalsReviewer)||typeof raw.model!=='string'||typeof raw.cwd!=='string'||!raw.approvalPolicy)throw Error('Reviewer settings unavailable');
 const sandbox=resumed?raw.sandbox:raw.sandboxPolicy,effort=resumed?raw.reasoningEffort:raw.effort;
 if(!sandbox||typeof sandbox.type!=='string'||!Array.isArray(raw.disabledPluginIds)||!Object.hasOwn(raw,'activePermissionProfile')||!Object.hasOwn(raw,'collaborationMode')||!Object.hasOwn(raw,'serviceTier'))throw Error('Incomplete permission boundaries');
 // Hold only settings in memory. Never retain previews, turns, instruction-source paths or logs.
 return structuredClone({reviewer:raw.approvalsReviewer,model:raw.model,modelProvider:raw.modelProvider,effort,cwd:raw.cwd,approvalPolicy:raw.approvalPolicy,sandboxPolicy:sandbox,activePermissionProfile:raw.activePermissionProfile,collaborationMode:raw.collaborationMode,serviceTier:raw.serviceTier,disabledPluginIds:raw.disabledPluginIds,multiAgentMode:raw.multiAgentMode});
}
function sameOtherSettings(a,b){const {reviewer:ignoredA,...left}=a,{reviewer:ignoredB,...right}=b;return isDeepStrictEqual(left,right);}
async function readPermissionSettings(rpc,id){
 if(!permissionVersionVerified(rpc.serverVersion))throw Error('Settings daemon version not verified');
 const before=await loadedThread(rpc,id),sequence=rpc.watchSettings(id);let result;
 try{result=await rpc.request('thread/resume',{threadId:id,excludeTurns:true});}
 catch(error){if(error.kind==='NO_ROLLOUT')throw Error('Settings need completed chat history');throw error;}
 if(result?.thread?.id!==id||!Array.isArray(result.thread.turns)||result.thread.turns.length)throw Error('Unexpected settings subscription response');
 const event=rpc.latestSettings(id),state=event&&event.sequence>sequence?event.state:permissionSnapshot(result,true);
 if(!state)throw Error('Invalid live permission settings');
 const after=await loadedThread(rpc,id);
 if(!isDeepStrictEqual(before,after)||state.model!==after.model||state.effort!==after.effort||state.cwd!==after.cwd)throw Error('Settings changed while subscribing');
 return state;
}
async function loadedThread(rpc,id){
 let cursor=null,found=false;
 for(let page=0;page<20;page++){
  const list=await rpc.request('thread/loaded/list',{limit:100,...cursor?{cursor}:{}});
  if(!Array.isArray(list?.data))throw Error('Invalid loaded-thread metadata');
  if(list.data.includes(id)){found=true;break;}cursor=list.nextCursor;if(!cursor)break;
 }
 if(!found)throw Error('Current chat is not loaded in this daemon');
 const result=await rpc.request('thread/read',{threadId:id,includeTurns:false}),t=result?.thread;
 if(t?.id!==id||typeof t.model!=='string'||typeof t.cwd!=='string'||t.status?.type!=='idle')throw Error('Current chat is unavailable or busy');
 // Discard previews, titles, turns, and all unrelated response fields immediately.
 return {id:t.id,model:t.model,effort:t.reasoningEffort,cwd:t.cwd};
}
async function availableModels(rpc,include=[]){
 let cursor=null,all=[];
 for(let page=0;page<10;page++){
  const list=await rpc.request('model/list',{limit:100,includeHidden:false,...cursor?{cursor}:{}});
  if(!Array.isArray(list?.data))throw Error('Invalid daemon model catalog');
  all.push(...list.data.filter(m=>m.hidden===false&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(m.model)&&Array.isArray(m.supportedReasoningEfforts)).map(m=>({id:m.model,label:m.displayName||m.model,efforts:m.supportedReasoningEfforts.map(e=>e.reasoningEffort)})));
  cursor=list.nextCursor;if(!cursor)break;if(page===9)throw Error('Model catalog incomplete');
 }
 const models=include.length?include.map(id=>all.find(m=>m.id===id)).filter(Boolean):all;
 if(!models.length||new Set(models.map(m=>m.id)).size!==models.length)throw Error('No unique available models');return models;
}
function nextModel(current,models){
 const compatible=models.filter(m=>current.effort==null||m.efforts.includes(current.effort));
 if(!compatible.length)throw Error('No model supports the current effort');
 const i=compatible.findIndex(m=>m.id===current.model);return compatible[(i+1)%compatible.length];
}
function nextEffort(current,models){
 const levels=models.find(m=>m.id===current.model)?.efforts;
 if(!levels?.length||levels.some(e=>typeof e!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(e))||new Set(levels).size!==levels.length)throw Error('Supported effort levels unavailable');
 const index=levels.indexOf(current.effort);
 if(index<0)throw Error('Current effort unavailable; check Codex');
 return levels[(index+1)%levels.length];
}
function sameExceptEffort(before,after,target){
 // The native mode's reasoning setting follows an explicit effort change.
 const expected=structuredClone(before);expected.effort=target;
 if(expected.collaborationMode?.settings)expected.collaborationMode.settings.reasoning_effort=target;
 return isDeepStrictEqual(expected,after);
}
class DaemonControls{
 constructor(bridge,dependencies={}){this.b=bridge;this.socketFor=dependencies.socketFor||socketFor;this.footer=dependencies.footer||readFooter;this.connect=dependencies.connect||(async endpoint=>{const rpc=new DaemonRpc(endpoint.socket);try{await rpc.connect();return rpc;}catch(e){rpc.close();throw e;}});}
 async cycleEffort(agent){
  const endpoint=await this.socketFor(agent.pid),rpc=await this.connect(endpoint);
  try{
   const id=await this.footer(this.b,agent),current=await readPermissionSettings(rpc,id);
   if(current.cwd!==agent.cwd)throw Error('Pane and daemon directory mismatch');
   const target=nextEffort(current,await availableModels(rpc));
   await this.b.checked(agent,true);
   const latest=await this.socketFor(agent.pid);
   if(latest.pid!==endpoint.pid||latest.socket!==endpoint.socket||await this.footer(this.b,agent)!==id)throw Error('Pane, chat or daemon changed');
   if(!isDeepStrictEqual(await readPermissionSettings(rpc,id),current))throw Error('Chat settings changed; press again');
   const sequence=rpc.settingsSequence;
   // One effort-only write, never retried after an uncertain result.
   await rpc.request('thread/settings/update',{threadId:id,effort:target});
   let confirmed;
   for(let i=0;i<15;i++){
    const event=rpc.latestSettings(id);
    if(event&&event.sequence>sequence){confirmed=event.state;break;}
    await pause(100);
   }
   confirmed??=await readPermissionSettings(rpc,id);
   if(!confirmed||!sameExceptEffort(current,confirmed,target))throw Error('Effort or preserved settings unconfirmed; check Codex');
   this.b.lastEffort={session:agent.session,block:agent.block,pid:agent.pid,...agent.terminalId?{terminalId:agent.terminalId}:{},...agent.nativeIdentity?{nativeIdentity:agent.nativeIdentity}:{},chatId:id,effort:target,at:Date.now()};
   return{kind:'effort',label:target};
  }finally{rpc.close();}
 }
 async cycle(agent){
  const endpoint=await this.socketFor(agent.pid),rpc=await this.connect(endpoint);
  try{
   const id=await this.footer(this.b,agent),current=await loadedThread(rpc,id);
   if(current.cwd!==agent.cwd)throw Error('Pane and daemon directory mismatch');
   const models=await availableModels(rpc,this.b.config.modelDiscovery?.include||[]),chosen=nextModel(current,models);
   await this.b.checked(agent,true);
   const latestEndpoint=await this.socketFor(agent.pid);
   if(latestEndpoint.pid!==endpoint.pid||latestEndpoint.socket!==endpoint.socket||await this.footer(this.b,agent)!==id)throw Error('Pane, chat or daemon changed');
   const latest=await loadedThread(rpc,id);
   if(JSON.stringify(latest)!==JSON.stringify(current))throw Error('Chat settings changed; press again');
   // Only the model field changes. Never retry a mutation after an uncertain outcome.
   await rpc.request('thread/settings/update',{threadId:id,model:chosen.id});
   for(let i=0;i<10;i++){
    const confirmed=await loadedThread(rpc,id);
    if(confirmed.model===chosen.id&&confirmed.effort===current.effort){this.b.lastModel={session:agent.session,block:agent.block,pid:agent.pid,...agent.terminalId?{terminalId:agent.terminalId}:{},...agent.nativeIdentity?{nativeIdentity:agent.nativeIdentity}:{},chatId:id,model:chosen.id,at:Date.now()};return {kind:'model',label:chosen.label};}
    await pause(100);
   }
   throw Error('Model change unconfirmed; check Codex');
  }finally{rpc.close();}
 }
 async cyclePermissions(agent){
  const endpoint=await this.socketFor(agent.pid),rpc=await this.connect(endpoint);
  try{
   // Reviewer-only preservation was tested against this installed daemon version.
   if(!permissionVersionVerified(rpc.serverVersion))throw Error('Settings daemon version not verified');
   const id=await this.footer(this.b,agent),current=await readPermissionSettings(rpc,id);
   if(current.cwd!==agent.cwd)throw Error('Pane and daemon directory mismatch');
   const target=current.reviewer==='user'?'auto_review':'user';
   await this.b.checked(agent,true);
   const latestEndpoint=await this.socketFor(agent.pid);
   if(latestEndpoint.pid!==endpoint.pid||latestEndpoint.socket!==endpoint.socket||await this.footer(this.b,agent)!==id)throw Error('Pane, chat or daemon changed');
   if(!isDeepStrictEqual(await readPermissionSettings(rpc,id),current))throw Error('Chat settings changed; press again');
   const sequence=rpc.settingsSequence;
   // Exactly one reviewer field; never write sandbox/policy, and never retry a mutation.
   await rpc.request('thread/settings/update',{threadId:id,approvalsReviewer:target});
   let confirmed;
   for(let i=0;i<15;i++){
    const event=rpc.latestSettings(id);
    if(event&&event.sequence>sequence){confirmed=event.state;break;}
    await pause(100);
   }
   confirmed??=await readPermissionSettings(rpc,id);
   if(!confirmed||confirmed.reviewer!==target||!sameOtherSettings(current,confirmed))throw Error('Reviewer or permission boundaries unconfirmed; check Codex');
   this.b.lastReviewer={session:agent.session,block:agent.block,pid:agent.pid,...agent.terminalId?{terminalId:agent.terminalId}:{},...agent.nativeIdentity?{nativeIdentity:agent.nativeIdentity}:{},chatId:id,reviewer:target,at:Date.now()};
   return {kind:'permissions',label:target==='user'?'Ask me':'Approve for me'};
  }finally{rpc.close();}
 }
}
module.exports={DaemonControls,DaemonRpc,socketFor,socketFromListing,safeSocket,readFooter,footerId,loadedThread,availableModels,nextModel,nextEffort,sameExceptEffort,permissionSnapshot,sameOtherSettings,readPermissionSettings};
