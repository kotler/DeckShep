const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  AppSelectionReader,
} = require('../../src/terminals/herdr-app/selection');
const { HerdrAppClient } = require('../../src/terminals/herdr-app/transport');
const { fakeServer } = require('../helpers/herdr-app-server');
const f = require('../fixtures/backends/herdr-app/index.cjs');

function fixture() {
  const world = structuredClone(f.world),
    before = structuredClone(f.status),
    after = structuredClone(f.status),
    calls = [];
  let statuses = 0;
  const port = {
    generation: 1,
    async status() {
      calls.push('status');
      return statuses++ ? after : before;
    },
    async ls() {
      calls.push('ls');
      return world;
    },
  };
  return {
    world,
    before,
    after,
    calls,
    port,
    reader: new AppSelectionReader(port),
  };
}
function target() {
  return { space: 's1', tab: 'c1', pane: 'p1', terminal: 't1' };
}

test('selection feedback retains App provenance without inventing process identity or carrying private source fields', async () => {
  const x = fixture();
  x.world.spaces[0].tabs[0].terminals[0].cwd = '/private/synthetic';
  const snapshot = await x.reader.read();
  assert.deepEqual(x.calls, ['status', 'ls', 'status']);
  assert.deepEqual(snapshot, {
    provenance: 'app-model',
    endpointGeneration: 1,
    panes: [
      {
        target: target(),
        reportedApp: 'codex',
        reportedStatus: 'idle',
        name: null,
      },
    ],
    selected: target(),
    verifiedFocus: false,
  });
  for (const text of [
    'pid',
    'chatId',
    '/sample',
    '/private/synthetic',
    'zoom',
    'errors',
  ])
    assert(!JSON.stringify(snapshot).includes(text));
  x.world.spaces[0].tabs[0].terminals[0].terminal = 't2';
  assert.equal(snapshot.selected.terminal, 't1');
  for (const name of ['focus', 'focused', 'deliver', 'zoom', 'readPane'])
    assert.equal(x.reader[name], undefined);
});

test('UI-scale changes do not masquerade as pane Zoom; absent shown agent still permits model feedback', async () => {
  const x = fixture();
  x.before.agent = x.after.agent = null;
  x.after.zoom = 1.5;
  x.after.font_size = 16;
  assert.deepEqual((await x.reader.read()).selected, target());
});

test('empty App and empty active tab report no selection without fabricating an agent', async () => {
  for (const emptyWorld of [false, true]) {
    const x = fixture();
    x.world.spaces[0].tabs[0].terminals = [];
    for (const status of [x.before, x.after]) {
      status.focused_pane = status.agent = null;
      if (emptyWorld) status.space = status.tab = null;
    }
    if (emptyWorld) x.world.spaces = [];
    const snapshot = await x.reader.read();
    assert.deepEqual(snapshot.panes, []);
    assert.equal(snapshot.selected, null);
    assert.equal(snapshot.verifiedFocus, false);
  }
});

test('remote records are excluded and remote selection is refused even when its address looks local', async () => {
  const x = fixture(),
    remote = structuredClone(x.world.spaces[0]);
  remote.id = 's2';
  remote.machine = 'remote';
  remote.active = false;
  remote.tabs[0].id = 'c2';
  remote.tabs[0].terminals[0].pane = 'p2';
  x.world.spaces.push(remote);
  assert.equal((await x.reader.read()).panes.length, 1);
  for (const change of [
    (y) => {
      y.world.spaces[0].machine = 'remote';
    },
    (y) => {
      y.world.spaces[0].tabs[0].terminals[0].terminal = 'remote/t1';
    },
  ]) {
    const y = fixture();
    change(y);
    await assert.rejects(y.reader.read(), /App selection/);
  }
});

test('status changes, unknown/null panes and swapped shown agents cannot count as selection feedback', async () => {
  for (const field of ['space', 'tab', 'focused_pane', 'agent', 'layout']) {
    const x = fixture();
    x.after[field] = field === 'agent' ? 't2' : 'changed';
    await assert.rejects(x.reader.read(), /App selection changed/);
  }
  for (const pane of [null, 'unknown']) {
    const x = fixture();
    x.before.focused_pane = x.after.focused_pane = pane;
    await assert.rejects(x.reader.read(), /App selection ambiguous/);
  }
  const x = fixture();
  x.before.agent = x.after.agent = 't2';
  await assert.rejects(x.reader.read(), /App selection ambiguous/);
});

