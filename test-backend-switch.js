'use strict';
const assert=require('node:assert/strict'),{harness}=require('./test-plugin-harness');
const event=(h,preferences)=>h.socket.emit('message',JSON.stringify({event:'didReceiveGlobalSettings',payload:{settings:{preferences}}}));
(async()=>{
 const h=harness();await h.ready();const old=h.api.bridge,stale=h.api.keys.get('2,0').presented,staleAgent=h.api.keys.get('0,0').presented,staleNext=h.api.keys.get('1,2').presented;
 event(h,{backend:'herdr',herdrSocketPath:'/tmp/explicit-session.sock'});await h.api.settled();assert.notEqual(h.api.bridge,old);assert.equal(h.api.bridge.config.backend,'herdr');assert.equal(h.api.bridge.config.allowClipboardFocus,false);await h.press(0,0);h.tick();
 assert.equal(h.api.selected().session,'herdr:fixture');const before=h.calls.length;await h.press(2,0,stale);assert.equal(h.calls.length,before,'old Rex presses cannot act on Herdr');await h.press(0,0,staleAgent);await h.press(1,2,staleNext);assert.equal(h.calls.length,before,'old navigation presses cannot focus the new backend');
 h.change('a',{state:'working'});await h.api.refresh();h.tick();assert.equal(h.action(2,0),'none');assert.equal(h.action(2,1),'none');assert.equal(h.action(2,2),'zoom');await h.press(1,4);await h.press(1,4);assert.equal(h.action(1,0),'inputInfo');assert(h.image(1,0).includes('keyboard'));
 const busy=harness();await busy.ready();const original=busy.api.bridge;let release,start;const started=new Promise(r=>start=r),finish=new Promise(r=>release=r);
 original.cycleControl=async()=>{start();await finish;};const press=busy.press(2,0);await started;
 event(busy,{backend:'herdr',herdrSocketPath:'/tmp/second-explicit.sock'});assert.equal(busy.api.bridge,original,'backend selection is deferred until the active action settles');release();await press;assert.notEqual(busy.api.bridge,original);assert.equal(busy.api.bridge.config.backend,'herdr');assert.equal(busy.api.bridge.lastTarget,undefined);
 console.log('PASS explicit backend preferences, clipboard-free Herdr selection, stale Rex press rejection, unavailable composer layouts and safe backend replacement after an active action settles');
})().catch(e=>{console.error(e);process.exitCode=1;});
