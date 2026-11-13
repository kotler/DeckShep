const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');

test('manual Rex selection, a shell, and closing the active tab move or clear the dot without input', async () => {
  const h = harness({ fixtureConsent: true });
  const dots = () =>
    Array.from({ length: 5 }, (_, column) => column).filter((column) =>
      h.image(0, column).includes('id="selected-agent"'),
    );
  await h.api.refresh();
  assert.deepEqual(dots(), [0]);
  h.native('b');
  await h.api.refresh();
  assert.deepEqual(dots(), [1]);
  const stale = h.api.keys.get('2,0').presented;
  h.native('shell');
  await h.api.refresh();
  assert.deepEqual(dots(), []);
  assert.equal(h.api.bridge.lastTarget, null);
  for (let column = 0; column < 5; column++) {
    assert.equal(h.api.keys.get('2,' + column).presented.action, 'none');
    await h.press(2, column);
  }
  h.native('a');
  h.setLive(h.live.filter((agent) => agent.block !== 'b'));
  await h.api.refresh();
  assert.deepEqual(dots(), [0]);
  h.tick();
  await h.press(2, 0, stale);
  assert.deepEqual(h.calls, []);
});

test('background arrivals never steal selection; manual focus follows the visible bank and PID', async () => {
  const h = harness({ fixtureConsent: true });
  await h.api.refresh();
  const agents = Array.from({ length: 6 }, (_, i) => ({
    ...h.live[0],
    block: 'p' + i,
    pid: 100 + i,
  }));
  h.setLive([...h.live, ...agents]);
  await h.api.refresh();
  assert.equal(h.api.bridge.lastTarget.block, 'a');
  h.native('p5');
  await h.api.refresh();
  assert.equal(h.api.getBank(), 1);
  assert.equal(h.api.bridge.lastNavigationTarget.block, 'p5');
  assert(h.image(0, 2).includes('id="selected-agent"'));
  h.change('p5', { pid: 200 });
  await h.api.refresh();
  assert.equal(h.api.bridge.lastNavigationTarget.pid, 200);
  h.setLive(h.live.filter((agent) => agent.block !== 'p5'));
  h.native('b');
  await h.api.refresh();
  assert.equal(h.api.getBank(), 0);
  assert(h.image(0, 1).includes('id="selected-agent"'));
  assert.deepEqual(h.calls, []);
});

test('hook-free Claude keeps the effort observed on the applied model when its badge disappears', async () => {
  const { ClaudeKeyboardScreen } = require('../helpers/claude-keyboard-screen');
  const screen = new ClaudeKeyboardScreen();
  screen.models = ['Sonnet 5.5', 'Fable 5.2', 'Opus 5.5'];
  screen.model = 1;
  screen.nativeEffort = true;
  const defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
  const h = harness({
    fs: {
      readFileSync: () =>
        JSON.stringify({
          ...defaults,
          allowClipboardFocus: true,
          claude: { ...defaults.claude, enabled: true },
        }),
    },
  });
  h.change('a', {
    app: 'claude-code',
    name: 'claude',
    chatId: null,
    rexSettings: {},
  });
  const b = h.api.bridge;
  b.inspectClaudeKeyboard = async () => 'fixture-process';
  b.agent = async () => h.live[0];
  b.readKeyboardView = async () => screen.view();
  b.run = async (args, input) =>
    screen.send(input ? input.slice(6, -6) : args.at(-1));
  await h.api.refresh();
  await new Promise(setImmediate);
  h.tick();
  await h.press(2, 1);
  assert.equal(screen.effort, 2);
  h.tick();
  // A background poll captured Fable before the model press. Let that read
  // finish after the new model and effort have been published.
  const oldView = screen.view();
  let releasePoll;
  b.readKeyboardView = async () => {
    b.readKeyboardView = async () => screen.view();
    return new Promise((resolve) => {
      releasePoll = () => resolve(oldView);
    });
  };
  await h.api.refresh();
  assert.equal(typeof releasePoll, 'function');
  await h.press(2, 0);
  releasePoll();
  await new Promise(setImmediate);
  assert.equal(
    h.api.keys.get('2,1').presented.target.rexSettings.viewHash,
    screen.view().hash,
  );
  assert.equal(screen.model, 2);
  assert.equal(
    h.api.keys.get('2,1').presented.target.rexSettings.effort,
    'high?',
  );
  assert(h.image(2, 1).includes('high?'));
  h.tick();
  await h.press(2, 1);
  assert.equal(screen.effort, 0);
  assert(!h.socket.frames.some((frame) => frame.event === 'showAlert'));
});

