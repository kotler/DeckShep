'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { EventEmitter } = require('node:events');
const directory = path.join(__dirname, '../../com.local.rexagents.sdPlugin');
const defaults = require('../../com.local.rexagents.sdPlugin/config.json');
function fixture(allowed = true, fail = false) {
  let socket,
    reads = 0;
  const timers = [];
  const agents = ['a', 'b'].map((block, i) => ({
    session: 's',
    block,
    pid: 42 + i,
    app: 'codex',
    state: 'idle',
    project: 'project',
    chatName: 'Chat ' + block,
  }));
  class Socket extends EventEmitter {
    constructor() {
      super();
      this.readyState = 1;
    }
    send() {}
  }
  class FixtureBridge {
    attachDelivery(kernel) { this.delivery = kernel; }
    constructor(config) {
      this.run = async () => {
        throw Error('No terminal operations expected');
      };
      this.config = config;
      this.slots = agents.map(({ session, block }) => ({ session, block }));
    }
    async discover() {
      this.agents = agents.map((a) => ({ ...a }));
      return this.agents;
    }
    async focused() {
      reads++;
      if (fail) throw Error('Rex focus unavailable');
      this.lastTarget = { session: 's', block: 'b', pid: 43 };
      return this.agents[1];
    }
    slotGaps() {
      return 0;
    }
  }
  class BoundSocket extends Socket {
    constructor() {
      super();
      socket = this;
    }
  }
  const mockedFs = {
    readFileSync: () =>
      JSON.stringify({ ...defaults, allowClipboardFocus: allowed }),
  };
  const { createApplication } = require('../../src/app/controller');
  const app = createApplication({socket:new BoundSocket(),fs:mockedFs,setInterval:(fn,ms)=>timers.push({fn,ms}),backendFactory:config=>new FixtureBridge(config),metadataFactory:()=>({hydrate(){},async refresh(agents){return agents;}})});
  const context = {api:app.getController('rex')};
  const api = context.api;
  for (let column = 0; column < 2; column++)
    api.keys.set(String(column), {
      settings: {},
      coordinates: { column, row: 0 },
    });
  const selected = (column) =>
    Buffer.from(api.keys.get(String(column)).lastImage.split(',')[1], 'base64')
      .toString()
      .includes('id="selected-agent"');
  return { api, socket, timers, selected, reads: () => reads };
}
test('startup selection', async () => {
  const f = fixture();
  f.socket.emit('open');
  await f.api.ready();
  assert.equal(f.reads(), 1);
  assert(!f.selected(0));
  assert(f.selected(1));
  for (let n = 0; n < 3; n++) {
    await f.api.refresh();
    assert(f.selected(1));
  }
  assert.equal(f.reads(), 1);
  f.socket.emit('open');
  await f.api.ready();
  assert.equal(f.reads(), 1);
  const denied = fixture(false);
  denied.socket.emit('open');
  await denied.api.ready();
  assert.equal(denied.reads(), 0);
  assert(!denied.selected(0));
  assert(!denied.selected(1));
  const failed = fixture(true, true);
  failed.socket.emit('open');
  await failed.api.ready();
  assert.equal(failed.reads(), 1);
  assert(!failed.selected(0));
  assert(!failed.selected(1));
  await failed.api.refresh();
  assert.equal(failed.reads(), 1);
  console.log(
    'PASS selected dot initializes from actual Rex selection before key presses, one startup read only, no recurring focus queries, existing opt-in respected and failed reads leave no false selection',
  );
});
