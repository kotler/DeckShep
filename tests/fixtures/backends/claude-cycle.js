'use strict';
const assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { Bridge } = require('../../../src/app/session'),
  {
    HerdrBridge,
  } = require('../../../src/app/herdr-session'),
  {
    ClaudeControls,
  } = require('../../../src/agents/claude/controls'),
  P = require('../../../src/agents/claude/cycle'),
  C = require('../../../src/guards/context'),
  { validate } = require('../../../src/terminals/herdr-tui/rpc'),
  defaults = require('../../../com.local.rexagents.sdPlugin/config.json');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function fixture(backend = 'rex') {
  let now = 10000;
  const models = [
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-fable-5-1',
      'claude-haiku-5-5',
    ],
    names = ['Opus 5.5', 'Sonnet 5.5', 'Fable 5.1', 'Haiku 5.5'];
  const state = {
      dialog: null,
      input: '',
      selected: 0,
      slider: 'medium',
      defaultModel: true,
      supported: [...P.levels],
      atBottom: true,
      unknown: false,
      catalogChange: false,
      credits: false,
      uncertain: false,
      focusLost: false,
    },
    calls = [],
    nativeCalls = [];
  const raw = {
    session: backend === 'herdr' ? 'herdr:test' : 's',
    window: 'w1:t1',
    block: 'w1:p1',
    workspaceId: 'w1',
    terminalId: backend === 'herdr' ? 'terminal-one' : undefined,
    backend,
    app: 'claude-code',
    pid: 42,
    name: 'claude',
    cwd: '/project',
    state: 'idle',
    serverFocused: true,
    atBottom: true,
  };
  const process = {
      pid: 42,
      startedAt: 'Sat Nov 7 12:00:00 2026',
      version: '2.1.319',
    },
    record = {
      schema: 1,
      pid: 42,
      startedAt: process.startedAt,
      version: process.version,
      sessionId: 'cycle-session',
      generation: 'generation',
      turnId: 'turn',
      cwd: '/project',
      state: 'idle',
      updatedAt: now,
      metadataAt: now,
      model: models[0],
      modelName: names[0],
      effort: 'medium',
      configDirectory: '/fixture/claude',
    };
  const selectedModel = () =>
    state.selected === 0 ? models[0] : models[state.selected - 1];
  const text = () => {
    if (state.unknown)
      return 'Do you want to approve this tool?\n❯ 1. Yes\n  2. No\nEsc to cancel';
    if (state.dialog === 'credits')
      return 'Continue using additional usage credits?\n❯ 1. Yes\n  2. No\nEsc to cancel';
    if (state.dialog === 'picker') {
      const labels = [
        'Default (recommended) ' +
          (state.defaultModel ? '✔ ' : '') +
          'Opus 5.5 · Recommended',
        ...names.map(
          (name, i) =>
            name +
            ' ' +
            (!state.defaultModel && record.model === models[i] ? '✔ ' : '') +
            ' · Native model',
        ),
        'More models Show 8 more',
      ];
      if (state.catalogChange) labels[2] += ' changed';
      return (
        'Select model\n' +
        labels
          .map(
            (label, i) =>
              (state.selected === i ? '❯ ' : '  ') + (i + 1) + '. ' + label,
          )
          .join('\n') +
        '\n◐ ' +
        state.slider.replace(/^./, (c) => c.toUpperCase()) +
        ' effort ←/→ to adjust\n' +
        (state.slider === 'max'
          ? 'May use excessive tokens resulting in long response times.\n'
          : '') +
        'Enter to set as default · s to use this session only · Esc to cancel'
      );
    }
    return (
      'Claude session\n──────────────── Deck validation ─\n❯\u00a0' +
      state.input +
      '\n────────────────────────\nClaude ' +
      record.modelName +
      ' · ' +
      record.effort
    );
  };
  const dispatch = async (keys) => {
    for (const key of keys) {
      if (state.delayFrames) {
        state.oldView = text();
        state.remaining = state.delayFrames;
      }
      calls.push(key);
      now++;
      if (key === 'alt+p') {
        state.dialog = 'picker';
        state.selected = state.defaultModel
          ? 0
          : models.indexOf(record.model) + 1;
        state.slider = record.effort;
        continue;
      }
      if (state.dialog !== 'picker') throw Error('Unexpected native input');
      if (['up', 'down'].includes(key)) {
        state.selected = Math.max(
          0,
          Math.min(5, state.selected + (key === 'down' ? 1 : -1)),
        );
        state.slider = 'medium';
      } else if (['left', 'right'].includes(key)) {
        const i = state.supported.indexOf(state.slider);
        state.slider =
          state.supported[
            Math.max(
              0,
              Math.min(
                state.supported.length - 1,
                i + (key === 'right' ? 1 : -1),
              ),
            )
          ];
      } else if (key === 's') {
        if (state.credits) {
          state.dialog = 'credits';
          continue;
        }
        record.model = selectedModel();
        record.modelName = names[models.indexOf(record.model)];
        record.effort = state.slider;
        record.metadataAt = ++now;
        state.defaultModel = state.selected === 0;
        state.dialog = null;
        if (state.backgroundRedraw) {
          const read = controls.viewReader,
            identity = b.lastTarget.nativeIdentity;
          controls.viewReader = async () => {
            throw Error('Claude view changed');
          };
          try {
            const redraw = await controls.enrich({ ...raw });
            assert.equal(redraw.nativeVerified, true);
            assert.equal(redraw.nativeIdentity, identity);
            assert(b.lastTarget, 'an apply redraw cannot clear selected root');
          } finally {
            controls.viewReader = read;
          }
        }
        if (state.uncertain) throw Error('Uncertain write');
      } else if (['escape', 'esc'].includes(key)) state.dialog = null;
      else throw Error('Unsupported input ' + key);
    }
  };
  const config = {
    ...structuredClone(defaults),
    backend,
    claude: { enabled: true },
    allowClipboardFocus: true,
  };
  let b, controls;
  if (backend === 'herdr') {
    const rpc = {
      endpoint: { scope: 'herdr:test' },
      close() {},
      async request(method, params) {
        nativeCalls.push({ method, params });
        validate(method, params);
        assert.equal(method, 'agent.send_keys');
        await dispatch(params.keys);
        return { type: 'ok' };
      },
    };
    b = new HerdrBridge(config, { connect: async () => rpc });
    b.snapshot = async () => ({
      focused_pane_id: raw.block,
      focused_tab_id: raw.window,
      focused_workspace_id: 'w1',
    });
    b.readAgent = async () =>
      controls.enrich({ ...raw, atBottom: state.atBottom });
  } else
    b = new Bridge(config, async (args) => {
      nativeCalls.push({ args });
      assert.equal(args[0], 'send-key');
      await dispatch(args.slice(5));
    });
  controls = new ClaudeControls(b, {
    inspect: async () => ({ ...process }),
    read: async () => ({ ...record }),
    bindingsDefault: () => true,
    now: () => now,
    cycleWait: async (ms) => {
      now += ms;
    },
    view: async () => {
      const t =
        state.remaining > 0 ? (state.remaining--, state.oldView) : text();
      return {
        text: t,
        hash: hash(t),
        cursor:
          backend === 'herdr'
            ? null
            : { row: 3, column: 3 + state.input.length },
      };
    },
  });
  b.claude = controls;
  b.focused = async () => {
    if (state.focusLost) throw Error('Profile changed');
    const a = await controls.enrich({ ...raw, atBottom: state.atBottom });
    if (b.actionContext) C.assertContext(b.actionContext, a);
    b.lastTarget = { ...a };
    return a;
  };
  const invoke = async (kind) => {
    const a = await b.focused();
    return b.withContext(
      { action: kind, target: C.snapshot(a), verifyChat: true },
      () => b.cycleControl(kind),
    );
  };
  return {
    b,
    controls,
    state,
    record,
    process,
    calls,
    nativeCalls,
    invoke,
    text,
  };
}

module.exports = { fixture };
