import { sameNavigationTarget } from '../domain/navigation';
import type { KeyboardView as View } from '../domain/backend';
import type { AgentSnapshot } from '../domain/types';
import {
  cycleCodexSetting,
  hasInterruptHint,
  readCodexSettings,
} from '../agents/codex/keyboard-settings';
import {
  cycleClaudeKeyboard,
  readClaudeSettings,
} from '../agents/claude/keyboard-settings';
import { claudeFooter } from '../agents/claude/keyboard-mode';
import { setTimeout as pause } from 'node:timers/promises';
const { assertContext } = require('../guards/context');

export const rexSettingsAction = (action: string) =>
  ['model', 'effort', 'permissions', 'plan'].includes(action);
function processKey(
  fact: { codex: boolean; pid: number; startedAt: string; image: string },
  pid: number,
) {
  if (!fact.codex || fact.pid !== pid) throw Error('Check Codex process');
  return fact.startedAt + ':' + fact.image;
}
/** Display-only observation; never turn a pane PID into a Codex thread ID. */
export async function observeSettings(b: any, agent: AgentSnapshot) {
  const state: NonNullable<AgentSnapshot['rexSettings']> = {};
  try {
    if (agent.app === 'codex') {
      if (!b.config.controlVerified?.codex) return state;
      state.process = processKey(
        await b.inspectKeyboardProcess(agent.pid),
        agent.pid,
      );
      if (agent.state === 'working') return state;
    } else {
      if (agent.app !== 'claude-code' || !b.config.claude?.enabled)
        return state;
      // Legacy hook-bound settings can still display their verified footer.
      try {
        state.process = await b.inspectClaudeKeyboard(agent);
      } catch {}
    }
    const view = await b.readKeyboardView(agent);
    state.viewHash = view.hash;
    Object.assign(
      state,
      agent.app === 'codex'
        ? readCodexSettings(view)
        : state.process
          ? readClaudeSettings(view)
          : claudeFooter(view),
    );
  } catch {
    /* A hidden field or unfamiliar view is unknown. */
  }
  return state;
}

/** Pane-scoped keyboard settings and the foreground working turn's Escape. */
export async function performRexKeyboard(b: any, display: any) {
  const { target, action } = display;
  const claude = target?.app === 'claude-code';
  const interrupt =
    !claude &&
    action === 'interrupt' &&
    target?.state === 'working' &&
    !target.chatId &&
    !!target.statusAt;
  if (
    (!rexSettingsAction(action) && !interrupt) ||
    display.scope !== 'rex' ||
    (!claude && target?.app !== 'codex') ||
    (claude && b.claude?.picker) ||
    !target.rexSettings?.process ||
    b.draft ||
    b.picker
  )
    throw Error('Check focused pane');
  async function check(visible = false) {
    b.assertDeliveryVisible();
    if (
      b.config.backend !== 'rex' ||
      !b.config.allowClipboardFocus ||
      (claude ? !b.config.claude?.enabled : !b.config.controlVerified?.codex)
    )
      throw Error('Enable pane checks');
    // Reads address the captured pane and independently recheck its foreground
    // process. Only a write needs the Mac client's visible-pane proof; never
    // reuse it across keys or substitute server focus for that proof.
    const a = visible
      ? await b.focused(true, true)
      : await b.agent(
          {
            session: target.session,
            window: target.window,
            block: target.block,
          },
          true,
        );
    if (!a) throw Error('Agent pane changed');
    if (!claude) assertContext(display, a);
    if (
      a.app !== target.app ||
      !sameNavigationTarget(target, a) ||
      a.cwd !== target.cwd ||
      a.window !== target.window ||
      (interrupt
        ? a.state !== 'working' || a.statusAt !== target.statusAt
        : !['idle', 'done', 'error'].includes(a.state)) ||
      (claude
        ? await b.inspectClaudeKeyboard(a)
        : processKey(await b.inspectKeyboardProcess(a.pid), a.pid)) !==
        target.rexSettings.process
    )
      throw Error('Agent pane changed');
    return a;
  }
  const read = async (): Promise<View> => b.readKeyboardView(await check());
  if (interrupt) {
    const a = await check(true);
    // A running timer can repaint between the two frame reads. Retry only
    // the observation, and recheck the originally captured run each time.
    for (let attempt = 0; ; attempt++) {
      try {
        if (!hasInterruptHint(await read()))
          throw Error('No Esc hint in Codex');
        break;
      } catch (error) {
        if (attempt >= 2 || (error as Error).message !== 'Rex view changed')
          throw error;
      }
    }
    await check();
    await b.run(
      ['send-key', '-s', a.session, '-b', a.block, 'escape'],
      undefined,
      target,
    );
    return;
  }
  async function change(view: View, key: string, paste = false) {
    const a = await check();
    if (
      paste &&
      !(await b.method(a, 'modes')).modes?.some(
        (m: any) => m.number === 2004 && m.set,
      )
    )
      throw Error('Paste unavailable');
    const visible = await check(true);
    if ((await b.readKeyboardView(visible)).hash !== view.hash)
      throw Error('Agent view changed');
    await b.run(
      [
        paste ? 'send' : 'send-key',
        '-s',
        a.session,
        '-b',
        a.block,
        ...(paste ? [] : [key]),
      ],
      paste ? '\x1b[200~' + key + '\x1b[201~' : undefined,
      target,
    );
    // Poll for a repaint, never retry the write.
    for (let i = 0; i < 5; i++) {
      const next = await read();
      if (next.hash !== view.hash || (i === 4 && claude && key === 'right'))
        return next;
      if (i < 4) await pause(45);
    }
    throw Error('Check native UI');
  }
  const initial = await read();
  if (
    !target.rexSettings.viewHash ||
    initial.hash !== target.rexSettings.viewHash
  )
    throw Error('Agent view changed');
  if (claude) return cycleClaudeKeyboard(initial, change, action, target);
  return cycleCodexSetting(
    {
      read: async () => initial,
      key: change,
      paste: (view, cmd) => change(view, cmd, true),
    },
    action,
  );
}
