const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const commit = 'a'.repeat(40),
  tag = 'v1.2.3-beta.1';

function releaseFixture(t, fail) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-prep-fixture-'));
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ version: '1.2.3' }),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  let checkout;
  const run = (file, args, options) => {
    const call = file + ' ' + args.join(' ');
    calls.push({ file, args, options, call });
    if (fail?.(call)) throw Error('Fixture prerequisite failed');
    if (file === 'git') {
      if (args[0] === 'rev-parse') return commit;
      if (args[0] === 'status') return '';
      if (args[1] === 'add') {
        checkout = args[3];
        fs.mkdirSync(checkout);
      }
      if (args[1] === 'remove')
        fs.rmSync(checkout, { recursive: true, force: true });
    }
    if (file === 'npm' && args[1] === 'package') {
      const dist = path.join(checkout, 'dist');
      fs.mkdirSync(dist);
      for (const name of [
        `deckshep-${tag.slice(1)}-macos.zip`,
        `deckshep-${tag.slice(1)}-macos.zip.sha256`,
        'SHA256SUMS',
      ])
        fs.writeFileSync(path.join(dist, name), 'Fixture artifact');
    }
    return '';
  };
  const verify = (file, options) => {
    assert.equal(options.commit, commit);
    assert.equal(options.tag, tag);
    assert.equal(options.release, false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'Fixture artifact');
    return {
      artifact: path.basename(file),
      gitCommit: options.commit,
      tag: options.tag,
      checks: ['fixture'],
    };
  };
  return { root, calls, run, verify, checkout: () => checkout };
}
test('checked treats nonzero, timeout and signal as failures without disclosing child arguments/output', async () => {
  const { checked } = await import('../../scripts/process.mjs');
  for (const result of [
    { status: 1, stderr: 'private' },
    { status: null, signal: 'SIGTERM' },
    { status: 0, error: Error('private') },
  ])
    assert.throws(
      () =>
        checked(
          'fixture',
          ['private'],
          { message: 'Stage failed' },
          () => result,
        ),
      /^Error: Stage failed$/,
    );
  assert.equal(
    checked('fixture', [], { capture: true }, () => ({
      status: 0,
      stdout: 'ok',
    })),
    'ok',
  );
});
test('release preparation stops at every failed prerequisite, cleans its own checkout and publishes no receipt', async (t) => {
  const { prepareRelease, preparationChecks } =
    await import('../../scripts/release.mjs');
  for (const stage of [
    'npm ci',
    ...preparationChecks.map((name) => 'npm run ' + name),
    'npm audit --audit-level=high',
    'npm run build -- --universal',
    'npm run package',
  ]) {
    const f = releaseFixture(t, (call) => call.startsWith(stage));
    assert.throws(
      () => prepareRelease({ ...f, tag }),
      /Fixture prerequisite failed/,
    );
    const failed = f.calls.findIndex(({ call }) => call.startsWith(stage));
    assert(failed >= 0);
    assert(
      f.calls
        .slice(failed + 1)
        .every(({ file, args }) => file === 'git' && args[1] === 'remove'),
    );
    assert.equal(
      fs.existsSync(path.join(f.root, 'dist/release-candidates', tag)),
      false,
    );
    assert.equal(fs.existsSync(path.dirname(f.checkout())), false);
  }
});
test('release preparation records only successful checks from the exact commit and never enables live tests', async (t) => {
  const { prepareRelease, preparationChecks } =
    await import('../../scripts/release.mjs');
  const f = releaseFixture(t);
  const receipt = prepareRelease({ ...f, tag });
  assert.deepEqual(
    f.calls.find(({ args }) => args[1] === 'add').args.slice(-1),
    [commit],
  );
  assert(
    f.calls
      .filter(({ file }) => file === 'npm')
      .every(({ options }) => options.env.CI === 'true'),
  );
  assert(
    preparationChecks.every((name) => receipt.preparationChecks.includes(name)),
  );
  assert(!JSON.stringify(receipt).includes(f.root));
  const recorded = JSON.parse(
    fs.readFileSync(path.join(f.root, receipt.output, 'verification.json')),
  );
  assert.equal(recorded.gitCommit, commit);
  const count = f.calls.length;
  assert.throws(() => prepareRelease({ ...f, tag }), /already exists/);
  assert.equal(f.calls.length, count + 2); // only source inspection, never another build
  assert.equal(fs.existsSync(path.dirname(f.checkout())), false);
});
test('release preparation refuses dirty source, missing public evidence, symlink output and cleanup failure', async (t) => {
  const { prepareRelease } = await import('../../scripts/release.mjs');
  const dirty = releaseFixture(t);
  assert.throws(
    () =>
      prepareRelease({
        ...dirty,
        tag,
        run: (file, args, options) =>
          args[0] === 'status' ? ' M source' : dirty.run(file, args, options),
      }),
    /clean tracked source/,
  );
  const publicBuild = releaseFixture(t);
  assert.throws(
    () => prepareRelease({ ...publicBuild, tag, release: true }),
    /Approved release evidence/,
  );
  assert(!publicBuild.calls.some(({ file }) => file === 'npm'));
  const linked = releaseFixture(t);
  fs.mkdirSync(path.join(linked.root, 'outside'));
  fs.symlinkSync(
    path.join(linked.root, 'outside'),
    path.join(linked.root, 'dist'),
  );
  assert.throws(
    () => prepareRelease({ ...linked, tag }),
    /Unsafe release output/,
  );
  const cleanup = releaseFixture(t, (call) =>
    call.startsWith('git worktree remove'),
  );
  assert.throws(
    () => prepareRelease({ ...cleanup, tag }),
    /Fixture prerequisite failed/,
  );
  assert.equal(
    fs.existsSync(path.join(cleanup.root, 'dist/release-candidates', tag)),
    false,
  );
  assert.equal(fs.existsSync(path.dirname(cleanup.checkout())), false);
  const verification = releaseFixture(t);
  assert.throws(
    () =>
      prepareRelease({
        ...verification,
        tag,
        verify: () => {
          throw Error('Bad archive');
        },
      }),
    /Bad archive/,
  );
  assert.equal(fs.existsSync(path.dirname(verification.checkout())), false);
});
test('release preparation uses a real detached worktree and excludes untracked user notes', async (t) => {
  const { prepareRelease } = await import('../../scripts/release.mjs');
  const { checked } = await import('../../scripts/process.mjs');
  const f = releaseFixture(t);
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'])
    delete env[name];
  const git = (...args) =>
    checked('git', args, { cwd: f.root, env, capture: true });
  git('init', '--quiet');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('add', 'package.json');
  git('commit', '--quiet', '-m', 'test: release fixture');
  const expected = git('rev-parse', 'HEAD').trim();
  fs.writeFileSync(
    path.join(f.root, 'private-notes.md'),
    'Untracked user notes',
  );
  let checkout;
  const receipt = prepareRelease({
    root: f.root,
    tag,
    run: (file, args, options) => {
      if (file === 'git') return checked(file, args, { ...options, env });
      assert.equal(file, 'npm');
      checkout = options.cwd;
      assert.equal(
        checked('git', ['rev-parse', 'HEAD'], {
          ...options,
          env,
          capture: true,
        }).trim(),
        expected,
      );
      assert.equal(
        fs.existsSync(path.join(checkout, 'private-notes.md')),
        false,
      );
      if (args[1] === 'package') {
        fs.mkdirSync(path.join(checkout, 'dist'));
        for (const name of [
          `deckshep-${tag.slice(1)}-macos.zip`,
          `deckshep-${tag.slice(1)}-macos.zip.sha256`,
          'SHA256SUMS',
        ])
          fs.writeFileSync(path.join(checkout, 'dist', name), 'Fixture');
      }
      return '';
    },
    verify: (file, options) => {
      assert.equal(options.commit, expected);
      return { artifact: path.basename(file), gitCommit: expected, tag };
    },
  });
  assert.equal(receipt.gitCommit, expected);
  assert.equal(
    (git('worktree', 'list', '--porcelain').match(/^worktree /gm) || []).length,
    1,
  );
  assert.equal(fs.existsSync(path.dirname(checkout)), false);
  assert.equal(
    fs.readFileSync(path.join(f.root, 'private-notes.md'), 'utf8'),
    'Untracked user notes',
  );
});

