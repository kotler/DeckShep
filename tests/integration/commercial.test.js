'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

test('public release refuses pending reviews, borrowed scope, changed artwork and unverified support', async (t) => {
  const { commercialFailures } = await import('../../scripts/commercial.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deckshep-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'commercial'));
  fs.writeFileSync(path.join(directory, 'package.json'), '{"version":"1.4.0"}');
  fs.writeFileSync(
    path.join(directory, 'commercial/evidence.txt'),
    'Fixture evidence only',
  );
  const record = {
    product: 'DeckShep',
    version: '1.4.0',
    seller: 'Everett Kotler',
    reviews: Object.fromEntries(
      [
        'nameAndLogo',
        'openaiMarks',
        'anthropicMarks',
        'customerTerms',
        'launchValidation',
      ].map((key) => [
        key,
        {
          approved: true,
          reviewedAt: '2026-11-07',
          evidence: 'commercial/evidence.txt',
        },
      ]),
    ),
    assets: [],
    support: {
      verified: true,
      contact: 'support@example.test',
      evidence: 'commercial/evidence.txt',
    },
  };
  for (const name of [
    'assets/plugin-icon-source.svg',
    'action-icon.svg',
    'icon.png',
    'icon@2x.png',
    'assets/codex-app.png',
    'assets/codex-mark.png',
    'assets/claude-mark.svg',
  ]) {
    const file = path.join(directory, 'com.local.rexagents.sdPlugin', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'fixture');
    record.assets.push({
      path: name,
      sha256: createHash('sha256').update('fixture').digest('hex'),
    });
  }
  const check = () => {
    fs.writeFileSync(
      path.join(directory, 'commercial/release.json'),
      JSON.stringify(record),
    );
    return commercialFailures(directory);
  };
  assert.deepEqual(check(), []);
  record.reviews.openaiMarks.approved = false;
  assert(check().some((s) => s.includes('openaiMarks')));
  record.reviews.openaiMarks.approved = true;
  record.product = 'Other product';
  record.version = '1.3.4';
  assert(check().some((s) => s.includes('match')));
  record.product = 'DeckShep';
  record.version = '1.4.0';
  fs.writeFileSync(
    path.join(directory, 'com.local.rexagents.sdPlugin/assets/codex-mark.png'),
    'changed',
  );
  assert(check().some((s) => s.includes('Artwork changed')));
  record.support.verified = false;
  assert(check().some((s) => s.includes('support')));
  record.reviews.nameAndLogo.evidence = '../outside';
  assert(check().some((s) => s.includes('nameAndLogo')));
  fs.symlinkSync(
    path.join(directory, 'commercial/evidence.txt'),
    path.join(directory, 'commercial/link.txt'),
  );
  record.reviews.nameAndLogo.evidence = 'commercial/link.txt';
  assert(check().some((s) => s.includes('nameAndLogo')));
});
