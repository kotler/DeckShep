'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { HerdrRpc } = require('../../src/terminals/herdr-tui/rpc');

test('Herdr socket path failures never reach the caller with a path', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckshep-herdr-path-'));
  fs.chmodSync(dir, 0o700);
  try {
    for (const socket of [
      path.join(dir, 'missing.sock'),
      path.join(dir, 'no-such-dir', 'missing.sock'),
    ]) {
      await assert.rejects(new HerdrRpc(socket).connect(), (error) => {
        assert.equal(error.message, 'Herdr session replaced or offline');
        assert(!error.message.includes(dir));
        assert.equal(error.code, undefined);
        return true;
      });
    }
    // Deliberate, path-free refusals keep their exact message.
    await assert.rejects(
      new HerdrRpc('relative.sock').connect(),
      /^Error: Herdr socket must be an absolute path$/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
