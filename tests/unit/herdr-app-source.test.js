'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HerdrAppSource } = require('../../src/app/herdr-app-source');

function snapshot(name = 'First', generation = 1) {
  const target = { space: 'space', tab: 'tab', pane: 'pane', terminal: 't1' };
  return {
    provenance: 'app-model',
    verifiedFocus: false,
    endpointGeneration: generation,
    selected: target,
    panes: [{ target, name, reportedApp: 'codex', reportedStatus: 'idle' }],
  };
}
function fixture(verified = true) {
  const ports = [],
    readers = [],
    changes = [];
  function reader() {
    const calls = [];
    let active = 0,
      maxActive = 0;
    return {
      generation: 1,
      peerKey: 'peer',
      recordKey: 'record',
      disposed: 0,
      calls,
      get maxActive() {
        return maxActive;
      },
      observe(signal) {
        const pending = Promise.withResolvers();
        maxActive = Math.max(maxActive, ++active);
        calls.push({ ...pending, signal });
        return pending.promise.finally(() => {
          active--;
        });
      },
      dispose() {
        this.disposed++;
      },
    };
  }
  let helper = true,
    openError;
  const backend = {
    recordCount: verified ? 1 : 0,
    helperAvailable: () => helper,
    create() {
      if (openError) throw Error(openError);
      const port = reader();
      port.deliver = () => {
        throw Error('Fixture has no delivery');
      };
      ports.push(port);
      return port;
    },
  };
  const source = new HerdrAppSource({
    config: () => ({ herdrApp: { home: '/fixture/app' } }),
    backend,
    authority: {},
    reader: () => {
      const local = reader();
      readers.push(local);
      return local;
    },
    changed: (change) => changes.push(change),
  });
  return {
    source,
    ports,
    readers,
    changes,
    backend,
    helper(value) {
      helper = value;
    },
    openError(value) {
      openError = value;
    },
    async ready(value = snapshot()) {
      const poll = source.poll();
      const current = verified ? ports[0] : readers[0];
      current.calls[0].resolve(value);
      await poll;
      return source.stamp;
    },
  };
}

test('retirement releases shared poll callers and a late completion cannot clear the new poll', async () => {
  const f = fixture();
  const captured = await f.ready();
  const first = f.source.poll(),
    joined = f.source.poll();
  assert.equal(first, joined);
  const wait = f.source.waitForPoll(
    captured.sourceId,
    new AbortController().signal,
  );
  f.source.retire();
  await Promise.all([first, joined]);
  await assert.rejects(wait, /Request stale/);
  assert.equal(f.ports[0].disposed, 1);
  assert.equal(f.ports[0].calls[1].signal.aborted, true);

  const replacement = f.source.poll();
  f.ports[0].calls[1].resolve(snapshot('Retired'));
  await new Promise(setImmediate);
  assert.equal(f.source.pending, replacement);
  assert.equal(f.source.poll(), replacement);
  f.ports[1].calls[0].resolve(snapshot('Replacement'));
  await replacement;
  assert.equal(f.source.snapshot.panes[0].name, 'Replacement');
  assert.equal(f.source.stamp.endpointGeneration, captured.endpointGeneration);
  assert.notEqual(f.source.stamp.sourceId, captured.sourceId);
  assert.equal(f.source.matches(captured), false);
  assert.throws(
    () => f.source.portForPress(captured.sourceId),
    /Request stale/,
  );
  assert.throws(
    () => f.source.accept(captured.sourceId, snapshot('Old ack')),
    /Request stale/,
  );
  assert.deepEqual(
    f.changes
      .filter((change) => change.kind === 'observed')
      .map((change) => change.snapshot.panes[0].name),
    ['First', 'Replacement'],
  );
});

