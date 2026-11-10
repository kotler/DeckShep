'use strict';
// Owner rule (2026-11-08): DeckShep never installs or changes a Claude status
// line. The only permitted write is restoring the recorded original over
// DeckShep's own legacy wrapper, during removal or the explicit restore.
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { plan, commands } = require('../../src/agents/claude/configure');
const { legacyInstall } = require('../helpers/claude-legacy');

const dir = '/fixture/com.kotl3r.deckshep.sdPlugin',
  node = '/fixture/node',
  wrapper = commands(dir, node).status;
const userLine = { type: 'command', command: 'my-status', padding: 1 };
const fixtures = {
  none: () => ({ settings: {}, saved: null }),
  user: () => ({ settings: { statusLine: userLine }, saved: null }),
  odd: () => ({
    settings: { statusLine: { type: 'prompt', x: 1 } },
    saved: null,
  }),
  hooksOnly: () => {
    const r = plan({ statusLine: userLine }, null, { dir, node });
    return { settings: r.settings, saved: r.registry };
  },
  legacy: () => {
    const r = legacyInstall({ statusLine: userLine }, null, { dir, node });
    return { settings: r.settings, saved: r.registry };
  },
  legacyNoOriginal: () => {
    const r = legacyInstall({}, null, { dir, node });
    return { settings: r.settings, saved: r.registry };
  },
  legacyUserChanged: () => {
    const r = legacyInstall({ statusLine: userLine }, null, { dir, node });
    r.settings.statusLine = { type: 'command', command: 'changed-later' };
    return { settings: r.settings, saved: r.registry };
  },
  removed: () => {
    const r = legacyInstall({ statusLine: userLine }, null, { dir, node }),
      gone = plan(r.settings, r.registry, { dir, node, remove: true });
    return { settings: gone.settings, saved: gone.registry };
  },
};
const variants = [
  {},
  { statusline: true },
  { remove: true },
  { remove: true, statusline: true },
  { restoreStatusLine: true },
  { restoreStatusLine: true, statusline: true },
  { remove: true, restoreStatusLine: true },
];

test('no setup path writes a Claude status line except restoring the recorded original', () => {
  let checked = 0;
  for (const [name, make] of Object.entries(fixtures))
    for (const options of variants) {
      const { settings, saved } = make(),
        before = structuredClone(settings.statusLine);
      let result;
      try {
        result = plan(settings, saved, { dir, node, ...options });
      } catch {
        continue; // refusing is always allowed
      }
      checked++;
      const after = result.settings.statusLine,
        label = name + ' ' + JSON.stringify(options);
      if (after?.command === wrapper)
        assert.deepEqual(
          after,
          before,
          label + ': wrapper may only be kept, never installed',
        );
      const restoring =
        (options.remove || options.restoreStatusLine) &&
        before?.command === wrapper;
      if (restoring)
        assert.deepEqual(after, saved.originalStatusLine ?? undefined, label);
      else assert.deepEqual(after, before, label + ': status line changed');
      if (options.remove || options.restoreStatusLine)
        assert.equal(result.registry.statusline, false, label);
    }
  assert(checked >= 20, 'enough paths exercised: ' + checked);
});

test('--statusline is refused for every install and only restore/remove reach the original', () => {
  for (const make of Object.values(fixtures)) {
    const { settings, saved } = make();
    assert.throws(
      () => plan(settings, saved, { dir, node, statusline: true }),
      /no longer installs/,
    );
  }
});

test('only configure.ts restore code assigns statusLine in src', () => {
  const offenders = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(ts|mts|js)$/.test(entry.name))
        fs.readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/\bstatusLine\s*=[^=]|statusLine:\s*\{/.test(line))
              offenders.push(
                path.relative(process.cwd(), file) +
                  ':' +
                  (i + 1) +
                  ' ' +
                  line.trim(),
              );
          });
    }
  };
  walk(path.join(__dirname, '../../src'));
  assert.deepEqual(
    offenders.map((o) => o.replace(/:\d+ /, ' ')),
    [
      'src/agents/claude/configure.ts result.statusLine = structuredClone(saved.originalStatusLine);',
    ],
  );
});
