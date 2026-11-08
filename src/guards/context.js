// @ts-check
/** @typedef {import("../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../domain/types").Config} Config */
/** @typedef {import("../domain/types").PressContext} PressContext */
'use strict';
const {isBackground,modeOf,homeRow,layout,needsContext,needsChat} = require('../domain/layout');


const actor =
  /** @param {import("../domain/types").TargetRef | null | undefined} a */
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