test('Rex smoke preserves current authorization and disables all optional provider and hook cases', async () => {
  const { rexSmoke } = await import('../../scripts/rex-smoke.mjs');
  const authorized = {
    ASW_LIVE: '1',
    ASW_LIVE_AUTHORIZATION: 'test-owned-only',
    ASW_LIVE_REX: '1',
    ASW_REX_PATH: '/fixture/Rex.app/rex',
  };
  for (const env of [
    {},
    { ...authorized, CI: 'true' },
    { ...authorized, ASW_LIVE: '0' },
    { ...authorized, ASW_LIVE_REX: '0' },
    { ...authorized, ASW_LIVE_AUTHORIZATION: '' },
  ]) {
    let ran = false;
    assert.throws(() =>
      rexSmoke(env, () => {
        ran = true;
      }),
    );
    assert.equal(ran, false);
  }
  const env = { ...authorized, ASW_LIVE_AUTH: 'signed-in' };
  const cases = [
    'PROVIDERS',
    'STATES',
    'BROWSER',
    'CASES',
    'CLAUDE_HOOKS',
    'CODEX_HOOKS',
  ];
  for (const name of cases) env['ASW_LIVE_REX_' + name] = '1';
  let calls = 0;
  rexSmoke(env, (file, args, options) => {
    calls++;
    assert.equal(file, process.execPath);
    assert.deepEqual(args, [
      '--import',
      'tsx',
      '--test',
      'tests/live/rex.test.js',
    ]);
    for (const [key, value] of Object.entries(authorized))
      assert.equal(options.env[key], value);
    for (const name of cases)
      assert.equal(options.env['ASW_LIVE_REX_' + name], '0');
    assert.equal(options.env.ASW_LIVE_AUTH, 'offline');
  });
  assert.equal(calls, 1);
  assert.equal(env.ASW_LIVE_REX_PROVIDERS, '1');
});
test('CI skips Rex before discovery even with invalid override and inherited live flags', () => {
  const env = {
    ...process.env,
    CI: 'true',
    ASW_REX_PATH: '/fixture/missing',
    ASW_LIVE: '1',
    ASW_LIVE_REX: '1',
    ASW_LIVE_AUTHORIZATION: 'test-owned-only',
  };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', 'tests/live/rex.test.js'],
    {
      encoding: 'utf8',
      env,
    },
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Live tests never run in CI/);
});