test('Codex Permissions keeps its last selection after feedback expires only for the observed chat and process', async () => {
  const { KeyboardScreen } = require('../helpers/keyboard-screen');
  const screen = new KeyboardScreen();
  screen.permissions = screen.profiles.length - 1;
  const h = harness({ fixtureConsent: true });
  h.change('a', { rexSettings: {} });
  const bridge = h.api.bridge;
  bridge.inspectKeyboardProcess = async (pid) => ({
    pid,
    codex: true,
    image: 'codex',
    startedAt: 'start',
  });
  bridge.readKeyboardView = async () => screen.view();
  bridge.agent = async () => h.live[0];
  bridge.run = async (args, input) =>
    screen.send(input ? input.slice(6, -6) : args.at(-1));
  async function refresh() {
    await h.api.refresh();
    await new Promise(setImmediate);
  }
  const caption = () =>
    h.api.keys.get('2,2').presented.target.rexSettings.permissions;
  await refresh();
  assert.match(h.image(2, 2), />Press<.*>to cycle</s);
  h.tick();
  await h.press(2, 2);
  assert.equal(screen.permissions, 0);
  h.tick(5000);
  await refresh();
  assert.equal(caption(), 'Ask for approval?');
  screen.surface = 'profiles';
  screen.permissions = 1;
  await refresh();
  assert.equal(caption(), 'Approve for me');
  screen.surface = 'idle';
  await refresh();
  assert.equal(caption(), 'Approve for me?');
  h.change('a', { chatId: 'replacement' });
  await refresh();
  assert.equal(caption(), undefined);
});

test('Codex permission caption survives rediscovery before the next pane read finishes', async () => {
  const { KeyboardScreen } = require('../helpers/keyboard-screen');
  const screen = new KeyboardScreen();
  const h = harness({
    fixtureConsent: true,
    metadataFactory: () => ({
      hydrate(agents) {
        for (const agent of agents) agent.chatId = 'verified-chat';
      },
      async refresh(agents) {
        return agents;
      },
    }),
  });
  h.change('a', { chatId: undefined, rexSettings: {} });
  const b = h.api.bridge;
  b.displayedAgent = async () => b.agents[0];
  b.inspectKeyboardProcess = async (pid) => ({
    pid,
    codex: true,
    image: 'codex',
    startedAt: 'start',
  });
  b.readKeyboardView = async () => screen.view();
  await h.api.refresh();
  await new Promise(setImmediate);
  const steady = h.image(2, 2);
  assert.match(steady, />Press<.*>to cycle</s);
  let finish;
  b.readKeyboardView = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await h.api.refresh();
  assert.equal(
    h.image(2, 2) === steady,
    true,
    'pending rediscovery must keep the last complete caption',
  );
  finish(screen.view());
  await new Promise(setImmediate);
  b.readKeyboardView = async () => {
    throw Error('Rex view changed');
  };
  await h.api.refresh();
  await new Promise(setImmediate);
  assert.equal(
    h.image(2, 2) === steady,
    true,
    'one torn read must not blink the caption',
  );
  assert.equal(
    h.api.keys.get('2,2').presented.target.rexSettings.viewHash,
    undefined,
  );
});
