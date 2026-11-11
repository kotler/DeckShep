'use strict';
// Owner decision (2026-11-10): no Codex version is pinned in source. The daemon
// only has to report a release version; each control keeps its own checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { knownServerVersion } = require('../../src/agents/codex/daemon');

test('any Codex release version is accepted and unreported versions refuse', () => {
  for (const version of ['0.166.0', '0.167.0', '0.168.0', '0.200.3', '1.0.0'])
    assert.equal(knownServerVersion(version), true, version);
  for (const version of [
    null,
    undefined,
    '',
    '0.168',
    'dev',
    '0.168.0-alpha',
    168,
  ])
    assert.equal(knownServerVersion(version), false, String(version));
});