test('inconsistent active flags and duplicate topology IDs refuse instead of selecting the first match', async () => {
  for (const change of [
    (x) => {
      x.world.spaces[0].active = false;
    },
    (x) => {
      x.world.spaces[0].tabs[0].active = false;
    },
    (x) => {
      x.world.spaces[0].id = 'other';
    },
    (x) => {
      x.world.spaces[0].tabs[0].id = 'other';
    },
    (x) => {
      x.world.spaces.push(structuredClone(x.world.spaces[0]));
    },
    (x) => {
      x.world.spaces[0].tabs.push(structuredClone(x.world.spaces[0].tabs[0]));
    },
    (x) => {
      x.world.spaces[0].tabs[0].terminals.push(
        structuredClone(x.world.spaces[0].tabs[0].terminals[0]),
      );
    },
    (x) => {
      const other = structuredClone(x.world.spaces[0]);
      other.id = 's2';
      other.tabs[0].id = 'c2';
      other.tabs[0].terminals[0].pane = 'p2';
      x.world.spaces.push(other);
    },
    (x) => {
      const other = structuredClone(x.world.spaces[0].tabs[0]);
      other.id = 'c2';
      other.terminals[0].pane = 'p2';
      x.world.spaces[0].tabs.push(other);
    },
  ]) {
    const x = fixture();
    change(x);
    await assert.rejects(x.reader.read(), /App (topology|selection)/);
  }
});

test('overlays, floats and host errors refuse without reflecting their private values', async () => {
  for (const phase of ['before', 'after']) {
    for (const [field, value] of [
      ['overlays', ['private-overlay']],
      ['floats', { private: { cwd: '/private/synthetic' } }],
      ['errors', ['private error with a path']],
    ]) {
      const x = fixture();
      x[phase][field] = value;
      await assert.rejects(
        x.reader.read(),
        (error) => error.message === 'App view unavailable',
      );
    }
  }
});

test('endpoint epochs must remain positive and unchanged across every observation boundary', async () => {
  for (const generation of [0, -1, 1.5, NaN]) {
    const x = fixture();
    x.port.generation = generation;
    await assert.rejects(x.reader.read(), /App endpoint changed/);
  }
  for (const edge of ['ls', 'status']) {
    const x = fixture();
    const original = x.port[edge];
    let calls = 0;
    x.port[edge] = async (...args) => {
      if (edge === 'ls' || calls++ === 1) x.port.generation++;
      return original(...args);
    };
    await assert.rejects(x.reader.read(), /App endpoint changed/);
  }
});

test('malformed reads, cancellation and overlapping observations produce no authority and release the pending slot', async () => {
  for (const edge of ['ls', 'status']) {
    const x = fixture();
    x.port[edge] = async () => ({});
    await assert.rejects(x.reader.read());
  }
  const x = fixture(),
    cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(x.reader.read(cancelled.signal), /cancelled/);
  assert.deepEqual(x.calls, []);
  let resume;
  x.port.status = () =>
    new Promise((resolve) => {
      resume = resolve;
    });
  const active = new AbortController();
  const pending = x.reader.read(active.signal);
  await assert.rejects(x.reader.read(), /pending/);
  active.abort();
  resume(x.before);
  // Finish with a cancelled caller and then prove a later fresh read works.
  // This port deliberately does not implement transport cancellation.
  await assert.rejects(pending, /expired/);
  x.port.status = async () => x.before;
  assert.equal((await x.reader.read()).verifiedFocus, false);
});

test('bounded observations expire on cancellation or elapsed monotonic budget', async () => {
  for (const timeout of [0, -1, 1001, 1.5, NaN])
    assert.throws(() => new AppSelectionReader(fixture().port, timeout));
  const x = fixture(),
    controller = new AbortController();
  x.port.ls = async () => {
    controller.abort();
    return x.world;
  };
  await assert.rejects(x.reader.read(controller.signal), /expired/);
  const y = fixture();
  y.port.ls = async () => {
    const end = performance.now() + 5;
    while (performance.now() < end) {
      /* Hold the event loop past the deadline. */
    }
    return y.world;
  };
  await assert.rejects(new AppSelectionReader(y.port, 1).read(), /expired/);
});

test('the socket observation uses only status/list/status and never claims verified focus', async (t) => {
  const peer = await fakeServer(
    t,
    (socket, request) => {
      socket.end(JSON.stringify(request.ls ? f.world : f.status) + '\n');
    },
    'herdr-app.sock',
  );
  const client = new HerdrAppClient({ appHome: peer.directory });
  t.after(() => client.dispose());
  const snapshot = await new AppSelectionReader(client).read();
  assert.deepEqual(snapshot.selected, target());
  assert.equal(snapshot.verifiedFocus, false);
  assert.deepEqual(peer.calls, [
    { status: true },
    { ls: true },
    { status: true },
  ]);
});
