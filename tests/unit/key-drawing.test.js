const test = require('node:test');
const assert = require('node:assert/strict');
const { svg, pulse } = require('../../src/render/visuals');

const STATES = [
  'ready',
  'working',
  'background',
  'question',
  'approval',
  'done',
  'error',
  'unknown',
  'closed',
  'empty',
  'offline',
];
const agent = (extra = {}) => ({
  icon: 'codex',
  lines: ['Chat a', 'Fixture a', 'Ready'],
  color: '#2b654c',
  agent: true,
  ...extra,
});
const control = (extra = {}) => ({
  icon: 'model',
  lines: ['Model', 'gpt-5'],
  color: '#252a39',
  accent: '#389ed7',
  ...extra,
});
const group = (image, id) =>
  (image.match(new RegExp(`<g id="${id}"[^>]*>[\\s\\S]*?</g>`)) || [''])[0];
const sizes = (image) =>
  [...image.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));

test('every state draws its own glyph group, all different', () => {
  const seen = new Map();
  for (const state of STATES) {
    const glyph = group(svg(agent({ state })), `state-${state}`);
    assert.ok(glyph, state);
    const shape = glyph.replace(/id="[^"]*"/, '');
    assert.ok(!seen.has(shape), `${state} duplicates ${seen.get(shape)}`);
    seen.set(shape, state);
  }
});

test('absent state keeps the plain status row', () => {
  const image = svg(agent());
  assert.ok(!image.includes('id="state-'));
  assert.match(image, /<text x="12" y="124"[^>]*>Ready<\/text>/);
  const withState = svg(agent({ state: 'ready' }));
  assert.match(withState, /<text x="40" y="124"[^>]*font-size="24"[^>]*>Ready/);
});

test('empty slots centre one or two lines with numeric positions', () => {
  for (const lines of [['No agent'], ['Rex offline']]) {
    const image = svg({ icon: 'empty', lines, agent: true, color: '#38414b' });
    assert.ok(!image.includes('undefined'));
    const ys = [...image.matchAll(/<text x="[^"]*" y="([^"]*)"/g)].map(
      (m) => m[1],
    );
    assert.equal(ys.length, lines.length);
    for (const y of ys) assert.ok(Number.isFinite(Number(y)), y);
  }
});

const texts = (image) =>
  [...image.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

test('text is never below 20 units', () => {
  for (const image of [
    svg(control({ lines: ['Stop', 'A very long caption indeed'] })),
    svg(control({ lines: ['Permissions'] })),
    svg(control({ lines: ['Approve for me'] })),
    svg(agent({ state: 'working', lines: ['A', 'B', 'WORKINGLONG'] })),
  ])
    for (const size of sizes(image)) assert.ok(size >= 20, String(size));
  const fits = svg(control({ lines: ['Permissions'] }));
  assert.ok(fits.includes('Permissions</text>'));
});

test('a two-word caption that does not fit wraps into two whole lines', () => {
  for (const [lines, expected] of [
    [
      ['Model', 'Select any agent'],
      ['Model', 'Select', 'any agent'],
    ],
    [
      ['Permissions', 'Approve for me'],
      ['Permissions', 'Approve', 'for me'],
    ],
    [['Approve for me'], ['Approve', 'for me']],
  ]) {
    const image = svg(control({ lines }));
    assert.deepEqual(texts(image), expected, lines.join('/'));
    assert.ok(!image.includes('…'));
    for (const size of sizes(image)) assert.ok(size >= 20, String(size));
  }
});

test('a single over-long word is shortened with an ellipsis, never wrapped', () => {
  const image = svg(control({ lines: ['Model', 'Extraordinarilylongword'] }));
  const lines = texts(image);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'), lines[1]);
  for (const size of sizes(image)) assert.ok(size >= 20, String(size));
});

test('a key that already has three lines does not grow', () => {
  const image = svg(control({ lines: ['Page', '1/2', 'A very long caption'] }));
  const lines = texts(image);
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Page');
  assert.equal(lines[1], '1/2');
  assert.ok(lines[2].endsWith('…'), lines[2]);
  const wide = svg(control({ lines: ['Approve for me', 'x', 'y'] }));
  assert.equal(texts(wide).length, 3);
  assert.ok(texts(wide)[0].endsWith('…'));
});

test('an agent key never wraps; its status word is shortened instead', () => {
  const image = svg(
    agent({ state: 'working', lines: ['A', 'B', 'Two words that overflow'] }),
  );
  const lines = texts(image);
  assert.equal(lines.length, 3);
  assert.ok(lines[2].endsWith('…'), lines[2]);
  for (const size of sizes(image)) assert.ok(size >= 20, String(size));
});

test('dim controls use the muted colours and no accent tint', () => {
  const image = svg(control({ dim: true, accent: '#d34263' }));
  assert.ok(image.includes('fill="#8f97ab"'));
  assert.match(image, /id="control-rail"[^>]*fill="#3a4155"/);
  assert.ok(image.includes('stroke="#6b7389"'));
  const surface = image.match(
    /<linearGradient[^>]*><stop stop-color="([^"]+)"/,
  )[1];
  assert.equal(surface, '#252a39');
  const normal = svg(control({ accent: '#d34263' }));
  assert.ok(!normal.includes('#8f97ab'));
  assert.notEqual(normal.match(/stop-color="([^"]+)"/)[1], '#252a39');
});

test('blank keys draw no rail; others do', () => {
  assert.ok(
    !svg({ icon: 'blank', lines: [], color: '#252a39' }).includes(
      'control-rail',
    ),
  );
  assert.ok(svg(control()).includes('control-rail'));
});

test('hold hint only appears when hold is set on a control', () => {
  assert.ok(
    svg(control({ hold: true, accent: '#d34263' })).includes(
      '<g id="hold-hint"><path d="M126 2H142V18Z" fill="#d34263"/>',
    ),
  );
  assert.ok(!svg(control()).includes('hold-hint'));
  assert.ok(!svg(control({ hold: false })).includes('hold-hint'));
  assert.ok(!svg(agent({ hold: true })).includes('hold-hint'));
});

test('attention icon draws a glyph', () => {
  const image = svg({
    icon: 'attention',
    lines: ['2', 'WAITING'],
    color: '#252a39',
    accent: '#d19c30',
  });
  assert.match(image, /<g transform="translate\(14 10\)[^>]*><circle/);
});

test('pulse is quantised to 0.02 and 0 when disabled', () => {
  const config = {
    enabled: true,
    workingPeriodMs: 2200,
    completePulseMs: 15000,
  };
  for (const state of ['working', 'done', 'blocked'])
    for (let t = 0; t < 4000; t += 37) {
      const v = pulse(state, t, config);
      assert.ok(
        Math.abs(v * 50 - Math.round(v * 50)) < 1e-9,
        `${state} ${t} ${v}`,
      );
      assert.ok(v >= 0 && v <= 0.22);
    }
  assert.equal(pulse('working', 100, { enabled: false }), 0);
  assert.equal(pulse('done', 100, {}), 0);
});

test('markup and control characters in text stay escaped', () => {
  const image = svg(
    agent({ state: 'ready', lines: ['<b>&x\u0007', 'p', 's'] }),
  );
  assert.ok(image.includes('&lt;b&gt;&amp;x</text>'));
  assert.ok(!image.includes('<b>'));
  assert.ok(!image.includes('\u0007'));
});
