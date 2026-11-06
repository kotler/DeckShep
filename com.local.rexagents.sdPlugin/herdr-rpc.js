'use strict';
const {StringDecoder}=require('node:string_decoder');
const fs=require('node:fs'),net=require('node:net'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const METHODS=new Set(['ping','session.snapshot','agent.get','agent.focus','agent.read','agent.send_keys','pane.process_info','pane.get','pane.zoom']);
function endpoint(value){
 if(typeof value!=='string'||!value||value.length>1024||/[\x00-\x1f\x7f]/.test(value))throw Error('Choose a Herdr session socket');
 const file=value.startsWith('~/')?path.join(os.homedir(),value.slice(2)):value;
 if(!path.isAbsolute(file))throw Error('Herdr socket must be an absolute path');
 const parent=fs.lstatSync(path.dirname(file)),stat=fs.lstatSync(file);
 if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid()||(parent.mode&0o022)||!stat.isSocket()||stat.uid!==process.getuid()||(stat.mode&0o077))throw Error('Unsafe Herdr session socket');
 const identity=[fs.realpathSync(file),stat.dev,stat.ino].join('|');
 return{file,identity,scope:'herdr:'+crypto.createHash('sha256').update(identity).digest('hex').slice(0,24)};
}
const paneId=s=>typeof s==='string'&&/^w[a-zA-Z0-9_-]+:p[a-zA-Z0-9_-]+$/.test(s);
function validate(method,p){
 if(!METHODS.has(method)||!p||typeof p!=='object'||Array.isArray(p))throw Error('Unsupported Herdr request');
 const keys=Object.keys(p).sort().join(',');
 if(['ping','session.snapshot'].includes(method)){if(keys)throw Error('Unexpected Herdr read parameters');return;}
 if(['agent.get','agent.focus'].includes(method)){if(keys!=='target'||!paneId(p.target))throw Error('Explicit Herdr pane required');return;}
 if(method==='agent.read'){
  if(keys!=='format,source,strip_ansi,target'||!paneId(p.target)||!['visible','detection'].includes(p.source)||!['text','ansi'].includes(p.format)||p.strip_ansi!==(p.format==='text'))throw Error('Only complete Herdr viewport reads are allowed');return;
 }
 if(method==='agent.send_keys'){
  if(keys!=='keys,target'||!paneId(p.target)||!Array.isArray(p.keys)||p.keys.length!==1||!['up','down','left','right','esc','enter','tab','shift+tab'].includes(p.keys[0]))throw Error('Only one guarded native key is allowed');return;
 }
 if(method==='pane.zoom'){if(keys!=='mode,pane_id'||!paneId(p.pane_id)||p.mode!=='toggle')throw Error('Only explicit pane zoom is allowed');return;}
 if(keys!=='pane_id'||!paneId(p.pane_id))throw Error('Explicit Herdr pane required');
}
class HerdrRpc{
 constructor(socketPath,deps={}){this.socketPath=socketPath;this.resolve=deps.endpoint||endpoint;this.open=deps.connect||((file)=>net.createConnection(file));this.nextId=0;this.pending=new Map();this.buffer='';this.decoder=new StringDecoder('utf8');this.verified=false;this.timeout=deps.timeout||4000;}
 async connect(){
  this.endpoint=this.resolve(this.socketPath);this.socket=this.open(this.endpoint.file);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.close();reject(Error('Herdr connection timed out'));},this.timeout);this.socket.once('connect',()=>{clearTimeout(timer);resolve();});this.socket.once('error',()=>{clearTimeout(timer);reject(Error('Herdr session unavailable'));});});
  this.socket.on('data',chunk=>this.receive(chunk));this.socket.on('error',()=>this.fail());this.socket.on('close',()=>this.fail());
  if(this.resolve(this.socketPath).identity!==this.endpoint.identity){this.close();throw Error('Herdr session changed while connecting');}
  const pong=await this.request('ping',{});
  if(pong?.type!=='pong'||pong.protocol!==22||!/^0\.9\.5(?:[-+].*)?$/.test(pong.version||'')){this.close();throw Error('Herdr version/protocol not verified');}
  this.verified=true;return this;
 }
 receive(chunk){
  this.buffer+=this.decoder.write(chunk);if(Buffer.byteLength(this.buffer)>4e6){this.close();return;}
  let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);let message;try{message=JSON.parse(line);}catch{this.close();return;}
   const pending=this.pending.get(message.id);if(!pending){this.close();return;}this.pending.delete(message.id);clearTimeout(pending.timer);
   if(message.error)pending.reject(Error('Herdr request refused; verify the session'));else if(!message.result||typeof message.result!=='object')pending.reject(Error('Invalid Herdr response'));else pending.resolve(message.result);
  }
 }
 request(method,params){
  try{validate(method,params);if(method!=='ping'&&!this.verified)throw Error('Herdr connection is not verified');if(!this.socket||this.socket.destroyed)throw Error('Herdr session offline');if(this.resolve(this.socketPath).identity!==this.endpoint.identity)throw Error('Herdr session replaced');}catch(error){return Promise.reject(error);}
  const id='switchboard-'+(++this.nextId);
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Herdr timeout; verify any requested change'));this.close();},this.timeout);this.pending.set(id,{resolve,reject,timer});this.socket.write(JSON.stringify({id,method,params})+'\n',error=>{if(error)this.fail();});});
 }
 fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Herdr disconnected; verify any requested change'));}this.pending.clear();this.verified=false;}
 close(){this.fail();this.socket?.destroy();}
}
module.exports={HerdrRpc,endpoint,validate,paneId};
