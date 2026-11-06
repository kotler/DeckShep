'use strict';
const assert=require('node:assert/strict');
const {Bridge,identify,state}=require('./com.local.rexagents.sdPlugin/core');
const defaults=require('./com.local.rexagents.sdPlugin/config.json');
(async()=>{
  const config={...defaults,allowClipboardFocus:true};
  const gated=new Bridge(defaults,async()=>{throw Error('Must not call Rex');});
  await assert.rejects(()=>gated.focused(),/not authorized/);
  const agent={app:'codex',pid:42,name:'codex'};
  assert.equal(identify({foreground:{pid:1,user_id:process.getuid(),path:'/bin/zsh',name:'zsh'},ancestors:[agent]}),null);
  const record={app:'codex',state:'done',updated_at:new Date().toISOString(),owner:{pid:41,name:'codex'}};
  assert.equal(state([record],agent).state,'unknown');
  assert.equal(state([{...record,updated_at:'2000-01-01',owner:agent}],agent).state,'unknown');
  let focus='b1',app='codex',status='idle';const calls=[];
  const run=async(args,input)=>{
    calls.push({args,input});
    if(args[0]==='client')return{clients:[{client_id:'c',info:{kind:'app',platform:'macos',name:'Rex Beta'},connection_state:'connected',session_ids:['s','s2']}]};
    if(args[0]==='ls')return{sessions:[{session_id:'s'},{session_id:'s2'}]};
    if(args[0]==='session')return{active_window_id:'wrong-server-focus',windows:[{window_id:'w',focused_block_id:'wrong-server-focus',layers:[{blocks:args[2]==='s'?['b1','b2'].map(block_id=>({block_id,creator_name:'com.superlogical.terminal'})):[]}]}]};
    if(args.at(-1)==='process')return{foreground:{pid:42,user_id:process.getuid(),path:'/bin/'+app,name:app}};
    if(args.at(-1)==='program_status')return{records:[{app,state:status,updated_at:new Date().toISOString(),owner:{pid:42,name:app}}]};
    if(args.at(-1)==='modes')return{modes:[{number:2004,set:true}]};
    return null;
  };
  const b=new Bridge(config,run,async()=>{},async()=>focus);
  let composerRead=0;b.readStagedComposer=async()=>({chatId:'fixture-chat',turnStamp:'turn-1',hash:composerRead++?'staged':'empty',cursor:{row:2,column:8},empty:composerRead===1});
  assert.equal((await b.focused()).block,'b1'); // Visible ID wins over stale server focus, even with multiple sessions.
  await b.stage('plan');assert(calls.some(x=>x.args[0]==='send'&&x.input.startsWith('\x1b[200~')));
  focus='b2';await assert.rejects(()=>b.send(),/Focus or process changed/);
  focus='b1';await b.send();assert.equal(calls.at(-1).args.at(-1),'enter');
  await assert.rejects(()=>b.send());app='zsh';await assert.rejects(()=>b.stage('tests'));
  app='codex';status='blocked';await assert.rejects(()=>b.stage('tests'));await assert.rejects(()=>b.interrupt());
  await b.menu('down');await assert.rejects(()=>b.menu('enter'));
  focus='closed';await assert.rejects(()=>b.focused(),/closed or ambiguous/);
  const failed=new Bridge(config,run,async()=>{},async()=>{throw Error('clipboard query failed');});
  const writes=()=>calls.filter(c=>['send','send-key'].includes(c.args[0])).length;
  const before=writes();await assert.rejects(()=>failed.stage('plan'));assert.equal(writes(),before);
  console.log('PASS visible focus over stale server state, multiple sessions, focus changes, closed panes, clipboard failure, shell rejection, status ownership and draft guards');
})();
