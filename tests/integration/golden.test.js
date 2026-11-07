'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { harness } = require('../helpers/plugin-harness');
const C = require('../../com.local.rexagents.sdPlugin/context-controls');

const goldenDirectory = path.join(__dirname, '../fixtures/golden');
const states = {
  ready: { state: 'idle' },
  working: { state: 'working', runId: 'turn' },
  background: {
    state: 'working',
    backgroundOnly: true,
    backgroundIds: ['terminal'],
    backgroundTurnId: 'turn',
    activityStatusAt: 'v1',
  },
  question: { state: 'blocked', kind: 'question' },
  approval: { state: 'blocked', kind: 'permission' },
  unknown: { state: 'unknown' },
  complete: { state: 'done' },
  error: { state: 'error' },
};
const pages = ['Home', 'Questions', 'Prompts'];

function snapshot(name, actual) {
  const file = path.join(goldenDirectory, name + '.json');
  const normalized = JSON.parse(JSON.stringify(actual));
  if (process.env.ASW_UPDATE_GOLDEN === '1') {
    fs.writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n');
  }
  assert.deepEqual(normalized, JSON.parse(fs.readFileSync(file, 'utf8')), name);
}

async function controllerFixture(backend, provider, state, page = 0) {
  const h = harness();
  h.api.keys.clear();
  h.change('a', {
    app: provider,
    name: provider === 'codex' ? 'codex' : 'claude',
    nativeVerified: true,
    nativeIdentity: 'root',
    claudeControlsEnabled: true,
    ...states[state],
  });
  await h.appear(backend);
  const controller = h.controller(backend);
  await h.profilePress(backend, 0, 0);
  for (let index = 0; index < page; index++) {
    await h.profilePress(backend, 1, 4);
  }
  h.tick();
  return { h, controller };
}

// Controller characterization stops at the provider interface. Native CLI/RPC
// sequences are captured separately below using the original injected fixtures.
// No fallback to an installed agent, process inspector or socket is permitted.
function recordDispatch(controller, calls) {
  const names = [
    'cycleControl',
    'adjustEffort',
    'togglePlan',
    'zoom',
    'interrupt',
    'stopTerminals',
    'submitRunning',
    'questionKey',
    'approvalKey',
    'stage',
    'send',
  ];
  for (const method of names) {
    controller.bridge[method] = async (...args) => {
      calls.push({ method, args });
      return { label: 'fixture result' };
    };
  }
  for (const method of ['focus', 'navigate', 'collapse']) {
    const original = controller.bridge[method].bind(controller.bridge);
    controller.bridge[method] = async (...args) => {
      calls.push({ method, args });
      return original(...args);
    };
  }
  controller.bridge.agent = async (target) =>
    controller.bridge.agents.find(
      (agent) => C.actor(agent) === C.actor(target),
    );
}

test('golden: all 15 keys across backend/provider/state/page combinations', async () => {
  const layouts = {};
  const presses = {};
  for (const backend of ['rex', 'herdr']) {
    for (const provider of ['codex', 'claude-code']) {
      for (const state of Object.keys(states)) {
        for (const [page, pageName] of pages.entries()) {
          const id = [backend, provider, state, pageName].join('/');
          const { controller } = await controllerFixture(
            backend,
            provider,
            state,
            page,
          );
          layouts[id] = [...controller.keys.values()].map((key) =>
            controller.mapping(key),
          );
          presses[id] = [];
          for (let index = 0; index < 15; index++) {
            const { h, controller: fresh } = await controllerFixture(
              backend,
              provider,
              state,
              page,
            );
            const calls = [];
            recordDispatch(fresh, calls);
            h.calls.length = 0;
            const context =
              backend + ':' + Math.floor(index / 5) + ',' + (index % 5);
            const key = fresh.keys.get(context);
            const action = fresh.mapping(key);
            await fresh.press(context);
            presses[id].push({
              action,
              dispatch: calls,
              backend: h.calls,
              outcome: key.feedback?.message || key.notice?.label || 'ok',
              alert: h.socket.frames.some(
                (frame) => frame.event === 'showAlert',
              ),
            });
          }
        }
      }
    }
  }
  assert.equal(Object.keys(layouts).length, 96);
  snapshot('layouts', layouts);
  snapshot('presses', presses);
});

async function trace(fixtureName, action) {
  const { fixture } = require('../fixtures/backends/' + fixtureName);
  const fixtureState = fixture();
  let outcome = 'ok';
  try {
    const result = await action(fixtureState);
    if (result?.label) outcome = result.label;
  } catch (error) {
    outcome = error.message;
  }
  return { calls: fixtureState.calls, outcome };
}

