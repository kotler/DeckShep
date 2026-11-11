import { textWidth } from './metrics';
type AgentSnapshot = import('../domain/types').AgentSnapshot;
type Config = import('../domain/types').Config;
type PressContext = import('../domain/types').PressContext;
('use strict');
const { pluginDirectory } = require('../platform/paths.ts');
const fs = require('node:fs'),
  path = require('node:path');
const icons: {
  steer: string;
  queue: string;
  reviewer: string;
  permissions: string;
  model: string;
  effort: string;
  collapse: string;
  next: string;
  previous: string;
  interrupt: string;
  stopTerminals: string;
  zoom: string;
  more: string;
  review: string;
  tests: string;
  continue: string;
  send: string;
  up: string;
  down: string;
  left: string;
  right: string;
  escape: string;
  bankprev: string;
  banknext: string;
} = {
  steer: 'corner-up-right',
  queue: 'list-plus',
  reviewer: 'user-cog',
  permissions: 'corner-down-left',
  model: 'cpu',
  effort: 'brain',
  collapse: 'fold-horizontal',
  next: 'arrow-right',
  previous: 'arrow-left',
  interrupt: 'square',
  stopTerminals: 'square',
  zoom: 'maximize',
  more: 'ellipsis',
  review: 'scan-search',
  tests: 'check-check',
  continue: 'play',
  send: 'send',
  up: 'arrow-up',
  down: 'arrow-down',
  left: 'arrow-left',
  right: 'arrow-right',
  escape: 'undo-2',
  bankprev: 'chevrons-left',
  banknext: 'panels-top-left',
};
type AgentFaceState = import('./spec').AgentFaceState;
interface SignalInput {
  icon: string;
  lines: string[];
  color: string;
  pulse: number;
  badge: string;
  agent: boolean;
  textOnly: boolean;
  accent?: string;
  state?: AgentFaceState;
  dim?: boolean;
  hold?: boolean;
  codexMark: string;
  claudeMark: string;
  busyRing?: string;
  legacyPaths: Record<string, string>;
}
const glyphs: Record<string, string> = Object.fromEntries(
  Object.entries(icons).map(([name, file]: [string, string]) => [
    name,
    (
      fs
        .readFileSync(
          path.join(pluginDirectory, 'assets', 'lucide', file + '.svg'),
          'utf8',
        )
        .match(/<svg[^>]*>([\s\S]*?)<\/svg>/) as RegExpMatchArray
    )[1],
  ]),
);
const esc: (s: unknown) => string = (s: unknown) =>
  String(s ?? '')
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
function blend(color: string, other: string, t: number) {
  const rgb: (c: string) => number[] = (c: string) =>
    /^#[a-f0-9]{6}$/i.test(c)
      ? [1, 3, 5].map((i: number) => parseInt(c.slice(i, i + 2), 16))
      : [37, 42, 57];
  return (
    '#' +
    rgb(color)
      .map((v: number, i: number) =>
        Math.round(v * (1 - t) + rgb(other)[i] * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function controlAccent(action: string, color: string) {
  if (color === '#38414b' || action === 'none') return '#485066';
  if (color === '#893748') return '#d34263';
  if (color === '#2b654c') return '#28ad82';
  if (['interrupt', 'stopTerminals'].includes(action)) return '#d34263';
  if (
    action.startsWith('approval') ||
    [
      'up',
      'down',
      'left',
      'right',
      'questionPrev',
      'questionNext',
      'answer',
      'escape',
    ].includes(action)
  )
    return '#d19c30';
  if (
    ['model', 'effort', 'effortIncrease', 'effortDecrease', 'plan'].includes(
      action,
    )
  )
    return '#b16bf2';
  return '#389ed7';
}
// Own-drawn 24x24 stroke glyph (circle with an exclamation mark).
glyphs.attention =
  '<circle cx="12" cy="12" r="10"/><path d="M12 7v6"/><path d="M12 16.8v.2"/>';
const MIN_TEXT = 20,
  TEXT_WIDTH = 120,
  ELLIPSIS = '…';
/** Size and text for one line: shrink to MIN_TEXT, then shorten with an ellipsis. */
function fitLine(
  raw: string,
  nominal: number,
  maxWidth: number,
  bold: boolean,
  floor: number = MIN_TEXT,
): { size: number; text: string; squeeze: boolean } {
  const chars = Array.from(raw);
  const width = textWidth(chars, nominal, bold);
  if (width <= maxWidth) return { size: nominal, text: raw, squeeze: false };
  const shrunk = Math.floor((nominal * maxWidth) / width);
  if (shrunk >= floor) return { size: shrunk, text: raw, squeeze: true };
  const size = Math.min(nominal, floor);
  if (textWidth(chars, size, bold) <= maxWidth)
    return { size, text: raw, squeeze: false };
  let kept = chars.slice();
  while (kept.length && textWidth([...kept, ELLIPSIS], size, bold) > maxWidth)
    kept = kept.slice(0, -1);
  return { size, text: kept.join('').trimEnd() + ELLIPSIS, squeeze: false };
}
interface Caption {
  text: string;
  /** Lines from the key's first caption are drawn bold at the heading size. */
  lead: boolean;
}
/**
 * A control caption that would have to be cut is broken at a space instead,
 * while the key still has a free line: "Approve for me" becomes two whole
 * lines rather than "Approve fo…".
 */
function wrapCaptions(lines: string[]): Caption[] {
  const captions: Caption[] = lines
    .slice(0, 3)
    .map((text: string, i: number) => ({ text, lead: i === 0 }));
  const fits = (text: string, bold: boolean) =>
    textWidth(Array.from(text), MIN_TEXT, bold) <= TEXT_WIDTH;
  for (let i = 0; i < captions.length && captions.length < 3; i++) {
    const { text, lead } = captions[i];
    if (fits(text, lead)) continue;
    const words = text.split(' ');
    let best: [string, string] | undefined,
      bestWidth = Infinity;
    for (let cut = 1; cut < words.length; cut++) {
      const head = words.slice(0, cut).join(' '),
        tail = words.slice(cut).join(' ');
      const width = Math.max(
        textWidth(Array.from(head), MIN_TEXT, lead),
        textWidth(Array.from(tail), MIN_TEXT, lead),
      );
      if (head && tail && width < bestWidth) {
        best = [head, tail];
        bestWidth = width;
      }
    }
    if (!best) continue;
    captions.splice(i, 1, { text: best[0], lead }, { text: best[1], lead });
    i++;
  }
  return captions;
}
const WHITE = 'fill="white"';
const RING = 'fill="none" stroke="white" stroke-width="3"';
const STROKE =
  'fill="none" stroke="white" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"';
/** Shape-coded state glyph in a 24x24 box; every state has a unique shape. */
function stateShape(state: AgentFaceState, knockout: string): string {
  switch (state) {
    case 'ready':
      return `<circle cx="12" cy="12" r="10.5" ${WHITE}/>`;
    case 'working':
      return `<path d="M5 2.5 22 12 5 21.5Z" ${WHITE} stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
    case 'background':
      return `<circle cx="12" cy="12" r="9" ${RING}/><path d="M12 4.5a7.5 7.5 0 0 0 0 15Z" ${WHITE}/>`;
    case 'question':
      return `<circle cx="12" cy="12" r="10" ${RING}/><text x="12" y="17.6" fill="white" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold">?</text>`;
    case 'approval':
      return `<path d="M12 2.5 22 21H2Z" ${WHITE} stroke="white" stroke-width="3" stroke-linejoin="round"/><path d="M12 9v5.5" fill="none" stroke="${knockout}" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="18" r="1.5" fill="${knockout}"/>`;
    case 'done':
      return `<path d="M3.5 12.5 9.5 18.5 20.5 6" ${STROKE}/>`;
    case 'error':
      return `<path d="M4.5 4.5 19.5 19.5M19.5 4.5 4.5 19.5" ${STROKE}/>`;
    case 'closed':
      return `<circle cx="12" cy="12" r="9" ${RING}/>`;
    case 'unknown':
      return `<circle cx="12" cy="12" r="9" ${RING}/><circle cx="12" cy="12" r="2.6" ${WHITE}/>`;
    case 'empty':
      return `<circle cx="12" cy="12" r="9" ${RING} stroke-dasharray="4.6 4"/>`;
    case 'offline':
      return `<circle cx="12" cy="12" r="9" ${RING}/><path d="M4.5 19.5 19.5 4.5" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>`;
  }
}
function stateGlyph(
  state: AgentFaceState,
  x: number,
  y: number,
  knockout: string,
): string {
  return `<g id="state-${state}" transform="translate(${x} ${y})">${stateShape(state, knockout)}</g>`;
}
function signalSvg({
  icon,
  lines,
  color,
  pulse,
  badge,
  agent,
  textOnly,
  accent = '#389ed7',
  state,
  dim = false,
  hold = false,
  codexMark,
  claudeMark,
  legacyPaths,
  busyRing = '',
}: SignalInput) {
  const empty: boolean = agent && icon === 'empty',
    fill: string = agent && !empty ? color : '#252a39';
  const bottom: string = agent && !empty ? blend(color, '#151923', 0.35) : fill;
  const dimmed: boolean = dim && !agent;
  const tinted: boolean =
      !agent && !dimmed && ['#d19c30', '#d34263'].includes(accent),
    top: string = tinted ? blend(fill, accent, 0.25) : fill;
  const claudeBackground: string = `<g id="claude-watermark" transform="translate(20 20) scale(4.333333)" color="white" fill="white" opacity=".28">${claudeMark}</g>`;
  const watermark: string =
    agent && icon === 'claude-code'
      ? claudeBackground
      : agent && icon === 'codex'
        ? `<g id="agent-watermark" transform="translate(20 20) scale(4.333333)" color="white" fill="white" opacity=".26">${codexMark}</g>`
        : '';
  const captions: Caption[] =
      agent || textOnly
        ? lines
            .slice(0, 3)
            .map((text: string, i: number) => ({ text, lead: i === 0 }))
        : wrapCaptions(lines),
    visible: string[] = captions.map((caption: Caption) => caption.text),
    scale: 1.4 | 1.7 = visible.length === 3 ? 1.4 : 1.7;
  const iconStroke: string = dimmed
    ? '#6b7389'
    : blend(accent, '#ffffff', 0.32);
  const glyph: string =
    agent && ['codex', 'claude-code'].includes(icon)
      ? ''
      : glyphs[icon]
        ? `<g transform="translate(14 10) scale(${scale})" fill="none" stroke="${iconStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphs[icon]}</g>`
        : icon === 'blank' || empty
          ? ''
          : `<g transform="translate(12 0) scale(.65)" fill="none" stroke="${dimmed ? '#6b7389' : 'white'}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${legacyPaths[icon] || ''}</g>`;
  const centered: boolean = textOnly || empty,
    stateRow: boolean = agent && !empty && Boolean(state),
    topGlyph: boolean = empty && Boolean(state),
    ys: number[] =
      agent && !empty
        ? [48, 86, 124]
        : centered
          ? visible.length >= 3
            ? [56, 84, 112]
            : visible.length === 2
              ? [72, 100]
              : [topGlyph ? 90 : 84]
          : visible.length === 3
            ? [64, 86, 108]
            : visible.length === 2
              ? [84, 111]
              : [100];
  const text: string = visible
    .map((s: string, i: number) => {
      const nominal: 28 | 24 | 26 | 22 = textOnly
        ? 28
        : empty
          ? 24
          : agent
            ? i === 0
              ? 26
              : i === 2 && stateRow
                ? 24
                : 22
            : captions[i].lead
              ? 24
              : 22;
      const indent = stateRow && i === 2;
      const x = centered ? 72 : indent ? 40 : 12;
      const bold: boolean = captions[i].lead || (agent && i === 2);
      // A centred slot caption may use the full inner width of the key. An
      // agent key drawn without a state glyph keeps shrink-to-fit captions.
      const maxWidth: number = indent ? 94 : centered ? 128 : TEXT_WIDTH;
      const fit = fitLine(
        s,
        nominal,
        maxWidth,
        bold,
        agent && !empty && !stateRow ? 12 : MIN_TEXT,
      );
      // Native key renderers can ignore textLength; a bounded font size keeps
      // long captions such as Permissions inside the same text area.
      const squeeze: string = fit.squeeze
        ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"`
        : '';
      const fillColor: string = empty
        ? '#a7aec0'
        : dimmed
          ? '#8f97ab'
          : '#f9fbff';
      return `<text x="${x}" y="${ys[i]}" fill="${fillColor}" text-anchor="${centered ? 'middle' : 'start'}" font-family="Arial" font-size="${fit.size}" font-weight="${bold ? 'bold' : 'normal'}"${squeeze}>${esc(fit.text).slice(0, 140)}</text>`;
    })
    .join('');
  const stateMark: string =
    state && stateRow
      ? stateGlyph(state, 12, (ys[2] ?? 124) - 20, color)
      : state && topGlyph
        ? stateGlyph(state, 60, 20, color)
        : '';
  const rail: string =
    !agent && !(icon === 'blank' && visible.length === 0)
      ? `<rect id="control-rail" x="14" y="120" width="116" height="12" rx="6" fill="${dimmed ? '#3a4155' : accent}"/>`
      : '';
  const tick: string =
    hold && !agent
      ? `<g id="hold-hint"><path d="M126 2H142V18Z" fill="${accent}"/></g>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><defs><linearGradient id="surface" x2="1" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><clipPath id="key"><rect x="2" y="2" width="140" height="140" rx="14"/></clipPath></defs><g clip-path="url(#key)"><rect x="2" y="2" width="140" height="140" fill="url(#surface)"/>${agent && !empty ? `<rect x="2" y="2" width="140" height="140" fill="white" opacity="${Math.max(0, Math.min(0.22, pulse))}"/>` : ''}${watermark}${!textOnly && !empty ? glyph : ''}${rail}${tick}</g>${stateMark}${text}${badge === 'selected' ? '<g id="selected-agent"><circle cx="123" cy="19" r="6" fill="white"/></g>' : ''}${busyRing}</svg>`;
}
module.exports = { signalSvg, controlAccent };

export {};
