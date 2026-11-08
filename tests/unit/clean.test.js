'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

test('cleanup removes generated output and preserves private backups', async () => {
  const { clean } = await import('../../scripts/clean.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-clean-'));
  try {
    for (const name of ['dist', 'coverage', 'backups']) {
      fs.mkdirSync(path.join(root, name));
      fs.writeFileSync(path.join(root, name, 'sentinel'), 'preserve');
    }
    clean(root);
    assert(!fs.existsSync(path.join(root, 'dist')));
    assert(!fs.existsSync(path.join(root, 'coverage')));
    assert.equal(
      fs.readFileSync(path.join(root, 'backups/sentinel'), 'utf8'),
      'preserve',
    );
    fs.symlinkSync(path.join(root, 'backups'), path.join(root, 'dist'));
    assert.throws(() => clean(root), /symlinked/);
    assert(fs.existsSync(path.join(root, 'backups/sentinel')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
