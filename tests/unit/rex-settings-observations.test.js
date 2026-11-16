const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  RexSettingsObservations,
} = require('../../src/app/rex-settings-observations');

function fixture() {
  let available = true;
  let started = Promise.withResolvers();
  const focus = {
    source: {},
    visibility: 1,
    agent: {
      session: 'fixture-session',
      block: 'pane',
      pid: 47,
      app: 'codex',
      name: 'codex',
      state: 'working',
      statusAt: 'first',
      cwd: '/fixture/project',
      chatId: 'chat-a',
      rexSettings: {},
    },
  };
  const reads = [],
    published = [];
  const observations = new RexSettingsObservations({
    currentFocus: () => (available ? focus : undefined),
    clock: () => 10000,
    read() {
      const read = Promise.withResolvers();
      reads.push(read);
      started.resolve();
      started = Promise.withResolvers();
      return read.promise;
    },
    published(agent, values) {
      agent.rexSettings = values;
      published.push(values);
    },
  });
  return {
    focus,
    reads,
    published,
    observations,
    unavailable() {
      available = false;
    },
    async readAt(index) {
      while (!reads[index]) await started.promise;
      return reads[index];
    },
  };
}

test('two callers share a read and both finish on picker confirmation before the old reader returns', async () => {
  const { focus, reads, published, observations } = fixture();
  focus.agent.state = 'idle';
  const first = observations.observe(focus);
  const second = observations.observe(focus);
  assert.equal(reads.length, 1);
  assert.equal(
    observations.pickerConfirmed(focus.agent, 'model', { label: 'New' }),
    true,
  );
  await Promise.all([first, second]);

  const next = observations.observe(focus);
  reads[1].resolve({ model: 'New', viewHash: 'new-view' });
  await next;
  reads[0].resolve({ model: 'Old', viewHash: 'old-view' });
  await new Promise(setImmediate);
  assert.deepEqual(published, [{ model: 'New', viewHash: 'new-view' }]);
  assert.equal(focus.agent.rexSettings.viewHash, 'new-view');
});

for (const [change, mutate] of [
  [
    'chat replacement',
    (f) => {
      f.agent.chatId = 'chat-b';
    },
  ],
  [
    'chat becoming unknown',
    (f) => {
      delete f.agent.chatId;
    },
  ],
  [
    'chat becoming known',
    (f) => {
      f.agent.chatId = 'chat-b';
    },
  ],
  [
    'state transition',
    (f) => {
      f.agent.state = 'idle';
    },
  ],
  [
    'working status change',
    (f) => {
      f.agent.statusAt = 'second';
    },
  ],
  [
    'roster entry losing eligibility',
    (f) => {
      delete f.agent.rexSettings;
    },
  ],
  [
    'pane replacement',
    (f) => {
      f.agent.pid++;
    },
  ],
  [
    'directory change',
    (f) => {
      f.agent.cwd = '/fixture/other';
    },
  ],
  [
    'bridge replacement',
    (f) => {
      f.source = {};
    },
  ],
  [
    'profile reappearance',
    (f) => {
      f.visibility++;
    },
  ],
]) {
  test('completion rechecks ' + change + ' without another poll', async () => {
    const { focus, reads, published, observations } = fixture();
    if (change === 'chat becoming known') delete focus.agent.chatId;
    const original = observations.observe(focus);
    mutate(focus);
    reads[0].resolve({ permissions: 'Old', viewHash: 'old-view' });
    await original;
    assert.deepEqual(published, []);
    assert.equal(focus.agent.rexSettings?.permissions, undefined);
    assert.equal(focus.agent.rexSettings?.viewHash, undefined);
  });
}

