const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = createRequire(path.resolve('tools/package.json'))(
  '@playwright/test',
);
const { createApplication } = require('../../src/app/controller');
const { Bridge } = require('../../src/app/session');
const { ClaudeControls } = require('../../src/agents/claude/controls');
const {
  readCodexSettings,
} = require('../../src/agents/codex/keyboard-settings');
const {
  readClaudeSettings,
} = require('../../src/agents/claude/keyboard-settings');

// A headless Rex server has no Mac display client. The test host exposes just
// the owned session as its display and checks the real foreground before I/O.
async function checkBrowserDeck({
  provider,
  action = 'ready',
  topology,
  block,
  repo,
  command,
  assertOwnedPane,
  read,
  hookPlugin,
  companion,
  onCycle,
}) {
  const panes = [
    { provider, topology, block, repo, assertOwnedPane, read },
    ...(companion ? [companion] : []),
  ];
  let active = panes[0];
  const cycles = [];
  const session = topology.session_id;
  const route = ['-s', session, '-b', block];
  function paneFor(sessionId, blockId) {
    const pane = panes.find(
      (pane) =>
        pane.topology.session_id === sessionId &&
        (blockId === undefined || pane.block === blockId),
    );
    assert(pane, 'Request escaped the owned pane set');
    pane.assertOwnedPane();
    return pane;
  }
  const inspect = (pane = active) =>
    JSON.parse(
      command(['session', 'inspect', pane.topology.session_id, '--json']),
    );
  function visible() {
    active.assertOwnedPane();
    const current = inspect();
    assert.equal(
      current.windows.find((w) => w.window_id === current.active_window_id)
        ?.focused_block_id,
      active.block,
    );
    return active.block;
  }
  let escapes = 0,
    publish,
    pendingRender;
  const images = new Map(),
    alerts = [];
  const socket = Object.assign(new EventEmitter(), {
    readyState: 1,
    deliver(frame) {
      if (frame.event === 'setImage') {
        images.set(frame.context, frame.payload.image);
        if (publish && !pendingRender)
          pendingRender = setImmediate(() => {
            pendingRender = undefined;
            publish?.();
          });
      }
      if (frame.event === 'sendToPropertyInspector')
        socket.message = frame.payload.message;
      if (frame.event === 'showAlert') alerts.push(frame.context);
    },
  });
  const app = createApplication({
    socket,
    setInterval() {},
    fs: {
      readFileSync: () =>
        JSON.stringify({
          ...require('../../com.kotl3r.deckshep.sdPlugin/config.json'),
          allowClipboardFocus: true,
          bringToFront: false,
          claude: { enabled: true },
        }),
    },
    metadataFactory: () => ({
      hydrate() {},
      async refresh(agents) {
        return agents;
      },
    }),
    backendFactory(config) {
      const bridge = new Bridge(
        config,
        async (args, input) => {
          if (args[0] === 'ls')
            return {
              sessions: panes.map((pane) => ({
                session_id: pane.topology.session_id,
              })),
            };
          if (args[0] === 'session') {
            const pane = paneFor(args[2]);
            assert.deepEqual(args, [
              'session',
              'inspect',
              pane.topology.session_id,
              '--json',
            ]);
            return inspect(pane);
          }
          if (args[0] === 'block') {
            const pane = paneFor(args[3], args[5]);
            assert.deepEqual(args.slice(0, 6), [
              'block',
              'call',
              '-s',
              pane.topology.session_id,
              '-b',
              pane.block,
            ]);
            assert(
              [
                'process',
                'program_status',
                'title',
                'size',
                'format',
                'modes',
              ].includes(args[6]),
            );
            return JSON.parse(command(args));
          }
          if (args[0] === '-C') {
            const pane = paneFor(args[4]?.replace(/^session_id=/, ''));
            assert.deepEqual(args, [
              '-C',
              'test-display',
              'do',
              'session.select',
              'session_id=' + pane.topology.session_id,
              'window_id=' + pane.topology.active_window_id,
            ]);
            // The headless server has no GUI client. Only display selection is
            // substituted; focus and subsequent reads/writes use the owned CLI.
            active = pane;
            return null;
          }
          if (args[0] === 'focus') {
            const pane = paneFor(args[2], args[3]);
            assert.equal(active, pane);
            return command(args);
          }
          assert(['send', 'send-key'].includes(args[0]));
          const pane = paneFor(args[2], args[4]);
          assert.equal(active, pane);
          assert.deepEqual(args.slice(1, 5), [
            '-s',
            pane.topology.session_id,
            '-b',
            pane.block,
          ]);
          visible();
          if (args[0] === 'send-key' && args[5] === 'escape') escapes++;
          command(args, input);
        },
        () => {
          throw Error('Unexpected GUI activation');
        },
        visible,
        async () => null,
      );
      bridge.client = async () => ({
        client_id: 'test-display',
        session_ids: panes.map((pane) => pane.topology.session_id),
      });
      bridge.inspectKeyboardProcess = (pid) =>
        require('../../src/agents/codex/hook-process').inspectProcess(
          pid,
          (_, args, options) =>
            require('../../src/platform/exec').exec(
              path.join(repo, '../codex-hook-process'),
              args,
              options,
            ),
        );
      bridge.inspectClaudeKeyboard = (a, _, _dir, surface) =>
        require('../../src/agents/claude/keyboard-identity').claudeKeyboardIdentity(
          a,
          undefined,
          path.join(repo, '../home/.claude'),
          surface,
        );
      const state = require('../../src/agents/claude/state');
      bridge.claude = new ClaudeControls(bridge, {
        read: (pid) =>
          hookPlugin
            ? state.readRecord(pid, path.join(hookPlugin, 'state/claude'))
            : null,
        setupMode: () => (hookPlugin ? state.setupMode(hookPlugin) : null),
      });
      return bridge;
    },
  });
  const runtime = app.getController('rex');
  const snapshot = () => ({
    profile: 'rex',
    scenario: 'live',
    clock: Date.now(),
    alerts,
    trace: [],
    refusals: [],
    keys: Array.from({ length: 15 }, (_, i) => {
      const image = images.get(String(i)) || '';
      const svg = Buffer.from(image.split(',')[1] || '', 'base64').toString();
      const labels = Array.from(
        svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g),
        (m) => m[1],
      );
      return {
        image,
        labels,
        visible: true,
        title: '',
        selected: svg.includes('id="selected-agent"'),
      };
    }),
  });
  for (let i = 0; i < 15; i++)
    app.receive({
      event: 'willAppear',
      context: String(i),
      payload: {
        settings: { profileScope: 'rex' },
        coordinates: { row: Math.floor(i / 5), column: i % 5 },
      },
    });
  await app.settled();
  await runtime.refresh(true, true);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const files = path.resolve('tests/e2e/virtual-deck');
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.host !== 'deck.test' || !['/', '/app.js'].includes(url.pathname))
        return route.abort();
      return route.fulfill({
        path: path.join(files, url.pathname === '/' ? 'index.html' : 'app.js'),
        contentType: url.pathname === '/' ? 'text/html' : 'text/javascript',
      });
    });
    let released;
    await page.routeWebSocket('**/control', (ws) => {
      publish = () => ws.send(JSON.stringify({ state: snapshot() }));
      publish();
      ws.onMessage((raw) => {
        const { method, args, id } = JSON.parse(raw);
        assert(['up', 'down'].includes(method));
        const [row, column] = args;
        assert(
          Number.isInteger(row) &&
            row >= 0 &&
            row < 3 &&
            Number.isInteger(column) &&
            column >= 0 &&
            column < 5,
        );
        app.receive({
          event: method === 'down' ? 'keyDown' : 'keyUp',
          context: String(row * 5 + column),
        });
        void app.settled().then(() => {
          const state = snapshot();
          ws.send(JSON.stringify({ state, result: state, id }));
          if (method === 'up') released();
        });
      });
    });
    await page.goto('http://deck.test/');
    await page.evaluate(() => globalThis.deck.ready);
    if (action === 'unbound-queue' || action === 'unbound-choice') {
      assert.equal(provider, 'claude');
      assert(!hookPlugin);
      const keys = snapshot().keys;
      assert(keys[0].selected, 'Missing native pane selection');
      const forbidden =
        action === 'unbound-queue'
          ? ['Queue', 'Steer']
          : ['Up', 'Down', 'Confirm', 'Submit'];
      for (const label of forbidden)
        assert(
          !keys.slice(10).some((key) => key.labels[0] === label),
          'Hook-free pane exposed a control requiring a bound turn or request',
        );
      return;
    }
    async function pressAt(row, column, heading) {
      const index = row * 5 + column;
      const key = page.getByTestId('key-' + row + '-' + column);
      // A newly opened pane can acquire its first status or hook record after
      // the first paint. Wait for the actual key, never retry a press.
      const deadline = Date.now() + 5000;
      do {
        await runtime.refresh(false, true);
        publish();
        if (!heading || snapshot().keys[index].labels[0] === heading) break;
        await delay(200);
      } while (Date.now() < deadline);
      if (heading && snapshot().keys[index].labels[0] !== heading) {
        const live = runtime.bridge.agents[0] || {};
        throw Error(
          JSON.stringify({
            heading,
            row: snapshot()
              .keys.slice(10)
              .map((k) => k.labels),
            state: live.state,
            kind: live.kind,
            selected: !!runtime.selected(),
            native: live.nativeVerified,
            chat: !!live.chatId,
            enabled: live.claudeControlsEnabled,
            why: live.claudeError,
          }),
        );
      }
      if (heading)
        await page.waitForFunction(
          ({ index, heading }) =>
            globalThis.deck.keys()[index].labels[0] === heading,
          { index, heading },
          { timeout: 2000 },
        );
      await delay(350);
      while (
        Date.now() < (runtime.keys.get(String(index))?.presented?.armedAt || 0)
      )
        await delay(
          runtime.keys.get(String(index)).presented.armedAt - Date.now() + 1,
        );
      const keyUp = new Promise((resolve) => {
        released = resolve;
      });
      const timeout = AbortSignal.timeout(30000);
      await key.click();
      await Promise.race([
        keyUp,
        new Promise((_, reject) => {
          timeout.addEventListener(
            'abort',
            () => reject(Error('Deck key-up acknowledgement timed out')),
            { once: true },
          );
        }),
      ]);
      if (alerts.length) {
        app.receive({
          event: 'sendToPlugin',
          context: String(index),
          payload: { kind: 'status' },
        });
        await app.settled();
      }
      assert.deepEqual(
        alerts,
        [],
        heading +
          ' press refused: ' +
          (socket.message || '') +
          ' ' +
          snapshot().keys[index].labels.join(' '),
      );
      // Ready-state settings can finish their passive read after the press settles.
      for (let poll = 0; poll < 4; poll++) {
        const label = snapshot()
          .keys[index].labels.slice(1)
          .join(' ')
          .replace(/\?$/, '');
        if (label || action !== 'ready') return label;
        await delay(200);
        await runtime.refresh(false, true);
        publish();
      }
      return '';
    }
    const press = (column, heading) => pressAt(2, column, heading);
    if ((companion && action === 'ready') || action === 'effort-cycle') {
      const visits =
        action === 'effort-cycle'
          ? [panes[0]]
          : [panes[0], companion, panes[0]];
      for (const pane of visits) {
        const index = runtime.bridge.slots.findIndex(
          (slot) =>
            slot.session === pane.topology.session_id &&
            slot.block === pane.block,
        );
        assert(index >= 0 && index < 5);
        await pressAt(0, index);
        assert.equal(active, pane);
        await runtime.refresh(true, true);
        publish();
        assert(
          snapshot().keys[index].selected,
          'Selection dot did not follow the owned agent',
        );
        const settings =
          pane.provider === 'codex' ? readCodexSettings : readClaudeSettings;
        for (const [column, heading, field] of action === 'effort-cycle'
          ? [[1, 'Effort', 'effort']]
          : [
              [0, 'Model', 'model'],
              [1, 'Effort', 'effort'],
              [2, 'Permissions', 'permissions'],
              ...(pane.provider === 'codex' ? [[3, 'Mode', 'plan']] : []),
            ]) {
          const seen = new Set();
          let first,
            wrapped = false;
          for (let step = 0; step < 50; step++) {
            const label = await press(column, heading);
            assert(
              label || field === 'plan',
              heading + ' did not update its face',
            );
            let native = settings(await pane.read())[field];
            if (pane.provider === 'codex' && field === 'permissions') {
              const route = ['-s', pane.topology.session_id, '-b', pane.block];
              visible();
              command(['send', ...route, '/permissions']);
              await delay(250);
              visible();
              command(['send-key', ...route, 'enter']);
              await delay(600);
              native = settings(await pane.read()).permissions;
              assert(native, 'Native permission selection was not readable');
              visible();
              command(['send-key', ...route, 'escape']);
            }
            const observed = runtime.selected()?.rexSettings?.[field];
            const value = String(native || observed || label || 'default')
              .toLowerCase()
              .replace(/\?$/, '');
            const caption = label.toLowerCase();
            assert(
              caption === value ||
                (caption.endsWith('…') &&
                  value.startsWith(caption.slice(0, -1))) ||
                (!caption && field === 'plan'),
              heading + ' face disagreed with its native setting',
            );
            if (first === undefined) first = value;
            else if (value === first) {
              wrapped = true;
              break;
            }
            assert(
              !seen.has(value),
              heading + ' repeated before completing its cycle',
            );
            seen.add(value);
            if (native && observed)
              assert.equal(
                String(observed).replace(/\?$/, '').toLowerCase(),
                native.toLowerCase(),
              );
            assert.notEqual(value, 'full access');
          }
          assert(
            wrapped && seen.size >= 2,
            heading + ' did not complete a native option cycle',
          );
          cycles.push({
            provider: pane.provider,
            button: heading,
            options: seen.size,
          });
          onCycle?.(cycles.at(-1));
        }
      }
      return { cycles };
    }
    if (['queue', 'down', 'confirm', 'submit'].includes(action)) {
      const [column, heading] = {
        queue: [1, 'Queue'],
        down: [1, 'Down'],
        confirm: [2, 'Confirm'],
        submit: [2, 'Submit'],
      }[action];
      await press(column, heading);
      return;
    }
    if (action === 'interrupt') {
      await press(4, 'Interrupt');
      assert.equal(escapes, 1, 'One press must deliver exactly one Escape');
      return;
    }
    const before =
      provider === 'claude'
        ? readClaudeSettings(await read()).permissions
        : undefined;
    const caption = await press(2, 'Permissions');
    if (provider === 'claude') {
      const after = readClaudeSettings(await read()).permissions;
      assert(after && after !== before, 'Claude permissions did not change');
      assert.equal(caption.toLowerCase(), after.toLowerCase());
    } else {
      assert(
        caption && caption !== 'Press to cycle',
        'Codex did not acknowledge a profile',
      );
      visible();
      command(['send', ...route, '/permissions']);
      await delay(250);
      visible();
      command(['send-key', ...route, 'enter']);
      await delay(600);
      assert.equal(readCodexSettings(await read()).permissions, caption);
      visible();
      command(['send-key', ...route, 'escape']);
    }
    const settings =
      provider === 'codex' ? readCodexSettings : readClaudeSettings;
    if (provider === 'codex') {
      assert.equal(await press(3, 'Mode'), 'Plan');
      assert.equal(settings(await read()).plan, 'Plan');
      await press(3, 'Mode');
      assert.notEqual(settings(await read()).plan, 'Plan');
    }
    const readSetting = async (column, heading, field) => {
      const label = await press(column, heading);
      assert(
        label && label !== 'Press to cycle',
        heading + ' key did not report the applied value',
      );
      const after = settings(await read())[field];
      if (after) assert.equal(label.toLowerCase(), after.toLowerCase());
      await runtime.refresh(true, true);
    };
    await readSetting(1, 'Effort', 'effort');
    await readSetting(0, 'Model', 'model');
    await readSetting(1, 'Effort', 'effort');
  } finally {
    publish = undefined;
    clearImmediate(pendingRender);
    await browser.close();
  }
}
module.exports = { checkBrowserDeck };
