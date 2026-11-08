const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixturePeerLease } = require('../helpers/post-close-peer-lease.cjs');
const { fixtureBuild } = require('../helpers/herdr-app-focus');
const {
  AppPeerVerifier,
  APP_FOCUS_RECORDS,
} = require('../../src/terminals/herdr-app/peer');
const { backendCapabilities } = require('../../src/domain/capabilities');

function fixture(options = {}) {
  const socket = { destroyed: false, fd: 11 },
    current = {
      socket,
      endpoint: 'owned-endpoint',
      generation: 1,
      record: 'fixture-record',
      peer: 'fixture-peer',
      request: 'request-1',
    },
    state = {
      now: 100,
      kernel: 'matched',
      captures: 0,
      closes: 0,
      calls: [],
      image: {
        protocol: 1,
        pid: 11,
        uid: process.getuid(),
        pidVersion: 17,
        startSeconds: '123',
        startMicros: 4,
        executable: '/fixture/owned-peer',
        cdHash: 'a'.repeat(40),
      },
    };
  const session = {
    captured: { kernel: 'matched', image: structuredClone(state.image) },
    async check(mode) {
      state.calls.push(mode);
      if (options.check) return options.check(mode, state);
      return {
        kernel: mode === 'retained' ? state.kernel : 'matched',
        image: structuredClone(state.image),
      };
    },
    close() {
      state.closes++;
      if (options.closeFails) throw Error('private token/path');
    },
  };
  const controller = new AbortController();
  const parameters = {
    socket,
    current: () => current,
    now: () => state.now,
    signal: controller.signal,
    capture: async () => {
      state.captures++;
      return options.capture ? options.capture(session, state) : session;
    },
  };
  return {
    socket,
    current,
    state,
    session,
    controller,
    parameters,
    open: () => fixturePeerLease(parameters),
  };
}
async function written(value) {
  const lease = await value.open();
  await lease.beforeWrite();
  lease.markWritten();
  return lease;
}
function reply(lease) {
  lease.acceptReply(Buffer.from('{"ok":true}\n'));
}

test('fixture contract revalidates the original image after close and grants no control authority', async (t) => {
  for (const kernel of ['matched', 'unavailable']) {
    const value = fixture(),
      lease = await written(value);
    value.state.kernel = kernel;
    reply(lease);
    const proof = await lease.finish();
    assert.deepEqual(proof, {
      proof: 'same-peer-image',
      verifiedFocus: false,
      grantsInput: false,
    });
    assert.deepEqual(value.state.calls, ['connected', 'retained']);
    assert.equal(value.state.captures, 1);
    assert.equal(value.state.closes, 1);
    assert.equal(JSON.stringify(lease), '{}');
    await assert.rejects(lease.finish(), /uncertain/);
    assert.equal(value.state.captures, 1);
    const build = fixtureBuild(t),
      verifier = new AppPeerVerifier(
        async () => proof,
        [build.record],
        build.decoder,
      );
    await assert.rejects(
      verifier.verify({}, 'fixture-endpoint'),
      /Peer unverified/,
    );
  }
  assert.deepEqual(APP_FOCUS_RECORDS, []);
  assert.deepEqual(backendCapabilities['herdr-app'], []);
});

test('missing initial kernel proof, wrong UID and caller-supplied token fields never open a lease', async () => {
  for (const mutate of [
    (value) => {
      value.session.captured.kernel = 'unavailable';
    },
    (value) => {
      value.session.captured.kernel = 'caller-id';
    },
    (value) => {
      value.session.captured.auditToken = 'untrusted';
    },
    (value) => {
      value.session.captured.image.uid++;
    },
    (value) => {
      value.session.captured.image.pidVersion = 0;
    },
  ]) {
    const value = fixture();
    mutate(value);
    await assert.rejects(
      value.open(),
      (error) => error.message === 'Fixture lease refused',
    );
    assert.equal(value.state.closes, 1);
  }
});

test('pre-write revalidation requires a still-matching kernel proof', async () => {
  for (const kernel of ['unavailable', 'different']) {
    const value = fixture({
        check: async (_mode, state) => ({ kernel, image: state.image }),
      }),
      lease = await value.open();
    await assert.rejects(lease.beforeWrite(), /refused/);
    assert.throws(() => lease.markWritten(), /refused/);
    assert.equal(value.state.captures, 1);
  }
});

test('PID/version/start, UID, executable and signing changes refuse before or after dispatch', async () => {
  for (const field of [
    'pid',
    'uid',
    'pidVersion',
    'startSeconds',
    'startMicros',
    'executable',
    'cdHash',
  ]) {
    for (const afterWrite of [false, true]) {
      const value = fixture(),
        lease = afterWrite ? await written(value) : await value.open();
      value.state.image[field] =
        typeof value.state.image[field] === 'number'
          ? value.state.image[field] + 1
          : field === 'cdHash'
            ? 'b'.repeat(40)
            : value.state.image[field] + '1';
      if (afterWrite) {
        reply(lease);
        await assert.rejects(lease.finish(), /uncertain/);
      } else await assert.rejects(lease.beforeWrite(), /refused/);
      assert.equal(value.state.closes, 1);
    }
  }
});

test('socket object, endpoint epoch, record and request changes cannot rebind an existing lease', async () => {
  for (const field of [
    'socket',
    'endpoint',
    'generation',
    'record',
    'peer',
    'request',
  ]) {
    const value = fixture(),
      lease = await value.open();
    value.current[field] =
      field === 'socket'
        ? { destroyed: false, fd: 11 }
        : field === 'generation'
          ? 2
          : 'changed';
    await assert.rejects(lease.beforeWrite(), /refused/);
    assert.equal(value.state.calls.length, 0);
    assert.equal(value.state.captures, 1);
  }
  const value = fixture(),
    lease = await written(value);
  value.current.endpoint = 'replacement';
  assert.throws(() => reply(lease), /uncertain/);
});

