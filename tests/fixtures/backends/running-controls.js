'use strict';
const assert=require('node:assert/strict'),{Bridge}=require('../../../com.local.rexagents.sdPlugin/core'),{composerSnapshot}=require('../../../com.local.rexagents.sdPlugin/native-input'),C=require('../../../com.local.rexagents.sdPlugin/context-controls');
const id='01a1ae31-d050-7503-afec-fd2b40d2bc26';
function fixture(state='working',kind){
 const agent={session:'s',block:'b',app:'codex',name:'codex',pid:42,state,kind,statusAt:'stamp',chatId:id},calls=[];
 const b=new Bridge({controlVerified:{codex:true}},async args=>{calls.push(args);});
 b.focused=async()=>agent;b.checked=async()=>agent;b.readComposer=async()=>({chatId:id,hash:'message',cursor:{row:1,column:6}});b.readRequest=async()=> 'view';b.draft={unsent:true};return{b,agent,calls};
}

module.exports = { fixture };
