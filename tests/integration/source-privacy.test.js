const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.resolve('.');
const privateHome = (name = 'operator') => ['', 'Users', name].join('/');

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-privacy-')),
  );
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'])
    delete env[key];
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, 'Fixture Git command succeeded');
    return result.stdout;
  };
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  git('init', '--quiet');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('.source-privacy.json', '[]\n');
  write('note.md', 'Safe fixture\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'test: fixture baseline');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, env, git, write };
}

test('privacy patterns reject Unix, escaped JSON and consecutive Windows paths without matching prose', async () => {
  const { privatePathLines } = await import('../../scripts/source-privacy.mjs');
  const unix = privateHome();
  assert.deepEqual(
    privatePathLines('(' + unix + '),', { file: 'note.md' }),
    [1],
  );
  const windows = ['C:', 'Users', 'operator', 'project'].join('\\');
  assert.deepEqual(
    privatePathLines(
      [unix + '/project', windows, windows, unix.replaceAll('/', '\\/')].join(
        '\n',
      ),
      { file: 'note.md' },
    ),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    privatePathLines('private socket/home/state, and a fixture', {
      file: 'note.md',
    }),
    [],
  );
  const exceptions = [
    {
      file: 'fixture.js',
      root: 'Users',
      account: 'operator',
      reason: 'Synthetic identity',
    },
  ];
  assert.deepEqual(
    privatePathLines(unix + '/project', { file: 'fixture.js', exceptions }),
    [],
  );
  assert.deepEqual(
    privatePathLines(unix + '/project', { file: 'another.js', exceptions }),
    [1],
  );
  assert.deepEqual(
    privatePathLines(unix + '2/project', { file: 'fixture.js', exceptions }),
    [1],
  );
  assert.deepEqual(
    privatePathLines(unix + '/project', {
      file: 'fixture.js',
      exceptions,
      root: unix + '/project',
    }),
    [1],
  );
});

test('staged privacy scans the index even after the working copy is sanitized', async (t) => {
  const f = fixture(t);
  const { scanSource } = await import('../../scripts/source-privacy.mjs');
  f.write('note.md', 'Private ' + privateHome() + '/project\n');
  f.git('add', 'note.md');
  f.write('note.md', 'Sanitized working copy\n');
  assert.deepEqual(scanSource({ root: f.root, staged: true }), [
    { file: 'note.md', line: 1 },
  ]);
  assert.deepEqual(scanSource({ root: f.root }), []);
  const result = spawnSync(
    process.execPath,
    [path.join(source, 'scripts/source-privacy.mjs'), '--staged'],
    { cwd: f.root, env: f.env, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /note.md/);
  assert(!result.stderr.includes(privateHome()));
  assert(!result.stderr.includes('Private ' + privateHome()));
});

test('only staged, file-scoped synthetic exceptions apply and policy edits recheck unchanged index files', async (t) => {
  const f = fixture(t);
  const { scanSource } = await import('../../scripts/source-privacy.mjs');
  const entry = {
    file: 'note.md',
    root: 'Users',
    account: 'operator',
    reason: 'Synthetic regression input',
  };
  f.write('note.md', privateHome() + '/project\n');
  f.git('add', 'note.md');
  f.write('.source-privacy.json', JSON.stringify([entry]));
  assert.equal(
    scanSource({ root: f.root, staged: true }).length,
    1,
    'Unstaged policy cannot waive staged input',
  );
  f.git('add', '.source-privacy.json');
  assert.deepEqual(scanSource({ root: f.root, staged: true }), []);
  f.git('commit', '--quiet', '-m', 'test: synthetic exception');
  f.write('.source-privacy.json', '[]');
  f.git('add', '.source-privacy.json');
  assert.deepEqual(scanSource({ root: f.root, staged: true }), [
    { file: 'note.md', line: 1 },
  ]);
  f.write(
    '.source-privacy.json',
    JSON.stringify([{ ...entry, file: '../outside' }]),
  );
  assert.throws(
    () => scanSource({ root: f.root }),
    /Invalid source privacy exceptions/,
  );
});

test('deleting staged exception policy rechecks unchanged indexed files', async (t) => {
  const { scanSource } = await import('../../scripts/source-privacy.mjs');
  const f = fixture(t);
  f.write('synthetic.md', privateHome() + '/fixture');
  f.write(
    '.source-privacy.json',
    JSON.stringify([
      {
        file: 'synthetic.md',
        root: 'Users',
        account: 'operator',
        reason: 'Synthetic fixture',
      },
    ]),
  );
  f.git('add', '.');
  f.git('commit', '--quiet', '-m', 'test: synthetic baseline');
  f.git('rm', '.source-privacy.json');
  assert.deepEqual(scanSource({ root: f.root, staged: true }), [
    { file: 'synthetic.md', line: 1 },
  ]);
});

test('working-tree scans do not follow symlinks and malformed policy errors omit input', async (t) => {
  const f = fixture(t);
  const { scanSource } = await import('../../scripts/source-privacy.mjs');
  fs.symlinkSync(privateHome() + '/missing', path.join(f.root, 'link'));
  f.git('add', 'link');
  assert.deepEqual(scanSource({ root: f.root }), [{ file: 'link', line: 1 }]);
  assert.deepEqual(scanSource({ root: f.root, staged: true }), [
    { file: 'link', line: 1 },
  ]);
  f.write('.source-privacy.json', '{' + privateHome());
  const result = spawnSync(
    process.execPath,
    [path.join(source, 'scripts/source-privacy.mjs')],
    { cwd: f.root, env: f.env, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert(!result.stderr.includes(privateHome()));
});

test('the installed pre-commit hook refuses a staged leak and preserves custom hooks', async (t) => {
  const f = fixture(t);
  const { installHooks } = await import('../../scripts/install-hooks.mjs');
  for (const file of [
    'scripts/source-privacy.mjs',
    'scripts/process.mjs',
    '.githooks/pre-commit',
  ]) {
    f.write(file, fs.readFileSync(path.join(source, file)));
  }
  fs.chmodSync(path.join(f.root, '.githooks/pre-commit'), 0o755);
  installHooks(f.root);
  installHooks(f.root);
  assert.equal(
    f.git('config', '--local', '--get', 'core.hooksPath').trim(),
    '.githooks',
  );
  f.write('note.md', privateHome() + '/project');
  f.git('add', 'note.md');
  const blocked = spawnSync('git', ['commit', '-m', 'test: refused leak'], {
    cwd: f.root,
    env: f.env,
    encoding: 'utf8',
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /private home\/workspace path/);
  assert(!blocked.stderr.includes(privateHome()));
  f.git('config', '--local', 'core.hooksPath', 'custom-hooks');
  assert.throws(() => installHooks(f.root), /custom hooks/);
  assert.equal(
    f.git('config', '--local', '--get', 'core.hooksPath').trim(),
    'custom-hooks',
  );
});
