import type { KeyboardView as View } from '../../domain/backend';
import type { AgentSnapshot } from '../../domain/types';
import { cycleEffortSlider, applyHighlightedEffort } from './effort-slider';
import { claudeFooter, nativeEffort } from './keyboard-mode';
const { picker, configurationView, levels } = require('./cycle');
const { composer } = require('./controls');

function currentRow(menu: ReturnType<typeof picker>) {
  const applied = menu.rows.filter((row: { label: string }) =>
    /[✔✓]/.test(row.label),
  );
  if (applied.length !== 1 || !applied[0].model || applied[0].more)
    throw Error('Check current model');
  return applied[0];
}
export function readClaudeSettings(view: View) {
  // A completed picker heading may remain in terminal history above the prompt.
  try {
    const settings = claudeFooter(view);
    return { ...settings, effortHidden: !settings.effort };
  } catch {
    /* Inspect the bottommost picker. */
  }
  const menu = picker(view, true),
    row = currentRow(menu);
  return {
    model: row.name,
    effort: row.number === menu.selected.number ? menu.effort : undefined,
  };
}

export function requireClaudeReady(view: View, target: AgentSnapshot) {
  composer(view.text, view.cursor, target, { allowEmpty: true });
  configurationView(view, { requireEmpty: true });
}

// The headless 80x24 viewport can end mid-catalog. This shape only
// authorizes cancelling a picker opened by this press, never applying a row.
function clippedModelPicker(before: View, after: View) {
  const heading = /^\s*(Select|Choose) model\s*$/;
  if (
    before.hash === after.hash ||
    before.text.split('\n').some((line) => heading.test(line))
  )
    return false;
  const lines = after.text.split('\n');
  const start = lines.findLastIndex((line) => heading.test(line));
  if (
    start < 0 ||
    !/^\s*Switch between Claude models\./.test(lines[start + 1] || '')
  )
    return false;
  const catalog = lines.slice(start + 2);
  const first = catalog.findIndex((line) =>
    /^\s*(?:[❯›>]\s*)?1\. Default \(recommended\)\s+/.test(line),
  );
  if (first < 0 || first > 4) return false;
  let number = 0;
  for (const line of catalog.slice(first)) {
    const row =
      /^\s*(?:[❯›>]\s*)?(\d+)\. (Default \(recommended\)|Sonnet|Fable|Opus|Haiku)\s+(Sonnet|Fable|Opus|Haiku) \d+\.\d+(?:\.\d+)?\s*·\s*\S/.exec(
        line,
      );
    if (row) {
      if (Number(row[1]) !== ++number || (number > 1 && row[2] !== row[3]))
        return false;
    } else if (!/^\s{6,}[\p{L}\p{N}][\p{L}\p{N} ,.‘’'-]*$/u.test(line))
      return false;
  }
  // A new dialog or a composer below the list invalidates this observation.
  return number >= 3 && /^\s*(?:[❯›>]\s*)?\d+\. /.test(lines.at(-1) || '');
}

export async function cycleClaudeKeyboard(
  initial: View,
  key: (
    view: View,
    key: string,
    paste?: boolean,
    surface?: 'open-slider' | 'slider',
  ) => Promise<View>,
  action: string,
  target: AgentSnapshot,
) {
  let view = initial;
  if (action === 'effort' && target.rexSettings?.effortSlider) {
    const { label, after } = await applyHighlightedEffort(initial, key);
    requireClaudeReady(after, target);
    return { label };
  }
  if (action === 'permissions' || action === 'plan') {
    requireClaudeReady(view, target);
    const after = await key(view, 'shift+tab');
    requireClaudeReady(after, target);
    return { label: claudeFooter(after).permissions || '' };
  }
  if (action !== 'model' && action !== 'effort') throw Error('Unknown setting');
  let menu;
  try {
    menu = picker(view, true);
  } catch {
    requireClaudeReady(view, target);
    const currentEffort = nativeEffort(view);
    if (action === 'effort' && (currentEffort || !claudeFooter(view).effort)) {
      const { label, after } = await cycleEffortSlider(
        view,
        currentEffort,
        key,
      );
      requireClaudeReady(after, target);
      return { label };
    }
    view = await key(view, 'alt+p');
    try {
      menu = picker(view, true);
    } catch (error) {
      if (!clippedModelPicker(initial, view)) throw error;
      requireClaudeReady(await key(view, 'escape'), target);
      throw Object.assign(
        Error(
          'Claude’s model list was clipped. Enlarge the Rex pane and press the key again.',
        ),
        { keyLabel: 'Enlarge pane' },
      );
    }
  }
  const current = currentRow(menu);
  if (menu.selected.number !== current.number) throw Error('Check highlight');
  const catalog = menu.catalog;
  async function move(direction: string, number: number) {
    view = await key(view, direction);
    menu = picker(view, true);
    if (
      menu.catalog !== catalog ||
      menu.selected.number !== number ||
      currentRow(menu).number !== current.number
    )
      throw Error('Picker changed');
  }
  const effort = menu.effort;
  if (action === 'model') {
    const options = menu.available;
    const index = options.findIndex(
      (row: { model: string }) => row.model === current.model,
    );
    if (index < 0 && !current.isDefault) throw Error('Check current model');
    if (
      options.length < (index < 0 ? 1 : 2) ||
      new Set(options.map((row: { model: string }) => row.model)).size !==
        options.length
    )
      throw Error('Check model list');
    const next = options[(index + 1) % options.length];
    while (menu.selected.number !== next.number) {
      const step = next.number > menu.selected.number ? 1 : -1;
      await move(step > 0 ? 'down' : 'up', menu.selected.number + step);
    }
    // Restore the original effort if this model offers that setting.
    for (
      let i = 0;
      effort && menu.effort && menu.effort !== effort && i < levels.length;
      i++
    )
      await move(
        levels.indexOf(menu.effort) < levels.indexOf(effort) ? 'right' : 'left',
        next.number,
      );
    if (effort && menu.effort && menu.effort !== effort)
      throw Error('Check effort');
  } else {
    if (!effort) throw Error('No effort slider');
    if (effort !== 'max') await move('right', current.number);
    if (menu.effort === effort) {
      for (let i = 0; menu.effort !== 'low' && i < levels.length; i++)
        await move('left', current.number);
      if (menu.effort !== 'low' || menu.effort === effort)
        throw Error('Check effort');
    }
    if (!levels.includes(menu.effort)) throw Error('Check effort');
  }
  const label = action === 'model' ? menu.selected.name : menu.effort;
  requireClaudeReady(await key(view, 's'), target);
  return { label };
}
