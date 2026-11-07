'use strict';
// Metadata only: no transcripts, prompts, tool inputs/outputs or credentials on disk.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const directory=()=>path.join(__dirname,'state','claude');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text=(s,max=200)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\x00-\x1f\x7f-\x9f]/.test(s);
const session=s=>text(s,128)&&/^[a-zA-Z0-9_-]+$/.test(s);
const modes=new Set(['default','acceptEdits','plan','bypassPermissions','auto','dontAsk']);
function nativeVersion(file){const resolved=fs.realpathSync(file);return /\/claude\/versions\/(\d+\.\d+\.\d+)$/.exec(resolved)?.[1]||null;}
function processInfo(pid){return new Promise((resolve,reject)=>{
 if(!Number.isSafeInteger(pid)||pid<=0){reject(Error('Claude process unavailable'));return;}
 execFile('/bin/ps',['-p',String(pid),'-o','uid=,ppid=,lstart=,comm='],{timeout:1500,maxBuffer:4096,env:{...process.env,LC_ALL:'C'}},(error,out)=>{
  const m=/^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/.exec(out||'');
  if(error||!m||Number(m[1])!==process.getuid()){reject(Error('Claude process owner unavailable'));return;}
  let version;try{version=nativeVersion(m[4]);}catch{}
  resolve({pid,ppid:Number(m[2]),startedAt:m[3].replace(/\s+/g,' '),executable:m[4],version:version||null});
 });
});}
async function ancestor(start=process.ppid,inspect=processInfo){let pid=start;for(let i=0;i<12&&pid>1;i++){const p=await inspect(pid);if(p.version)return p;pid=p.ppid;}throw Error('No native Claude ancestor');}
function defaultBindings(dir){if(!text(dir,4096)||!path.isAbsolute(dir))return false;try{fs.lstatSync(path.join(dir,'keybindings.json'));return false;}catch(error){return error.code==='ENOENT';}}
function privateDirectory(dir,create=false){if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});const s=fs.lstatSync(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077))throw Error('Unsafe Claude metadata directory');}
function readRecord(pid,dir=directory(),{allowInvalid=false}={}){
 privateDirectory(dir);if(!allowInvalid&&fs.existsSync(path.join(dir,String(pid)+'.invalid')))throw Error('Claude lifecycle report was lost; wait for a fresh event');const file=path.join(dir,String(pid)+'.json'),fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o077)||s.size>16384)throw Error('Unsafe Claude metadata');const data=JSON.parse(fs.readFileSync(fd,'utf8')),after=fs.fstatSync(fd);if(s.mtimeMs!==after.mtimeMs||s.size!==after.size)throw Error('Claude metadata changed');return data;}finally{fs.closeSync(fd);}
}
function validate(record,agent,p,now=Date.now()){
 if(record?.schema!==1||record.pid!==p.pid||agent.pid!==p.pid||record.startedAt!==p.startedAt||record.version!==p.version||p.version!=='2.1.319'||record.cwd!==agent.cwd||!path.isAbsolute(record.cwd)||!session(record.sessionId)||!text(record.generation,128)||!text(record.turnId,128)||!['idle','working','done','blocked','unknown'].includes(record.state)||record.ended||!Number.isFinite(record.updatedAt)||now-record.updatedAt>86400000||record.updatedAt>now+1000)throw Error('Claude session metadata unavailable or unsupported');
 if(record.state==='blocked'&&(!['question','permission'].includes(record.kind)||!text(record.requestId,128)))throw Error('Claude request identity unavailable');
 return record;
}
function reduce(previous,data,p,now=Date.now(),id=()=>crypto.randomUUID(),statusline=false){
 if(!data||typeof data!=='object'||data.agent_id||!session(data.session_id)||!text(data.cwd,4096)||!path.isAbsolute(data.cwd)||p.version!=='2.1.319')return null;
 const same=previous?.pid===p.pid&&previous.startedAt===p.startedAt&&previous.sessionId===data.session_id;
 if(statusline){
  // A subagent/status-line callback can never establish or replace root identity.
  if(!same||previous.ended||data.agent)return null;
  const model=text(data.model?.id)?data.model.id:null,effort=['low','medium','high','xhigh','max'].includes(data.effort?.level)?data.effort.level:null;
  return{...previous,title:text(data.session_name,250)?data.session_name:null,promptId:session(data.prompt_id)?data.prompt_id:null,model,modelName:text(data.model?.display_name)?data.model.display_name:null,effort,vimMode:['INSERT','NORMAL','VISUAL','VISUAL LINE'].includes(data.vim?.mode)?data.vim.mode:null,metadataAt:now};
 }
 const event=data.hook_event_name;
 if(!['SessionStart','SessionEnd','UserPromptSubmit','Stop','PreToolUse','PostToolUse','PostToolUseFailure','PermissionRequest','Notification'].includes(event))return null;
 if(!same&&!['SessionStart','UserPromptSubmit'].includes(event))return null;
 if(previous?.pid===p.pid&&previous.startedAt===p.startedAt&&previous.eventAt>now)return null;
 const r=same?{...previous}:{schema:1,pid:p.pid,startedAt:p.startedAt,version:p.version,sessionId:data.session_id,generation:id(),turnId:id(),cwd:data.cwd,state:'unknown',updatedAt:now};
 if(event==='SessionStart'){r.generation=id();r.turnId=id();r.state='idle';r.ended=false;r.model=null;r.effort=null;r.metadataAt=null;r.title=text(data.session_title,250)?data.session_title:null;}
 if(event==='UserPromptSubmit'){r.turnId=id();r.promptId=null;r.state='working';r.ended=false;}
 if(event==='SessionEnd'){r.state='unknown';r.ended=true;}
 if(event==='Stop'){r.state='done';}
 if(event==='PermissionRequest'||event==='PreToolUse'&&data.tool_name==='AskUserQuestion'){
  r.state='blocked';r.kind=event==='PermissionRequest'?'permission':'question';r.requestId=hash([data.tool_name,data.tool_use_id||null,data.tool_input]);r.toolId=text(data.tool_use_id,128)?data.tool_use_id:null;
 }else if(event==='Notification'){
  if(data.notification_type!=='permission_prompt')return null;
  if(r.state==='blocked')return null; // Do not replace the stronger exact tool request.
  r.state='blocked';r.kind='permission';r.requestId=hash([event,data.message,now]);r.toolId=null;
 }else if(['PostToolUse','PostToolUseFailure'].includes(event)){
  if(r.state==='blocked'&&(!r.toolId||r.toolId!==data.tool_use_id))return null;
  r.state='working';
 }else if(event==='PreToolUse'){
  if(r.state==='blocked')return null;
  r.state='working';
 }
 if(r.state!=='blocked'){r.kind=null;r.requestId=null;r.toolId=null;}
 r.cwd=data.cwd;r.updatedAt=now;r.eventAt=now;
 if(modes.has(data.permission_mode))r.permissionMode=data.permission_mode;
 return r;
}
function markInvalid(p,dir){const file=path.join(dir,String(p.pid)+'.invalid'),tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,crypto.randomUUID(),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
async function invalidate({dir=directory(),inspect=processInfo,parent=process.ppid}={}){const p=await ancestor(parent,inspect);privateDirectory(dir,true);markInvalid(p,dir);}
async function record(data,{dir=directory(),inspect=processInfo,parent=process.ppid,now=Date.now(),statusline=false}={}){
 const p=await ancestor(parent,inspect);privateDirectory(dir,true);
 const lock=path.join(dir,String(p.pid)+'.lock'),invalid=path.join(dir,String(p.pid)+'.invalid');let fd,initialInvalid=null;try{initialInvalid=fs.readFileSync(invalid,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
 try{fd=fs.openSync(lock,'wx',0o600);}catch(error){if(error.code!=='EEXIST')throw error;if(!statusline)markInvalid(p,dir);return null;} // A lost lifecycle report revokes authority; metadata refreshes never repair it.
 try{let prior;try{prior=readRecord(p.pid,dir,{allowInvalid:true});}catch(error){if(error.code!=='ENOENT')throw error;}
  const next=reduce(prior,data,p,now,undefined,statusline);if(!next)return null;next.configDirectory=path.resolve(process.env.CLAUDE_CONFIG_DIR||path.join(require('node:os').homedir(),'.claude'));
  const current=await inspect(p.pid);if(current.startedAt!==p.startedAt||current.version!==p.version)throw Error('Claude process replaced');
  const file=path.join(dir,String(p.pid)+'.json'),tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try{fs.writeFileSync(tmp,JSON.stringify(next)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}finally{try{fs.unlinkSync(tmp);}catch{}}
  if(!statusline&&initialInvalid!==null){try{if(fs.readFileSync(invalid,'utf8')===initialInvalid)fs.unlinkSync(invalid);}catch(error){if(error.code!=='ENOENT')throw error;}}
  return next;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={directory,invalidate,defaultBindings,hash,text,session,modes,nativeVersion,processInfo,ancestor,readRecord,validate,reduce,record};
