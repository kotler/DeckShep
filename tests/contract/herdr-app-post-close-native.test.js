const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function command(file, args, options = {}) {
  try {
    return execFileSync(file, args, {
      stdio: 'pipe',
      timeout: 60000,
      ...options,
    });
  } catch {
    throw Error('Post-close self-fixture failed');
  }
}
test(
  'retained kernel proof is revalidated after close, expires, pins its FD and rejects same-PID self-exec',
  { skip: process.platform !== 'darwin', timeout: 120000 },
  (t) => {
    const directory = fs.realpathSync(
        fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'dsh-pc-')),
      ),
      binary = path.join(directory, 'post-close-fixture'),
      cache = path.join(directory, 'module-cache');
    fs.chmodSync(directory, 0o700);
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const sources = [
      'native/herdr-app-peer.swift',
      'tests/fixtures/post-close-peer.swift',
      'tests/fixtures/post-close-peer-main.swift',
    ];
    command('swiftc', [
      '-O',
      '-target',
      process.arch + '-apple-macosx13.0',
      '-module-cache-path',
      cache,
      ...sources,
      '-lbsm',
      '-o',
      binary,
    ]);
    command('/usr/bin/codesign', ['--force', '--sign', '-', binary]);
    for (const scenario of ['close', 'expiry', 'fd-reuse', 'self-exec']) {
      const bytes = command(binary, [scenario, directory], {
          timeout: 5000,
          maxBuffer: 4096,
          encoding: 'utf8',
        }),
        result = JSON.parse(bytes);
      assert.equal(result.scenario, scenario);
      assert(!bytes.includes(directory));
      for (const [key, value] of Object.entries(result)) {
        if (key !== 'scenario' && key !== 'kernelRetained')
          assert.equal(value, true, key);
      }
      if (scenario === 'close')
        t.diagnostic(
          'Kernel socket token after close: ' +
            (result.kernelRetained ? 'retained' : 'unavailable') +
            '; original process image revalidated.',
        );
    }
    for (const architecture of ['arm64', 'x86_64'])
      command('swiftc', [
        '-typecheck',
        '-target',
        architecture + '-apple-macosx13.0',
        '-module-cache-path',
        cache,
        ...sources,
      ]);
  },
);
