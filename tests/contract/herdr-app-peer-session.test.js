const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { createConnection } = require('node:net');
const { nativeAppPeerSession } = require('../../src/platform/app-peer-session');
const { pinPeerHelper } = require('../../src/platform/peer-helper-integrity');
const {
  peerSessionFrame,
  uniquePeerJSON,
} = require('../../src/platform/peer-session-frame');
const {
  fixtureBuild,
  senderFixture,
  hash,
} = require('../helpers/herdr-app-focus');
const { fakeServer } = require('../helpers/herdr-app-server');

async function fixture(t, behavior = '', paused = false) {
  const build = fixtureBuild(t),
    helper = path.join(build.root, 'peer-helper');
  const { protocol, ...image } = build.evidence;
  fs.writeFileSync(
    helper,
    '#!' +
      process.execPath +
      '\n' +
      `
    const fs = require('node:fs');
    if (!fs.fstatSync(3).isSocket()) process.exit(1);
    const peer = ${JSON.stringify(image)};
    const lines = require('node:readline').createInterface({input:process.stdin});
    function frame(seq,state) {
      const value = {protocol:2,seq,state,peer};
      if(seq === 2) value.socketToken = 'unavailable';
      process.stdout.write(JSON.stringify(value)+'\\n');
    }
    ${
      behavior ||
      `frame(0,'captured');
    lines.on('line', text => {
      const command = JSON.parse(text);
      if(command.op === 'check') frame(1,'checked');
      else if(command.op === 'finish') {
        frame(2,'finished'); lines.close(); process.stdin.destroy(); fs.closeSync(3);
      }
    });`
    }
  `,
    { mode: 0o700 },
  );
  const peer = await fakeServer(t, (socket) => socket.end('{"ok":true}\n'));
  const socket = createConnection({ path: peer.file, allowHalfOpen: true });
  t.after(() => socket.destroy());
  let reply = '';
  socket.on('data', (bytes) => {
    reply += bytes;
  });
  await once(socket, 'connect');
  if (paused) socket.pause();
  return {
    build,
    helper,
    socket,
    reply: () => reply,
    open: (signal) =>
      nativeAppPeerSession(helper, hash(fs.readFileSync(helper)))(
        socket,
        signal,
      ),
  };
}

test('persistent production bridge resumes at readiness and finalizes after EOF while preserving paused callers', async (t) => {
  for (const paused of [false, true]) {
    const value = await fixture(t, '', paused),
      session = await value.open();
    assert.equal(value.socket.readableFlowing, !paused);
    assert.deepEqual(session.captured, value.build.evidence);
    assert.deepEqual(await session.check(), session.captured);
    value.socket.resume();
    const ended = once(value.socket, 'end');
    value.socket.write('{"status":true}\n');
    await ended;
    assert.equal(value.reply(), '{"ok":true}\n');
    assert.deepEqual(await session.finish(), session.captured);
    await assert.rejects(session.finish(), /Peer unverified/);
    await session.dispose();
  }
});

test(
  'bridge bounds output, malformed/extra frames, silent helpers, early exits and cancellation',
  { timeout: 10000 },
  async (t) => {
    for (const behavior of [
      `process.stdout.write('bad\\n');`,
      `process.stdout.write(Buffer.from([255,10]));`,
      `process.stdout.write('x'.repeat(9000));`,
      `frame(0,'captured'); frame(0,'captured');`,
      `process.exit(1);`,
      `setInterval(()=>{},1000);`,
      `frame(4,'captured');`,
      `process.stdout.write(JSON.stringify({protocol:2,seq:0,state:'captured',peer,extra:1})+'\\n');`,
    ]) {
      const value = await fixture(t, behavior);
      let session;
      await assert.rejects(async () => {
        session = await value.open();
        await session.check();
      }, /Peer unverified/);
      await session?.dispose();
    }
    const value = await fixture(t),
      before = new AbortController();
    before.abort();
    await assert.rejects(value.open(before.signal), /Peer unverified/);
    const during = new AbortController(),
      session = await value.open(during.signal);
    during.abort();
    await assert.rejects(session.check(), /Peer unverified/);
    await session.dispose();
    const idle = await fixture(t),
      disposed = await idle.open();
    await disposed.dispose();
    await assert.rejects(disposed.check(), /Peer unverified/);
  },
);

