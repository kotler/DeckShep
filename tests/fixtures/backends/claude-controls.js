'use strict';
const assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { Bridge } = require('../../../com.local.rexagents.sdPlugin/core'),
  C = require('../../../com.local.rexagents.sdPlugin/context-controls'),
  {
    ClaudeControls,
    composer,
    dialog,
  } = require('../../../com.local.rexagents.sdPlugin/claude-controls'),
  defaults = require('../../../com.local.rexagents.sdPlugin/config.json');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function fixture() {
  const raw = {
    session: 's',
    window: 'w',
    block: 'b',
    app: 'claude-code',
    pid: 42,
    name: 'claude',
    cwd: '/project',
    state: 'unknown',
    project: 'project',
  };
  const p = {
      pid: 42,
      startedAt: 'Fri Nov 6 12:00:00 2026',
      version: '2.1.319',
    },
    r = {
      configDirectory: '/fixture/claude',
      schema: 1,
      pid: 42,
      startedAt: p.startedAt,
      version: p.version,
      sessionId: 'claude-session',
      generation: 'generation-one',
      turnId: 'turn-one',
      cwd: '/project',
      state: 'idle',
      updatedAt: 10000,
      metadataAt: 10000,
      model: 'claude-sonnet-4-6',
      modelName: 'Sonnet 4.6',
      effort: 'high',
      permissionMode: 'default',
    };
  const state = {
      input: '',
      dialog: null,
      changed: false,
      workingHint: true,
      failWrite: false,
      viewReads: 0,
    },
    calls = [];
  const b = new Bridge(
    {
      ...structuredClone(defaults),
      allowClipboardFocus: true,
      claude: { enabled: true },
    },
    async (args, input) => {
      calls.push({ args, input });
      if (state.failWrite) throw Error('Uncertain write');
      if (args[0] === 'send')
        state.input += input.replace(/\x1b\[20[01]~/g, '');
      if (args.at(-1) === 'alt+p') state.dialog = 'picker';
    },
    async () => {},
  );
  const text = () =>
    state.dialog
      ? '────────────────────────\n' +
        (state.dialog === 'picker'
          ? 'Select model'
          : state.dialog === 'permission'
            ? 'Do you want to allow this command?'
            : 'Which color?') +
        '\n❯ 1. ' +
        (state.dialog === 'permission' ? 'Yes, once' : 'Red') +
        '\n  2. ' +
        (state.dialog === 'permission' ? 'No' : 'Blue') +
        '\n' +
        (state.dialog === 'picker'
          ? 'Enter to set as default · s to use this session only · Esc to cancel'
          : state.multiSelect
            ? 'Space to toggle · Enter to select · Esc to cancel'
            : 'Enter to confirm · Esc to cancel')
      : 'Claude session\n────────────────────────\n❯ ' +
        state.input +
        '\n────────────────────────\nClaude Sonnet · high' +
        (r.state === 'working' && state.workingHint
          ? '\nesc to interrupt'
          : '');
  const view = async () => {
    state.viewReads++;
    const t = text() + (state.changed && state.viewReads % 2 ? ' changed' : '');
    return {
      text: t,
      hash: hash(t),
      cursor: { row: 3, column: 3 + state.input.length },
    };
  };
  const controls = new ClaudeControls(b, {
    inspect: async () => ({ ...p }),
    read: async () => ({ ...r }),
    now: () => 10000,
    view,
  });
  b.claude = controls;
  b.focused = async () => {
    const a = await controls.enrich({ ...raw });
    if (b.actionContext) {
      C.assertContext(b.actionContext, a);
      if (b.actionContext.verifyChat)
        controls.assert(b.actionContext.target, a);
    }
    b.lastTarget = { ...a };
    return a;
  };
  b.method = async (_a, method) => {
    assert.equal(method, 'modes');
    return { modes: [{ number: 2004, set: true }] };
  };
  const invoke = async (action, fn) => {
    const a = await b.focused();
    return b.withContext(
      { action, target: C.snapshot(a), verifyChat: C.needsChat(action, a) },
      fn,
    );
  };
  return { b, controls, r, p, raw, state, calls, text, invoke };
}

module.exports = { fixture };