test('clearing releases a waiter and an old completion cannot publish into a reappeared focus', async () => {
  const { focus, reads, published, observations } = fixture();
  const original = observations.observe(focus);
  observations.clear();
  await original;
  const next = observations.observe(focus);
  reads[0].resolve({ viewHash: 'retired' });
  await new Promise(setImmediate);
  assert.deepEqual(published, []);
  assert.equal(observations.observe(focus), next);
  reads[1].resolve({ viewHash: 'current' });
  await next;
  assert.deepEqual(published, [{ viewHash: 'current' }]);
});

const unreadable = { process: 'fixture-process', why: 'view-unreadable' };

test(
  'a torn initial Codex observation is read again before publishing',
  { timeout: 1500 },
  async () => {
    const { focus, reads, published, observations, readAt } = fixture();
    focus.agent.state = 'idle';
    const pending = observations.observe(focus);
    reads[0].resolve({ ...unreadable });
    // The shared observation stays pending through recovery of the first frame.
    const second = await readAt(1);
    assert.equal(reads.length, 2);
    assert.deepEqual(published, []);
    assert.equal(observations.observe(focus), pending);
    second.resolve({ process: 'fixture-process', viewHash: 'stable' });
    await pending;
    assert.equal(focus.agent.rexSettings.viewHash, 'stable');
  },
);

test(
  'an unreadable initial Codex observation has only one recovery read',
  { timeout: 1500 },
  async () => {
    const { focus, reads, published, observations, readAt } = fixture();
    focus.agent.state = 'idle';
    const pending = observations.observe(focus);
    reads[0].resolve({ ...unreadable });
    const second = await readAt(1);
    second.resolve({ ...unreadable });
    await pending;
    assert.deepEqual(published, [unreadable]);
    assert.equal(reads.length, 2);
    assert.equal(focus.agent.rexSettings.viewHash, undefined);
  },
);

for (const [change, mutate] of [
  ['source replacement', (f) => (f.source = {})],
  ['profile disappearance', (f) => f.visibility++],
  ['process replacement', (f) => f.agent.pid++],
  ['chat replacement', (f) => (f.agent.chatId = 'chat-b')],
  ['chat becoming unknown', (f) => delete f.agent.chatId],
  ['a new turn', (f) => (f.agent.state = 'working')],
  ['directory change', (f) => (f.agent.cwd = '/fixture/other')],
  ['eligibility revoked', (f) => delete f.agent.rexSettings],
]) {
  test(
    'startup recovery rechecks ' + change + ' before reading again',
    async () => {
      const { focus, reads, published, observations } = fixture();
      focus.agent.state = 'idle';
      const pending = observations.observe(focus);
      reads[0].resolve({ ...unreadable });
      await new Promise(setImmediate);
      mutate(focus);
      await pending;
      assert.equal(reads.length, 1);
      assert.deepEqual(published, []);
    },
  );
}

test('startup recovery stops when pane checks no longer supply a focus', async () => {
  const { focus, reads, published, observations, unavailable } = fixture();
  focus.agent.state = 'idle';
  const pending = observations.observe(focus);
  reads[0].resolve({ ...unreadable });
  await new Promise(setImmediate);
  unavailable();
  await pending;
  assert.equal(reads.length, 1);
  assert.deepEqual(published, []);
});

test('retiring startup recovery releases its waiter and prevents another read', async () => {
  const { focus, reads, published, observations } = fixture();
  focus.agent.state = 'idle';
  const pending = observations.observe(focus);
  reads[0].resolve({ ...unreadable });
  await new Promise(setImmediate);
  observations.clear();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(reads.length, 1);
  assert.deepEqual(published, []);
});

test('a torn warm Codex observation still drops its digest without a recovery read', async () => {
  const { focus, reads, published, observations } = fixture();
  focus.agent.state = 'idle';
  const initial = observations.observe(focus);
  reads[0].resolve({ process: 'fixture-process', viewHash: 'stable' });
  await initial;
  const next = observations.observe(focus);
  reads[1].resolve({ ...unreadable });
  await next;
  assert.equal(reads.length, 2);
  assert.equal(published.at(-1).viewHash, undefined);
});
