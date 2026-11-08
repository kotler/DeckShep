import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { svg } = require('../src/render/visuals.ts');
const out = path.join(root, 'dist/marketplace');
fs.mkdirSync(out, { recursive: true });
const logo = fs.readFileSync(
  path.join(root, 'com.local.rexagents.sdPlugin/assets/plugin-icon-source.svg'),
  'utf8',
);
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const text = (x, y, size, value, color = '#f3f0e7', weight = 400) =>
  `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" font-weight="${weight}" fill="${color}">${escape(value)}</text>`;
function key(options, index) {
  const content = svg(options)
    .replaceAll('id="surface"', `id="surface${index}"`)
    .replaceAll('url(#surface)', `url(#surface${index})`)
    .replaceAll('id="key"', `id="key${index}"`)
    .replaceAll('url(#key)', `url(#key${index})`);
  return `<g transform="translate(${1010 + (index % 5) * 156} ${275 + Math.floor(index / 5) * 156})">${content}</g>`;
}
function board(question = false) {
  const agents = [
    { icon: 'codex', lines: ['Codex', 'app', 'WORKING'], color: '#2b654c' },
    {
      icon: 'claude-code',
      lines: ['Claude', 'site', 'READY'],
      color: '#2c526b',
    },
    {
      icon: 'codex',
      lines: ['Codex', 'docs', question ? 'CHOICE' : 'READY'],
      color: question ? '#806325' : '#2c526b',
      badge: 'selected',
    },
    {
      icon: 'claude-code',
      lines: ['Claude', 'tests', 'READY'],
      color: '#2c526b',
    },
    { icon: 'empty', lines: ['Empty'], color: '#252a39' },
  ].map((entry) => ({ ...entry, agent: true }));
  const navigation = [
    ['collapse', ['Collapse']],
    ['banknext', ['Agents', '1–5']],
    ['next', ['Next', 'agent']],
    ['reviewer', ['Reviewer', 'Ask me']],
    ['more', ['Page', 'Home']],
  ].map(([icon, lines]) => ({ icon, lines, color: '#24394b' }));
  const controls = (
    question
      ? [
          ['up', ['Up']],
          ['down', ['Down']],
          ['permissions', ['Confirm']],
          ['escape', ['Esc']],
          ['blank', []],
        ]
      : [
          ['model', ['Model', 'GPT-6 Luna']],
          ['effort', ['Effort', 'Low']],
          ['zoom', ['Zoom']],
          ['plan', ['Plan', 'Default']],
          ['blank', []],
        ]
  ).map(([icon, lines]) => ({
    icon,
    lines,
    color: '#24394b',
    accent:
      icon === 'blank'
        ? '#485066'
        : question
          ? '#d19c30'
          : icon === 'zoom'
            ? '#389ed7'
            : '#b16bf2',
  }));
  return [...agents, ...navigation, ...controls].map(key).join('');
}
function composition({ headline, subhead, question }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="960" viewBox="0 0 1920 960">
  <rect width="1920" height="960" fill="#102a2e"/><circle cx="1660" cy="160" r="430" fill="#173b3d"/>
  <g transform="translate(88 66) scale(.53)">${logo.replace(/<!--[\s\S]*?-->/g, '')}</g>
  ${text(190, 121, 46, 'DeckShep', '#86e1b6', 700)}
  ${headline.map((line, index) => text(96, 340 + index * 88, 70, line, '#f3f0e7', 700)).join('')}
  ${subhead.map((line, index) => text(100, 568 + index * 45, 30, line, '#b9d1c8')).join('')}
  <rect x="986" y="251" width="828" height="516" rx="28" fill="#0a1d21" stroke="#2b4d4c" stroke-width="2"/>
  ${board(question)}
  ${text(100, 795, 24, 'macOS · Stream Deck MK.2', '#86e1b6')}
  ${text(100, 846, 22, 'Rendered preview · demo data', '#b9d1c8')}
  ${text(100, 912, 22, 'PRIVATE REVIEW · Provider artwork and Marketplace submission pending approval', '#ffb66c')}
  </svg>`;
}
const scenes = {
  thumbnail: {
    headline: ['Your agents.', 'At your fingertips.'],
    subhead: [
      'Local controls for Rex and Herdr.',
      'A clear view of the agent you select.',
    ],
  },
  'gallery-overview': {
    headline: ['See the agent.', 'Choose the next move.'],
    subhead: [
      'Project, status and selection on the keys.',
      'Separate Rex and Herdr profiles.',
    ],
  },
  'gallery-context': {
    headline: ['Controls that follow', 'the selected agent.'],
    subhead: [
      'Model, Effort and Zoom when supported.',
      'Experimental features require setup.',
    ],
  },
  'gallery-questions': {
    headline: ['Keep the native', 'choice in view.'],
    subhead: [
      'Navigate supported questions and approvals.',
      'Confirm the choice shown in your terminal.',
    ],
    question: true,
  },
};
for (const [name, scene] of Object.entries(scenes)) {
  const source = composition(scene);
  fs.writeFileSync(path.join(out, name + '.svg'), source);
  fs.writeFileSync(
    path.join(out, name + '.png'),
    new Resvg(source, {
      font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
    })
      .render()
      .asPng(),
  );
}
fs.copyFileSync(
  path.join(root, 'com.local.rexagents.sdPlugin/icon@2x.png'),
  path.join(out, 'app-icon.png'),
);
const names = [
  'app-icon.png',
  ...Object.keys(scenes).map((name) => name + '.png'),
];
const manifest = names.map((name) => ({
  name,
  sha256: createHash('sha256')
    .update(fs.readFileSync(path.join(out, name)))
    .digest('hex'),
}));
fs.writeFileSync(
  path.join(out, 'MEDIA-INFO.json'),
  JSON.stringify(
    {
      product: 'DeckShep',
      status: 'private-review',
      data: 'synthetic',
      providerPermission: 'pending',
      files: manifest,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Generated one app icon, one thumbnail and three gallery images for private review.',
);
