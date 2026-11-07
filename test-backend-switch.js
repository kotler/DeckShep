'use strict';
const assert=require('node:assert/strict'),{harness}=require('./test-plugin-harness');
const prefs=(h,scope,preferences)=>{h.socket.emit('message',JSON.stringify({event:'sendToPlugin',context:scope+':1,0',payload:{kind:'preferences',preferences}}));return h.api.settled();};
(async()=>{
 const h=harness();h.api.keys.clear();await h.appear('rex');await h.profilePress('rex',0,0);h.tick();const rex=h.controller('rex'),oldBridge=rex.bridge;
 const base=h.live[0];h.setLive(Array.from({length:7},(_,i)=>({...base,block:i===0?'a':i===1?'b':'extra'+i,pid:42+i,chatId:'chat-'+i})));await rex.refresh();await h.profilePress('rex',1,1);await h.profilePress('rex',1,4);assert.equal(rex.getPage(),1);assert.equal(rex.getBank(),1);
 rex.bridge.draft={target:{session:'s',block:'a',pid:42},action:'review'};
 const stale=rex.keys.get('rex:2,2').presented;h.hide('rex');assert.equal(rex.bridge.draft,null);await h.appear('herdr');const herdr=h.controller('herdr');
 assert.notEqual(herdr.bridge,rex.bridge);assert.equal(herdr.bridge.config.backend,'herdr');assert.equal(herdr.bridge.config.allowClipboardFocus,false);await h.profilePress('herdr',0,1);h.tick();assert.equal(herdr.selected().block,'b');assert.equal(herdr.selected().session,'herdr:fixture');
 const calls=h.calls.length;await herdr.press('herdr:2,2',stale);assert.equal(h.calls.length,calls,'Rex display cannot act through Herdr');
 h.change('b',{state:'working'});await herdr.refresh();h.tick();assert.equal(herdr.mapping(herdr.keys.get('herdr:2,0')),'none');await h.profilePress('herdr',1,4);await h.profilePress('herdr',1,4);assert.equal(herdr.getPage(),2);assert.equal(herdr.mapping(herdr.keys.get('herdr:1,0')),'inputInfo');
 h.hide('herdr');await h.appear('rex');assert.equal(rex.bridge,oldBridge);assert.equal(rex.selected().block,'a');assert.equal(rex.getPage(),1);assert.equal(rex.getBank(),1);assert.equal(herdr.getPage(),2);
 const n=h.calls.length;await rex.press('rex:2,2',stale);assert.equal(h.calls.length,n,'disappeared/reappeared contexts cannot revive old presses');
 // Scoped connection edits and shared presentation edits retain the other runtime.
 await h.appear('herdr');const rexBridge=rex.bridge;await prefs(h,'herdr',{herdrSocketPath:'/tmp/explicit-herdr.sock',herdrTitleIdentity:true});assert.equal(herdr.bridge.config.herdr.socketPath,'/tmp/explicit-herdr.sock');assert.equal(rex.bridge,rexBridge);assert.equal(rex.getBank(),1);assert.equal(rex.getPage(),1);
 await prefs(h,'herdr',{animationEnabled:false,prompts:{review:'Shared review text'}});assert.equal(rex.bridge.config.animation.enabled,false);assert.equal(rex.bridge.config.prompts.review,'Shared review text');assert.equal(herdr.bridge.config.prompts.review,'Shared review text');assert.equal(rex.getPage(),1);
 const current=herdr.bridge;await prefs(h,'rex',{backend:'herdr'});assert.equal(rex.bridge.config.backend,'rex');assert.equal(herdr.bridge,current,'wrong-profile settings never rebind another runtime');
 // Settings arriving during an action are serialized; hidden queued navigation is discarded.
 const busy=harness();busy.api.keys.clear();await busy.appear('rex');await busy.profilePress('rex',0,0);busy.tick();let release,start;const started=new Promise(r=>start=r),finish=new Promise(r=>release=r);
 const runningBridge=busy.api.bridge;busy.api.bridge.cycleControl=async()=>{start();await finish;await runningBridge.run(['send-key','-s','s','-b','a','enter']);};busy.socket.emit('message',JSON.stringify({event:'keyDown',context:'rex:2,0'}));await started;busy.socket.emit('message',JSON.stringify({event:'keyDown',context:'rex:1,2'}));busy.hide('rex');const appearing=busy.appear('herdr');release();await appearing;assert.equal(busy.calls.length,0,'no hidden queued navigation is sent');assert.equal(busy.controller('herdr').bridge.config.backend,'herdr');
 // A delayed read from an old socket cannot hydrate its replacement.
 let resolve;const late=new Promise(r=>resolve=r),old=herdr.bridge;herdr.metadata.refresh=async()=>late;const pending=herdr.refreshMetadata(true);await prefs(h,'herdr',{herdrSocketPath:'/tmp/replacement-herdr.sock'});assert.notEqual(herdr.bridge,old);resolve([{...old.agents?.[0],chatName:'Wrong socket',model:'private-old'}]);await pending;assert(!herdr.bridge.agents?.some(a=>a.chatName==='Wrong socket'));
 console.log('PASS separate profile routing, independent selection/banks/pages, safe legacy Rex keys, draft invalidation, stale/context-reuse refusal, shared presentation, scoped connections, hidden queued controls and delayed metadata isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
