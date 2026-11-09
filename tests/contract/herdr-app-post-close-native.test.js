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
  } catch (error) {
    const diagnostics = String(error.stderr || '')
      .split('\n')
      .filter((line) => line.includes('error:'))
      .map((line) => line.replace(/^.*?error: /, ''))
      .join(' | ')
      .slice(0, 1200);
    const stage = args.includes('-typecheck')
      ? args[args.indexOf('-target') + 1]
      : path.basename(file);
    throw Error('Post-close self-fixture failed: ' + stage + ' ' + diagnostics);
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
      'native/herdr-app-session.swift',
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
    const check = '{"protocol":2,"seq":1,"op":"check"}\n',
      finish = '{"protocol":2,"seq":2,"op":"finish"}\n';
    const frames = command(binary, ['ipc', directory], {
      input: check + finish,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      frames.map((frame) => frame.state),
      ['captured', 'checked', 'finished'],
    );
    for (const input of [
      '',
      finish,
      check + check,
      check + finish + '{}\n',
      '{"protocol":2,"seq":1,"op":"check","op":"check"}\n',
      'x'.repeat(257),
    ])
      assert.throws(
        () => command(binary, ['ipc', directory], { input }),
        /self-fixture failed/,
      );
  },
);
