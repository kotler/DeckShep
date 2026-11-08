'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('release gate requires exact version, Apache hash, LobeHub provenance and verified launch/support evidence', async (t) => {
  const { releaseReadinessFailures } =
    await import('../../scripts/release-readiness.mjs');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'deckshep-readiness-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, value);
  };
  write(
    'package.json',
    JSON.stringify({ version: '1.4.0', license: 'Apache-2.0' }),
  );
  write('LICENSE', 'Apache license fixture');
  write('NOTICE', 'Fixture attribution');
  write('TRADEMARKS.md', 'Reserved fixture mark');
  write('release/evidence.txt', 'Fixture evidence only');
  const assetRoot = 'com.local.rexagents.sdPlugin/assets/';
  const files = Object.entries({
    'codex-mark.svg': 'packages/static-svg/icons/codex.svg',
    'claude-mark.svg': 'packages/static-svg/icons/claude.svg',
    'lobehub-LICENSE.txt': 'LICENSE',
  }).map(([name, sourcePath]) => {
    write(assetRoot + name, 'fixture ' + name);
    return { path: name, sourcePath, sha256: digest('fixture ' + name) };
  });
  const provenance = {
    repository: 'https://github.com/lobehub/lobe-icons',
    revision: 'a'.repeat(40),
    trademarkPermission: 'pending',
    files,
  };
  const provenanceText = JSON.stringify(provenance);
  write(assetRoot + 'lobehub-PROVENANCE.json', provenanceText);
  const review = {
    ownerVerified: true,
    reviewedAt: '2026-11-08',
    evidence: 'release/evidence.txt',
  };
  const record = {
    product: 'DeckShep',
    version: '1.4.0',
    license: { spdx: 'Apache-2.0', sha256: digest('Apache license fixture') },
    providerMarks: {
      revision: provenance.revision,
      provenanceSha256: digest(provenanceText),
      trademarkPermission: 'pending',
    },
    launchValidation: { version: '1.4.0', ...review },
    support: {
      issues: {
        url: 'https://github.com/fixture-maintainer/deckshep/issues',
        ...review,
      },
      email: { address: 'support@fixture-domain.test', ...review },
    },
  };
  const check = () => {
    write('release/readiness.json', JSON.stringify(record));
    return releaseReadinessFailures(directory);
  };
  assert.deepEqual(check(), []);
  record.version = '1.3.4';
  assert(check().some((s) => s.includes('exact version')));
  record.version = '1.4.0';
  write('LICENSE', 'changed license');
  assert(check().some((s) => s.includes('license hash')));
  write('LICENSE', 'Apache license fixture');
  write(assetRoot + 'codex-mark.svg', 'changed vector');
  assert(check().some((s) => s.includes('provenance')));
  write(assetRoot + 'codex-mark.svg', 'fixture codex-mark.svg');
  record.providerMarks.trademarkPermission = 'cleared';
  assert(check().some((s) => s.includes('trademark')));
  record.providerMarks.trademarkPermission = 'pending';
  record.launchValidation.ownerVerified = false;
  assert(check().some((s) => s.includes('launch-validation')));
  record.launchValidation.ownerVerified = true;
  record.launchValidation.version = '1.3.4';
  assert(check().some((s) => s.includes('launch-validation')));
  record.launchValidation.version = '1.4.0';
  record.support.issues.url = 'https://github.com/OWNER/REPOSITORY/issues';
  assert(check().some((s) => s.includes('Issues')));
  record.support.issues.url =
    'https://github.com/fixture-maintainer/deckshep/issues';
  record.support.email.address = 'SUPPORT_EMAIL_NOT_VERIFIED';
  assert(check().some((s) => s.includes('email')));
  record.support.email.address = 'support@fixture-domain.test';
  record.support.email.ownerVerified = false;
  assert(check().some((s) => s.includes('email')));
  record.support.email.ownerVerified = true;
  record.launchValidation.evidence = '../outside';
  assert(check().some((s) => s.includes('launch-validation')));
  fs.symlinkSync(
    path.join(directory, 'release/evidence.txt'),
    path.join(directory, 'release/link.txt'),
  );
  record.launchValidation.evidence = 'release/link.txt';
  assert(check().some((s) => s.includes('launch-validation')));
  record.launchValidation.evidence = 'release/evidence.txt';
  record.launchValidation.reviewedAt = '2026-99-99';
  assert(check().some((s) => s.includes('launch-validation')));
  record.launchValidation.reviewedAt = '2026-11-08';
  assert.deepEqual(check(), []);
});
