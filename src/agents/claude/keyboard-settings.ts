import type { KeyboardView as View } from '../../domain/backend';
import type { AgentSnapshot } from '../../domain/types';
import { claudeFooter } from './keyboard-mode';
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
    return claudeFooter(view);
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

function ready(view: View, target: AgentSnapshot) {
  composer(view.text, view.cursor, target, { allowEmpty: true });
  configurationView(view, { requireEmpty: true });
}

export async function cycleClaudeKeyboard(
  initial: View,
  key: (view: View, key: string) => Promise<View>,
  action: string,
  target: AgentSnapshot,
) {
  let view = initial;
  if (action === 'permissions' || action === 'plan') {
    ready(view, target);
    const after = await key(view, 'shift+tab');
    ready(after, target);
    return { label: claudeFooter(after).permissions || '' };
  }
  if (action !== 'model' && action !== 'effort') throw Error('Unknown setting');
  let menu;
  try {
    menu = picker(view, true);
  } catch {
    ready(view, target);
    view = await key(view, 'alt+p');
    menu = picker(view, true);
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
  ready(await key(view, 's'), target);
  return { label };
}
