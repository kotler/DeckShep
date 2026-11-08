// @ts-check
/** @typedef {import("../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../domain/types").Config} Config */
/** @typedef {import("../domain/types").PressContext} PressContext */
'use strict';
let /** @type {any} */ socket,
  /** @type {any} */ registration,
  /** @type {any} */ actionContext,
  keySettings = {},
  /** @type {any} */ shared = null,
  lastStatus;
/** @returns {HTMLElement & {value: string, checked: boolean, disabled: boolean, add: HTMLSelectElement["add"]}} */
const byId =
  /** @param {any} id */
  (id) => /** @type {any} */ (document.getElementById(id));
const connectionFields = ['herdrSocketPath'];
const booleans = [
    'allowClipboardFocus',
    'bringToFront',
    'animationEnabled',
    'herdrTitleIdentity',
    'claudeEnabled',
  ],
  promptNames = ['review', 'tests', 'continue'];
for (const action of [
  'collapse',
  'banknext',
  'next',
  'more',
  'model',
  'effort',
  'plan',
  'permissions',
  'interrupt',
  'stopTerminals',
  'zoom',
  'steer',
  'queue',
  'review',
  'tests',
  'continue',
  'send',
  'questionPrev',
  'up',
  'questionNext',
  'answer',
  'left',
  'down',
  'right',
  'escape',
  'approvalUp',
  'approvalDown',
  'approvalConfirm',
  'approvalEscape',
  'agent:0',
  'agent:1',
  'agent:2',
  'agent:3',
  'agent:4',
  'none',
])
  byId('action').add(
    new Option(
      {
        effort: 'Effort (cycle supported levels)',
        permissions: 'Reviewer (Ask me / Approve for me)',
        more: 'Page selector',
        interrupt: 'Interrupt',
        stopTerminals: 'Stop background terminals',
        plan: 'Plan / Default',
        banknext: 'Agent bank',
        next: 'Next agent',
        approvalConfirm: 'Confirm shown approval choice',
      }[action] || action,
      action,
    ),
  );
/** @param {any} event
 * @param {any} payload
 * @param {any} [context] */
function send(event, payload, context = registration) {
  if (socket?.readyState === 1)
    socket.send(
      JSON.stringify({
        event,
        context,
        payload,
        ...(event === 'sendToPlugin' || event === 'setSettings'
          ? { action: 'com.local.rexagents.key' }
          : {}),
      }),
    );
}
function query() {
  send('sendToPlugin', { kind: 'status' }, actionContext);
}
/** @param {any} status */
function fill(status) {
  lastStatus = status;
  shared = status.preferences;
  const herdr = status.backend === 'herdr';
  byId('backend').value = status.backend || 'rex';
  byId('backend').disabled = true;
  byId('profileName').textContent =
    status.profileName || (herdr ? 'Herdr Agents' : 'Rex Agents');
  byId('herdrConnection').hidden = !herdr;
  byId('herdrHelp').hidden = !herdr;
  byId('rexSetup').hidden = herdr;
  for (const name of connectionFields) {
    byId(name).disabled = status.setupBusy;
    if (document.activeElement !== byId(name))
      byId(name).value = shared[name] || '';
  }
  byId('connection').textContent = status.offline
    ? herdr
      ? 'Herdr unavailable — choose its running session socket'
      : 'Rex unavailable — open Rex and enable Remote Control'
    : `${status.agents} agent${status.agents === 1 ? '' : 's'} · ${status.metadata}/${status.codex} Codex${status.claude ? ' · ' + status.claudeIdentified + '/' + status.claude + ' Claude' : ''} chats identified`;
  byId('selection').textContent = status.selectionNotice
    ? 'Selection changed. Select an agent on the deck.'
    : status.selected
      ? `Selected: ${status.selected.app} · ${status.selected.state}${status.selected.mode ? ' · ' + status.selected.mode : ''}`
      : 'Select an agent on the deck to enable controls.';
  byId('message').textContent =
    status.message || status.selected?.identityMessage || '';
  for (const key of booleans) {
    byId(key).disabled = status.setupBusy;
    if (document.activeElement !== byId(key)) byId(key).checked = !!shared[key];
  }
  for (const name of promptNames) {
    byId(name).disabled = status.setupBusy;
    if (document.activeElement !== byId(name))
      byId(name).value = shared.prompts[name];
  }
  byId('herdrTitleIdentity').disabled = !herdr || status.setupBusy;
  byId('allowClipboardFocus').disabled = herdr || status.setupBusy;
  byId('bringToFront').disabled = herdr || status.setupBusy;
  byId('setup').disabled =
    herdr ||
    status.offline ||
    status.setupBusy ||
    !shared.allowClipboardFocus ||
    status.selected?.app !== 'codex' ||
    !['idle', 'done'].includes(status.selected?.state);
}
/** @param {string} key */
function save(key) {
  if (!shared) return;
  const value = promptNames.includes(key)
    ? { prompts: { [key]: byId(key).value } }
    : { [key]: booleans.includes(key) ? byId(key).checked : byId(key).value };
  try {
    const patch = RexPreferences.normalize(value);
    send(
      'sendToPlugin',
      { kind: 'preferences', preferences: patch },
      actionContext,
    );
    byId('message').textContent = 'Saving preferences…';
  } catch (error) {
    byId('message').textContent = /** @type {Error & {code?: string}} */ (
      error
    ).message;
  }
}
for (const key of [...booleans, ...promptNames, ...connectionFields])
  byId(key).addEventListener('change', () => save(key));
byId('refresh').addEventListener('click', query);
byId('setup').addEventListener('click', () => {
  byId('setup').disabled = true;
  send('sendToPlugin', { kind: 'setupFooter' }, actionContext);
});
byId('action').addEventListener('change', () =>
  send(
    'setSettings',
    { ...keySettings, action: byId('action').value },
    actionContext,
  ),
);
/** @type {any} */ (window).connectElgatoStreamDeckSocket =
  /** @param {any} port
   * @param {any} uuid
   * @param {any} event
   * @param {any} info
   * @param {any} actionInfo */
  (port, uuid, event, info, actionInfo) => {
    registration = uuid;
    const initial = JSON.parse(actionInfo);
    actionContext = uuid;
    keySettings = initial.payload.settings || {};
    byId('action').value = /** @type {any} */ (keySettings).action || '';
    socket = new WebSocket('ws://127.0.0.1:' + port);
    socket.onopen = () => {
      socket.send(JSON.stringify({ event, uuid }));
      query();
    };
    socket.onmessage =
      /** @param {any} raw */
      (raw) => {
        try {
          const message = JSON.parse(raw.data);
          if (
            message.event === 'sendToPropertyInspector' &&
            message.payload?.kind === 'status'
          )
            fill(message.payload);
          if (message.event === 'didReceiveGlobalSettings') query();
        } catch {
          byId('message').textContent = 'Could not read plugin status';
        }
      };
    socket.onclose = () => {
      byId('connection').textContent = 'Plugin disconnected';
      byId('setup').disabled = true;
      for (const key of [...booleans, ...promptNames, ...connectionFields])
        byId(key).disabled = true;
    };
  };
setInterval(query, 3000);
