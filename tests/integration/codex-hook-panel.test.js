'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  fixture,
  input,
  fact,
  session,
  block,
} = require('../helpers/codex-hook-fixture');
const { runHook } = require('../../src/agents/codex/hook');
const { hookIdentity } = require('../../src/agents/codex/hook-identity');
const {
  readPrivate,
  writePrivate,
} = require('../../src/agents/codex/hook-files');

function prepare(f, event = 'SessionStart') {
  const queries = [];
  const panel = {
    generation: 1,
    pid: 42,
    userId: process.getuid(),
    name: 'codex',
    cwd: '/fixture',
  };
  f.publisher.environment.REX_SERVER = 'unix:///fixture/rex.sock';
  f.publisher.input = (async function* () {
    yield Buffer.from(JSON.stringify(input({ hook_event_name: event })));
  })();
  f.publisher.readPanel = async (target) => {
    queries.push(target);
    return { ...panel };
  };
  return { queries, panel };
}

test('installed hook pipeline collects panel/PID metadata without granting shared-client authority', async (t) => {
  const f = await fixture(t),
    { queries } = prepare(f);
  await runHook(f.publisher);
  const record = readPrivate(f.recordFile);
  const observation = readPrivate(
    f.recordFile.replace(/\.json$/, '.panel.json'),
  );
  assert.equal(record.panelObservation, undefined);
  assert.equal(observation.hookEpoch, record.epoch);
  assert.equal(observation.process.pid, 42);
  assert.equal(observation.controlAuthority, false);
  const status = readPrivate(
    f.recordFile.replace(/\.json$/, '.panel-status.json'),
  );
  assert.equal(status.outcome, 'observed');
  assert.equal(status.phase, 'complete');
  assert.equal(status.hookEpoch, record.epoch);
  assert.equal(observation.originEvidence, 'unverified');
  assert.equal(observation.process.startedAt, fact(42).startedAt);
  assert.deepEqual(
    queries,
    Array(2).fill({ session, block, server: 'unix:///fixture/rex.sock' }),
  );
  for (const secret of [
    'PRIVATE',
    '/fixture/rex.sock',
    '/fixture/codex',
    'transcript',
  ])
    assert(!JSON.stringify(observation).includes(secret));
});

test('hook metadata failure preserves the already-published lifecycle identity', async (t) => {
  const f = await fixture(t);
  prepare(f);
  let published;
  f.publisher.readPanel = async () => {
    published = readPrivate(f.recordFile);
    throw Error('/PRIVATE/path?token=SECRET');
  };
  await runHook(f.publisher);
  assert(
    published && !published.ended,
    'publish lifecycle before optional Rex I/O',
  );
  assert.deepEqual(readPrivate(f.recordFile), published);
  assert.equal(published.panelObservation, undefined);
  const status = readPrivate(
    f.recordFile.replace(/\.json$/, '.panel-status.json'),
  );
  assert.equal(status.outcome, 'unavailable');
  assert.equal(status.phase, 'first-panel');
  assert(!JSON.stringify(status).includes('PRIVATE'));
  assert(!fs.existsSync(f.recordFile.replace(/\.json$/, '.panel.json')));
});

test('hook checkpoints a fixed backend phase before awaiting and never stores native errors', async (t) => {
  const f = await fixture(t);
  prepare(f);
  const statusFile = f.recordFile.replace(/\.json$/, '.panel-status.json');
  f.publisher.readPanel = async (_target, progress) => {
    progress('rex-query');
    const pending = readPrivate(statusFile);
    assert.equal(pending.phase, 'rex-query');
    assert.equal(pending.outcome, 'pending');
    throw Error('/PRIVATE/host/path?secret=TOKEN');
  };
  await runHook(f.publisher);
  const status = readPrivate(statusFile);
  assert.equal(status.phase, 'rex-query');
  assert.equal(status.outcome, 'unavailable');
  assert.equal(status.hasServerEnvironment, true);
  assert.equal(status.validLocalContext, true);
  assert.equal(fs.statSync(statusFile).mode & 0o777, 0o600);
  assert(!/PRIVATE|TOKEN|secret=|host\/path/.test(JSON.stringify(status)));
});

