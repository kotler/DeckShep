const boundary = require('../schemas');
type AgentSnapshot = import('../domain/types').AgentSnapshot;
type Config = import('../domain/types').Config;
type PressContext = import('../domain/types').PressContext;
('use strict');
let filling = false;
let socket: any,
  registration: any,
  actionContext: any,
  keySettings: {} = {},
  shared: any = null,
  lastStatus: any;
const byId: (id: any) => HTMLElement & {
  value: string;
  checked: boolean;
  disabled: boolean;
  add: HTMLSelectElement['add'];
  options: HTMLSelectElement['options'];
} = (
  id: any,
): HTMLElement & {
  value: string;
  checked: boolean;
  disabled: boolean;
  add: HTMLSelectElement['add'];
  options: HTMLSelectElement['options'];
} => document.getElementById(id) as any;
const connectionFields: string[] = ['herdrSocketPath', 'herdrAppHome'];
const booleans: string[] = [
    'allowClipboardFocus',
    'bringToFront',
    'animationEnabled',
    'herdrTitleIdentity',
    'claudeEnabled',
    'herdrAppFocusRequestEnabled',
  ],
  promptNames: string[] = ['review', 'tests', 'continue'];
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
function send(event: any, payload: any, context: any = registration) {
  if (socket?.readyState === 1)
    socket.send(
      JSON.stringify({
        event,
        context,
        payload,
        ...(event === 'sendToPlugin' || event === 'setSettings'
          ? { action: 'com.kotl3r.deckshep.key' }
          : {}),
      }),
    );
}
function query() {
  send('sendToPlugin', { kind: 'status' }, actionContext);
}
function fill(status: any) {
  filling = true;
  lastStatus = status;
  shared = status.preferences;
  const herdr: boolean = status.backend === 'herdr',
    app = status.backend === 'herdr-app';
  byId('backend').value = status.backend || 'rex';
  byId('backend').disabled = true;
  byId('profileName').textContent =
    status.profileName || (herdr ? 'Herdr' : 'Rex');
  byId('herdrConnection').hidden = !herdr;
  byId('herdrHelp').hidden = !herdr;
  byId('rexSetup').hidden = herdr || app;
  byId('herdrAppSetup').hidden = !app;
  byId('providerSetup').hidden = app;
  byId('promptShortcuts').hidden = app;
  byId('herdrSessionChoices').hidden = !herdr;
  for (const name of connectionFields) {
    byId(name).disabled = status.setupBusy;
    if (document.activeElement !== byId(name))
      byId(name).value = shared[name] || '';
  }
  byId('connection').textContent = app
    ? status.offline
      ? 'Herdr App preview — no matched App build'
      : `${status.agents} pane(s) · App-reported status`
    : status.offline
      ? herdr
        ? 'Herdr unavailable — choose its running session socket'
        : 'Rex unavailable — open Rex and enable Remote Control'
      : `${status.agents} agent${status.agents === 1 ? '' : 's'} · ${status.metadata}/${status.codex} Codex${status.claude ? ' · ' + status.claudeIdentified + '/' + status.claude + ' Claude' : ''} chats identified`;
  byId('selection').textContent = app
    ? 'Focus requests do not verify keyboard focus. Input remains disabled.'
    : status.selectionNotice
      ? 'Selection changed. Select an agent on the deck.'
      : status.selected
        ? `Selected: ${status.selected.app} · ${status.selected.state}${status.selected.mode ? ' · ' + status.selected.mode : ''}`
        : 'Select an agent on the deck to enable controls.';
  byId('message').textContent =
    status.message || status.selected?.identityMessage || '';
  for (const key of booleans) {
    byId(key).disabled = status.setupBusy;
    if (document.activeElement !== byId(key))
      if (byId(key).tagName === 'SDPI-CHECKBOX')
        (byId(key) as any).value = !!shared[key];
      else byId(key).checked = !!shared[key];
  }
  for (const name of promptNames) {
    byId(name).disabled = status.setupBusy;
    if (document.activeElement !== byId(name))
      byId(name).value = shared.prompts[name];
  }
  byId('herdrTitleIdentity').disabled = !herdr || status.setupBusy;
  byId('allowClipboardFocus').disabled = herdr || app || status.setupBusy;
  byId('bringToFront').disabled = herdr || app || status.setupBusy;
  byId('claudeEnabled').disabled = app || status.setupBusy;
  byId('herdrAppHome').disabled = !app || status.setupBusy;
  byId('herdrAppFocusRequestEnabled').disabled = !app || status.setupBusy;
  for (const option of Array.from(byId('action').options))
    option.disabled =
      app &&
      ![
        'none',
        'collapse',
        'banknext',
        'next',
        'agent:0',
        'agent:1',
        'agent:2',
        'agent:3',
        'agent:4',
      ].includes(option.value);
  byId('setup').disabled =
    herdr ||
    app ||
    status.offline ||
    status.setupBusy ||
    !shared.allowClipboardFocus ||
    status.selected?.app !== 'codex' ||
    !['idle', 'done'].includes(status.selected?.state);
  filling = false;
}
function save(key: string) {
  if (!shared || filling) return;
  const value: Record<string, any> = promptNames.includes(key)
    ? { prompts: { [key]: byId(key).value } }
    : {
        [key]: booleans.includes(key)
          ? byId(key).tagName === 'SDPI-CHECKBOX'
            ? (byId(key) as any).value
            : byId(key).checked
          : byId(key).value,
      };
  try {
    const patch: Record<string, unknown> =
      lastStatus?.backend === 'herdr-app'
        ? boundary.validate('herdrAppPreferencePatch', value)
        : RexPreferences.normalize(value);
    send(
      'sendToPlugin',
      { kind: 'preferences', preferences: patch },
      actionContext,
    );
    byId('message').textContent = 'Saving preferences…';
  } catch (error: unknown) {
    byId('message').textContent = (
      error as Error & {
        code?: string;
      }
    ).message;
  }
}
for (const key of [...booleans, ...promptNames, ...connectionFields])
  byId(key).addEventListener(
    booleans.includes(key) && byId(key).tagName === 'SDPI-CHECKBOX'
      ? 'valuechange'
      : 'change',
    () => save(key),
  );
