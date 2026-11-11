'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { collectRegistration } = require('../poc/rex-hook/registration.cjs');
const {
  fixture,
  payload,
  session,
  blockA,
  blockB,
  threadA,
  threadB,
  pidA,
  pidB,
  daemonPid,
} = require('../poc/rex-hook/fixture.cjs');
const { writePrivate } = require('../../src/agents/codex/hook-files');
const { hookRecord } = require('../../src/agents/codex/hook-contract');
const { hookIdentity } = require('../../src/agents/codex/hook-identity');
function own(t) {
  const f = fixture();
  t.after(() => f.close());
  return f;
}

test('POC subprocess hooks query two explicit Rex panels and persist minimal private observations', async (t) => {
  const f = own(t);
  const first = await f.runHook(payload(threadA));
  const second = await f.runHook(
    payload(threadB),
    { ...f.environment, REX_BLOCK: blockB },
    pidB,
  );
  assert.equal(first.originEvidence, 'reporter-is-foreground');
  assert.equal(second.originEvidence, 'reporter-is-foreground');
  for (const [id, block, pid] of [
    [threadA, blockA, pidA],
    [threadB, blockB, pidB],
  ]) {
    const record = f.record(id);
    assert.equal(record.threadId, id);
    assert.equal(record.block, block);
    assert.equal(record.process.pid, pid);
    assert.equal(record.session, session);
    assert.equal(record.controlAuthority, false);
    assert.equal(hookRecord.safeParse(record).success, false);
    const bytes = fs.readFileSync(
      path.join(f.directory, `candidate-${id}.json`),
      'utf8',
    );
    for (const sensitive of [
      'PRIVATE_POC_PROMPT',
      '/fixture/project',
      'transcript',
      '/fixture/rex-poc.sock',
    ])
      assert(!bytes.includes(sensitive));
    assert.equal(
      fs.statSync(path.join(f.directory, `candidate-${id}.json`)).mode & 0o777,
      0o600,
    );
  }
  assert.equal(fs.statSync(f.directory).mode & 0o777, 0o700);
  assert.deepEqual(
    f.reads().map((read) => read.block),
    [blockA, blockA, blockB, blockB],
  );
  assert(f.reads().every((read) => read.method === 'process'));
});

test('POC registration uses launch context even when another GUI panel is active', async (t) => {
  const f = own(t);
  assert.equal(f.data.activeBlock, blockB);
  await f.runHook();
  assert.equal(f.record(threadA).block, blockA);
  assert.equal(f.record(threadA).process.pid, pidA);
});

test('POC reproduces a shared daemon misassociation when a second hook inherits the first panel context', async (t) => {
  const f = own(t);
  await f.runHook(payload(threadA), f.environment, daemonPid);
  // Only the test oracle knows B originated here; that fact is never passed to the hook.
  const result = await f.runHook(payload(threadB), f.environment, daemonPid);
  const second = f.record(threadB);
  assert.equal(second.block, blockA);
  assert.equal(second.process.pid, pidA);
  assert.notEqual(second.block, blockB);
  assert.equal(result.originEvidence, 'unverified');
  assert.equal(result.controlAuthority, false);
  await assert.rejects(
    hookIdentity(
      { app: 'codex' },
      {
        setup: f.setup,
        directory: f.directory,
        inspect: async () =>
          assert.fail('POC files cannot trigger a production process probe'),
      },
    ),
    /report unavailable/,
  );
});

test('POC shared daemon with distinct panel contexts collects both PIDs but does not invent origin proof', async (t) => {
  const f = own(t);
  await f.runHook(payload(threadA), f.environment, daemonPid);
  await f.runHook(
    payload(threadB),
    { ...f.environment, REX_BLOCK: blockB },
    daemonPid,
  );
  assert.equal(f.record(threadA).process.pid, pidA);
  assert.equal(f.record(threadB).process.pid, pidB);
  assert.equal(f.record(threadA).originEvidence, 'unverified');
  assert.equal(f.record(threadB).originEvidence, 'unverified');
});

for (const field of ['REX_SESSION', 'REX_BLOCK', 'REX_SERVER'])
  test(`POC refuses missing ${field} without guessing the active panel`, async (t) => {
    const f = own(t);
    delete f.ports.environment[field];
    await assert.rejects(collectRegistration(f.ports));
    assert.deepEqual(f.reads(), []);
    assert.deepEqual(f.records(), []);
  });

