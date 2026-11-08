'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GuardPipeline } = require('../../src/guards/pipeline.ts');
const { DeliveryKernel } = require('../../src/app/delivery.ts');
test('all legacy input adapters and provider writes use the final visibility gate', async () => {
  const target = {session:'s',block:'b',pid:42,name:'codex',app:'codex',state:'idle'};
  const current = {scope:'rex',appearance:1,visibility:1,generation:1,backendKey:'rex',page:0,stamp:'stamp',visible:true};
  const display = {...current,action:'model',target,armedAt:0,setupBusy:false,verifyChat:true};
  let active = display, writes = 0;
  const operation = async () => { writes++; return 'ok'; };
  const session = {generation:1,config:{backend:'rex'},agents:[target],discover:async()=>[target],focused:async()=>target,focus:operation,zoom:operation};
  const kernel = new DeliveryKernel(session,new GuardPipeline(()=>current),()=>active);
  await kernel.run(['send-key','-s','s','-b','b','enter'],undefined,operation);
  assert.equal(writes,1);
  current.visible = false;
  for (const call of [
    ()=>kernel.run(['send-key','-s','s','-b','b','enter'],undefined,operation),
    ()=>kernel.run(['send','-s','s','-b','b'],'fixture',operation),
    ()=>kernel.run(['focus','-s','s','b'],undefined,operation),
    ()=>kernel.rpc('agent.send_keys',{target:'b',keys:['enter']},operation),
    ()=>kernel.mutation(target,'thread/settings/update',operation),
  ]) await assert.rejects(call,/Profile changed/);
  assert.equal(writes,1,'late disappearance cannot leak keys, paste, focus or daemon writes');
  current.visible = true;
  await assert.rejects(()=>kernel.run(['new-input-path'],undefined,operation),/Unsupported/);
  assert.equal(writes,1,'unknown terminal methods never default to read-only');
  active = null;
  await assert.rejects(()=>kernel.mutation(target,'thread/settings/update',operation),/No guarded press/);
  assert.equal(writes,1);
});
