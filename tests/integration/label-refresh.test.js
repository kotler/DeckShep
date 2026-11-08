'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  { EventEmitter } = require('node:events');
const { Bridge } = require('../../src/app/session'),
  { AgentMetadata } = require('../../src/agents/codex/metadata');
test('label refresh', async () => {
  const directory = path.join(__dirname, '../../com.kotl3r.deckshep.sdPlugin');
  const baseline = {
    session: 's',
    block: 'b',
    pid: 42,
    cwd: '/project',
    project: 'project',
    app: 'codex',
    state: 'idle',
  };
  class Socket extends EventEmitter {
    constructor() {
      super();
      this.readyState = 1;
    }
    send() {}
  }
  class FixtureBridge extends Bridge {
    async discover() {
      this.agents = [{ ...baseline }];
      return this.agents;
    }
  }
  class FixtureMetadata extends AgentMetadata {
    async read() {
      return {
        chatName: 'Known',
        project: 'project',
        model: 'gpt-6-luna',
        metadataAt: 1000,
      };
    }
  }
  const { createApplication } = require('../../src/app/controller');
  const app = createApplication({
    socket: new Socket(),
    setInterval: () => {},
    backendFactory: (config) => new FixtureBridge(config),
    metadataFactory: (bridge) => new FixtureMetadata(bridge),
  });
  const context = { api: app.getController('rex') };
  const api = context.api;
  api.bridge.slots = [{ session: baseline.session, block: baseline.block }];
  api.keys.set('agent', { settings: {}, coordinates: { column: 0, row: 0 } });
  api.keys.set('reviewer', {
    settings: {},
    coordinates: { column: 3, row: 1 },
  });
  await api.bridge.discover();
  await api.refreshMetadata(true);
  const displayed = () =>
    Buffer.from(
      api.keys.get('agent').lastImage.split(',')[1],
      'base64',
    ).toString();
  assert(displayed().includes('Known'));
  const reviewer = Buffer.from(
    api.keys.get('reviewer').lastImage.split(',')[1],
    'base64',
  ).toString();
  assert(reviewer.includes('>Reviewer<'));
  assert(!reviewer.includes('>Permissions<'));
  assert(!displayed().includes('id="selected-agent"'));
  api.bridge.lastTarget = {
    session: baseline.session,
    block: baseline.block,
    pid: baseline.pid,
  };
  api.render();
  assert(displayed().includes('id="selected-agent"'));
  let resolveRead;
  const delayed = new Promise((resolve) => (resolveRead = resolve));
  api.metadata.read = () => delayed;
  await api.refresh(true);
  assert(displayed().includes('Known'));
  for (let poll = 0; poll < 3; poll++) {
    await api.refresh();
    assert(displayed().includes('Known'));
    assert(!displayed().includes('Name unavailable'));
    assert(displayed().includes('id="selected-agent"'));
  }
  // Navigation/Collapse can discover outside the status refresh, too.
  await api.bridge.discover();
  api.render();
  assert(displayed().includes('Known'));
  resolveRead({
    chatName: 'Updated',
    project: 'project',
    model: 'gpt-6-luna',
    metadataAt: 2000,
  });
  await new Promise(setImmediate);
  assert(displayed().includes('Updated'));
  // A failed read keeps a known label; a different process must not inherit it.
  api.metadata.read = async () => {
    throw Error('Temporary metadata failure');
  };
  await api.refresh(true);
  await new Promise(setImmediate);
  assert(displayed().includes('Updated'));
  api.bridge.agents = [{ ...baseline, pid: 43 }];
  api.render();
  assert(!displayed().includes('Updated'));
  assert(!displayed().includes('id="selected-agent"'));
  api.bridge.agents = [{ ...baseline, cwd: '/other' }];
  api.render();
  assert(!displayed().includes('Updated'));
  console.log(
    'PASS stable rendered names through fresh status records, delayed and failed reads, independent discovery, live rename updates, persistent selection through polls and process/folder cache isolation',
  );
});