test('a press deadline ends its wait while the shared poll can still publish', async () => {
  const f = fixture(false);
  const captured = await f.ready();
  const poll = f.source.poll();
  const deadline = new AbortController();
  const wait = f.source.waitForPoll(captured.sourceId, deadline.signal);
  const read = f.source.readForPress(captured.sourceId, deadline.signal);
  await new Promise(setImmediate);
  assert.equal(f.readers[0].calls.length, 2);
  deadline.abort();
  await assert.rejects(wait, /Request expired/);
  await assert.rejects(read, /App read expired/);
  assert.equal(f.source.pending, poll);
  assert.equal(f.readers[0].calls[1].signal.aborted, false);
  f.readers[0].calls[1].resolve(snapshot('Poll finished'));
  await poll;
  assert.equal(f.source.snapshot.panes[0].name, 'Poll finished');
});

test('a press reads again after the poll and leaves publication to the controller', async () => {
  const f = fixture(false);
  const captured = await f.ready();
  const poll = f.source.poll();
  const signal = new AbortController().signal;
  const read = f.source.readForPress(captured.sourceId, signal);
  await new Promise(setImmediate);
  assert.equal(f.readers[0].calls.length, 2);
  f.readers[0].calls[1].resolve(snapshot('Poll'));
  await poll;
  await new Promise(setImmediate);
  assert.equal(f.readers[0].calls.length, 3);
  assert.equal(f.readers[0].maxActive, 1);
  f.readers[0].calls[2].resolve(snapshot('Fresh'));
  const fresh = await read;
  assert.equal(fresh.panes[0].name, 'Fresh');
  assert.equal(f.source.snapshot.panes[0].name, 'Poll');
  f.source.accept(captured.sourceId, fresh);
  assert.equal(f.source.snapshot, fresh);
});

test('retirement releases a press even when its native read ignores cancellation', async () => {
  const f = fixture(false);
  const captured = await f.ready();
  const read = f.source.readForPress(
    captured.sourceId,
    new AbortController().signal,
  );
  await new Promise(setImmediate);
  f.source.retire();
  await assert.rejects(read, /Request stale/);
  const next = f.source.poll();
  f.readers[1].calls[0].resolve(snapshot('New'));
  await next;
  f.readers[0].calls[1].reject(Error('Late reader failure'));
  await new Promise(setImmediate);
  assert.equal(f.source.snapshot.panes[0].name, 'New');
});

test('expired signals start no new read and a deadline can end an unresponsive fresh read', async () => {
  const f = fixture(false);
  const captured = await f.ready();
  const expired = new AbortController();
  expired.abort();
  await assert.rejects(
    f.source.waitForPoll(captured.sourceId, expired.signal),
    /Request expired/,
  );
  await assert.rejects(
    f.source.readForPress(captured.sourceId, expired.signal),
    /App read expired/,
  );
  assert.equal(f.readers[0].calls.length, 1);
  const deadline = new AbortController();
  const read = f.source.readForPress(captured.sourceId, deadline.signal);
  await new Promise(setImmediate);
  deadline.abort();
  await assert.rejects(read, /App read expired/);
  f.readers[0].calls[1].resolve(snapshot('Too late'));
  await new Promise(setImmediate);
  assert.equal(f.source.snapshot.panes[0].name, 'First');
});

test('helper loss retires verification and local navigation waits for an independent read', async () => {
  const f = fixture();
  const captured = await f.ready();
  assert.equal(f.source.verified, true);
  assert.equal(f.source.portForPress(captured.sourceId), f.ports[0]);
  f.helper(false);
  assert.equal(f.source.check(), false);
  assert.equal(f.source.snapshot, null);
  assert.equal(f.ports[0].disposed, 1);
  const local = f.source.poll();
  assert.equal(f.readers.length, 1);
  assert.equal(f.source.snapshot, null);
  f.readers[0].calls[0].resolve(snapshot('Independent'));
  await local;
  assert.equal(f.source.verified, false);
  assert.equal(f.source.matches(f.source.stamp), true);
  assert.throws(
    () => f.source.portForPress(f.source.stamp.sourceId),
    /Focus refused/,
  );
  assert.equal(f.source.check(), true);

  f.helper(true);
  const stayLocal = f.source.poll();
  assert.equal(f.ports.length, 1);
  f.readers[0].calls[1].resolve(snapshot('Still local'));
  await stayLocal;
  const retry = f.source.poll(true);
  assert.equal(f.readers[0].disposed, 1);
  f.ports[1].calls[0].resolve(snapshot('Verified'));
  await retry;
  assert.equal(f.source.verified, true);
});

