// @ts-check
/** @typedef {import("../src/domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../src/domain/types").Config} Config */
/** @typedef {import("../src/domain/types").PressContext} PressContext */
'use strict';
/** @param {AgentSnapshot | null | undefined} agent */
function isBackground(agent) {
  return (
    agent?.app === 'codex' &&
    agent.state === 'working' &&
    agent.backgroundOnly === true &&
    typeof agent.statusAt === 'string' &&
    agent.activityStatusAt === agent.statusAt &&
    Array.isArray(agent.backgroundIds) &&
    agent.backgroundIds.length > 0 &&
    !!agent.backgroundTurnId
  );
}
/** @param {AgentSnapshot | null | undefined} agent */
function modeOf(agent) {
  if (
    !agent ||
    !['codex', 'claude-code'].includes(agent.app) ||
    /** @type {any} */ (
      agent.backend === 'herdr' &&
        /** @type {any} */ (agent).nativeVerified === false
    ) ||
    (agent.app === 'claude-code' &&
      (!(/** @type {any} */ (agent).nativeVerified) ||
        !(/** @type {any} */ (agent).claudeControlsEnabled)))
  )
    return 'unknown';
  if (isBackground(agent)) return 'background';
  if (['idle', 'done', 'error'].includes(/** @type {any} */ (agent).state))
    return 'ready';
  if (/** @type {any} */ (agent).state === 'working') return 'working';
  if (
    /** @type {any} */ (agent).state === 'blocked' &&
    /** @type {any} */ (agent).kind === 'question'
  )
    return 'question';
  if (
    /** @type {any} */ (agent).state === 'blocked' &&
    /** @type {any} */ (agent).kind === 'permission'
  )
    return 'approval';
  return 'unknown';
}
const actor =
  /** @param {import("../src/domain/types").TargetRef | null | undefined} a */
  (a) =>
    a &&
    [a.session, a.block, a.app, a.pid, a.name, a.terminalId || ''].join('|');
/** @param {AgentSnapshot | null | undefined} agent
 * @param {number} [page] */
function stamp(agent, page = 0) {
  return JSON.stringify([
    actor(agent),
    modeOf(agent),
    agent?.state === 'blocked' ? agent.statusAt : null,
    agent?.chatId || null,
    agent?.runId || null,
    agent?.nativeIdentity || null,
    agent?.claudeUiEpoch || 0,
    page,
    ...(isBackground(agent)
      ? [
          /** @type {any} */ (agent).backgroundTurnId,
          /** @type {any} */ (agent).backgroundIds,
        ]
      : []),
  ]);
}
/** @param {AgentSnapshot | null | undefined} agent */
function snapshot(agent) {
  if (!agent) return null;
  return Object.fromEntries(
    [
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
    ]
      .filter(
        (k) => /** @type {Record<string, any>} */ (agent)[k] !== undefined,
      )
      .map((k) => [
        k,
        Array.isArray(/** @type {Record<string, any>} */ (agent)[k])
          ? [.../** @type {Record<string, any>} */ (agent)[k]]
          : /** @type {Record<string, any>} */ (agent)[k],
      ]),
  );
}
/** @param {Partial<PressContext> | null | undefined} context
 * @param {AgentSnapshot | null | undefined} current */
