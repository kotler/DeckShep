import { sameNavigationTarget } from '../domain/navigation';
import type { KeyboardView as View } from '../domain/backend';
import type { AgentSnapshot } from '../domain/types';
import {
  cycleCodexSetting,
  hasInterruptHint,
  streamingSurface,
  outputAdvanced,
  readCodexSettings,
} from '../agents/codex/keyboard-settings';
import {
  cycleClaudeKeyboard,
  readClaudeSettings,
  requireClaudeReady,
} from '../agents/claude/keyboard-settings';
import {
  idleEffortIdentity,
  effortFrameIdentity,
  highlightedEffort,
} from '../agents/claude/effort-slider';
import { hasClaudeInterruptCue } from '../agents/claude/interrupt-cue';
import { claudeFooter, nativeEffort } from '../agents/claude/keyboard-mode';
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
  // Which step was running when the read stopped; shown on the key as the
  // reason. It never grants or refuses input.
  let step: 'process' | 'view' | 'prompt' | 'parse' = 'process';
  try {
    if (agent.app === 'codex') {
      if (!b.config.controlVerified?.codex) {
        state.why = 'codex-unverified';
        return state;
      }
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
      } catch (error) {
        state.why =
          (error as Error)?.message === 'Custom Claude keys'
            ? 'custom-keys'
            : 'cli-unverified';
      }
      if (agent.state === 'working') return state;
    }
    step = 'view';
    const view = await b.readKeyboardView(
      agent,
      agent.app === 'claude-code' ? effortFrameIdentity : undefined,
      false,
      agent.app === 'claude-code' ? idleEffortIdentity : undefined,
    );
    if (agent.app === 'claude-code') {
      const level = highlightedEffort(view);
      if (level) {
        const process = await b.inspectClaudeKeyboard(
          agent,
          undefined,
          undefined,
          'effort-slider',
        );
        return {
          process,
          viewHash: view.hash,
          effort: level,
          effortSlider: true,
        };
      }
    }
    if (
      agent.app === 'claude-code' &&
      agent.state === 'unknown' &&
      state.process
    ) {
      step = 'prompt';
      requireClaudeReady(view, agent);
      state.idleComposer = true;
    }
    step = 'parse';
    state.viewHash = view.hash;
    if (view.idleEffortHash) state.idleEffortHash = view.idleEffortHash;
    Object.assign(
      state,
      agent.app === 'codex'
        ? readCodexSettings(view)
        : state.process
          ? readClaudeSettings(view)
          : claudeFooter(view),
    );
    if (agent.app === 'codex' && !state.permissions && view.cursor)
      state.permissionsHidden = true;
  } catch {
    /* A hidden field or unfamiliar view is unknown. */
    if (step === 'view') state.why ??= 'view-unreadable';
    if (step === 'prompt') state.why ??= 'not-at-prompt';
  }
  return state;
}