test('golden: native backend sequences and provider outcomes', async () => {
  const traces = {};
  for (const [fixture, method] of [
    ['daemon-controls', 'cycle'],
    ['daemon-effort', 'cycleEffort'],
    ['daemon-permissions', 'cyclePermissions'],
    ['background-controls', 'stop'],
  ]) {
    traces[fixture] = await trace(fixture, (f) => f.control()[method](f.agent));
    assert.notEqual(traces[fixture].calls.length, 0);
  }
  for (const kind of ['steer', 'queue']) {
    traces['codex/' + kind] = await trace('running-controls', (f) =>
      f.b.submitRunning(kind),
    );
  }
  for (const action of ['review', 'tests', 'continue']) {
    traces['codex/' + action + '/send'] = await trace(
      'staged-send',
      async (f) => {
        await f.b.stage(action);
        await f.b.send();
      },
    );
    traces['claude/' + action + '/send'] = await trace(
      'claude-controls',
      async (f) => {
        await f.invoke(action, () => f.b.stage(action));
        await f.invoke('send', () => f.b.send());
      },
    );
  }
  for (const provider of ['codex', 'claude']) {
    for (const kind of ['question', 'permission']) {
      for (const key of kind === 'question'
        ? ['up', 'down', 'left', 'right', 'tab', 'shift+tab', 'enter', 'escape']
        : ['up', 'down', 'enter', 'escape']) {
        traces[provider + '/' + kind + '/' + key] = await trace(
          provider === 'claude' ? 'claude-controls' : 'running-controls',
          async (f) => {
            if (provider === 'claude') {
              Object.assign(f.r, {
                state: 'blocked',
                kind,
                requestId: 'request',
              });
              f.state.dialog = kind;
            } else Object.assign(f.agent, { state: 'blocked', kind });
            return f.b[kind === 'question' ? 'questionKey' : 'approvalKey'](
              key,
            );
          },
        );
      }
    }
  }
  for (const backend of ['rex', 'herdr']) {
    for (const kind of ['model', 'effort']) {
      const f = require('../fixtures/backends/claude-cycle').fixture(backend);
      const result = await f.invoke(kind);
      traces['claude/' + backend + '/' + kind] = {
        calls: f.nativeCalls,
        outcome: result?.label || 'ok',
      };
    }
  }
  for (const kind of ['question', 'permission', 'ready']) {
    for (const key of kind === 'question'
      ? ['up', 'down', 'left', 'right', 'tab', 'shift+tab', 'enter', 'escape']
      : kind === 'permission'
        ? ['up', 'down', 'enter', 'escape']
        : ['plan', 'zoom', 'focus']) {
      traces['herdr/' + kind + '/' + key] = await trace(
        'herdr-bridge',
        async (f) => {
          f.state.status =
            kind === 'ready'
              ? { type: 'idle' }
              : {
                  type: 'active',
                  activeFlags: [
                    kind === 'question'
                      ? 'waitingOnUserInput'
                      : 'waitingOnApproval',
                  ],
                };
          const agents = await f.b.discover();
          f.calls.length = 0;
          if (key === 'focus') return f.b.focus(agents[1]);
          if (key === 'zoom') return f.b.zoom();
          if (key === 'plan') return f.b.togglePlan();
          return f.b[kind === 'question' ? 'questionKey' : 'approvalKey'](key);
        },
      );
    }
  }
  snapshot('native-traces', traces);
});

test('golden: controller refusals never dispatch input', async () => {
  const refusals = {};
  const changes = {
    'stale press': (_h, _c, display) => {
      display.pressedAt = display.armedAt - 1;
    },
    'changed backend': (_h, _c, display) => {
      display.backendKey = 'old';
    },
    'changed profile': (_h, _c, display) => {
      display.scope = 'other';
    },
    'changed appearance': (_h, _c, display) => {
      display.appearance = -1;
    },
    'changed visibility': (_h, _c, display) => {
      display.visibility = -1;
    },
    'changed generation': (_h, _c, display) => {
      display.generation = -1;
    },
    'setup busy': (_h, _c, display) => {
      display.setupBusy = true;
    },
    'changed page': (_h, _c, display) => {
      display.page = 2;
    },
    'changed stamp': (_h, _c, display) => {
      display.stamp = 'old';
    },
    'focus mismatch': (h) => {
      h.native('b');
    },
    'changed chat': (h) => {
      h.change('a', { chatId: 'replacement' });
    },
    'changed process': (h) => {
      h.change('a', { pid: 500 });
    },
  };
  for (const [name, change] of Object.entries(changes)) {
    const { h, controller } = await controllerFixture(
      'rex',
      'codex',
      'working',
    );
    const key = controller.keys.get('rex:2,4');
    const display = { ...key.presented };
    change(h, controller, display);
    h.calls.length = 0;
    await controller.press('rex:2,4', display);
    assert.equal(h.calls.length, 0, name);
    assert(key.feedback, name + ' must refuse');
    refusals[name] = key.feedback.message;
  }
  snapshot('controller-refusals', refusals);
});

test('golden: draft, picker and identity refusals send zero input', async () => {
  const refusals = {};
  for (const [name, patch] of Object.entries({
    'edited draft': { hash: 'edited' },
    'changed draft chat': { chatId: 'replacement' },
    'changed draft turn': { turnStamp: 'replacement' },
    'changed draft cursor': { cursor: { row: 4, column: 1 } },
  })) {
    const f = require('../fixtures/backends/staged-send').fixture();
    await f.b.stage('review');
    f.calls.length = 0;
    f.input = { ...f.input, ...patch };
    await assert.rejects(
      () => f.b.send(),
      (error) => {
        refusals[name] = error.message;
        return true;
      },
    );
    assert.equal(f.calls.length, 0, name);
  }
  const picker = require('../fixtures/backends/staged-send').fixture();
  picker.b.picker = { target: picker.a, at: Date.now() - 61000 };
  await assert.rejects(
    () => picker.b.pickerTarget(),
    (error) => {
      refusals['expired picker'] = error.message;
      return true;
    },
  );
  assert.equal(picker.calls.length, 0);
  const missing = require('../fixtures/backends/claude-controls').fixture();
  missing.controls.read = async () => {
    throw Error('missing identity');
  };
  await assert.rejects(
    () => missing.b.cycleControl('model'),
    (error) => {
      refusals['missing identity'] = error.message;
      return true;
    },
  );
  assert.equal(missing.calls.length, 0);
  snapshot('native-refusals', refusals);
});
