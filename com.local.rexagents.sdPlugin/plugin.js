'use strict';
const fs=require('fs'),path=require('path'),WebSocket=require('ws');
const {Bridge}=require('./core'),{svg,pulse}=require('./visuals');
const {agentLines,modelLines,modeLines,effortLines,reviewerLines,sameTarget}=require('./agent-labels'),{AgentMetadata}=require('./agent-metadata');
const C=require('./context-controls');
const {controlAccent}=require('./signal-visuals');
const {CompletionDisplay}=require('./completion-display');
const preferences=require('./preferences');
const configPath=path.join(__dirname,'config.json');let diskConfig=JSON.parse(fs.readFileSync(configPath)),config=diskConfig;
const bridge=new Bridge(config),metadata=new AgentMetadata(bridge);
const completion=new CompletionDisplay();
let globalPreferences={},settingsError='',setupBusy=false,inspectorMessage='';
function loadConfig(){try{diskConfig=JSON.parse(fs.readFileSync(configPath));settingsError='';}catch{settingsError='Settings file invalid; using the last valid defaults';}config=preferences.apply(diskConfig,globalPreferences);bridge.config=config;}
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1],ws=new WebSocket('ws://127.0.0.1:'+arg('-port'));
const keys=new Map(),transitions=new Map();let page=0,bank=0,busy=false,offline=true,queue=Promise.resolve(),metadataBusy=false,metadataAgain=false,startupSelectionRead=false,contextState={stamp:null,armedAt:0};
const emit=(event,context,payload)=>{if(ws.readyState===1)ws.send(JSON.stringify({event,context,payload}));};
const clean=s=>String(s||'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').slice(0,15);
function selected(){return bridge.agents?.find(a=>sameTarget(bridge.lastTarget,a));}
function mapping(k){
 const override=k.settings.action;
 if(override){if(override==='tools')return'questions';if(['planPrompt','modelPicker','effortPicker','previous','bankprev'].includes(override))return'none';return override;}
 const {column:c,row:r}=k.coordinates;return r===0?'agent:'+c:C.layout(page,selected())[(r-1)*5+c];
}
function bankLines(){
 if(offline)return['Agents ▶','Rex offline'];
 const visible=bridge.slots.slice(bank*5,bank*5+5).filter(s=>bridge.agents?.some(a=>a.session===s.session&&a.block===s.block)).length;
 const total=Math.max(1,Math.ceil(bridge.slots.length/5)),outside=Math.max(0,(bridge.agents?.length||0)-visible);
 return['Agents ▶',...(total>1?[`bank ${bank+1}/${total}`]:[]),...(outside?[`${outside} off-page`]:bridge.agents?.length?[]:['No agents'])];
}
function capture(k){
 const target=selected(),action=mapping(k),contextStamp=C.stamp(target,page);
 return{action,page,stamp:contextStamp,target:C.snapshot(action.startsWith('agent:')?k.target:target),armedAt:contextState.armedAt,verifyChat:C.needsChat(action,target)};
}
function render(){
 metadata.hydrate(bridge.agents||[]);const now=Date.now(),target=selected(),mode=C.modeOf(target),contextStamp=C.stamp(target,page);
 completion.update(bridge.agents||[],target,now);
 if(contextState.stamp!==contextStamp)contextState={stamp:contextStamp,armedAt:now+350};
 for(const[ctx,k]of keys){
  const action=mapping(k);let icon=({effortIncrease:'blank',effortDecrease:'blank',plan:'blank',permissions:'reviewer',more:'more',questions:'more',prompts:'more',back:'previous',questionPrev:'previous',questionNext:'next',answer:'send',approvalUp:'up',approvalDown:'down',approvalConfirm:'permissions',approvalEscape:'escape',none:'blank',status:'blank'})[action]||action;
  let lines=[],color='#233a50',p=0,badge='';
  if(action.startsWith('agent:')){
   const slot=bridge.slots[bank*5+Number(action.split(':')[1])],a=bridge.agents?.find(a=>a.block===slot?.block&&a.session===slot?.session);k.target=a;
   if(a){const shown=completion.agent(a),prior=transitions.get(a.block);if(!prior||prior.state!==shown.state||prior.pid!==a.pid||prior.statusAt!==a.statusAt)transitions.set(a.block,{state:shown.state,pid:a.pid,statusAt:a.statusAt,at:now});icon=a.app;lines=agentLines(shown,config.aliases);color=C.isBackground(shown)?'#126b78':config.palette[shown.state==='idle'?'ready':shown.state]||config.palette.unknown;p=pulse(C.isBackground(shown)?'idle':shown.state,now-transitions.get(a.block).at,config.animation);if(sameTarget(bridge.lastTarget,a))badge='selected';}
   else{icon='empty';lines=offline?['Rex offline','UNKNOWN']:slot?['Closed']:['No agent'];color=offline?config.palette.error:config.palette.idle;}
  }else{
   const gaps=bridge.slotGaps(),names={collapse:['Collapse',...(offline?['Rex offline']:gaps?[`${gaps} gap${gaps===1?'':'s'}`]:[])],banknext:bankLines(),next:['Next agent'],model:modelLines(bridge),effort:effortLines(bridge),effortIncrease:['Effort +'],effortDecrease:['Effort −'],permissions:reviewerLines(bridge),plan:modeLines(bridge),interrupt:['Interrupt',mode==='working'?'running':'not running'],stopTerminals:['Stop terminals',`${target?.backgroundIds?.length||0} running`],steer:['Steer','typed message'],queue:['Queue','typed message'],zoom:['Zoom'],up:['Up'],down:['Down'],left:['Left'],right:['Right'],questionPrev:['Shift+Tab','question'],questionNext:['Tab','question'],answer:['Confirm','Enter'],escape:['Esc','question'],approvalUp:['Up','approval'],approvalDown:['Down','approval'],approvalConfirm:['Confirm','shown choice'],approvalEscape:['Esc','approval'],review:['Review','draft'],tests:['Tests','draft'],continue:['Continue','draft'],send:bridge.draft?['Send',bridge.draft.action]:['Send','no draft'],more:[`Page ${page+1}/3`,['Home','Questions','Prompts'][page],page===0?({ready:'Ready',working:'Working',background:'Background',question:'Question',approval:'Approval',unknown:target?'Check Rex':'Select agent'})[mode]:'next page'],questions:['Questions'],prompts:['Prompts'],back:['Back','Questions'],none:[],status:target?['Check Rex',target.kind==='auth'?'Authentication':'']:[bridge.selectionNotice?'Reselect':'Select','agent']};
   lines=names[action]||[action.toUpperCase()];
   if((action==='collapse'&&(offline||!gaps))||(action==='interrupt'&&mode!=='working')||action==='none')color='#38414b';
   if(action==='stopTerminals'||action==='interrupt'&&mode==='working')color='#813c42';
   if(['steer','queue'].includes(action)&&!target?.runId){color='#38414b';lines=[action==='steer'?'Steer':'Queue','loading run'];}
   if(action.startsWith('approval'))color='#78551e';
   if(action==='send'&&bridge.draft)color='#416428';
   if((['up','down','left','right','escape','questionPrev','questionNext','answer'].includes(action)&&mode!=='question')||(action==='permissions'&&mode!=='ready'))color='#38414b';
   if(k.feedback&&k.feedback.action===action&&k.feedback.stamp===contextStamp&&now<k.feedback.until){lines=['Unavailable',k.feedback.message];color='#893748';}
  }
  if(action!=='plan'&&!['effort','effortIncrease','effortDecrease'].includes(action)&&k.notice&&k.notice.action===action&&k.notice.stamp===contextStamp&&now<k.notice.until){lines=[action==='stopTerminals'?'Stop terminals':action==='collapse'?'Collapse':action==='permissions'?'Reviewer':action==='steer'?'Steer':action==='queue'?'Queue':['effortIncrease','effortDecrease'].includes(action)?'Effort':action==='plan'?'Mode':'Model',k.notice.label];color='#2b654c';}
  k.presented=capture(k);
  const img='data:image/svg+xml;base64,'+Buffer.from(svg({icon,lines,color,pulse:p,badge,accent:controlAccent(action,color),style:config.appearance?.style||'signal',textOnly:lines.length===1&&['effortIncrease','effortDecrease','plan'].includes(action),agent:action.startsWith('agent:')})).toString('base64');
  if(img!==k.lastImage){emit('setImage',ctx,{image:img,target:0});emit('setTitle',ctx,{title:'',target:0});k.lastImage=img;}
 }
}
async function refreshMetadata(force=false){
 if(metadataBusy){metadataAgain=metadataAgain||force;return;}metadataBusy=true;
 try{const agents=await metadata.refresh(bridge.agents||[],force);for(const agent of agents){const live=bridge.agents?.find(a=>sameTarget(a,agent));if(live&&live.cwd===agent.cwd&&!(live.metadataAt>agent.metadataAt))for(const field of['chatId','chatName','project','model','effort','collaborationMode','reviewer','runId','backgroundOnly','backgroundIds','backgroundTurnId','activityStatusAt','metadataAt'])if(Object.hasOwn(agent,field)&&(!['backgroundOnly','backgroundIds','backgroundTurnId','activityStatusAt'].includes(field)||live.statusAt===agent.statusAt))live[field]=agent[field];}render();}
 finally{metadataBusy=false;if(metadataAgain){metadataAgain=false;void refreshMetadata(true);}}
}
async function refresh(forceMetadata=false){
 if(busy)return;busy=true;
 try{loadConfig();await bridge.discover();offline=false;void refreshMetadata(forceMetadata);}
 catch{offline=true;bridge.agents=[];bridge.draft=null;bridge.picker=null;}
 finally{busy=false;render();}
}
async function perform(a,display){
 if(a==='more')page=(page+1)%3;
 else if(a==='questions')page=1;
 else if(a==='prompts')page=2;
 else if(a==='back')page=0;
 else if(a==='collapse'){const result=await bridge.collapse();bank=Math.min(bank,Math.max(0,Math.ceil(bridge.slots.length/5)-1));return result.removed?result:undefined;}
 else if(a==='banknext')bank=(bank+1)%Math.max(1,Math.ceil(bridge.slots.length/5));
 else if(a.startsWith('agent:')){if(!display.target||offline)throw Error('No live agent');await bridge.focus(display.target);}
 else if(a==='next'){await bridge.navigate(1);const index=bridge.slots.findIndex(s=>s.session===bridge.lastTarget?.session&&s.block===bridge.lastTarget?.block);if(index>=0)bank=Math.floor(index/5);}
 else if(['effortIncrease','effortDecrease'].includes(a))return bridge.adjustEffort(a==='effortDecrease'?'decrease':'increase');
 else if(['model','effort','permissions'].includes(a))return bridge.cycleControl(a);
 else if(a==='plan')return bridge.togglePlan();
 else if(a==='zoom')await bridge.zoom();
 else if(a==='interrupt')await bridge.interrupt();
 else if(a==='stopTerminals')return bridge.stopTerminals();
 else if(a==='steer'||a==='queue')return bridge.submitRunning(a);
 else if(a==='send')await bridge.send();
 else if(a.startsWith('approval'))await bridge.approvalKey(({approvalUp:'up',approvalDown:'down',approvalConfirm:'enter',approvalEscape:'escape'})[a]);
 else if(['up','down','left','right','escape','questionPrev','questionNext','answer'].includes(a))await bridge.questionKey(({questionPrev:'shift+tab',questionNext:'tab',answer:'enter'})[a]||a);
 else await bridge.stage(a);
}
async function press(ctx,display){
 const k=keys.get(ctx);if(!k)return;display=display||k.presented||capture(k);const a=display.action;if(['none','status'].includes(a))return;
 try{
  let result;
  if(display.setupBusy)throw Error('Setup finished; press again');
  if(C.needsContext(a)){
   if(display.page!==page||display.stamp!==C.stamp(selected(),page))throw Error('Controls changed; press again');
   if((display.pressedAt??Date.now())<display.armedAt)throw Error('Controls updating; press again');
   if(!display.target)throw Error('Select an agent first');
   result=await bridge.withContext(display,()=>perform(a,display));
  }else result=await perform(a,display);
  k.feedback=null;if(result)k.notice={until:Date.now()+2500,label:result.label,action:a,stamp:display.stamp};
 }catch(error){k.notice=null;k.feedback={until:Date.now()+10000,message:clean(error.message),action:a,stamp:display.stamp};inspectorMessage=String(error.message).replace(/[\x00-\x1f\x7f]/g,'').slice(0,160);render();emit('showAlert',ctx,{});}
 await refresh(true);render();
}
async function initialize(){await refresh();if(!startupSelectionRead&&config.allowClipboardFocus){startupSelectionRead=true;try{await bridge.focused();}catch{}}render();}
function inspectorStatus(context,message){
 if(message!==undefined)inspectorMessage=message;
 const a=selected(),agents=bridge.agents||[];
 emit('sendToPropertyInspector',context,{kind:'status',preferences:preferences.view(config),offline,agents:agents.length,codex:agents.filter(a=>a.app==='codex').length,metadata:agents.filter(a=>a.app==='codex'&&a.chatId).length,selected:a?{app:a.app,state:a.state,mode:a.collaborationMode||null}:null,selectionNotice:!!bridge.selectionNotice,setupBusy,message:inspectorMessage||settingsError});
}
async function inspectorRequest(e){
 if(!keys.has(e.context))return;
 if(e.payload?.kind==='status'){inspectorStatus(e.context);return;}
 if(e.payload?.kind!=='setupFooter')return;
 if(setupBusy){inspectorStatus(e.context,'Setup already running');return;}
 const a=selected();setupBusy=true;inspectorStatus(e.context,'Configuring the selected agent in Rex…');
 try{
  if(!config.allowClipboardFocus)throw Error('Enable visible-pane checks first');
  if(a?.app!=='codex'||!['idle','done'].includes(a.state))throw Error('Select a ready Codex agent on the deck');
  const display={target:C.snapshot(a),verifyChat:false};
  await bridge.withContext(display,()=>require('./setup-daemon-controls').configure(bridge,a,__dirname));
  await refresh(true);inspectorStatus(e.context,'Status line configured; no prompt submitted');
 }catch(error){inspectorStatus(e.context,String(error.message).replace(/[\x00-\x1f\x7f]/g,'').slice(0,160));}
 finally{setupBusy=false;inspectorStatus(e.context);}
}
ws.on('open',()=>{ws.send(JSON.stringify({event:arg('-registerEvent'),uuid:arg('-pluginUUID')}));ws.send(JSON.stringify({event:'getGlobalSettings',context:arg('-pluginUUID')}));queue=queue.then(initialize).catch(()=>{});});
ws.on('message',raw=>{try{const e=JSON.parse(raw);if(e.event==='didReceiveGlobalSettings'){try{globalPreferences=preferences.normalize(e.payload?.settings?.preferences);loadConfig();if(!config.allowClipboardFocus){bridge.lastTarget=null;bridge.draft=null;bridge.picker=null;}else if(!startupSelectionRead)queue=queue.then(initialize).catch(()=>{});}catch{settingsError='Saved preferences invalid; keeping the last valid configuration';}render();}if(e.event==='sendToPlugin'){queue=queue.then(()=>inspectorRequest(e)).catch(()=>{});}if(e.event==='willAppear'){keys.set(e.context,{settings:e.payload.settings||{},coordinates:e.payload.coordinates});render();}if(e.event==='willDisappear')keys.delete(e.context);if(e.event==='didReceiveSettings'&&keys.has(e.context)){keys.get(e.context).settings=e.payload.settings||{};render();}if(e.event==='keyDown'){const shown=keys.get(e.context)?.presented,display=shown?{...shown,pressedAt:Date.now(),setupBusy}:undefined;queue=queue.then(()=>press(e.context,display)).catch(()=>{});}}catch{}});
ws.on('close',()=>process.exit(0));ws.on('error',()=>process.exit(1));setInterval(refresh,2000);setInterval(render,250);
