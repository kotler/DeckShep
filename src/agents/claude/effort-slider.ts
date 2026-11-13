import type { KeyboardView as View } from '../../domain/backend';
import { nativeEffort } from './keyboard-mode';

const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
const footer =
  '←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel';

function slider(view: Pick<View, 'text'>) {
  const lines = view.text.trimEnd().split('\n');
  const heading = lines.findLastIndex((line) => line.trim() === 'Effort');
  const rows = lines.slice(heading + 1).filter((line) => line.trim());
  if (
    heading < 0 ||
    rows.length < 4 ||
    rows.at(-1)?.trim() !== footer ||
    !/^\s*Faster\s+Smarter\s*$/.test(rows[0]) ||
    !/^\s*─*▲─*(?:\s+Ultracode\s+(?:off|on))?\s*$/.test(rows[1]) ||
    !/^\s*(?:low|medium|high|xhigh|max)(?:\s+(?:low|medium|high|xhigh|max))+(?:\s+Tab to toggle)?\s*$/.test(
      rows[2],
    )
  )
    throw Error('Check effort slider');
  const labels = [...rows[2].matchAll(/\b(low|medium|high|xhigh|max)\b/g)];
  const catalog = labels.map((match) => match[0]);
  if (
    catalog.some(
      (name, i) =>
        i > 0 && levels.indexOf(name) <= levels.indexOf(catalog[i - 1]),
    )
  )
    throw Error('Check effort levels');
  const marker = rows[1].indexOf('▲');
  const index = labels.findIndex(
    (label) => marker >= label.index && marker < label.index + label[0].length,
  );
  if (index < 0) throw Error('Check effort marker');
  // Claude changes the explanatory copy by model, level and account. Only
  // the track, labels and session-only footer carry selection semantics.
  const description = rows.slice(3, -1);
  if (
    description.some((line) => /^\s*(?:[❯›>▲]|\d+[.)]\s|[─━▔]{3,})/.test(line))
  )
    throw Error('Check effort slider');
  return { catalog, index };
}

export function highlightedEffort(view: Pick<View, 'text'>) {
  try {
    const { catalog, index } = slider(view);
    return catalog[index];
  } catch {
    return undefined;
  }
}

type SliderSend = (
  view: View,
  value: string,
  paste?: boolean,
  surface?: 'open-slider' | 'slider',
) => Promise<View>;

export async function applyHighlightedEffort(view: View, send: SliderSend) {
  const { catalog, index } = slider(view);
  const label = catalog[index];
  const after = await send(view, 's', false, 'slider');
  const observed = nativeEffort(after);
  if (observed && observed !== label) throw Error('Check applied effort');
  return { label, after };
}

export async function cycleEffortSlider(
  initial: View,
  current: string | undefined,
  send: SliderSend,
) {
  let view = await send(initial, '/effort', true);
  const lines = view.text.split('\n');
  const row = (view.cursor?.row ?? 0) - 1;
  const input = /^(\s*❯[ \u00a0]\/effort)\s*$/.exec(lines[row] || '');
  if (
    !input ||
    view.cursor?.column !== input[1].length + 1 ||
    !/^[─━]{12,}\s*$/.test(lines[row + 1]?.trim() || '') ||
    !lines
      .slice(0, row)
      .some((line) =>
        /^\s*❯\s+\/effort\s+Set effort level for model usage\s*$/.test(line),
      )
  )
    throw Error('Check effort command');
  view = await send(view, 'enter', false, 'open-slider');
  const first = slider(view);
  if (current && first.catalog[first.index] !== current)
    throw Error('Effort changed');
  const next = (first.index + 1) % first.catalog.length;
  const step = next === 0 ? -1 : 1;
  for (let index = first.index; index !== next;) {
    view = await send(view, step > 0 ? 'right' : 'left', false, 'slider');
    const moved = slider(view);
    index += step;
    if (moved.catalog.join() !== first.catalog.join() || moved.index !== index)
      throw Error('Effort slider changed');
  }
  return applyHighlightedEffort(view, send);
}

// Rex groups adjacent letters with the same color into a single VT run.
// The xhigh shimmer can therefore repaint the word with different run boundaries.
const boldRgb = '\\x1b\\[0m\\x1b\\[1m\\x1b\\[38;2;\\d{1,3};\\d{1,3};\\d{1,3}m';
const shimmer = new RegExp(
  boldRgb +
    [...'xhigh'].join('(?:' + boldRgb + ')?') +
    '(?=\\x1b\\[0m|\\x1b\\[\\d+C|\\r?$)',
);

