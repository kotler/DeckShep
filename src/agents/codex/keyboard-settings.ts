/** Recognize only the live bottom surface. A model name in history is not a setting. */
import type { KeyboardView as View } from '../../domain/backend';
export interface KeyboardPort {
  read(): Promise<View>;
  key(view: View, key: string): Promise<View>;
  paste(
    view: View,
    command: '/model' | '/permissions' | '/plan',
  ): Promise<View>;
}
type Kind = 'model' | 'effort' | 'permissions' | 'plan';
const levelsPattern =
  'minimal|low|medium|high|xhigh|extra high|max|ultra|persistent';
const levelPattern = '(' + levelsPattern + ')';
const normalize = (label: string) =>
  label.toLowerCase().replace('extra high', 'xhigh');
function inputError(keyLabel: string, message: string) {
  return Object.assign(Error(message), { keyLabel });
}
function prompt(view: View) {
  const lines = view.text.split('\n'),
    row = (view.cursor?.row ?? 0) - 1;
  const line = /^( {0,4})› (.*)$/.exec(lines[row] ?? '');
  if (!line || !view.cursor)
    throw inputError(
      'Check Codex',
      'DeckShep couldn’t locate the Codex prompt. Return to the prompt in Rex and try again.',
    );
  return {
    line: line[2].trimEnd(),
    column: view.cursor.column - line[1].length - 3,
    gap: !(lines[row + 1] || '').trim(),
    footer: lines.slice(row + 1).filter((x) => x.trim()),
  };
}
// The footer supplies a display label, not a model identifier. Read only the
// leading fields so an effort word in a project path or chat title cannot match.
const modelField = new RegExp(
  '^(.+?)\\s+(?:·\\s+)?(' +
    levelsPattern +
    '|default)' +
    '(?:\\s+fast)?(?=\\s*(?:·|$)|\\s{2,}(?:Plan|Default) mode\\b)',
  'iu',
);
function readModelField(line: string) {
  if (!/^ {2,}\S/.test(line)) return;
  const match = modelField.exec(line.trim());
  if (!match || match[1].includes('·')) return;
  return {
    model: match[1],
    effort:
      match[2].toLowerCase() === 'default' ? undefined : normalize(match[2]),
  };
}
function footerSettings(view: View) {
  const { footer } = prompt(view);
  if (footer.length > 3)
    throw inputError(
      'Check Codex',
      'DeckShep couldn’t recognize the lines beneath the Codex prompt.',
    );
  const text = footer.join(' ').trim();
  const setting = readModelField(footer[0] || '');
  const mode = /\b(Plan|Default) mode\s*\((?:⇧tab|shift\+tab) to cycle\)/i.exec(
    text,
  );
  return { model: setting?.model, effort: setting?.effort, plan: mode?.[1] };
}
// A blank first line is not an empty composer if a wrapped or multiline
// draft follows it. Only accept a separated, recognizable native footer.
function singleLine(p: ReturnType<typeof prompt>) {
  // Codex can render the model line and its keyboard hint on separate rows.
  // Recognize the second row in full so unrelated text still blocks input.
  if (p.footer.length === 2)
    return p.gap && !!readModelField(p.footer[0]) && nativeHintRow(p.footer[1]);
  return (
    p.gap &&
    (p.footer.length === 0 ||
      (p.footer.length === 1 &&
        (!!readModelField(p.footer[0]) ||
          /^\s*(?:(?:100|[1-9]?\d)% context left\s*$|\? for shortcuts\b|(?:Default|Plan) mode \()/i.test(
            p.footer[0],
          ))))
  );
}
function nativeHintRow(line: string) {
  // The warning stays right-aligned when typing hides the idle shortcuts.
  const hint = line
    .trim()
    .replace(/(?:^|\s+)⚠\s+\d+ warnings? · f2 to view$/i, '');
  return hint === '' || /^(?:← for agents · )?\? for shortcuts$/i.test(hint);
}
function idle(view: View) {
  const p = prompt(view);
  // With the cursor at column zero a draft could still extend to its right.
  if (p.column > 0 && p.line && p.line !== 'Ask Codex to do anything')
    throw inputError(
      'Draft in Codex',
      'Finish or save the draft in Rex, then press the setting again.',
    );
  if (p.column !== 0 || !['', 'Ask Codex to do anything'].includes(p.line))
    throw inputError(
      'Check input box',
      'DeckShep couldn’t confirm the Codex input box was empty.',
    );
  if (!singleLine(p))
    throw inputError(
      'Check Codex',
      'DeckShep couldn’t recognize the lines beneath the Codex prompt.',
    );
  return footerSettings(view);
}
/** Esc belongs to the foreground turn only at the live, unobstructed prompt. */
export function hasInterruptHint(view: View) {
  const row = (view.cursor?.row ?? 0) - 1;
  const lines = view.text.split('\n');
  if (
    !view.cursor ||
    view.cursor.column !== 3 ||
    !/^› (?:Ask Codex to do anything)?\s*$/.test(lines[row] ?? '')
  )
    return false;
  const below = prompt(view);
  const queueHint =
    /^\s*(?:← for agents · )?tab to queue message(?:\s+(?:100|[1-9]?\d)% context left)?(?:\s+⚠ \d+ warnings? · f2 to view)?\s*$/i;
  if (
    !singleLine(below) &&
    !(
      below.gap &&
      queueHint.test(below.footer.at(-1) || '') &&
      (below.footer.length === 1 ||
        (below.footer.length === 2 && readModelField(below.footer[0])))
    )
  )
    return false;
  // History, command suggestions, and “Back to bottom · esc” can all sit
  // above the prompt. Only the adjacent native activity header owns Escape.
  let i = row - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  if (/^\s*└ Tip: /.test(lines[i] ?? '')) i--;
  return /^\s*(?:• [^\n]+|Working) \((?:\d+h )?(?:\d+m )?\d+s • esc to interrupt\)(?: · .+)?\s*$/i.test(
    lines[i] ?? '',
  );
}
type Row = {
  number: number;
  name: string;
  selected: boolean;
  current: boolean;
};
function menu(view: View) {
  const lines = view.text
    .trimEnd()
    .split('\n')
    .map((x) => x.trimEnd());
  const footer = lines.at(-1)?.trim();
  if (
    footer !== 'enter select · esc back' &&
    footer !== 'enter default · s session · esc back'
  )
    throw Error('Check native UI');
  const start = lines.findLastIndex((x) =>
    /^\s*(Select Model(?: and Effort)?|Select Reasoning Level for .+|Update Model Permissions)\s*$/.test(
      x,
    ),
  );
  if (start < 0) throw Error('Check native UI');
  const body = lines.slice(start + 1, -1),
    rows: Row[] = [];
  for (const line of body) {
    const m = /^\s*(›)?\s*(\d+)\.\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const label = m[3].split(/\s{2,}/)[0];
    rows.push({
      number: Number(m[2]),
      name: label.replace(/\s+\((current|default)\)/g, ''),
      selected: !!m[1],
      current: label.includes('(current)'),
    });
  }
  const selected = rows.filter((r) => r.selected);
  if (
    selected.length !== 1 ||
    rows.length > 50 ||
    rows.some(
      (r, i) => r.number < 1 || (i > 0 && r.number !== rows[i - 1].number + 1),
    )
  )
    throw Error('Picker changed');
  return {
    title: lines[start].trim(),
    footer,
    rows,
    selected: selected[0],
    moreBelow: body.some((x) => /^\s*↓\s*$/.test(x)),
    view,
  };
}
type Menu = ReturnType<typeof menu>;
function current(m: Menu) {
  const rows = m.rows.filter((r) => r.current);
  if (rows.length !== 1) throw Error('Current setting unclear');
  return rows[0];
}
async function move(port: KeyboardPort, m: Menu, target: Row) {
  const catalog = m.rows.map((r) => [r.number, r.name, r.current]);
  while (m.selected.number !== target.number) {
    const delta = Math.sign(target.number - m.selected.number);
    const next = menu(await port.key(m.view, delta > 0 ? 'down' : 'up'));
    if (
      next.title !== m.title ||
      next.selected.number !== m.selected.number + delta ||
      next.rows.some((r) =>
        catalog.some(
          ([n, name, cur]) =>
            n === r.number && (name !== r.name || cur !== r.current),
        ),
      )
    )
      throw Error('Picker changed');
    m = next;
  }
  if (m.selected.name !== target.name) throw Error('Picker changed');
  return m;
}
function nextRow(m: Menu, rows: Row[]) {
  const cur = current(m),
    i = rows.findIndex((r) => r.number === cur.number);
  if (i < 0 || rows.length < 2) throw Error('No next setting');
  if (i === rows.length - 1 && (m.moreBelow || m.rows[0].number !== 1))
    throw Error('List incomplete');
  return rows[(i + 1) % rows.length];
}
function nextPermission(m: Menu) {
  const from = current(m);
  const choices = m.rows.filter(
    (r) => r.number !== from.number && r.name.toLowerCase() !== 'full access',
  );
  const next = choices.find((r) => r.number > from.number);
  if (next) return next;
  if (m.moreBelow || m.rows[0].number !== 1) throw Error('List incomplete');
  if (!choices.length) throw Error('No next setting');
  return choices[0];
}
function fullAccessConfirmation(view: View) {
  const lines = view.text
    .trimEnd()
    .split('\n')
    .map((s) => s.trim());
  return (
    !view.cursor &&
    lines.at(-1) === 'enter select · esc back' &&
    lines.includes('Enable full access?') &&
    lines.some((s) =>
      /^(?:›\s*)?2\. Cancel\s+Go back without enabling full access$/.test(s),
    )
  );
}
export function readCodexSettings(view: View) {
  try {
    const m = menu(view),
      name = current(m).name;
    if (m.title === 'Update Model Permissions') return { permissions: name };
    if (m.title === 'Select Model and Effort') return { model: name };
    if (m.title.startsWith('Select Reasoning Level for '))
      return { effort: normalize(name) };
  } catch {
    /* An idle composer has no picker. */
  }
  return footerSettings(view);
}
async function command(
  port: KeyboardPort,
  initial: View,
  name: '/model' | '/permissions' | '/plan',
) {
  const typed = await port.paste(initial, name);
  const p = prompt(typed);
  if (!singleLine(p) || p.line !== name || p.column !== name.length)
    throw Error('Command changed');
  return port.key(typed, 'enter');
}
async function nextModel(port: KeyboardPort, m: Menu) {
  const original = current(m);
  m = await move(port, m, original);
  const after = menu(await port.key(m.view, 'down'));
  const next = after.selected;
  if (
    after.title !== m.title ||
    (next.number !== original.number + 1 &&
      !(next.number === 1 && !m.moreBelow)) ||
    next.name === original.name ||
    after.rows.some((r) =>
      m.rows.some(
        (old) =>
          r.number === old.number &&
          (r.name !== old.name || r.current !== old.current),
      ),
    )
  )
    throw Error('Model list changed');
  return after;
}
export async function cycleCodexSetting(port: KeyboardPort, kind: Kind) {
  let initial = await port.read();
  if (kind === 'permissions' && fullAccessConfirmation(initial))
    initial = await port.key(initial, 'escape');
  let openPicker: Menu | undefined;
  if (!initial.cursor && kind !== 'plan') {
    const candidate = menu(initial);
    if (
      candidate.title !==
        (kind === 'permissions'
          ? 'Update Model Permissions'
          : 'Select Model and Effort') ||
      candidate.footer !== 'enter select · esc back' ||
      (kind !== 'permissions' &&
        candidate.selected.number !== current(candidate).number)
    )
      throw inputError(
        'Check selection',
        'Return to the current model in the Rex picker, or close the picker and press the setting again.',
      );
    openPicker = candidate;
  }
  const settings: Partial<ReturnType<typeof footerSettings>> = openPicker
    ? {}
    : idle(initial);
  if (kind === 'plan') {
    const after =
      settings.plan?.toLowerCase() === 'plan'
        ? await port.key(initial, 'shift+tab')
        : await command(port, initial, '/plan');
    const result = idle(after);
    if (
      result.plan === settings.plan ||
      (!result.plan && settings.plan?.toLowerCase() !== 'plan')
    )
      throw Error('Check mode in Rex');
    return { label: result.plan || 'Mode changed' };
  }
  let m =
    openPicker ??
    menu(
      await command(
        port,
        initial,
        kind === 'permissions' ? '/permissions' : '/model',
      ),
    );
  if (kind === 'permissions') {
    if (
      m.title !== 'Update Model Permissions' ||
      m.footer !== 'enter select · esc back'
    )
      throw Error('Check permissions');
    m = await move(port, m, nextPermission(m));
    if (m.selected.name.toLowerCase() === 'full access')
      throw Error('Check permissions');
    idle(await port.key(m.view, 'enter'));
    return { label: m.selected.name };
  }
  if (m.title === 'Select Model') {
    const all = m.rows.find((r) => r.name === 'All models');
    if (!all) throw Error('Check models');
    m = await move(port, m, all);
    if (m.footer !== 'enter select · esc back') throw Error('Check models');
    m = menu(await port.key(m.view, 'enter'));
  }
  if (m.title !== 'Select Model and Effort') throw Error('Check models');
  m = await move(port, m, current(m));
  // The footer is optional. Read current effort from the current model's
  // picker before navigating away; Escape returns without applying it.
  if (
    kind === 'model' &&
    !settings.effort &&
    m.footer === 'enter select · esc back'
  ) {
    const original = m.selected.name;
    const effortMenu = menu(await port.key(m.view, 'enter'));
    if (
      normalize(effortMenu.title) !==
      normalize('Select Reasoning Level for ' + original)
    )
      throw Error('Check reasoning');
    settings.effort = normalize(current(effortMenu).name);
    m = menu(await port.key(effortMenu.view, 'escape'));
    if (m.title !== 'Select Model and Effort' || current(m).name !== original)
      throw Error('Model list changed');
  }
  if (kind === 'model') m = await nextModel(port, m);
  const model = m.selected;
  if (m.footer !== 'enter select · esc back') {
    // A one-level model has no picker for preserving a different effort.
    if (kind !== 'model' || settings.effort)
      throw Error('Effort not supported');
    idle(await port.key(m.view, 's'));
    return { label: model.name };
  }
  m = menu(await port.key(m.view, 'enter'));
  if (
    !m.title.toLowerCase().startsWith('select reasoning level for ') ||
    normalize(m.title.slice('Select Reasoning Level for '.length)) !==
      normalize(model.name) ||
    m.footer !== 'enter default · s session · esc back'
  )
    throw Error('Check reasoning');
  const levels = m.rows.filter((r) =>
    new RegExp('^' + levelPattern + '$', 'i').test(r.name),
  );
  const effort =
    kind === 'effort'
      ? nextRow(m, levels)
      : levels.find((r) => normalize(r.name) === settings.effort);
  if (!effort) throw Error('Check current effort');
  m = await move(port, m, effort);
  if (m.footer !== 'enter default · s session · esc back')
    throw Error('Session key unavailable');
  const after = idle(await port.key(m.view, 's'));
  if (after.effort && after.effort !== normalize(effort.name))
    throw Error('Check effort in Rex');
  return { label: kind === 'model' ? model.name : effort.name };
}
