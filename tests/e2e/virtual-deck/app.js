const socket = new WebSocket(
  location.origin.replace('http:', 'ws:') + '/control',
);
const pending = new Map();
let sequence = 0;
let state;
let readyResolve;
const ready = new Promise((resolve) => {
  readyResolve = resolve;
});
const deckElement = document.getElementById('deck');
const statusElement = document.getElementById('status');
const buttons = Array.from({ length: 15 }, (_, i) => {
  const button = document.createElement('button');
  button.className = 'key';
  button.dataset.key = Math.floor(i / 5) + '-' + (i % 5);
  button.dataset.testid = 'key-' + button.dataset.key;
  button.append(document.createElement('img'), document.createElement('span'));
  button.querySelector('img').alt = '';
  button.addEventListener('pointerdown', (event) => {
    button.setPointerCapture(event.pointerId);
    void invoke('down', Math.floor(i / 5), i % 5).catch(showError);
  });
  button.addEventListener('pointerup', () => {
    void invoke('up', Math.floor(i / 5), i % 5).catch(showError);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void invoke('press', Math.floor(i / 5), i % 5).catch(showError);
    }
  });
  deckElement.append(button);
  return button;
});
function showError() {
  statusElement.textContent = 'Fixture command refused';
}
function render(next) {
  state = next;
  for (const [i, key] of state.keys.entries()) {
    const button = buttons[i];
    button.querySelector('img').src = key.image;
    button.querySelector('span').textContent = key.title;
    button.dataset.labels = JSON.stringify(key.labels);
    button.dataset.selected = String(key.selected);
    button.dataset.visible = String(key.visible);
    button.disabled = !key.visible;
    button.setAttribute('aria-label', key.labels.join(' · ') || 'Empty key');
  }
  document.getElementById('profile').value = state.profile;
  document.getElementById('scenario').value = state.scenario;
  document.getElementById('trace').textContent = JSON.stringify(
    { input: state.trace, alerts: state.alerts, refusals: state.refusals },
    null,
    2,
  );
  statusElement.textContent = state.scenario + ' · ' + state.clock + ' ms';
}
async function invoke(method, ...args) {
  await ready;
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, args }));
  });
}
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.state) {
    render(message.state);
    readyResolve();
  }
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(Error(message.error));
    else request?.resolve(message.result);
  }
});
socket.addEventListener('close', () => {
  statusElement.textContent = 'Preview disconnected';
  for (const request of pending.values())
    request.reject(Error('Preview disconnected'));
  pending.clear();
});
const names = [
  'idle-two-codex',
  'working-rex',
  'question',
  'approval',
  'background-terminals',
  'closed-slot',
  'overflow-banks',
  'claude-mixed',
  'herdr-tui',
  'offline',
];
for (const name of names) {
  const option = new Option(name, name);
  document.getElementById('scenario').append(option);
}
document.getElementById('profile').addEventListener('change', (event) => {
  void invoke('switchProfile', event.target.value).catch(showError);
});
document.getElementById('scenario').addEventListener('change', (event) => {
  void invoke('setScenario', event.target.value).catch(showError);
});
document.getElementById('advance').onclick = () => {
  void invoke('advance', 500).catch(showError);
};
document.getElementById('consent').onclick = () => {
  void invoke(
    'setPreferences',
    state.profile === 'rex'
      ? { allowClipboardFocus: true }
      : { herdrTitleIdentity: true },
  ).catch(showError);
};
document.getElementById('claude').onclick = () => {
  void invoke('setPreferences', { claudeEnabled: true }).catch(showError);
};
document.getElementById('reset').onclick = () => {
  void invoke('reset').catch(showError);
};
window.deck = Object.fromEntries(
  [
    'press',
    'down',
    'up',
    'setScenario',
    'advance',
    'switchProfile',
    'setKeySettings',
    'setPreferences',
    'reset',
    'hide',
    'pauseFocus',
    'snapshot',
  ].map((method) => [method, (...args) => invoke(method, ...args)]),
);
window.deck.ready = ready;
window.deck.trace = () => structuredClone(state.trace);
window.deck.keys = () => structuredClone(state.keys);