function assertContext(context, current) {
  const target = context?.target;
  if (!target || actor(target) !== actor(current)) {
    const error = Error('Reselect agent on deck');
    /** @type {any} */ (error).code = 'SELECTION_CHANGED';
    throw error;
  }
  if (
    context.action !== 'zoom' &&
    target.app === 'claude-code' &&
    (!(/** @type {any} */ (current).nativeVerified) ||
      target.chatId !== /** @type {any} */ (current).chatId ||
      target.nativeIdentity !== /** @type {any} */ (current).nativeIdentity ||
      (target.runId && target.runId !== /** @type {any} */ (current).runId))
  ) {
    const error = Error('Claude session changed; reselect');
    /** @type {any} */ (error).code = 'SELECTION_CHANGED';
    throw error;
  }
  if (
    context.action !== 'zoom' &&
    target.app === 'claude-code' &&
    (!(/** @type {any} */ (current).claudeControlsEnabled) ||
      target.claudeUiEpoch !== /** @type {any} */ (current).claudeUiEpoch)
  )
    throw Error('Claude controls updating; press again');
  // Fresh Rex records do not contain daemon metadata. Background actions separately
  // revalidate the ended turn and the complete terminal-ID set before any mutation.
  const background =
    isBackground(target) &&
    /** @type {any} */ (current).state === 'working' &&
    target.statusAt === /** @type {any} */ (current).statusAt;
  if (!background && modeOf(target) !== modeOf(current))
    throw Error('Agent state changed; press again');
  if (
    target.state === 'blocked' &&
    (!target.statusAt ||
      target.statusAt !== /** @type {any} */ (current).statusAt ||
      target.kind !== /** @type {any} */ (current).kind)
  )
    throw Error('Waiting request changed; press again');
}
/** @param {AgentSnapshot | null | undefined} agent */
function homeRow(agent) {
  switch (modeOf(agent)) {
    case 'ready':
      return [
        'model',
        'effort',
        'zoom',
        /** @type {any} */ (agent).app === 'claude-code'
          ? 'claudeModeInfo'
          : 'plan',
        'interrupt',
      ];
    case 'working':
      return /** @type {any} */ (agent).composerSupported === false
        ? ['none', 'none', 'zoom', 'none', 'interrupt']
        : ['steer', 'queue', 'zoom', 'none', 'interrupt'];
    case 'background':
      return ['none', 'none', 'zoom', 'none', 'stopTerminals'];
    case 'question':
      return [
        'up',
        'down',
        'answer',
        'escape',
        /** @type {any} */ (agent).app === 'claude-code' &&
        /** @type {any} */ (agent).claudeMultiSelect
          ? 'claudeToggle'
          : 'interrupt',
      ];
    case 'approval':
      return [
        'approvalUp',
        'approvalDown',
        'approvalConfirm',
        'approvalEscape',
        'interrupt',
      ];
    default:
      return ['status', 'none', 'zoom', 'none', 'interrupt'];
  }
}
/** @param {number} page
 * @param {AgentSnapshot | null | undefined} agent */
function layout(page, agent) {
  const stop = isBackground(agent)
    ? 'stopTerminals'
    : agent?.app === 'claude-code' &&
        agent.kind === 'question' &&
        agent.claudeMultiSelect
      ? 'claudeToggle'
      : 'interrupt';
  if (page === 1)
    return [
      'questionPrev',
      'up',
      'questionNext',
      'answer',
      'more',
      'left',
      'down',
      'right',
      'escape',
      stop,
    ];
  if (page === 2 && agent?.composerSupported === false)
    return [
      'inputInfo',
      'none',
      'none',
      'none',
      'more',
      'none',
      'none',
      'zoom',
      'none',
      stop,
    ];
  if (page === 2)
    return [
      'review',
      'tests',
      'continue',
      'send',
      'more',
      'none',
      'none',
      'zoom',
      'none',
      stop,
    ];
  return [
    'collapse',
    'banknext',
    'next',
    agent?.app === 'claude-code' ? 'claudeInfo' : 'permissions',
    'more',
    ...homeRow(agent),
  ];
}
const localActions = new Set([
  'none',
  'status',
  'inputInfo',
  'claudeInfo',
  'claudeModeInfo',
  'more',
  'questions',
  'prompts',
  'back',
  'collapse',
  'banknext',
  'next',
]);
/** @param {string} action */
function needsContext(action) {
  return !localActions.has(action) && !action.startsWith('agent:');
}
/** @param {string} action
 * @param {AgentSnapshot | null | undefined} target */
function needsChat(action, target) {
  return target?.state !== 'blocked' && action !== 'zoom';
}
module.exports = {
  isBackground,
  modeOf,
  actor,
  stamp,
  snapshot,
  assertContext,
  homeRow,
  layout,
  needsContext,
  needsChat,
};
