'use strict';
let socket,registration,actionContext,shared=null,lastStatus;
const byId=id=>document.getElementById(id);
const booleans=['allowClipboardFocus','bringToFront','animationEnabled'],promptNames=['review','tests','continue'];
for(const action of ['collapse','banknext','next','more','model','effort','plan','permissions','interrupt','stopTerminals','zoom','steer','queue','review','tests','continue','send','questionPrev','up','questionNext','answer','left','down','right','escape','approvalUp','approvalDown','approvalConfirm','approvalEscape','agent:0','agent:1','agent:2','agent:3','agent:4','none'])byId('action').add(new Option(({effort:'Effort (cycle supported levels)',permissions:'Reviewer (Ask me / Approve for me)',more:'Page selector',interrupt:'Interrupt',stopTerminals:'Stop background terminals',plan:'Plan / Default',banknext:'Agent bank',next:'Next agent',approvalConfirm:'Confirm shown approval choice'})[action]||action,action));
function send(event,payload,context=registration){if(socket?.readyState===1)socket.send(JSON.stringify({event,context,payload,...event==='sendToPlugin'||event==='setSettings'?{action:'com.local.rexagents.key'}:{}}));}
function query(){send('sendToPlugin',{kind:'status'},actionContext);}
function fill(status){
 lastStatus=status;shared=status.preferences;
 byId('connection').textContent=status.offline?'Rex unavailable — open Rex and enable Remote Control':`${status.agents} agent${status.agents===1?'':'s'} · ${status.metadata}/${status.codex} Codex chats identified`;
 byId('selection').textContent=status.selectionNotice?'Rex focus changed. Select an agent on the deck.':status.selected?`Selected: ${status.selected.app} · ${status.selected.state}${status.selected.mode?' · '+status.selected.mode:''}`:'Select an agent on the deck to enable controls.';
 byId('message').textContent=status.message||'';
 for(const key of booleans){byId(key).disabled=status.setupBusy;if(document.activeElement!==byId(key))byId(key).checked=!!shared[key];}
 for(const name of promptNames){byId(name).disabled=status.setupBusy;if(document.activeElement!==byId(name))byId(name).value=shared.prompts[name];}
 byId('setup').disabled=status.offline||status.setupBusy||!shared.allowClipboardFocus||status.selected?.app!=='codex'||!['idle','done'].includes(status.selected?.state);
}
function save(){
 if(!shared)return;
 const next={...shared,prompts:{...shared.prompts}};for(const key of booleans)next[key]=byId(key).checked;for(const name of promptNames)next.prompts[name]=byId(name).value;
 try{shared=RexPreferences.normalize(next);send('setGlobalSettings',{version:1,preferences:shared});byId('message').textContent='Preferences saved';}
 catch(error){byId('message').textContent=error.message;}
}
for(const key of [...booleans,...promptNames])byId(key).addEventListener('change',save);
byId('refresh').addEventListener('click',query);
byId('setup').addEventListener('click',()=>{byId('setup').disabled=true;send('sendToPlugin',{kind:'setupFooter'},actionContext);});
byId('action').addEventListener('change',()=>send('setSettings',{action:byId('action').value},actionContext));
window.connectElgatoStreamDeckSocket=(port,uuid,event,info,actionInfo)=>{
 registration=uuid;const initial=JSON.parse(actionInfo);actionContext=uuid;byId('action').value=initial.payload.settings.action||'';
 socket=new WebSocket('ws://127.0.0.1:'+port);socket.onopen=()=>{socket.send(JSON.stringify({event,uuid}));query();};
 socket.onmessage=raw=>{try{const message=JSON.parse(raw.data);if(message.event==='sendToPropertyInspector'&&message.payload?.kind==='status')fill(message.payload);if(message.event==='didReceiveGlobalSettings')query();}catch{byId('message').textContent='Could not read plugin status';}};
 socket.onclose=()=>{byId('connection').textContent='Plugin disconnected';byId('setup').disabled=true;for(const key of [...booleans,...promptNames])byId(key).disabled=true;};
};
setInterval(query,3000);
