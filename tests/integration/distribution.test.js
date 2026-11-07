'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

// Keep all eight legacy packaging assertions in the aggregate runner until the
// Node port in Phase 6. The Python suite operates exclusively in temporary HOME.
test('distribution: Python archive and upgrade regression groups', () => {
  const result = spawnSync(
    'python3',
    ['-m', 'unittest', 'discover', '-s', 'tests', '-v'],
    {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stderr, /Ran 8 tests/);
});