test('clock expiry, rollback and non-finite values burn the proof without recapture', async () => {
  for (const now of [1100, 99, NaN, Infinity]) {
    const value = fixture(),
      lease = await written(value);
    reply(lease);
    value.state.now = now;
    await assert.rejects(lease.finish(), /uncertain/);
    assert.equal(value.state.captures, 1);
  }
  const value = fixture(),
    lease = await written(value);
  reply(lease);
  value.state.now = 1099;
  assert.equal((await lease.finish()).proof, 'same-peer-image');
});

test('capture time is included in the deadline, and invalid initial context/abort causes no capture', async () => {
  const slow = fixture({
    capture: async (session, state) => {
      state.now += 1000;
      return session;
    },
  });
  await assert.rejects(slow.open(), /refused/);
  assert.equal(slow.state.closes, 1);
  for (const change of [
    (value) => value.controller.abort(),
    (value) => {
      value.state.now = NaN;
    },
    (value) => {
      value.current.record = '';
    },
  ]) {
    const value = fixture();
    change(value);
    await assert.rejects(value.open(), /refused/);
    assert.equal(value.state.captures, 0);
  }
});

test('no write, no validated reply, repeated write and repeated finish never produce proof', async () => {
  const fresh = fixture(),
    first = await fresh.open();
  await assert.rejects(first.finish(), /refused/);
  const value = fixture(),
    lease = await written(value);
  await assert.rejects(lease.finish(), /uncertain/);
  const another = fixture(),
    repeated = await written(another);
  assert.throws(() => repeated.markWritten(), /uncertain/);
  assert.equal(another.state.captures, 1);
});

test('partial, oversized, malformed, refused and extra-frame replies cannot arm final verification', async () => {
  for (const bytes of [
    Buffer.from('{"ok":true}'),
    Buffer.from('{"ok":true}\n{}\n'),
    Buffer.from('{"ok":true,"extra":1}\n'),
    Buffer.from('{"error":"private path/token"}\n'),
    Buffer.from([255, 10]),
    Buffer.alloc(1000001, 10),
  ]) {
    const value = fixture(),
      lease = await written(value);
    assert.throws(
      () => lease.acceptReply(bytes),
      (error) => error.message === 'Fixture peer uncertain',
    );
    await assert.rejects(lease.finish(), /uncertain/);
    assert.deepEqual(value.state.calls, ['connected']);
  }
});

test('cancellation and disposal invalidate idle and in-flight leases', async () => {
  const idle = fixture(),
    lease = await idle.open();
  idle.controller.abort();
  assert.equal(idle.state.closes, 1);
  await assert.rejects(lease.beforeWrite(), /refused/);
  let release;
  const value = fixture({
      check: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    }),
    active = await value.open();
  const pending = active.beforeWrite();
  await new Promise((resolve) => setImmediate(resolve));
  active.dispose();
  await assert.rejects(pending, /refused/);
  release({ kernel: 'matched', image: value.state.image });
  assert.equal(value.state.closes, 1);
});

test('late capture completion is disposed after abort; overlapping checks cannot grant proof', async () => {
  let release;
  const late = fixture({
    capture: (session) =>
      new Promise((resolve) => {
        release = () => resolve(session);
      }),
  });
  const opening = late.open();
  await new Promise((resolve) => setImmediate(resolve));
  late.controller.abort();
  await assert.rejects(opening, /refused/);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(late.state.closes, 1);
  const value = fixture({ check: () => new Promise(() => {}) }),
    lease = await value.open();
  const pending = lease.beforeWrite();
  await assert.rejects(lease.beforeWrite(), /refused/);
  await assert.rejects(pending, /refused/);
  assert.equal(value.state.closes, 1);
});

test('a silent helper is bounded and failed cleanup cannot yield a positive result', async (t) => {
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => clearTimeout(keepAlive));
  const value = fixture({ check: () => new Promise(() => {}) }),
    lease = await value.open();
  await assert.rejects(lease.beforeWrite(), /refused/);
  assert.equal(value.state.closes, 1);
  const broken = fixture({ closeFails: true }),
    finished = await written(broken);
  reply(finished);
  await assert.rejects(
    finished.finish(),
    (error) => error.message === 'Fixture peer uncertain',
  );
});

test('finalization rejects a changed kernel proof or a context change during fresh inspection', async () => {
  for (const change of [
    (value) => {
      value.state.kernel = 'different';
    },
    (value) => {
      value.current.generation++;
    },
    (value) => {
      value.state.now += 1000;
    },
    (value) => {
      value.socket.destroyed = true;
    },
    (value) => value.controller.abort(),
  ]) {
    let release;
    const value = fixture({
      check: (mode, state) =>
        mode === 'connected'
          ? { kernel: 'matched', image: structuredClone(state.image) }
          : new Promise((resolve) => {
              release = () =>
                resolve({
                  kernel: state.kernel,
                  image: structuredClone(state.image),
                });
            }),
    });
    const lease = await written(value);
    reply(lease);
    const finishing = lease.finish();
    await new Promise((resolve) => setImmediate(resolve));
    change(value);
    release();
    await assert.rejects(
      finishing,
      (error) => error.message === 'Fixture peer uncertain',
    );
    assert.equal(value.state.closes, 1);
    assert.equal(value.state.captures, 1);
  }
});