for (const [name, patch] of [
  ['a shell in the panel', { name: 'zsh' }],
  ['a foreign owner', { user_id: process.getuid() + 1 }],
  ['a different project', { cwd: '/fixture/other' }],
  ['a malformed PID', { pid: '42001' }],
])
  test(`POC refuses ${name} without writing an observation`, async (t) => {
    const f = own(t);
    Object.assign(f.data.panels[session + '|' + blockA].foreground, patch);
    f.write();
    await assert.rejects(collectRegistration(f.ports));
    assert.deepEqual(f.records(), []);
  });

for (const kind of ['PID', 'generation'])
  test(`POC refuses a ${kind} change between Rex reads`, async (t) => {
    const f = own(t),
      read = f.ports.executeRex;
    let count = 0;
    f.ports.executeRex = async (args) => {
      const result = await read(args);
      if (++count === 1) {
        const panel = f.data.panels[session + '|' + blockA];
        if (kind === 'PID') panel.foreground.pid = pidB;
        else panel.generation++;
        f.write();
      }
      return result;
    };
    await assert.rejects(collectRegistration(f.ports), /foreground changed/);
    assert.deepEqual(f.records(), []);
  });

test('POC refuses PID reuse and late setup revocation before commit', async (t) => {
  const f = own(t),
    inspect = f.ports.inspect;
  let count = 0;
  f.ports.inspect = async (pid) => ({
    ...(await inspect(pid)),
    startedAt: ++count === 1 ? '1794000000.123456' : '1794000000.123457',
  });
  await assert.rejects(collectRegistration(f.ports), /foreground changed/);
  assert.deepEqual(f.records(), []);
  f.ports.inspect = inspect;
  let reporterReads = 0;
  f.ports.inspectReporter = async () => {
    if (++reporterReads === 2)
      writePrivate(f.setup, { ...f.saved, active: false });
    return f.data.processes[pidA];
  };
  await assert.rejects(collectRegistration(f.ports), /setup changed/);
  assert.deepEqual(f.records(), []);
});

test('POC record replacement while a registration awaits cannot be overwritten', async (t) => {
  const f = own(t);
  await collectRegistration(f.ports);
  let reads = 0,
    replacement;
  f.ports.inspectReporter = async () => {
    if (++reads === 2) {
      replacement = { ...f.record(threadA), registrationEpoch: randomUUID() };
      writePrivate(
        path.join(f.directory, `candidate-${threadA}.json`),
        replacement,
      );
    }
    return f.data.processes[pidA];
  };
  await assert.rejects(collectRegistration(f.ports), /record changed/);
  assert.deepEqual(f.record(threadA), replacement);
});

test('POC lifecycle refresh keeps process identity and SessionEnd revokes without reading a replacement panel', async (t) => {
  const f = own(t);
  await collectRegistration(f.ports);
  const before = f.record(threadA);
  f.ports.payload = payload(threadA, 'UserPromptSubmit');
  await collectRegistration(f.ports);
  assert.notEqual(
    f.record(threadA).registrationEpoch,
    before.registrationEpoch,
  );
  assert.deepEqual(f.record(threadA).process, before.process);
  f.ports.environment.REX_BLOCK = blockB;
  f.ports.payload = payload(threadA, 'SessionEnd');
  f.ports.executeRex = async () =>
    assert.fail('SessionEnd never binds a different panel');
  await collectRegistration(f.ports);
  assert.equal(f.record(threadA).ended, true);
  f.ports.payload = payload(threadA, 'UserPromptSubmit');
  await assert.rejects(collectRegistration(f.ports));
  assert.equal(f.record(threadA).ended, true);
});

test('POC refuses disabled setup and redacts subprocess errors and unsafe files', async (t) => {
  const f = own(t);
  writePrivate(f.setup, { ...f.saved, active: false });
  await assert.rejects(collectRegistration(f.ports), /disabled/);
  assert.deepEqual(f.reads(), []);
  writePrivate(f.setup, f.saved);
  f.ports.executeRex = async () => {
    throw Error('/PRIVATE/host/path?token=SECRET');
  };
  await assert.rejects(
    collectRegistration(f.ports),
    (error) => error.message === 'POC registration unavailable' && !error.cause,
  );
  fs.symlinkSync(f.setup, path.join(f.directory, `candidate-${threadA}.json`));
  await assert.rejects(collectRegistration(f.ports));
  assert.deepEqual(f.reads(), []);
});
