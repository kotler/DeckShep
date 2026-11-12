'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  mask,
  sanitize,
  recorder,
  frames,
} = require('../helpers/screen-corpus.cjs');

test('masking keeps every line the same length', () => {
  const home = os.homedir(),
    line = `│ cwd: ${home}/work   mail someone@example.org │`;
  const clean = sanitize(line + '\n' + 'x'.repeat(4) + ' ' + 'A1b2'.repeat(10));
  assert.equal(
    clean.length,
    (line + '\n' + 'x'.repeat(4) + ' ' + 'A1b2'.repeat(10)).length,
  );
  assert(!clean.includes(home));
  assert(!clean.includes('someone@example.org'));
  assert(!clean.includes('A1b2A1b2'));
  assert(clean.startsWith('│ cwd: '));
  assert(clean.includes('/work   mail '));
  assert.equal(mask('abc secret abc', 'secret'), 'abc xxxxxx abc');
  // Too short to be a safe needle: left alone.
  assert.equal(mask('a/b', '/'), 'a/b');
  assert.equal(sanitize('plain ❯ prompt'), 'plain ❯ prompt');
  assert.equal(sanitize('token here', ['token']), 'xxxxx here');
});

test('nothing is recorded unless recording is switched on', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-frames-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const options = {
    provider: 'claude',
    version: '2.1.322',
    scenario: 'picker',
    root,
  };
  const off = recorder({ ...options, enabled: false });
  assert.equal(off.save({ text: 'screen', cursor: null }), null);
  assert.deepEqual(fs.readdirSync(root), []);
  // A malformed name can never become a path.
  for (const bad of [
    { provider: '../x' },
    { version: 'latest' },
    { scenario: '../../etc' },
    { scenario: '' },
  ]) {
    const refused = recorder({ ...options, ...bad, enabled: true });
    assert.equal(refused.enabled, false);
    assert.equal(refused.save({ text: 'screen' }), null);
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

test('a recorded frame keeps the text, the raw stream and the step that led to it', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-frames-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const record = recorder({
    provider: 'claude',
    version: '2.1.322',
    scenario: 'picker',
    root,
    enabled: true,
    secrets: ['PRIVATE-NAME'],
  });
  const run = record.tap((args) =>
    args.includes('format') ? { content: '\x1b[1mPRIVATE-NAME\x1b[0m' } : {},
  );
  run(['block', 'call', 'format', '{}']);
  run(['block', 'call', 'modes']);
  record.note('alt+p');
  const first = record.save({
    text: 'Select model PRIVATE-NAME',
    cursor: null,
  });
  const later = record.tap(async () => ({ content: 'second' }));
  await later(['block', 'call', 'format']);
  record.note('down / odd name!');
  record.save({ text: 'second screen', cursor: { row: 2, column: 3 } });
  assert.equal(path.relative(root, first), 'claude/2.1.322/picker-01.json');
  const saved = frames('claude', root);
  assert.deepEqual(
    saved.map((f) => [f.file, f.step, f.after]),
    [
      ['claude/2.1.322/picker-01.json', 1, 'alt+p'],
      ['claude/2.1.322/picker-02.json', 2, 'down---odd-name-'],
    ],
  );
  assert.equal(saved[0].text, 'Select model xxxxxxxxxxxx');
  assert.equal(saved[0].vt, '\x1b[1mxxxxxxxxxxxx\x1b[0m');
  assert.deepEqual(saved[1].cursor, { row: 2, column: 3 });
  assert.equal(saved[1].vt, 'second');
  assert.deepEqual(saved[0].expect, {});
  // Releases load oldest first, by number.
  fs.mkdirSync(path.join(root, 'claude/2.1.99'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'claude/2.1.99/picker-01.json'),
    JSON.stringify({ version: '2.1.99', text: '' }),
  );
  assert.equal(frames('claude', root)[0].version, '2.1.99');
  assert.deepEqual(frames('codex', root), []);
});

test('every recorded Claude frame reads the way its reviewer said', (t) => {
  const recorded = frames('claude');
  if (!recorded.length) {
    t.diagnostic(
      'no recorded Claude frames yet; see tests/fixtures/screens/README.md',
    );
    return;
  }
  const {
    highlightedEffort,
  } = require('../../src/agents/claude/effort-slider');
  const {
    readClaudeSettings,
    requireClaudeReady,
  } = require('../../src/agents/claude/keyboard-settings');
  const {
    hasClaudeInterruptCue,
  } = require('../../src/agents/claude/interrupt-cue');
  for (const frame of recorded) {
    const view = { text: frame.text, cursor: frame.cursor, hash: 'recorded' },
      expect = frame.expect || {};
    if ('effortSlider' in expect)
      assert.equal(highlightedEffort(view), expect.effortSlider, frame.file);
    if ('interruptCue' in expect)
      assert.equal(
        hasClaudeInterruptCue(frame.text),
        expect.interruptCue,
        frame.file,
      );
    if ('ready' in expect) {
      const ready = () => requireClaudeReady(view, { app: 'claude-code' });
      if (expect.ready) assert.doesNotThrow(ready, frame.file);
      else assert.throws(ready, frame.file);
    }
    if (expect.settings) {
      const read = readClaudeSettings(view);
      for (const [key, value] of Object.entries(expect.settings))
        assert.equal(read[key], value, `${frame.file} ${key}`);
    }
  }
});