export function idleEffortIdentity(vt: string, text: string) {
  // The idle badge appears a frame after the model picker closes. Keep the
  // cursor, borders, prompt and history byte-exact. Only its reserved line
  // and the optional navigation hint may repaint during the transition.
  const cursor = /\x1b\[(\d+);3H$/.exec(vt);
  if (!cursor) return vt;
  const row = Number(cursor[1]) - 1;
  const lines = text.split('\n'),
    rows = vt.split('\n');
  if (
    !/^❯[ \u00a0]*$/.test(lines[row] || '') ||
    !/^[─━]{12,}\s*$/.test(lines[row - 1] || '') ||
    !/^[─━]{12,}\s*$/.test(lines[row + 1] || '')
  )
    return vt;
  const index = row - 2;
  const badge = /^[○◯◐◑◒◓◔◕◉●◎] (low|medium|high|xhigh|max) · \/effort$/;
  const modelNotice =
    /^Model set to [a-z][a-z0-9 .-]{0,40} \(claude-[a-z0-9.-]+\) for this session only$/i;
  const plainText = lines[index]?.trim() || '';
  if (
    !badge.test(plainText) &&
    !modelNotice.test(plainText) &&
    plainText !== ''
  )
    return vt;
  const rendered = (rows[index] || '')
    .replace(/\x1b\[[\d;]*m/g, '')
    .replace(/\x1b\[(\d{1,3})C/g, (_, width: string) =>
      ' '.repeat(Number(width)),
    )
    .trim();
  if (plainText !== rendered) return vt;
  // The same startup timer removes the optional agent-navigation hint.
  const hintRow = row + 2;
  const hint = (lines[hintRow] || '').trim();
  const permission =
    /^([⏵⏸◯○●]+\s+(?:manual mode|auto mode|plan mode|accept edits|bypass permissions|default mode)(?: on)?(?: \(shift\+tab to cycle\))?(?: · \? for shortcuts)?)(?: · ← for agents)?$/i.exec(
      hint,
    );
  if (permission) {
    const painted = (rows[hintRow] || '')
      .replace(/\x1b\[[\d;]*m/g, '')
      .replace(/\x1b\[(\d{1,3})C/g, (_, width: string) =>
        ' '.repeat(Number(width)),
      )
      .trimEnd();
    const visible = painted.replace(/\x1b\[\d+;\d+H$/, '').trim();
    if (visible === hint)
      rows[hintRow] =
        permission[1] + (hintRow === rows.length - 1 ? cursor[0] : '');
  }
  rows[index] = '<effort-badge>';
  return rows.join('\n');
}

export function effortFrameIdentity(
  vt: string,
  text: string,
  initialLevel?: string,
) {
  if (!text.trimEnd().endsWith(footer)) return vt;
  const rows = vt.split('\n');
  // The startup badge expires even while a modal is open. Its absence paints
  // an equal-width divider. Only fold the level observed on this press.
  const heading = rows.findLastIndex((row) => row.includes('Effort'));
  if (initialLevel && heading > 0) {
    const index = rows
      .slice(0, heading)
      .findLastIndex((row) => row.includes('▔'));
    const badge =
      /^(\x1b\[0m)(\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}m)(▔+)\x1b\[1C\x1b\[0m\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}m([○◯◐◑◒◓◔◕◉●◎] (low|medium|high|xhigh|max) · \/effort)\x1b\[0m\2 ▔(\x1b\[0m\r?)$/;
    const match = badge.exec(rows[index] || '');
    if (match && match[5] === initialLevel)
      rows[index] =
        match[1] +
        match[2] +
        match[3] +
        '▔'.repeat(match[4].length + 3) +
        match[6];
  }
  const index = rows.findLastIndex(
    (row) =>
      row.includes('low') &&
      row.includes('high') &&
      (row.includes('Tab to toggle') || row.includes('\x1b[1m')),
  );
  if (index < 0) return rows.join('\n');
  // Only this label on the verified catalog row may change its RGB runs.
  if (highlightedEffort({ text }) === 'xhigh') {
    const plain = rows[index]
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\x1b\[\d+C/g, ' ')
      .trim();
    if (
      /^low(?:\s+(?:medium|high|xhigh|max))+(?:\s+Tab to toggle)?$/.test(plain)
    )
      rows[index] = rows[index].replace(
        shimmer,
        '\x1b[0m\x1b[1m\x1b[38;2;0;0;0mxhigh',
      );
  }
  const animatedMax =
    /\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}mm\x1b\[0m\x1b\[1m\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}ma\x1b\[0m\x1b\[1m\x1b\[38;2;\d{1,3};\d{1,3};\d{1,3}mx/;
  rows[index] = rows[index].replace(animatedMax, (value) =>
    value.replace(/38;2;\d+;\d+;\d+/g, '38;2;0;0;0'),
  );
  return rows.join('\n');
}
