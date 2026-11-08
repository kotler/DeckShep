// @ts-check
/** @typedef {import("./types").AgentSnapshot} AgentSnapshot */

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

/** @param {AgentSnapshot | null | undefined} agent @param {ReadonlySet<string>} [capabilities] */
function homeRow(agent, capabilities) {
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
      return (capabilities ? !capabilities.has('composerCursor') : /** @type {any} */ (agent).composerSupported === false)
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
 * @param {AgentSnapshot | null | undefined} agent
 * @param {ReadonlySet<string>} [capabilities] */
function layout(page, agent, capabilities) {
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
  if (page === 2 && (capabilities ? !capabilities.has('composerCursor') : agent?.composerSupported === false))
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
    ...homeRow(agent, capabilities),
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
module.exports = { isBackground, modeOf, homeRow, layout, needsContext, needsChat, localActions };
