'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const D=require('./daemon-controls'),{latestTurn,backgroundState}=require('./background-controls');
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(s);
function titlePrefix(title){
 // Codex 0.166 emits the first 29 UUID characters plus three ASCII dots.
 // Accept no surrounding names, spinner, whitespace, Unicode ellipsis or partial ID.
 if(uuid(title))return title;
 const match=typeof title==='string'&&/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{5})\.\.\.$/.exec(title);
 if(!match)throw Error('In Codex, run /title thread-id');return match[1];
}
function socketIdentity(endpoint){const s=fs.lstatSync(endpoint.socket,{bigint:true});D.safeSocket(endpoint.socket);return crypto.createHash('sha256').update([endpoint.pid,endpoint.socket,s.dev,s.ino].join('|')).digest('hex');}
async function loadedIds(rpc){
 const ids=[],cursors=new Set();let cursor=null;
 for(let page=0;page<20;page++){
  const r=await rpc.request('thread/loaded/list',{limit:100,...cursor?{cursor}:{}});
  if(!Array.isArray(r?.data)||!r.data.every(uuid)||!Object.hasOwn(r,'nextCursor'))throw Error('Loaded chat IDs incomplete');
  for(const id of r.data){if(ids.includes(id))throw Error('Loaded chat IDs ambiguous');ids.push(id);}
  if(r.nextCursor===null)return ids;
  if(typeof r.nextCursor!=='string'||!r.nextCursor||cursors.has(r.nextCursor))throw Error('Loaded chat pagination incomplete');
  cursors.add(r.nextCursor);cursor=r.nextCursor;
 }
 throw Error('Loaded chat pagination incomplete');
}
class TitleIdentity{
 constructor(deps={}){this.socketFor=deps.socketFor||D.socketFor;this.socketIdentity=deps.socketIdentity||socketIdentity;this.connect=deps.connect||(async endpoint=>{const rpc=new D.DaemonRpc(endpoint.socket);try{await rpc.connect();return rpc;}catch(e){rpc.close();throw e;}});}
 async resolve(agent,title){
  const prefix=titlePrefix(title),endpoint=await this.socketFor(agent.pid),identity=this.socketIdentity(endpoint),rpc=await this.connect(endpoint);
  try{
   if(!['0.166.0','0.167.0'].includes(rpc.serverVersion))throw Error('Codex title identity version not verified');
   const matches=(await loadedIds(rpc)).filter(id=>id.startsWith(prefix));
   if(matches.length!==1)throw Error(matches.length?'Title matches multiple chats':'Title chat is not loaded');
   const id=matches[0],t=(await rpc.request('thread/read',{threadId:id,includeTurns:false}))?.thread;
   if(t?.id!==id||t.cwd!==agent.cwd||t.parentThreadId!==null||!['cli','vscode'].includes(t.source))throw Error('Title must identify a root interactive chat in this folder');
   if(!['idle','active','systemError'].includes(t.status?.type))throw Error('Codex chat unavailable');
   const status={...t.status};
   if(status.type==='active'&&(!Array.isArray(status.activeFlags)||status.activeFlags.length>1||status.activeFlags.some(f=>!['waitingOnApproval','waitingOnUserInput'].includes(f))))throw Error('Codex waiting state unavailable');
   if(status.type==='active'&&!status.activeFlags.length){
    const turn=await latestTurn(rpc,id);
    if(turn.status==='inProgress')status.runId=turn.id;
    else{const bg=await backgroundState(rpc,id,t,turn);if(!bg)throw Error('Active turn unavailable');Object.assign(status,bg);}
   }else if(status.type==='idle')try{Object.assign(status,await backgroundState(rpc,id,t)||{});}catch{}
   const latest=await this.socketFor(agent.pid);
   if(this.socketIdentity(latest)!==identity)throw Error('Codex daemon changed; reselect agent');
   return{chatId:id,nativeIdentity:identity,status};
  }finally{rpc.close();}
 }
}
module.exports={TitleIdentity,titlePrefix,loadedIds};
