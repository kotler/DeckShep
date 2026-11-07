'use strict';
const assert=require('node:assert/strict');
const {DaemonControls,DaemonRpc,nextEffort,permissionSnapshot,sameExceptEffort}=require('../../../com.local.rexagents.sdPlugin/daemon-controls');
const {effortLines}=require('../../../com.local.rexagents.sdPlugin/agent-labels');
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

module.exports = { fixture };
