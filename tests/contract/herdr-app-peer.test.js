const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AppPeerVerifier,
  APP_FOCUS_RECORDS,
} = require('../../src/terminals/herdr-app/peer');
const {
  inspectAppBuild,
} = require('../../src/terminals/herdr-app/build-files');
const { validate } = require('../../src/schemas');
const { fixtureBuild, hash } = require('../helpers/herdr-app-focus');

test('peer/build verification needs one exact record and stable independently supplied process evidence', async (t) => {
  const x = fixtureBuild(t),
    socket = {},
    seen = [];
  const verifier = new AppPeerVerifier(
    async (value) => {
      seen.push(value);
      return structuredClone(x.evidence);
    },
    [x.record],
    x.decoder,
  );
  const binding = await verifier.verify(socket, 'endpoint-1');
  assert.equal(binding.recordKey, x.record.key);
  assert.match(binding.key, /^[a-f0-9]{64}$/);
  assert.deepEqual(seen, [socket, socket]);
  assert(Object.isFrozen(binding));
  binding.assertUnchanged();
  assert(!JSON.stringify(binding).includes(x.root));
  x.record.version = 'changed';
  assert.equal((await verifier.verify(socket, 'endpoint-1')).key, binding.key);
  assert.notEqual(
    (await verifier.verify(socket, 'endpoint-2')).key,
    binding.key,
  );
  x.evidence.pidVersion++;
  assert.notEqual(
    (await verifier.verify(socket, 'endpoint-1')).key,
    binding.key,
  );
});
test('the production request allowlist is empty and refuses before probing any peer or reading a bundle', async () => {
  assert.deepEqual(APP_FOCUS_RECORDS, []);
  assert(Object.isFrozen(APP_FOCUS_RECORDS));
  let calls = 0;
  const verifier = new AppPeerVerifier(async () => {
    calls++;
    throw Error('private');
  });
  assert.throws(() => verifier.assertConfigured(), /Build mismatch/);
  await assert.rejects(verifier.verify({}, 'endpoint'), /Peer unverified/);
  assert.equal(calls, 0);
});
test('changed build, hashes, signature or record ambiguity never satisfy a request record', async (t) => {
  const x = fixtureBuild(t);
  for (const field of [
    'version',
    'build',
    'executableSha256',
    'plistSha256',
    'cdHash',
  ]) {
    const record = {
      ...x.record,
      [field]:
        field === 'version'
          ? '0.1.15'
          : field === 'build'
            ? 'other'
            : 'b'.repeat(field === 'cdHash' ? 40 : 64),
    };
    const verifier = new AppPeerVerifier(
      async () => x.evidence,
      [record],
      x.decoder,
    );
    await assert.rejects(verifier.verify({}, 'endpoint'), /Peer unverified/);
  }
  const ambiguous = new AppPeerVerifier(
    async () => x.evidence,
    [x.record, { ...x.record, key: 'second-record' }],
    x.decoder,
  );
  await assert.rejects(ambiguous.verify({}, 'endpoint'), /Peer unverified/);
  assert.throws(
    () => new AppPeerVerifier(async () => x.evidence, [x.record, x.record]),
    /Build mismatch/,
  );
  for (const record of [
    { ...x.record, contract: 2 },
    { ...x.record, bundleId: 'other' },
    { ...x.record, executable: 'Other' },
    { ...x.record, control: 'focus' },
  ])
    assert.throws(() => new AppPeerVerifier(async () => x.evidence, [record]));
});
test('missing/wrong UID, malformed signing evidence, PID reuse and exec changes during verification refuse privately', async (t) => {
  const x = fixtureBuild(t);
  for (const evidence of [
    {},
    { ...x.evidence, uid: x.evidence.uid + 1 },
    { ...x.evidence, protocol: 2 },
    { ...x.evidence, pid: 0 },
    { ...x.evidence, pidVersion: 0 },
    { ...x.evidence, startSeconds: '0' },
    { ...x.evidence, cdHash: '' },
    { ...x.evidence, executable: 'relative' },
    { ...x.evidence, private: 'do not echo' },
  ]) {
    const verifier = new AppPeerVerifier(
      async () => evidence,
      [x.record],
      x.decoder,
    );
    await assert.rejects(
      verifier.verify({}, 'endpoint'),
      (error) => error.message === 'Peer unverified',
    );
  }
  for (const field of ['pidVersion', 'startMicros', 'cdHash', 'executable']) {
    let calls = 0;
    const verifier = new AppPeerVerifier(
      async () => {
        const value = structuredClone(x.evidence);
        if (calls++)
          value[field] =
            typeof value[field] === 'number'
              ? value[field] + 1
              : field === 'cdHash'
                ? 'b'.repeat(40)
                : value[field] + 'x';
        return value;
      },
      [x.record],
      x.decoder,
    );
    await assert.rejects(verifier.verify({}, 'endpoint'), /Peer unverified/);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    new AppPeerVerifier(
      async () => {
        throw Error('private path');
      },
      [x.record],
      x.decoder,
    ).verify({}, 'endpoint', controller.signal),
    /Peer unverified/,
  );
  const cancelled = new AbortController();
  const verifier = new AppPeerVerifier(
    async () => {
      cancelled.abort();
      return x.evidence;
    },
    [x.record],
    x.decoder,
  );
  await assert.rejects(
    verifier.verify({}, 'endpoint', cancelled.signal),
    /Peer unverified/,
  );
});
test('bundle inspection rejects symlinks, hardlinks, writable components and malformed or replaced build files', async (t) => {
  for (const mutate of [
    (x) => fs.chmodSync(x.executable, 0o622),
    (x) => fs.chmodSync(path.dirname(x.executable), 0o777),
    (x) => fs.chmodSync(path.dirname(x.executable), 0o1777),
    (x) => fs.linkSync(x.executable, path.join(x.root, 'hardlink')),
    (x) => {
      fs.renameSync(x.executable, x.executable + '.saved');
      fs.symlinkSync(x.executable + '.saved', x.executable);
    },
    (x) => {
      fs.renameSync(
        path.dirname(x.executable),
        path.dirname(x.executable) + '.saved',
      );
      fs.symlinkSync(
        path.dirname(x.executable) + '.saved',
        path.dirname(x.executable),
      );
    },
    (x) => fs.writeFileSync(x.executable, ''),
    (x) => {
      fs.unlinkSync(x.executable);
      fs.mkdirSync(x.executable);
    },
    (x) => fs.writeFileSync(x.plist, '{}'),
    (x) => fs.writeFileSync(x.plist, 'not JSON'),
    (x) => {
      x.metadata.CFBundleIdentifier = 'other';
      fs.writeFileSync(x.plist, JSON.stringify(x.metadata));
    },
    (x) => {
      x.metadata.CFBundleExecutable = 'other';
      fs.writeFileSync(x.plist, JSON.stringify(x.metadata));
    },
    (x) => {
      x.metadata.CFBundleVersion = 14;
      fs.writeFileSync(x.plist, JSON.stringify(x.metadata));
    },
  ]) {
    const x = fixtureBuild(t);
    mutate(x);
    await assert.rejects(
      inspectAppBuild(x.executable, x.decoder),
      (error) => error.message === 'Build mismatch',
    );
  }
  const x = fixtureBuild(t),
    build = await inspectAppBuild(x.executable, x.decoder);
  fs.appendFileSync(x.executable, 'changed');
  assert.throws(() => build.assertUnchanged(), /Build mismatch/);
  for (const executable of [
    'relative',
    '/sample/not-an-app/Contents/MacOS/Herdr',
    x.executable + '\n',
  ])
    await assert.rejects(
      inspectAppBuild(executable, x.decoder),
      /Build mismatch/,
    );
  const y = fixtureBuild(t);
  await assert.rejects(
    inspectAppBuild(y.executable, async (bytes) => {
      fs.appendFileSync(y.plist, ' ');
      return y.decoder(bytes);
    }),
    /Build mismatch/,
  );
});
test('peer and focus schemas reject arbitrary actions/arguments without extending the read-only request union', () => {
  for (const input of [
    { kind: 'focus' },
    { kind: 'keys', keys: ['ENTER'] },
    { kind: 'requestFocus', pane: 'p1' },
    { kind: 'requestFocus', text: 'private' },
  ])
    assert.throws(() => validate('herdrAppFocusInput', input));
  assert.deepEqual(validate('herdrAppFocusInput', { kind: 'requestFocus' }), {
    kind: 'requestFocus',
  });
  assert.throws(() =>
    validate('herdrAppRequest', { do: 'pane.focus', args: { pane: 'p1' } }),
  );
  for (const reply of [
    { ok: false },
    { ok: true, error: 'private' },
    { ok: true, extra: 1 },
  ])
    assert.throws(() => validate('herdrAppFocusReply', reply));
});
test(
  'the default plist decoder reads only fixture bytes and supports real XML metadata',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const x = fixtureBuild(t);
    const plist =
      '<?xml version="1.0"?><plist version="1.0"><dict>' +
      Object.entries(x.metadata)
        .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
        .join('') +
      '</dict></plist>';
    fs.writeFileSync(x.plist, plist);
    const result = await inspectAppBuild(x.executable);
    assert.equal(result.version, '0.1.14');
    assert.equal(result.plistSha256, hash(plist));
  },
);
