import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  fixture,
  payload,
  blockA,
  blockB,
  threadA,
  threadB,
  pidA,
  pidB,
  daemonPid,
} = require('../tests/poc/rex-hook/fixture.cjs');

async function runCase(run) {
  const scenario = fixture();
  try {
    return await run(scenario);
  } finally {
    scenario.close();
  }
}

async function main() {
  if (process.argv.length !== 2)
    throw Error('Fixture demo accepts no live options');
  console.log(
    'DeckShep hook registration POC — synthetic Rex and process facts',
  );
  await runCase(async (f) => {
    await f.runHook(payload(threadA));
    await f.runHook(
      payload(threadB),
      { ...f.environment, REX_BLOCK: blockB },
      pidB,
    );
    assert.equal(f.record(threadA).process.pid, pidA);
    assert.equal(f.record(threadB).process.pid, pidB);
    assert.equal(f.record(threadA).block, blockA);
    assert.equal(f.record(threadB).block, blockB);
    assert.equal(f.data.activeBlock, blockB);
    assert.equal(f.record(threadA).controlAuthority, false);
    console.log(
      'PASS: two hook subprocesses called the fixture CLI and stored separate panel/PID/thread records.',
    );
    console.log(
      'PASS: panel A stayed associated with A while the GUI focus was on B.',
    );
  });
  await runCase(async (f) => {
    await f.runHook(payload(threadA), f.environment, daemonPid);
    await f.runHook(payload(threadB), f.environment, daemonPid);
    assert.equal(f.record(threadB).block, blockA);
    assert.equal(f.record(threadB).originEvidence, 'unverified');
    assert.equal(f.record(threadB).controlAuthority, false);
    console.log(
      'REPRODUCED: B’s hook inherited A’s panel context; the CLI returned A’s PID.',
    );
    console.log(
      'PASS: the shared-daemon observation stayed unverified and granted no control authority.',
    );
  });
  await runCase(async (f) => {
    await f.runHook(payload(threadA), f.environment, daemonPid);
    await f.runHook(
      payload(threadB),
      { ...f.environment, REX_BLOCK: blockB },
      daemonPid,
    );
    assert.equal(f.record(threadA).process.pid, pidA);
    assert.equal(f.record(threadB).process.pid, pidB);
    assert.equal(f.record(threadB).originEvidence, 'unverified');
    console.log(
      'PASS: a shared daemon with distinct supplied panel contexts collected both PIDs correctly.',
    );
  });
  console.log(
    'Live Rex/Codex calls: 0. Production integration/settings changed: 0. Temporary files removed.',
  );
}
await main().catch(() => {
  console.error('POC failed; no live fallback was attempted.');
  process.exitCode = 1;
});