test('initial verification failure waits for its first independent observation', async () => {
  const f = fixture();
  f.openError('Build mismatch');
  const first = f.source.poll();
  let finished = false;
  first.then(() => {
    finished = true;
  });
  await new Promise(setImmediate);
  assert.equal(finished, false);
  assert.equal(f.source.snapshot, null);
  assert.equal(f.readers.length, 1);
  f.readers[0].calls[0].resolve(snapshot('Independent'));
  await first;
  assert.equal(f.source.snapshot.panes[0].name, 'Independent');
  assert.equal(f.source.verified, false);
});

test('failure of an established verified source releases its callers before independent recovery', async () => {
  const f = fixture();
  const captured = await f.ready();
  const old = f.source.poll();
  f.ports[0].calls[1].reject(Error('App unavailable'));
  await old;
  assert.equal(f.source.snapshot, null);
  assert.equal(f.ports[0].disposed, 1);
  const recovery = f.source.pending;
  assert(recovery);
  assert.notEqual(recovery, old);
  assert.equal(f.readers.length, 1);
  f.readers[0].calls[0].resolve(snapshot('Recovered'));
  await recovery;
  assert.equal(f.source.snapshot.panes[0].name, 'Recovered');
  assert.equal(f.source.matches(captured), false);
});

for (const verified of [true, false]) {
  test(
    'a changing App view suspends the current reader and then recovers (verified=' +
      verified +
      ')',
    async () => {
      const f = fixture(verified);
      const captured = await f.ready();
      const reader = verified ? f.ports[0] : f.readers[0];
      const poll = f.source.poll();
      reader.calls[1].reject(Error('App selection changed'));
      await poll;
      assert.equal(f.source.snapshot, null);
      assert.equal(reader.disposed, 0);
      assert.equal(f.source.stamp.sourceId, captured.sourceId);
      assert.equal(f.changes.at(-1).kind, 'suspended');
      assert.equal(f.source.matches(captured), false);
      const recovery = f.source.poll();
      reader.calls[2].resolve(snapshot('Recovered'));
      await recovery;
      assert.equal(f.source.snapshot.panes[0].name, 'Recovered');
      assert.equal(f.source.matches(captured), true);
    },
  );
}

test('a changing view with a replaced endpoint retires verification instead of retaining its source', async () => {
  const f = fixture();
  await f.ready();
  const poll = f.source.poll();
  f.ports[0].generation++;
  f.ports[0].calls[1].reject(Error('App selection changed'));
  await poll;
  assert.equal(f.source.snapshot, null);
  assert.equal(f.ports[0].disposed, 1);
  assert.equal(f.changes.at(-1).kind, 'retired');
  assert.equal(f.readers.length, 0);
});

test('an unknown verification failure cannot establish a local fallback', async () => {
  const f = fixture();
  f.openError('Command mismatch');
  await f.source.poll();
  assert.equal(f.source.snapshot, null);
  assert.equal(f.readers.length, 0);
});

test('retiring between the poll wait and fresh-read start performs no read on the old source', async () => {
  const f = fixture(false);
  const captured = await f.ready();
  const read = f.source.readForPress(
    captured.sourceId,
    new AbortController().signal,
  );
  f.source.retire();
  await assert.rejects(read, /Request stale/);
  assert.equal(f.readers[0].calls.length, 1);
});
