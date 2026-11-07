'use strict';
const assert=require('node:assert/strict'),{Bridge}=require('./com.local.rexagents.sdPlugin/core'),{composerSnapshot}=require('./com.local.rexagents.sdPlugin/native-input'),C=require('./com.local.rexagents.sdPlugin/context-controls');
const id='01a1ae31-d050-7503-afec-fd2b40d2bc26';
function fixture(state='working',kind){
 const agent={session:'s',block:'b',app:'codex',name:'codex',pid:42,state,kind,statusAt:'stamp',chatId:id},calls=[];
 const b=new Bridge({controlVerified:{codex:true}},async args=>{calls.push(args);});
 b.focused=async()=>agent;b.checked=async()=>agent;b.readComposer=async()=>({chatId:id,hash:'message',cursor:{row:1,column:6}});b.readRequest=async()=> 'view';b.draft={unsent:true};return{b,agent,calls};
}
(async()=>{
 const footer='  '+id+' · GPT-6-Luna high',view=['history','› hello world','',''+footer].join('\n');
 const parsed=composerSnapshot(view,{row:2,column:14},id);assert.equal(parsed.chatId,id);assert(!JSON.stringify(parsed).includes('hello'));assert.equal(parsed.hash.length,64);
 for(const v of ['› ', '› /model another', '› !rm something'])await assert.rejects(async()=>composerSnapshot(['history',v,'',footer].join('\n'),{row:2,column:v.length+1},id));
 assert.throws(()=>composerSnapshot(view,{row:1,column:2},id));assert.throws(()=>composerSnapshot(view.replace(id,'missing'),{row:2,column:14},id));assert.throws(()=>composerSnapshot('› ambiguous\n'+view,{row:3,column:14},id));
 const transcript=['› previous task','  continued task','','• Working (5s)','','› steer message','',footer].join('\n');
 const live=composerSnapshot(transcript,{row:6,column:16},id);assert(live.hash,'a recent transcript prompt is outside the active composer');
 assert.throws(()=>composerSnapshot(transcript,{row:1,column:8},id),'a historical cursor cannot jump over newer rendered content');
 assert.throws(()=>composerSnapshot('› nested\n  › second marker\n\n'+footer,{row:2,column:18},id),'two markers within the active input block remain ambiguous');
 // Ghost suggestions after a cursor at the initial input cell do not count as typed text.
 assert.throws(()=>composerSnapshot('› Implement a feature\n\n'+footer,{row:1,column:3},id),/Type a message/);
 const multiline=composerSnapshot('› first line\n  second line\n\n'+footer,{row:2,column:14},id);assert(multiline.hash);assert(composerSnapshot('› 修复测试\n\n'+footer,{row:1,column:11},id).hash);
 for(const[k,key]of[['steer','enter'],['queue','tab']]){const f=fixture();await f.b.submitRunning(k);assert.deepEqual(f.calls,[['send-key','-s','s','-b','b',key]]);assert.equal(f.b.draft,null);await assert.rejects(()=>f.b.submitRunning(k),/Already submitted/);assert.equal(f.calls.length,1);}
 for(const modify of[
  f=>f.agent.state='idle',f=>f.agent.kind='permission',f=>{f.agent.state='blocked';f.agent.kind='question';},f=>f.agent.app='claude-code',f=>f.b.config.controlVerified.codex=false,
  f=>f.b.readComposer=async()=>{throw Error('No typed message');},
  f=>{let n=0;f.b.readComposer=async()=>({chatId:id,hash:String(++n),cursor:{row:1,column:9}});},
  f=>f.b.checked=async()=>({...f.agent,state:'done'}),
 ]){const f=fixture();modify(f);if(f.agent.state==='working'&&f.agent.kind==='permission')f.agent.state='blocked';await assert.rejects(()=>f.b.submitRunning('steer'));assert.equal(f.calls.length,0);}
 const timeout=fixture();timeout.b.run=async args=>{timeout.calls.push(args);throw Error('timeout');};await assert.rejects(()=>timeout.b.submitRunning('queue'));await assert.rejects(()=>timeout.b.submitRunning('queue'),/Already submitted/);assert.equal(timeout.calls.length,1);
 for(const key of ['up','down','enter','escape']){const f=fixture('blocked','permission'),draft=f.b.draft;await f.b.approvalKey(key);assert.equal(f.calls[0].at(-1),key);assert.equal(f.b.draft,draft);}
 for(const change of [f=>f.agent.kind='question',f=>f.b.checked=async()=>({...f.agent,statusAt:'different'}),f=>{let n=0;f.b.readRequest=async()=>String(++n);},f=>f.agent.statusAt=undefined]){const f=fixture('blocked','permission');change(f);await assert.rejects(()=>f.b.approvalKey('enter'));assert.equal(f.calls.length,0);}
 const original=fixture('blocked','question').agent,context={target:{...original}};C.assertContext(context,{...original});
 for(const patch of [{pid:43},{block:'c'},{state:'working'},{kind:'permission'},{statusAt:'new'}])assert.throws(()=>C.assertContext(context,{...original,...patch}));
 // Scoped guards always unwind after failure, with no nested action context.
 const scope=fixture();scope.b.focused=async()=>{throw Error('Focus mismatch');};await assert.rejects(()=>scope.b.withContext({target:scope.agent},async()=>{}));assert.equal(scope.b.actionContext,null);
 console.log('PASS native composer validation and message privacy, explicit running-only Enter/Tab, changed/empty/command input refusal, no replay or timeout retries, stable approval-view guards, request/target isolation and context cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
