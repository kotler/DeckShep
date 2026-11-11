type AgentSnapshot = import('../domain/types').AgentSnapshot;
type Config = import('../domain/types').Config;
type PressContext = import('../domain/types').PressContext;
type KeySpec = import('./spec').KeySpec;
('use strict');
const { pluginDirectory } = require('../platform/paths.ts');
const esc: (s: any) => string = (s: any) =>
  String(s || '')
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
function providerMark(provider: string): string {
  const source: string = require('node:fs').readFileSync(
    require('node:path').join(
      pluginDirectory,
      'assets',
      provider + '-mark.svg',
    ),
    'utf8',
  );
  // The pinned marks use a 24×24 viewBox. Inline their geometry in the key's
  // document so native rendering needs neither nested SVG nor CSS color
  // inheritance. Keep upstream fill/clip rules, titles and paths intact.
  return source
    .replace(/<svg\b([^>]*)>/, (_tag: string, attributes: string) => {
      const rules = attributes.replace(
        /\s(?:xmlns|viewBox|width|height|style|fill)="[^"]*"/g,
        '',
      );
      return `<g${rules} fill="white">`;
    })
    .replace('</svg>', '</g>');
}
const codexMark: string = providerMark('codex');
const claudeMark: string = providerMark('claude');
const paths: Record<string, string> = {
  blank: '',
  codex: `<g transform="translate(12 0) scale(3.333333)" color="white" fill="white" stroke="none">${codexMark}</g>`,
  empty:
    '<rect x="22" y="15" width="60" height="50" rx="10" stroke-opacity=".45" stroke-dasharray="4 7"/>',
  'claude-code': `<g transform="translate(27 15) scale(2.1)" color="white" fill="white" stroke="none">${claudeMark}</g>`,
  grok: '<circle cx="52" cy="40" r="25"/><path d="m27 65 50-50M42 44l22-8-8 22"/>',
  steer: '<path d="M25 65V42q0-22 22-22h33M64 7l16 13-16 13"/>',
  queue:
    '<path d="M23 15h48M23 30h40M23 45h25"/><circle cx="69" cy="53" r="17"/><path d="M69 43v11l8 5"/>',
  reviewer:
    '<circle cx="52" cy="25" r="13"/><path d="M27 67v-7a25 25 0 0 1 50 0v7M25 21l-8 8 8 8M79 21l8 8-8 8"/>',
  permissions:
    '<path d="M52 9 80 20v20c0 19-28 32-28 32S24 59 24 40V20Z"/><path d="m38 39 10 10 19-22"/>',
  model:
    '<path d="m52 13 32 17-32 17-32-17Zm-32 30 32 17 32-17M20 57l32 17 32-17"/>',
  effort:
    '<path d="M22 59a30 30 0 0 1 60 0M52 54l19-24M29 59h-7m53 0h7M52 22v7"/><circle cx="52" cy="56" r="5"/>',
  collapse:
    '<path transform="rotate(90 52 40)" d="M22 13h60M22 67h60M35 21l17 14 17-14M35 59l17-14 17 14"/>',
  previous: '<path d="M75 40H24m20-20L24 40l20 20"/>',
  next: '<path d="M29 40h51M60 20l20 20-20 20"/>',
  stopTerminals: '<rect x="28" y="16" width="48" height="48" rx="8"/>',
  interrupt: '<rect x="28" y="16" width="48" height="48" rx="8"/>',
  zoom: '<rect x="19" y="10" width="66" height="60" rx="8"/><path d="m27 34 16-16m-16 0h16v16m34 12L61 62m0-16v16h16"/>',
  more: '<circle cx="25" cy="40" r="4"/><circle cx="52" cy="40" r="4"/><circle cx="79" cy="40" r="4"/>',
  plan: '<path d="M32 14h45v54H27V22h5M39 29h25M39 41h25M39 53h14"/>',
  review:
    '<circle cx="45" cy="32" r="21"/><path d="m60 48 23 22m-50-38 8 8 15-17"/>',
  tests:
    '<path d="M36 12h32M42 12v20L23 62q-3 6 6 6h46q9 0 6-6L62 32V12M34 48h36"/>',
  continue: '<path d="m36 14 42 26-42 26Z"/>',
  send: '<path d="m18 17 69 23-69 23 10-23Zm10 23h59"/>',
  up: '<path d="M52 68V13m-23 23 23-23 23 23"/>',
  down: '<path d="M52 12v55M29 44l23 23 23-23"/>',
  left: '<path d="M83 40H21m22-22L21 40l22 22"/>',
  right: '<path d="M21 40h62M61 18l22 22-22 22"/>',
  escape: '<path d="m30 18 44 44m0-44L30 62"/>',
  bankprev: '<path d="m50 17-23 23 23 23m28-46L55 40l23 23"/>',
  banknext: '<path d="m26 17 23 23-23 23m28-46 23 23-23 23"/>',
};
function svg({
  icon = 'more',
  lines = [],
  color = '#24394b',
  pulse = 0,
  badge = '',
  agent = false,
  textOnly = false,
  accent,
  style = 'signal',
  state,
  dim,
  hold,
}: Partial<KeySpec>) {
  if (style === 'signal')
    return require('./signal').signalSvg({
      icon,
      lines,
      color,
      pulse,
      badge,
      agent,
      textOnly,
      accent,
      state,
      dim,
      hold,
      codexMark,
      claudeMark,
      legacyPaths: paths,
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><rect x="2" y="2" width="140" height="140" rx="17" fill="${color}"/><rect x="2" y="2" width="140" height="140" rx="17" fill="white" opacity="${Math.max(0, Math.min(0.22, pulse))}"/><rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="2"/><g transform="${agent ? 'translate(32 -1) scale(.78)' : 'translate(20 0)'}" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${textOnly ? '' : (((paths as Record<string, any>)[icon] ?? paths.more) as Record<string, any>)}</g>${lines
    .slice(0, 3)
    .map(
      (s: any, i: any) =>
        `<text x="72" y="${textOnly ? 82 : agent ? [79, 103, 130][i] : 94 + i * 19}" fill="white" text-anchor="middle" font-family="Arial" font-size="${textOnly ? 26 : agent ? [18, 16, 16][i] : i === 0 ? 17 : 15}" font-weight="${i === 0 || (agent && i === 2) ? 'bold' : 'normal'}">${esc(s).slice(0, 140)}</text>`,
    )
    .join(
      '',
    )}${badge === 'selected' ? `<g id="selected-agent"><circle cx="123" cy="19" r="6" fill="white"/></g>` : badge ? `<circle cx="125" cy="17" r="7" fill="#ffd66c"/>` : ''}</svg>`;
}
function pulse(state: any, elapsed: number, config: Record<string, any>) {
  if (!config?.enabled) return 0;
  // Quantised to 0.02 so animated frames repeat and hit the frame cache.
  const q = (v: number): number => Math.round(v * 50) / 50;
  if (state === 'working')
    return q(
      0.09 +
        0.09 *
          Math.sin((elapsed * 2 * Math.PI) / (config.workingPeriodMs || 2200)),
    );
  if (state === 'done' && elapsed < (config.completePulseMs ?? 15000))
    return q(0.12 + 0.1 * Math.sin((elapsed * 2 * Math.PI) / 1500));
  if (state === 'blocked')
    return q(0.07 + 0.07 * Math.sin((elapsed * 2 * Math.PI) / 3000));
  return 0;
}
module.exports = { svg, pulse, paths };

export {};