byId('refresh').addEventListener('click', () => {
  query();
  send('sendToPlugin', { kind: 'doctor' }, actionContext);
});
for (const kind of [
  'claudePreview',
  'claudeApply',
  'claudeUndo',
  'removeIntegrations',
])
  byId(kind).addEventListener('click', () => {
    send(
      'sendToPlugin',
      { kind, statusline: (byId('chainStatus') as any).value === true },
      actionContext,
    );
    if (kind === 'claudeApply') {
      byId(kind).disabled = true;
      byId('claudeDiff').textContent = '';
    }
  });
byId('useSession').addEventListener('click', () => {
  byId('herdrSocketPath').value = byId('sessions').value;
  save('herdrSocketPath');
});
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
// sdpi-components chains this callback and opens the single inspector socket.
(window as any).connectElgatoStreamDeckSocket = (
  _port: string,
  uuid: string,
  _event: string,
  info: string,
  actionInfo: string,
) => {
  registration = uuid;
  const initial: any = boundary.parse('registry', actionInfo);
  actionContext = uuid;
  keySettings = initial.payload.settings || {};
  byId('action').value = (keySettings as any).action || '';
  const client = (window as any).SDPIComponents?.streamDeckClient;
  if (!client) {
    byId('message').textContent = 'Inspector library unavailable';
    return;
  }
  socket = {
    readyState: 1,
    send: (raw: string) => {
      const frame = boundary.parse('hostEvent', raw);
      void client.send(frame.event, frame.payload).catch(() => {});
    },
  };
  client.message.subscribe((input: unknown) => {
    try {
      const message: any = boundary.validate('hostEvent', input);
      if (message.event === 'sendToPropertyInspector') {
        const payload = message.payload;
        if (payload?.kind === 'status') fill(payload);
        if (payload?.kind === 'doctor') {
          byId('checklist').textContent = payload.checks
            .map((c: any) => `${c.ok ? '✓' : '⚠'} ${c.reason}`)
            .join('\n');
          const list = byId('sessions') as any;
          list.textContent = '';
          for (const session of payload.sessions) {
            const option = new Option(session.label, session.path);
            option.disabled = session.verified === false;
            list.add(option);
          }
        }
        if (payload?.kind === 'claudePreview') {
          byId('claudeDiff').textContent =
            'Before\n' + payload.before + '\nAfter\n' + payload.after;
          byId('claudeApply').disabled = false;
        }
      }
      if (message.event === 'didReceiveGlobalSettings') query();
    } catch {
      byId('message').textContent = 'Could not read plugin status';
    }
  });
  query();
  const connection: any = boundary.parse('registry', info);
  const model = connection.devices?.find(
    (device: any) => device.id === initial.device,
  )?.type;
  send('sendToPlugin', { kind: 'doctor', model }, actionContext);
};
setInterval(query, 3000);

export {};
