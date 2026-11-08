const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('stable artifacts require explicit release mode and clean provenance; legacy beta verification stays compatible', async () => {
  const { releasePolicy, validProvenanceTag } =
    await import('../../scripts/release-policy.mjs');
  assert.deepEqual(releasePolicy('1.4.0'), {
    tag: 'v1.4.0-beta.1',
    distribution: 'private-review',
  });
  assert.deepEqual(releasePolicy('1.4.0', { release: true }), {
    tag: 'v1.4.0',
    distribution: 'public-release',
  });
  assert.throws(() => releasePolicy('1.4.0', { tag: 'v1.4.0' }), /Stable tags/);
  assert.throws(
    () => releasePolicy('1.4.0', { tag: 'v1.3.4', release: true }),
    /match/,
  );
  assert.throws(
    () => releasePolicy('1.4.0', { release: true, dirty: true }),
    /clean/,
  );
  assert(
    validProvenanceTag({
      packageVersion: '1.4.0',
      tag: 'v1.4.0-beta.1',
      workingTreeDirty: false,
    }),
  );
  assert(
    !validProvenanceTag({
      packageVersion: '1.4.0',
      tag: 'v1.4.0',
      workingTreeDirty: false,
    }),
  );
  assert(
    !validProvenanceTag({
      packageVersion: '1.4.0',
      tag: 'v1.4.0',
      distribution: 'public-release',
      workingTreeDirty: true,
    }),
  );
  assert(
    !validProvenanceTag({
      packageVersion: '1.4.0',
      tag: 'v1.4.0-beta.1',
      distribution: 'unknown',
    }),
  );
});

test('real packaging CLI refuses a stable private build before building or packing', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/package.mjs', '--tag', 'v1.4.0', '--skip-build'],
    {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: { ...process.env, ASW_LIVE: '0' },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Stable tags require --release/);
  assert(!result.stdout.includes('Built and audited'));
});
