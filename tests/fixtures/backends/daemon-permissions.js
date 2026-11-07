'use strict';
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {DaemonControls,DaemonRpc,permissionSnapshot,sameOtherSettings}=require('../../../com.local.rexagents.sdPlugin/daemon-controls');
const id='01a1ae31-d050-7503-afec-fd2b40d2bc26',other='01a1ae31-f4ee-7212-b16a-f3b61ddf3688';
function fixture(){
 let state={approvalsReviewer:'user',model:'test-model',modelProvider:'openai',effort:'high',cwd:'/project',approvalPolicy:{granular:{sandbox_approval:true,request_permissions:true}},sandboxPolicy:{type:'workspaceWrite',writableRoots:['/project'],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true},activePermissionProfile:{id:':workspace'},collaborationMode:{mode:'plan',settings:{model:'test-model',reasoning_effort:'high',developer_instructions:null}},serviceTier:null,disabledPluginIds:['disabled'],multiAgentMode:'explicitRequestOnly'};
 const calls=[],agent={pid:42,cwd:'/project'},endpoint={pid:50,socket:'/socket'},b={config:{},checked:async()=>agent,draft:{unsent:true}};
 const rpc={serverVersion:'0.166.0',settingsSequence:0,event:null,watchSettings:()=>rpc.settingsSequence,latestSettings:()=>rpc.event,close:()=>rpc.closed=true,request:async(method,params)=>{
  calls.push({method,params});if(method==='thread/loaded/list')return{data:[id]};
  if(method==='thread/read')return{thread:{id,model:state.model,reasoningEffort:state.effort,cwd:state.cwd,status:{type:'idle'}}};
  if(method==='thread/resume'){const result=structuredClone(state);result.thread={id,turns:[]};result.sandbox=result.sandboxPolicy;result.reasoningEffort=result.effort;return result;}
  if(method==='thread/settings/update'){state={...state,approvalsReviewer:params.approvalsReviewer};rpc.event={sequence:++rpc.settingsSequence,state:permissionSnapshot(state,false)};return{};}throw Error('Unexpected method');
 }};
 const deps={socketFor:async()=>endpoint,footer:async()=>id,connect:async()=>rpc};
 return{calls,agent,b,rpc,deps,get:()=>structuredClone(state),set:patch=>state={...state,...patch},control:()=>new DaemonControls(b,deps)};
}

module.exports = { fixture };