/** Pane-scoped keyboard settings and the foreground working turn's Escape. */
export async function performRexKeyboard(b: any, display: any) {
  const { target, action } = display;
  const claude = target?.app === 'claude-code';
  const interrupt =
    action === 'interrupt' &&
    target?.state === 'working' &&
    !target.chatId &&
    !!target.statusAt;
  if (
    (!rexSettingsAction(action) && !interrupt) ||
    display.scope !== 'rex' ||
    (!claude && target?.app !== 'codex') ||
    (claude && b.claude?.picker) ||
    b.draft ||
    b.picker
  )
    throw Error('Check focused pane');
  // Revoking consent also clears the passive process observation.
  if (!b.config.allowClipboardFocus)
    throw Error('Enable visible-pane checks first');
  if (!target.rexSettings?.process) throw Error('Check focused pane');
  async function check(visible = false, slider = false) {
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
        ? a.state !== 'working' ||
          !a.statusAt ||
          (!claude && a.statusAt !== target.statusAt)
        : !['idle', 'done', 'error'].includes(a.state) &&
          !(
            claude &&
            a.state === 'unknown' &&
            (target.rexSettings.idleComposer ||
              (slider &&
                action === 'effort' &&
                target.rexSettings.effortSlider))
          )) ||
      (claude
        ? await b.inspectClaudeKeyboard(
            a,
            undefined,
            undefined,
            slider ? 'effort-slider' : undefined,
          )
        : processKey(await b.inspectKeyboardProcess(a.pid), a.pid)) !==
        target.rexSettings.process
    )
      throw Error('Agent pane changed');
    return a;
  }
  let initialLevel: string | undefined;
  const frameIdentity =
    claude && action === 'effort'
      ? (vt: string, text: string) =>
          effortFrameIdentity(vt, text, initialLevel)
      : undefined;
  async function read(slider = false, visible = false): Promise<View> {
    for (let attempt = 0; ; attempt++) {
      const pane = await check(visible, slider);
      try {
        return await b.readKeyboardView(
          pane,
          frameIdentity,
          !claude && interrupt,
          claude && action === 'effort' ? idleEffortIdentity : undefined,
        );
      } catch (error) {
        // Claude may still be painting the slider. Retry a torn observation
        // only; a complete frame with a different digest still rejects input.
        if (
          !(claude && frameIdentity) ||
          attempt >= 3 ||
          (error as Error).message !== 'Rex view changed'
        )
          throw error;
        await pause(50);
      }
    }
  }
  if (interrupt) {
    const a = await check(true);
    if (claude) {
      const key = 'rex-interrupt:' + target.rexSettings.process;
      if (b.claude.submissions.has(key))
        throw Error('Interrupt already requested');
      // Bracket both composer reads with the same working pane and busy CLI
      // registration. Streaming can hide the spinner while the mode stays visible.
      if (
        !hasClaudeInterruptCue(
          await b.readKeyboardText(a),
          'verified-busy-registration',
        ) ||
        !hasClaudeInterruptCue(
          await b.readKeyboardText(await check()),
          'verified-busy-registration',
        )
      )
        throw Error('Check Claude activity');
      await check(true);
      b.claude.submissions.set(key, Date.now());
    } else {
      // A running timer can repaint between frames. Retry only the observation.
      for (let attempt = 0; ; attempt++) {
        try {
          let view = await read();
          // A visible shortcut can disappear between paint and press. Confirm
          // the current surface in a second self-contained snapshot.
          if (hasInterruptHint(view)) view = await read();
          if (!hasInterruptHint(view)) {
            const before = streamingSurface(view);
            if (!before) throw Error('No Esc hint in Codex');
            // The CLI flushes chunks in bursts. A stationary sample is
            // inconclusive; an altered composer, footer or turn is a refusal.
            for (let sample = 0; sample < 4; sample++) {
              await pause(150);
              const next = await read();
              if (hasInterruptHint(next)) break;
              const after = streamingSurface(next);
              if (!after || after.footer !== before.footer)
                throw Error('Check composer; Codex prompt or footer changed');
              if (outputAdvanced(before, after)) break;
              if (before.output !== after.output)
                throw Error('View redrawn; Codex reply overlap was lost');
              if (sample === 3)
                throw Error('Output paused; Codex reply stayed unchanged');
            }
          }
          break;
        } catch (error) {
          if (attempt >= 2 || (error as Error).message !== 'Rex view changed')
            throw error;
        }
      }
      await check(true);
    }
    await b.run(
      ['send-key', '-s', a.session, '-b', a.block, 'escape'],
      undefined,
      target,
    );
    return;
  }
  function sameIdleEffort(
    view: View,
    observedHash: string | undefined,
    expectedLevel: string | undefined,
  ) {
    if (
      !claude ||
      action !== 'effort' ||
      !observedHash ||
      !expectedLevel ||
      view.idleEffortHash !== observedHash
    )
      return false;
    requireClaudeReady(view, target);
    const level = nativeEffort(view);
    if (level) return level === expectedLevel.replace(/\?$/, '');
    // Only a disappearance is equivalent here. A new model notice belongs to
    // another settings operation and must invalidate the previously shown key.
    return !view.text.split('\n')[(view.cursor?.row ?? 0) - 3]?.trim();
  }
  async function change(
    view: View,
    key: string,
    paste = false,
    surface?: 'open-slider' | 'slider',
  ) {
    // Only the dedicated parser requests slider keys after verifying its marker
    // and session-only footer. Opening the command still requires idle proof.
    const inSlider = surface === 'slider';
    const a = await check(false, inSlider);
    if (
      paste &&
      !(await b.method(a, 'modes')).modes?.some(
        (m: any) => m.number === 2004 && m.set,
      )
    )
      throw Error('Paste unavailable');
    const current = await read(inSlider, true);
    if (
      current.hash !== view.hash &&
      !(
        paste &&
        key === '/effort' &&
        sameIdleEffort(
          current,
          view.idleEffortHash,
          nativeEffort(view) || target.rexSettings.effort,
        )
      )
    )
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
    const polls = surface === 'open-slider' ? 12 : 5;
    for (let i = 0; i < polls; i++) {
      const next = await read(surface !== undefined);
      // Enter can repaint the command before the modal has finished opening.
      // Wait only for a verified slider; never repeat Enter on that repaint.
      if (surface === 'open-slider' && !highlightedEffort(next)) {
        if (i + 1 === polls) throw Error('Check effort slider');
        await pause(60);
        continue;
      }
      if (next.hash !== view.hash || (i === 4 && claude && key === 'right'))
        return next;
      if (i < 4) await pause(45);
    }
    throw Error('Check native UI');
  }
  const initial = await read(
    claude && action === 'effort' && target.rexSettings.effortSlider === true,
  );
  if (
    !target.rexSettings.viewHash ||
    (initial.hash !== target.rexSettings.viewHash &&
      !sameIdleEffort(
        initial,
        target.rexSettings.idleEffortHash,
        target.rexSettings.effort,
      ))
  )
    throw Error('Agent view changed');
  if (frameIdentity) {
    try {
      initialLevel = nativeEffort(initial);
    } catch {
      /* The native model picker may already be open. */
    }
  }
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
