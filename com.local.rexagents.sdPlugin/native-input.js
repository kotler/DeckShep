'use strict';
const crypto=require('node:crypto');
const {readFooter,DaemonRpc,socketFor}=require('./daemon-controls');
const {Setup}=require('./setup-presets');
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');
function composerSnapshot(view,cursor,chatId,{allowEmpty=false}={}){
 const lines=view.split('\n'),footer=lines.findIndex(line=>new RegExp('^\\s{0,4}'+chatId+'\\s*·').test(line));
 const row=cursor.row-1,column=cursor.column-1;
 if(footer<0||row<0||row>=footer||footer-row>16||lines.slice(row+1,footer).some(line=>line.trim()))throw Error('Native composer not visible');
 // The cursor belongs to the live input block immediately above the footer.
 // Earlier transcript prompts can also be nearby; a blank separator ends that block.
 let regionStart=row;while(regionStart>0&&row-regionStart<15&&lines[regionStart-1].trim())regionStart--;
 const starts=lines.map((line,index)=>({index,match:/^(\s{0,4})› (.*)$/.exec(line)})).filter(x=>x.match&&x.index>=regionStart&&x.index<=row);
 if(starts.length!==1)throw Error('Native composer is ambiguous');
 const start=starts[0],prefix=start.match[1].length+2;
 if(column<0)throw Error('Composer cursor unavailable');
 const before=lines.slice(start.index,row+1);before[before.length-1]=before.at(-1).slice(0,column);before[0]=before[0].slice(prefix);
 const text=before.join('\n').trim();
 if(!text&&!allowEmpty)throw Error('Type a message first');
 if(/^[!\/]/.test(text)||/[\x00-\x08\x0b-\x1f\x7f]/.test(text))throw Error('Steer/Queue requires plain message text');
 // Keep a digest only. Never return or log the user's message.
 return{chatId,hash:digest(lines.slice(start.index,footer).join('\n')),cursor:{row:cursor.row,column:cursor.column},empty:!text};
}
async function composerView(bridge,agent,chatId,options){
 const args=['block','call','-s',agent.session,'-b',agent.block,'format',JSON.stringify({format:'vt',extra_cursor:true,max_bytes:960000})];
 const before=await bridge.run(args),cursor=/\x1b\[(\d+);(\d+)H$/.exec(before?.content||'');
 if(before?.id||!cursor)throw Error('Composer cursor unavailable');
 const view=await new Setup(bridge).screen(agent),after=await bridge.run(args);
 if(after?.id||typeof after?.content!=='string'||digest(before.content)!==digest(after.content))throw Error('Composer changed while reading');
 return composerSnapshot(view,{row:Number(cursor[1]),column:Number(cursor[2])},chatId,options);
}
async function readIdleComposer(bridge,agent,options={}){
 if(agent.app!=='codex')throw Error('Draft verification supports Codex only');
 const chatId=await readFooter(bridge,agent),endpoint=await socketFor(agent.pid),rpc=new DaemonRpc(endpoint.socket);
 let turnStamp;
 try{
  await rpc.connect();
  const thread=(await rpc.request('thread/read',{threadId:chatId,includeTurns:false}))?.thread;
  if(thread?.id!==chatId||thread.cwd!==agent.cwd||thread.status?.type!=='idle')throw Error('Chat is not ready for Send');
  const result=await rpc.request('thread/turns/list',{threadId:chatId,limit:1,sortDirection:'desc',itemsView:'notLoaded'});
  if(!Array.isArray(result?.data)||result.data.length>1)throw Error('Latest-turn metadata unavailable');
  const turn=result.data[0];
  if(turn&&(typeof turn.id!=='string'||!['completed','interrupted','failed'].includes(turn.status)||turn.itemsView!=='notLoaded'||!Array.isArray(turn.items)||turn.items.length))throw Error('Chat turn changed');
  turnStamp=turn?JSON.stringify([turn.id,turn.status,turn.startedAt??null,turn.completedAt??null]):'no-turn';
 }finally{rpc.close();}
 const snapshot=await composerView(bridge,agent,chatId,options);
 if(await readFooter(bridge,agent)!==chatId)throw Error('Chat changed while reading');
 return{...snapshot,turnStamp};
}
const sameComposer=(a,b)=>a?.chatId===b?.chatId&&a?.hash===b?.hash&&a?.turnStamp===b?.turnStamp&&a?.cursor?.row===b?.cursor?.row&&a?.cursor?.column===b?.cursor?.column;
async function readComposer(bridge,agent){
 const chatId=await readFooter(bridge,agent);
 const endpoint=await socketFor(agent.pid),rpc=new DaemonRpc(endpoint.socket);let runId;
 try{
  await rpc.connect();const thread=(await rpc.request('thread/read',{threadId:chatId,includeTurns:false}))?.thread;
  if(thread?.id!==chatId||thread.cwd!==agent.cwd||thread.status?.type!=='active'||!Array.isArray(thread.status.activeFlags)||thread.status.activeFlags.length)throw Error('Run is not accepting direct input');
  const turn=(await rpc.request('thread/turns/list',{threadId:chatId,limit:1,sortDirection:'desc',itemsView:'notLoaded'}))?.data?.[0];
  if(turn?.status!=='inProgress'||turn.itemsView!=='notLoaded'||!Array.isArray(turn.items)||turn.items.length||typeof turn.id!=='string')throw Error('Active turn metadata unavailable');
  runId=turn.id;
  const expected=bridge.actionContext?.target.runId;
  if(!expected||expected!==runId)throw Error('Run metadata changed; press again');
 }finally{rpc.close();}
 const vt=await bridge.run(['block','call','-s',agent.session,'-b',agent.block,'format',JSON.stringify({format:'vt',extra_cursor:true,max_bytes:960000})]);
 const cursor=/\x1b\[(\d+);(\d+)H$/.exec(vt?.content||'');if(vt?.id||!cursor)throw Error('Composer cursor unavailable');
 const view=await new Setup(bridge).screen(agent);
 return{...composerSnapshot(view,{row:Number(cursor[1]),column:Number(cursor[2])},chatId),runId};
}
async function requestSnapshot(bridge,agent){
 const view=await bridge.run(['block','call','-s',agent.session,'-b',agent.block,'format',JSON.stringify({format:'vt',extra_cursor:true,max_bytes:960000})]);
 if(view?.id||typeof view?.content!=='string'||!view.content)throw Error('Approval view unavailable');
 return digest(view.content); // Includes native selection styling; never retain the content.
}
module.exports={composerSnapshot,readComposer,readIdleComposer,sameComposer,requestSnapshot};
