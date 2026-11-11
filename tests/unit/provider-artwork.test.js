const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { svg } = require('../../src/render/visuals');

for (const [provider, icon] of [
  ['codex', 'codex'],
  ['claude', 'claude-code'],
]) {
  for (const style of ['signal', 'classic']) {
    test(`${provider} ${style} artwork uses inline paths with an explicit fill for Stream Deck`, () => {
      const source = fs.readFileSync(
        path.join(
          __dirname,
          '../../com.kotl3r.deckshep.sdPlugin/assets',
          provider + '-mark.svg',
        ),
        'utf8',
      );
      const image = svg({
        icon,
        agent: true,
        style,
        color: '#167348',
        lines: ['Agent', 'Project', 'READY'],
      });
      // Native rendering must not depend on browser support for nested SVG
      // documents and CSS inheritance. Preserve the pinned upstream geometry.
      assert.equal((image.match(/<svg\b/g) || []).length, 1);
      assert.doesNotMatch(image, /currentColor|1em|style="/);
      assert.match(image, /<g\b[^>]*fill="white"/);
      assert.match(image, /fill-rule="evenodd"/);
      for (const element of source.matchAll(
        /<(?:title|path)\b[^>]*>(?:[^<]*<\/title>)?/g,
      ))
        assert(image.includes(element[0]), 'preserve upstream title and paths');
      if (style === 'signal')
        assert(
          image.includes(
            provider === 'codex' ? 'agent-watermark' : 'claude-watermark',
          ),
        );
    });
  }
}
