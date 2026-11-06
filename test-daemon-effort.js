'use strict';
const assert=require('node:assert/strict');
const {DaemonControls,DaemonRpc,nextEffort,permissionSnapshot,sameExceptEffort}=require('./com.local.rexagents.sdPlugin/daemon-controls');
const {effortLines}=require('./com.local.rexagents.sdPlugin/agent-labels');
const id='01a1ae31-d050-7503-afec-fd2b40d2bc26';
function fixture(){
 let state={approvalsReviewer:'user',model:'test-model',modelProvider:'openai',effort:'high',cwd:'/project',approvalPolicy:'on-request',sandboxPolicy:{type:'workspaceWrite',networkAccess:false},activePermissionProfile:null,collaborationMode:{mode:'default',settings:{model:'test-model',reasoning_effort:'high',developer_instructions:null}},serviceTier:null,disabledPluginIds:[],multiAgentMode:'explicitRequestOnly'};
 const agent={session:'s',block:'b',pid:42,cwd:'/project',chatId:id},endpoint={pid:50,socket:'/socket'},calls=[],b={config:{modelDiscovery:{include:['other-model']}},checked:async()=>agent,draft:{unsent:true}};
 const rpc={serverVersion:'0.167.0',settingsSequence:0,event:null,watchSettings:()=>rpc.settingsSequence,latestSettings:()=>rpc.event,close:()=>rpc.closed=true,request:async(method,params)=>{
  calls.push({method,params});
  if(method==='thread/loaded/list')return{data:[id]};
  if(method==='thread/read')return{thread:{id,model:state.model,reasoningEffort:state.effort,cwd:state.cwd,status:{type:'idle'}}};
  if(method==='thread/resume')return{...structuredClone(state),thread:{id,turns:[]},sandbox:state.sandboxPolicy,reasoningEffort:state.effort};
  if(method==='model/list')return{data:[{model:state.model,hidden:false,supportedReasoningEfforts:['low','medium','high','xhigh'].map(reasoningEffort=>({reasoningEffort}))}]};
  if(method==='thread/settings/update'){state.effort=params.effort;state.collaborationMode.settings.reasoning_effort=params.effort;rpc.event={sequence:++rpc.settingsSequence,state:permissionSnapshot(state,false)};return{};}
  throw Error('Unexpected method');
 }};
 const deps={socketFor:async()=>endpoint,footer:async()=>id,connect:async()=>rpc};
 return{agent,b,rpc,calls,deps,set:patch=>Object.assign(state,patch),get:()=>permissionSnapshot(state,false),control:()=>new DaemonControls(b,deps)};
}
(async()=>{
 const f=fixture(),before=f.get(),draft=f.b.draft;
 assert.equal((await f.control().cycleEffort(f.agent)).label,'xhigh');
 assert.equal((await f.control().cycleEffort(f.agent)).label,'low','last supported level wraps');
 assert(sameExceptEffort(before,f.get(),'low'));assert.equal(f.b.draft,draft);assert(f.rpc.closed);
 assert.deepEqual(f.calls.filter(c=>c.method==='thread/settings/update').map(c=>c.params),[{threadId:id,effort:'xhigh'},{threadId:id,effort:'low'}]);
 const catalog=[{id:'test-model',efforts:['medium','high']}];assert.equal(nextEffort({model:'test-model',effort:'high'},catalog),'medium');
 for(const levels of [[],['high','high'],['high',null],['high','BAD']])assert.throws(()=>nextEffort({model:'test-model',effort:'high'},[{id:'test-model',efforts:levels}]));
 assert.throws(()=>nextEffort({model:'missing',effort:'high'},catalog));assert.throws(()=>nextEffort({model:'test-model',effort:null},catalog));
 for(const change of [
  x=>x.set({effort:'unsupported'}),
  x=>{x.rpc.serverVersion='0.168.0';},
  x=>{x.b.checked=async()=>{throw Error('Focus changed');};},
  x=>{let n=0;x.deps.footer=async()=>++n===1?id:'other';},
  x=>{let n=0;x.deps.socketFor=async()=>({pid:++n===1?50:51,socket:'/socket'});},
  x=>{let n=0;const request=x.rpc.request;x.rpc.request=async(m,p)=>{if(m==='thread/resume'&&++n===2)x.set({effort:'medium'});return request(m,p);};},
  x=>x.set({cwd:'/other'})
 ]){const x=fixture();change(x);await assert.rejects(()=>x.control().cycleEffort(x.agent));assert(!x.calls.some(c=>c.method==='thread/settings/update'));assert(x.rpc.closed);}
 for(const change of [
  x=>{const request=x.rpc.request;x.rpc.request=async(m,p)=>{if(m==='thread/settings/update'){x.calls.push({method:m,params:p});throw Error('timeout');}return request(m,p);};},
  x=>{const request=x.rpc.request;x.rpc.request=async(m,p)=>{const result=await request(m,p);if(m==='thread/settings/update')x.rpc.event.state.sandboxPolicy.networkAccess=true;return result;};},
  x=>{const request=x.rpc.request;x.rpc.request=async(m,p)=>{const result=await request(m,p);if(m==='thread/settings/update')x.rpc.event.state.collaborationMode.mode='plan';return result;};}
 ]){const x=fixture();change(x);await assert.rejects(()=>x.control().cycleEffort(x.agent));assert.equal(x.calls.filter(c=>c.method==='thread/settings/update').length,1);assert(!x.b.lastEffort);assert(x.rpc.closed);}
 const agent={...f.agent,effort:'medium',metadataAt:100},bridge={agents:[agent],lastTarget:agent,lastEffort:{...agent,effort:'high',at:200}};
 assert.deepEqual(effortLines(bridge),['Effort','High']);agent.metadataAt=300;assert.deepEqual(effortLines(bridge),['Effort','Medium'],'manual effort change updates caption');
 agent.chatId='other';agent.metadataAt=100;assert.deepEqual(effortLines(bridge),['Effort','Medium'],'chat replacement cannot inherit last effort');agent.effort=null;assert.deepEqual(effortLines(bridge),['Effort','Unknown']);
 const rpc=Object.create(DaemonRpc.prototype);
 for(const params of [{threadId:id,effort:null},{threadId:id,effort:'high',model:'other'},{threadId:id,effort:'low',approvalPolicy:'never'},{threadId:id,effort:'HIGH'}])await assert.rejects(()=>rpc.request('thread/settings/update',params),/Only explicit/);
 console.log('PASS supported effort cycle/wrap, model catalog independence, verified captions/manual changes, chat/focus/process guards, effort-only payload, full boundary preservation and no uncertain retries');
})().catch(e=>{console.error(e);process.exitCode=1;});
