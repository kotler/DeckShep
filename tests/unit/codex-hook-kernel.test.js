const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectProcess } = require('../../src/agents/codex/hook-process');
const { digest } = require('../../src/agents/codex/hook-contract');

test('hook process reader accepts only the requested PID and precise kernel identity', async () => {
  const fact = {
    pid: 42,
    parent: 1,
    startedAt: '1794364000.123456',
    image: digest('/fixture/codex'),
    codex: true,
  };
  const execute = async (file, args, options) => {
    assert(file.endsWith('/bin/codex-hook-process'));
    assert.deepEqual(args, ['42']);
    assert.equal(options.maxBuffer, 4096);
    assert.equal(options.timeout, 1500);
    return JSON.stringify(fact);
  };
  assert.deepEqual(await inspectProcess(42, execute), fact);
  for (const patch of [
    { pid: 43 },
    { startedAt: '1794364000' },
    { image: 'path' },
    { parent: -1 },
    { codex: 'true' },
  ])
    await assert.rejects(
      inspectProcess(42, async () => JSON.stringify({ ...fact, ...patch })),
    );
});

test(
  'owned kernel helper fixture reads only itself and emits no executable path',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'dsh-hook-kernel-'),
    );
    fs.chmodSync(directory, 0o700);
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const helper = path.join(directory, 'kernel-fixture');
    const built = spawnSync(
      'swiftc',
      [
        '-O',
        '-module-cache-path',
        path.join(directory, 'cache'),
        'native/codex-hook-process.swift',
        '-o',
        helper,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(built.status, 0, 'owned kernel helper compilation failed');
    const result = spawnSync(helper, ['--self'], { encoding: 'utf8' });
    assert.equal(result.status, 0, 'owned kernel helper inspection failed');
    const fact = JSON.parse(result.stdout);
    assert.equal(fact.pid, result.pid);
    assert.match(fact.startedAt, /^\d+\.\d{6}$/);
    assert.match(fact.image, /^[a-f0-9]{64}$/);
    assert.equal(fact.codex, false);
    assert.equal(fact.executable, undefined);
    assert(!result.stdout.includes(directory));
    for (const args of [[], ['bad'], ['0'], ['1'], ['--self', 'extra']]) {
      const refused = spawnSync(helper, args, { encoding: 'utf8' });
      assert.equal(refused.status, 1);
      assert.equal(refused.stdout, '');
      assert.equal(refused.stderr, 'Codex process unavailable\n');
    }
  },
);