test('SessionEnd never queries or binds a replacement Rex process', async (t) => {
  const f = await fixture(t);
  prepare(f, 'SessionEnd');
  f.publisher.readPanel = async () =>
    assert.fail('no Rex I/O during SessionEnd');
  await runHook(f.publisher);
  assert.equal(readPrivate(f.recordFile).ended, true);
  assert.equal(readPrivate(f.recordFile).panelObservation, undefined);
});

test('a later SessionEnd wins over an in-flight panel observation', async (t) => {
  const f = await fixture(t);
  const { panel } = prepare(f);
  let ended;
  f.publisher.readPanel = async () => {
    ended = {
      ...readPrivate(f.recordFile),
      ended: true,
      epoch: require('node:crypto').randomUUID(),
    };
    writePrivate(f.recordFile, ended);
    return { ...panel };
  };
  await runHook(f.publisher);
  assert.deepEqual(readPrivate(f.recordFile), ended);
  assert.equal(ended.panelObservation, undefined);
  assert(!fs.existsSync(f.recordFile.replace(/\.json$/, '.panel.json')));
});

for (const [name, patch] of [
  ['foreign owner', { userId: process.getuid() + 1 }],
  ['shell process', { name: 'zsh' }],
  ['different directory', { cwd: '/other' }],
])
  test(`hook refuses a panel observation for a ${name} while preserving its report`, async (t) => {
    const f = await fixture(t);
    const { panel } = prepare(f);
    Object.assign(panel, patch);
    await runHook(f.publisher);
    assert(readPrivate(f.recordFile));
    assert(!fs.existsSync(f.recordFile.replace(/\.json$/, '.panel.json')));
  });

test('a hook reporter matching the foreground generation is labelled without granting controls', async (t) => {
  const f = await fixture(t);
  const { panel } = prepare(f);
  panel.pid = 80;
  await runHook(f.publisher);
  const observation = readPrivate(
    f.recordFile.replace(/\.json$/, '.panel.json'),
  );
  assert.equal(observation.originEvidence, 'reporter-is-foreground');
  assert.equal(observation.controlAuthority, false);
});

for (const change of [
  'generation',
  'pid-reuse',
  'non-codex',
  'reporter',
  'revocation',
])
  test(`hook observation drops ${change} during I/O without erasing lifecycle state`, async (t) => {
    const f = await fixture(t);
    const { panel } = prepare(f);
    let panelReads = 0,
      cliReads = 0,
      ownerReads = 0;
    f.publisher.readPanel = async () => ({
      ...panel,
      generation: change === 'generation' ? ++panelReads : 1,
    });
    f.publisher.inspect = async (pid) => {
      if (pid === 42) {
        cliReads++;
        if (change === 'non-codex') return { ...fact(pid), codex: false };
        if (change === 'pid-reuse' && cliReads === 2)
          return { ...fact(pid), startedAt: 'replacement' };
      }
      if (pid === 80 && ++ownerReads === 3) {
        if (change === 'revocation')
          writePrivate(f.setup, { ...f.saved, active: false });
        if (change === 'reporter')
          return { ...fact(pid), image: 'a'.repeat(64) };
      }
      return fact(pid);
    };
    await runHook(f.publisher);
    assert.equal(readPrivate(f.recordFile).ended, false);
    assert(!fs.existsSync(f.recordFile.replace(/\.json$/, '.panel.json')));
  });

test('missing server context adds no Rex reads and an orphan sidecar cannot identify an agent', async (t) => {
  const f = await fixture(t);
  const { queries } = prepare(f);
  delete f.publisher.environment.REX_SERVER;
  await runHook(f.publisher);
  assert.equal(queries.length, 0);
  const missing = readPrivate(
    f.recordFile.replace(/\.json$/, '.panel-status.json'),
  );
  assert.equal(missing.phase, 'context');
  assert.equal(missing.hasServerEnvironment, false);
  assert.equal(missing.validLocalContext, false);
  prepare(f);
  await runHook(f.publisher);
  assert(fs.existsSync(f.recordFile.replace(/\.json$/, '.panel.json')));
  fs.unlinkSync(f.recordFile);
  f.ports.inspect = async () => assert.fail('sidecar grants no native access');
  await assert.rejects(hookIdentity(f.agent, f.ports), /report unavailable/);
});
