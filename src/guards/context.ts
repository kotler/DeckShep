import type { AgentSnapshot, PressContext, TargetRef } from '../domain/types';
import {
  isBackground,
  modeOf,
  homeRow,
  layout,
  needsContext,
  needsChat,
} from '../domain/layout';

/** Error carrying the machine-readable reason a press was refused. */
type CodedError = Error & { code?: string };
export const actor: (
  a: TargetRef | null | undefined,
) => string | null | undefined = (a: TargetRef | null | undefined) =>
  a && [a.session, a.block, a.app, a.pid, a.name, a.terminalId || ''].join('|');
export function stamp(
  agent: AgentSnapshot | null | undefined,
  page: number | undefined = 0,
) {
  return JSON.stringify([
    actor(agent),
    modeOf(agent),
    agent?.state === 'blocked' ? agent.statusAt : null,
    agent?.chatId || null,
    agent?.runId || null,
    agent?.nativeIdentity || null,
    ...(agent?.codexBindingEpoch ? [agent.codexBindingEpoch] : []),
    ...(agent?.codexHookEpoch ? [agent.codexHookEpoch] : []),
    ...(agent?.rexSettings?.process ? [agent.rexSettings.process] : []),
    agent?.claudeUiEpoch || 0,
    page,
    ...(isBackground(agent)
      ? [agent?.backgroundTurnId, agent?.backgroundIds]
      : []),
  ]);
}
export function snapshot(agent: AgentSnapshot | null | undefined) {
  if (!agent) return null;
  const keys: (keyof AgentSnapshot)[] = [
    'session',
    'window',
    'block',
    'terminalId',
    'backend',
    'composerSupported',
    'pid',
    'name',
    'app',
    'cwd',
    'state',
    'kind',
    'statusAt',
    'chatId',
    'nativeVerified',
    'nativeIdentity',
    'codexHookEpoch',
    'codexBindingEpoch',
    'rexSettings',
    'runId',
    'backgroundOnly',
    'backgroundIds',
    'backgroundTurnId',
    'activityStatusAt',
    'claudeControlsEnabled',
    'claudeUiEpoch',
    'claudeTurnId',
    'claudeRequestId',
    'claudePicker',
    'claudeMultiSelect',
    'claudeCheckboxList',
    'claudeQuestionReview',
    'permissionMode',
    'vimMode',
    'atBottom',
  ];
  return Object.fromEntries(
    keys
      .filter((k: keyof AgentSnapshot) => agent[k] !== undefined)
      .map((k: keyof AgentSnapshot) => {
        const value = agent[k];
        return [
          k,
          Array.isArray(value)
            ? [...value]
            : k === 'rexSettings'
              ? { ...agent.rexSettings }
              : value,
        ];
      }),
  );
}
export function assertContext(
  context: Partial<PressContext> | null | undefined,
  current: AgentSnapshot | null | undefined,
) {
  const target: AgentSnapshot | null | undefined = context?.target;
  if (!target || actor(target) !== actor(current)) {
    const error: CodedError = Error('Reselect agent on deck');
    error.code = 'SELECTION_CHANGED';
    throw error;
  }
  if (
    context?.action !== 'zoom' &&
    target.app === 'claude-code' &&
    (!current?.nativeVerified ||
      target.chatId !== current?.chatId ||
      target.nativeIdentity !== current?.nativeIdentity ||
      (target.runId && target.runId !== current?.runId))
  ) {
    const error: CodedError = Error('Claude session changed; reselect');
    error.code = 'SELECTION_CHANGED';
    throw error;
  }
  if (
    context?.action !== 'zoom' &&
    target.app === 'claude-code' &&
    (!current?.claudeControlsEnabled ||
      target.claudeUiEpoch !== current?.claudeUiEpoch)
  )
    throw Error('Claude controls updating; press again');
  const background: boolean =
    isBackground(target) &&
    current?.state === 'working' &&
    target.statusAt === current?.statusAt;
  if (!background && modeOf(target) !== modeOf(current))
    throw Error('Agent state changed; press again');
  if (
    target.state === 'blocked' &&
    (!target.statusAt ||
      target.statusAt !== current?.statusAt ||
      target.kind !== current?.kind)
  )
    throw Error('Waiting request changed; press again');
}
export { isBackground, modeOf, homeRow, layout, needsContext, needsChat };
