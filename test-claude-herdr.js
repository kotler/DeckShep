'use strict';
const assert=require('node:assert/strict'),{HerdrBridge}=require('./com.local.rexagents.sdPlugin/herdr-bridge'),{ClaudeControls}=require('./com.local.rexagents.sdPlugin/claude-controls'),C=require('./com.local.rexagents.sdPlugin/context-controls'),defaults=require('./com.local.rexagents.sdPlugin/config.json');
(async()=>{
 const id='01a1ae31-d050-7503-afec-fd2b40d2bc26',now=Date.now(),calls=[],state={focus:'w1:p1',atBottom:true,body:'────────────────────────\nDo you want to allow this command?\n❯ 1. Yes, once\n  2. No\nEsc to cancel · Tab to amend'};
 const infos=[1,2].map(i=>({agent:i===1?'codex':'claude',pane_id:'w1:p'+i,terminal_id:'terminal-'+i,workspace_id:'w1',tab_id:'w1:t'+i,revision:1,state_change_seq:1,agent_status:i===1?'idle':'blocked',foreground_cwd:'/project',title:'Chat '+i,name:'Chat '+i,terminal_title_stripped:i===1?id.slice(0,29)+'...':'Claude chat'}));
 const p={pid:202,startedAt:'Fri Nov 6 12:00:00 2026',version:'2.1.319'},record={configDirectory:'/fixture/claude',schema:1,pid:202,startedAt:p.startedAt,version:p.version,sessionId:'claude-session',generation:'gen',turnId:'turn',cwd:'/project',state:'blocked',kind:'permission',requestId:'request-one',updatedAt:now,metadataAt:now,model:'claude-sonnet-4-6'};
 const connect=async()=>({endpoint:{scope:'herdr:test'},close(){},async request(method,params){calls.push({method,params});const a=infos.find(i=>i.pane_id===(params.target||params.pane_id));
  if(method==='session.snapshot')return{type:'session_snapshot',snapshot:{protocol:22,version:'0.9.5',focused_pane_id:state.focus,focused_workspace_id:'w1',focused_tab_id:infos.find(i=>i.pane_id===state.focus).tab_id,workspaces:[{workspace_id:'w1',number:1}],tabs:infos.map((i,n)=>({workspace_id:'w1',tab_id:i.tab_id,number:n})),panes:infos.map(i=>({pane_id:i.pane_id})),layouts:infos.map(i=>({tab_id:i.tab_id,panes:[{pane_id:i.pane_id}]})),agents:structuredClone(infos.map(i=>({...i,focused:i.pane_id===state.focus})))}};
  if(method==='agent.get')return{agent:structuredClone({...a,focused:a.pane_id===state.focus})};
  if(method==='pane.process_info')return{process_info:{pane_id:a.pane_id,foreground_processes:[{pid:a.agent==='codex'?101:202,name:a.agent,cwd:'/project'}]}};
  if(method==='pane.get')return{pane:{...a,focused:a.pane_id===state.focus,scroll:{offset_from_bottom:state.atBottom?0:5}}};
  if(method==='agent.read')return{type:'pane_read',read:{pane_id:a.pane_id,workspace_id:'w1',tab_id:a.tab_id,source:'visible',format:params.format,truncated:false,text:state.body}};
  if(method==='agent.focus'){state.focus=a.pane_id;return{type:'ok'};}
  if(method==='agent.send_keys')return{type:'ok'};
  if(method==='pane.zoom')return{type:'pane_zoom',zoom:{pane_id:a.pane_id}};
  throw Error('Unexpected Herdr request');
 }});
 let codexReads=0;const b=new HerdrBridge({...structuredClone(defaults),backend:'herdr',herdr:{titleIdentity:true},claude:{enabled:true}},{connect,owner:async()=>true,identity:{resolve:async a=>{assert.equal(a.app,'codex');codexReads++;return{chatId:id,nativeIdentity:'daemon',status:{type:'idle'}};}}});
 b.claude=new ClaudeControls(b,{inspect:async()=>p,read:async()=>record,now:()=>now});
 const agents=await b.discover();assert.deepEqual(agents.map(a=>a.app),['codex','claude-code']);assert.equal(agents[1].chatId,'claude-session');assert.equal(C.modeOf(agents[1]),'approval');const reads=codexReads;
 await b.focus(agents[1]);let target=C.snapshot(await b.focused());await b.withContext({target,action:'approvalConfirm',verifyChat:true},()=>b.approvalKey('enter'));assert.deepEqual(calls.at(-1),{method:'agent.send_keys',params:{target:'w1:p2',keys:['enter']}});assert.equal(codexReads,reads,'Claude actions never resolve Codex identity');
 state.atBottom=false;const count=calls.filter(c=>c.method==='agent.send_keys').length;await assert.rejects(()=>b.withContext({target,action:'approvalConfirm',verifyChat:true},()=>b.approvalKey('enter')),/bottom/);assert.equal(calls.filter(c=>c.method==='agent.send_keys').length,count);state.atBottom=true;
 record.requestId='new-request';await assert.rejects(()=>b.withContext({target,action:'approvalConfirm',verifyChat:true},()=>b.approvalKey('enter')),/changed/);assert.equal(calls.filter(c=>c.method==='agent.send_keys').length,count);
 record.state='working';record.kind=null;record.requestId=null;infos[1].agent_status='working';state.body='Working\nesc to interrupt';target=C.snapshot(await b.focused());await b.withContext({target,action:'interrupt',verifyChat:true},()=>b.interrupt());assert.deepEqual(calls.at(-1).params,{target:'w1:p2',keys:['esc']});
 for(const method of ['stage','send','submitRunning','cycleControl']){const n=calls.filter(c=>c.method==='agent.send_keys').length;await assert.rejects(()=>b[method]('model'));assert.equal(calls.filter(c=>c.method==='agent.send_keys').length,n);}
 b.config.claude.enabled=false;target=C.snapshot(await b.focused());await b.withContext({target,action:'zoom',verifyChat:false},()=>b.zoom());assert.equal(calls.at(-1).method,'pane.zoom');
 console.log('PASS Herdr mixed-provider discovery, independent Claude identity, scoped waiting/Interrupt keys, changed-request/scroll refusal, read-only Zoom without opt-in and no composer/model submissions');
})().catch(e=>{console.error(e);process.exitCode=1;});
