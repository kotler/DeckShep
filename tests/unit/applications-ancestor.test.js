const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  trustedApplicationsAncestor,
} = require('../../src/platform/applications-ancestor');
const stat = { uid: 0n, gid: 80n, mode: 0o40775n, isDirectory: () => true };
const header = 'drwxrwxr-x 19 root admin 608 Nov 8 14:37 /Applications\n';
test('only canonical root/admin Applications with no ACL or the standard deny-only ACL qualifies', () => {
  assert.equal(
    trustedApplicationsAncestor('/Applications', stat, 'darwin', () => header),
    true,
  );
  assert.equal(
    trustedApplicationsAncestor(
      '/Applications',
      stat,
      'darwin',
      () => header.replace('x ', 'x+') + ' 0: group:everyone deny delete\n',
    ),
    true,
  );
  for (const [file, value, platform] of [
    ['/private/tmp/Applications', stat, 'darwin'],
    ['/Applications/', stat, 'darwin'],
    ['/Applications', { ...stat, uid: 501n }, 'darwin'],
    ['/Applications', { ...stat, gid: 20n }, 'darwin'],
    ['/Applications', { ...stat, mode: 0o40777n }, 'darwin'],
    ['/Applications', { ...stat, mode: 0o41775n }, 'darwin'],
    ['/Applications', { ...stat, isDirectory: () => false }, 'darwin'],
    ['/Applications', stat, 'linux'],
  ])
    assert.equal(
      trustedApplicationsAncestor(file, value, platform, () => {
        throw Error('Must not read ACL');
      }),
      false,
    );
});
test('ACL grants, unexpected entries, truncated output and failed inspection refuse', () => {
  for (const text of [
    '',
    header.replace('x ', 'x+'),
    header + ' 0: user:other allow write\n',
    header + ' 0: group:everyone deny delete\n 1: user:other allow write\n',
    'invalid output',
  ])
    assert.equal(
      trustedApplicationsAncestor('/Applications', stat, 'darwin', () => text),
      false,
    );
  assert.equal(
    trustedApplicationsAncestor('/Applications', stat, 'darwin', () => {
      throw Error('Private path');
    }),
    false,
  );
});
test('build inspection applies the container exception and invalidates it on group or ACL metadata changes', async (t) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const ts = require('typescript');
  const { createRequire } = require('node:module');
  const { fixtureBuild } = require('../helpers/herdr-app-focus');
  const build = fixtureBuild(t),
    source = path.resolve('src/terminals/herdr-app/build-files.ts');
  const localRequire = createRequire(source),
    module = { exports: {} };
  let group = 80n,
    ctime = 1n,
    acl = header;
  const actualBundle = path.dirname(
    path.dirname(path.dirname(build.executable)),
  );
  const map = (file) =>
    file.startsWith('/Applications/Fixture.app')
      ? actualBundle + file.slice('/Applications/Fixture.app'.length)
      : file;
  const syntheticFs = {
    ...fs,
    lstatSync(file, options) {
      if (file === '/Applications') {
        const original = fs.lstatSync(build.root, options);
        return {
          ...original,
          isSymbolicLink: () => false,
          isDirectory: () => true,
          uid: 0n,
          gid: group,
          mode: 0o40775n,
          ctimeNs: ctime,
        };
      }
      return fs.lstatSync(map(file), options);
    },
    openSync: (file, flags) => fs.openSync(map(file), flags),
  };
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      process,
      Buffer,
      require(name) {
        if (name === 'node:fs') return syntheticFs;
        if (name.endsWith('/applications-ancestor'))
          return {
            trustedApplicationsAncestor: (file, value) =>
              trustedApplicationsAncestor(file, value, 'darwin', () => acl),
          };
        return localRequire(name);
      },
    },
  );
  const inspect = () =>
    module.exports.inspectAppBuild(
      '/Applications/Fixture.app/Contents/MacOS/Herdr',
      build.decoder,
    );
  const accepted = await inspect();
  assert.equal(accepted.executableSha256, build.record.executableSha256);
  group = 20n;
  assert.throws(() => accepted.assertUnchanged(), /Build mismatch/);
  await assert.rejects(inspect(), /Build mismatch/);
  group = 80n;
  const second = await inspect();
  acl = header + ' 0: user:other allow write\n';
  ctime++;
  assert.throws(() => second.assertUnchanged(), /Build mismatch/);
  await assert.rejects(inspect(), /Build mismatch/);
  acl = header;
  fs.chmodSync(build.executable, 0o777);
  await assert.rejects(inspect(), /Build mismatch/);
});