test('bridge burns overlapping or reordered checks and refuses late helper/file changes', async (t) => {
  const value = await fixture(
    t,
    `frame(0,'captured'); lines.on('line',()=>{});`,
  );
  const session = await value.open(),
    checking = session.check();
  await assert.rejects(session.check(), /Peer unverified/);
  await assert.rejects(checking, /Peer unverified/);
  await session.dispose();
  const reordered = await fixture(t),
    second = await reordered.open();
  await assert.rejects(second.finish(), /Peer unverified/);
  await second.dispose();
  const changed = await fixture(t),
    third = await changed.open();
  fs.appendFileSync(changed.helper, '\n// changed');
  await assert.rejects(third.check(), /Peer unverified/);
  await third.dispose();
});

test('helper approval pins reviewed bytes and trusted ancestors, and refuses links or mutable images', async (t) => {
  const value = await fixture(t),
    file = value.helper;
  const approved = hash(fs.readFileSync(file)),
    check = pinPeerHelper(file, approved);
  check();
  for (const [name, digest] of [
    [file, ''],
    [file, 'a'.repeat(64)],
    ['relative', approved],
  ])
    assert.throws(() => pinPeerHelper(name, digest), /Peer unverified/);
  const link = file + '-link';
  fs.symlinkSync(file, link);
  assert.throws(() => pinPeerHelper(link, approved), /Peer unverified/);
  fs.chmodSync(file, 0o722);
  assert.throws(check, /Peer unverified/);
  assert.throws(() => pinPeerHelper(file, approved), /Peer unverified/);
  fs.chmodSync(file, 0o700);
  fs.linkSync(file, file + '-hard');
  assert.throws(() => pinPeerHelper(file, approved), /Peer unverified/);
  fs.unlinkSync(file + '-hard');
  fs.chmodSync(value.build.root, 0o777);
  assert.throws(() => pinPeerHelper(file, approved), /Peer unverified/);
  fs.chmodSync(value.build.root, 0o700);
});

test('strict frame parser rejects duplicate/escaped keys and never exposes raw identities in errors', () => {
  assert.deepEqual(uniquePeerJSON('{"a":[1,true,null,{"b":"c"}]}'), {
    a: [1, true, null, { b: 'c' }],
  });
  for (const text of [
    '{"a":1,"\\u0061":2}',
    '{"p":{"x":1,"x":2}}',
    '{}bad',
    '[]',
    '{}',
    '{"protocol":2}',
  ])
    assert.throws(() => peerSessionFrame(Buffer.from(text), 0, 'captured'));
});

test('real sender uses a per-connection session and refuses changed final evidence after a single write', async (t) => {
  for (const changed of [false, true]) {
    let build,
      armed = false,
      captures = 0,
      checks = 0,
      finishes = 0,
      disposals = 0;
    const x = await senderFixture(t, {
      sessions: async () => {
        const image = structuredClone(build.evidence);
        captures++;
        return {
          captured: image,
          check: async () => {
            checks++;
            return image;
          },
          finish: async () => {
            finishes++;
            return changed && armed && x.peer.calls.at(-1).do
              ? { ...image, pidVersion: image.pidVersion + 1 }
              : image;
          },
          dispose: async () => {
            disposals++;
          },
        };
      },
      beforeObserve: (value) => {
        build = value;
      },
    });
    armed = true;
    if (!changed) {
      await x.sender.deliver({ kind: 'requestFocus' }, x.permit());
      assert.equal(x.focusCalls().length, 1);
      assert.equal(captures, checks);
      assert.equal(captures, finishes);
      assert.equal(captures, disposals);
    } else {
      await assert.rejects(
        x.sender.deliver({ kind: 'requestFocus' }, x.permit()),
        /Focus uncertain/,
      );
      assert.equal(x.focusCalls().length, 1);
      assert.equal(captures, disposals);
    }
  }
});
