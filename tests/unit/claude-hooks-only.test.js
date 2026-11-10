'use strict';
// Hooks-only Claude mode (NO-STATUS-LINE-PLAN Part A): controls are enabled by
// press-time process + lifecycle proof instead of a status-line heartbeat, and
// hook captions are display only.
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { Bridge } = require('../../src/app/session'),
  { ClaudeControls } = require('../../src/agents/claude/controls'),
  S = require('../../src/agents/claude/state'),
  configure = require('../../src/agents/claude/configure'),
  labels = require('../../src/domain/labels'),
  defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');

const NOW = 50_000_000;
const proc = {
  pid: 42,
  ppid: 1,
  startedAt: 'Tue Nov 10 12:00:00 2026',
  version: '2.1.319',
};
const raw = {
  session: 's',
  window: 'w',
  block: 'b',
  app: 'claude-code',
  pid: 42,
  name: 'claude',
  cwd: '/project',
  state: 'idle',
  project: 'project',
};
/** A record as the hook writes it in hooks-only mode: no metadataAt. */
function hookRecord(extra = {}) {
  return {
    schema: 1,
    pid: 42,
    startedAt: proc.startedAt,
    version: proc.version,
    sessionId: 'hooks-session',
    generation: 'generation-one',
    turnId: 'turn-one',
    cwd: '/project',
    state: 'idle',
    updatedAt: NOW - 3_600_000,
    configDirectory: '/fixture/claude',
    establishedBy: 'SessionStart',
    establishedAt: NOW - 3_600_000,
    ...extra,
  };
}
function harness({ mode = 'hooks', record = hookRecord(), inspect } = {}) {
  const b = new Bridge(
    { ...structuredClone(defaults), claude: { enabled: true } },
    async () => {
      throw Error('No native input in enrich tests');
    },
    async () => {},
  );
  const f = { record, mode, now: NOW };
  const controls = new ClaudeControls(b, {
    inspect: inspect || (async () => ({ ...proc })),
    read: async () => {
      if (f.record instanceof Error) throw f.record;
      return { ...f.record };
    },
    now: () => f.now,
    bindingsDefault: () => true,
    setupMode: () => f.mode,
    view: async () => {
      throw Error('No view needed');
    },
  });
  f.enrich = () => controls.enrich({ ...raw });
  f.controls = controls;
  return f;
}

test('hooks-only proof enables an idle session with no status-line report', async () => {
  const f = harness();
  const a = await f.enrich();
  assert.equal(a.nativeVerified, true);
  assert.equal(a.claudeControlsEnabled, true, a.claudeError);
  assert.equal(a.claudeHooksOnly, true);
  assert.equal(a.chatId, 'hooks-session');
  assert.equal(
    f.controls.bindings.get([...f.controls.bindings.keys()][0]).confirmed,
    true,
  );
  // An hour idle is the point of this mode; the 24 h record bound still applies.
  f.now = NOW + 86_400_000;
  assert.equal((await f.enrich()).nativeVerified, false);
});

test('each missing proof keeps hooks-only controls disabled', async () => {
  const disabled = async (f, why) => {
    const a = await f.enrich();
    assert(
      a.nativeVerified === false || a.claudeControlsEnabled === false,
      why,
    );
    return a;
  };
  // Lifecycle: a record from an older hook build, or one established by a
  // non-establishing event, waits for the next prompt.
  let a = await disabled(
    harness({ record: hookRecord({ establishedBy: undefined }) }),
    'no lifecycle proof',
  );
  assert.equal(a.claudeError, 'Wait for a Claude prompt');
  await disabled(
    harness({ record: hookRecord({ establishedBy: 'Stop' }) }),
    'non-establishing event',
  );
  await disabled(
    harness({ record: hookRecord({ establishedAt: NOW + 60_000 }) }),
    'future epoch',
  );
  // Install mode: legacy status-line installs and unknown setups keep the heartbeat.
  a = await disabled(harness({ mode: 'statusline' }), 'legacy install');
  assert.equal(a.claudeError, 'Wait for fresh Claude status line');
  await disabled(harness({ mode: null }), 'unknown setup fails closed');
  // Process: restarted Claude or a reused PID with a new start time.
  await disabled(
    harness({
      inspect: async () => ({ ...proc, startedAt: 'Tue Nov 10 13:00:00 2026' }),
    }),
    'PID reused',
  );
  await disabled(
    harness({ inspect: async () => ({ ...proc, version: '2.1.320' }) }),
    'other version',
  );
  await disabled(
    harness({ inspect: async () => ({ ...proc, pid: 43 }) }),
    'other foreground process',
  );
  // Lifecycle end and lost events.
  await disabled(
    harness({ record: hookRecord({ ended: true }) }),
    'SessionEnd',
  );
  await disabled(
    harness({
      record: Error('Claude lifecycle report was lost; wait for a fresh event'),
    }),
    'invalidated record',
  );
  await disabled(
    harness({ record: hookRecord({ cwd: '/elsewhere' }) }),
    'other folder',
  );
});

test('a different root session (/clear, /resume) re-binds the identity', async () => {
  const f = harness(),
    first = await f.enrich();
  for (const change of [
    { generation: 'generation-two' },
    { sessionId: 'resumed-session' },
  ]) {
    f.record = hookRecord(change);
    const next = await f.enrich();
    assert.notEqual(
      next.nativeIdentity,
      first.nativeIdentity,
      JSON.stringify(change),
    );
    assert.throws(() => f.controls.assert(first, next));
  }
  // /clear through the real reducer starts a new generation and session.
  const p = { ...proc },
    start = S.reduce(
      null,
      {
        hook_event_name: 'SessionStart',
        session_id: 'one',
        cwd: '/project',
        source: 'startup',
      },
      p,
      NOW,
    ),
    cleared = S.reduce(
      start,
      {
        hook_event_name: 'SessionStart',
        session_id: 'two',
        cwd: '/project',
        source: 'clear',
      },
      p,
      NOW + 1,
    );
  assert.equal(cleared.sessionId, 'two');
  assert.notEqual(cleared.generation, start.generation);
  assert.equal(cleared.establishedBy, 'SessionStart');
  // A later event for the old session cannot re-establish it.
  assert.equal(
    S.reduce(
      cleared,
      { hook_event_name: 'Stop', session_id: 'one', cwd: '/project' },
      p,
      NOW + 2,
    ),
    null,
  );
});

test('captions come from SessionStart, PostModelSwitch and tool effort, go stale and never gate controls', async () => {
  const p = { ...proc };
  let r = S.reduce(
    null,
    {
      hook_event_name: 'SessionStart',
      session_id: 'one',
      cwd: '/project',
      source: 'startup',
      model: 'claude-opus-5-5',
    },
    p,
    NOW,
  );
  assert.equal(r.establishedBy, 'SessionStart');
  assert.deepEqual(r.caption, {
    model: 'claude-opus-5-5',
    modelAt: NOW,
    effort: null,
    effortAt: null,
  });
  r = S.reduce(
    r,
    {
      hook_event_name: 'PreToolUse',
      session_id: 'one',
      cwd: '/project',
      tool_name: 'Read',
      tool_input: {},
      effort: { level: 'high' },
    },
    p,
    NOW + 1,
  );
  assert.equal(r.caption.effort, 'high');
  const beforeSwitch = r;
  r = S.reduce(
    r,
    {
      hook_event_name: 'PostModelSwitch',
      session_id: 'one',
      cwd: '/project',
      from_model: 'claude-opus-5-5',
      to_model: 'claude-sonnet-5-5',
      source: 'picker',
      pricing: 'catalog',
      estimated_cache_write_usd: 0.4,
    },
    p,
    NOW + 2,
  );
  assert.equal(r.caption.model, 'claude-sonnet-5-5');
  assert.equal(r.caption.effort, 'high');
  // A model switch is not lifecycle or request activity.
  for (const field of [
    'state',
    'generation',
    'turnId',
    'updatedAt',
    'establishedAt',
    'pendingToolDigest',
  ])
    assert.deepEqual(r[field], beforeSwitch[field], field);
  assert.equal(JSON.stringify(r).includes('pricing'), false);
  assert.equal(JSON.stringify(r).includes('0.4'), false);
  // Invalid captions are ignored, and /clear (no model) resets them.
  assert.equal(
    S.reduce(
      r,
      {
        hook_event_name: 'PostModelSwitch',
        session_id: 'one',
        cwd: '/project',
        to_model: 'bad model\n',
      },
      p,
      NOW + 3,
    ),
    null,
  );
  assert.equal(
    S.reduce(
      r,
      {
        hook_event_name: 'PreToolUse',
        session_id: 'one',
        cwd: '/project',
        tool_name: 'Read',
        effort: { level: 'turbo' },
      },
      p,
      NOW + 3,
    ).caption.effort,
    'high',
  );
  const cleared = S.reduce(
    r,
    {
      hook_event_name: 'SessionStart',
      session_id: 'one',
      cwd: '/project',
      source: 'clear',
    },
    p,
    NOW + 4,
  );
  assert.deepEqual(cleared.caption, {
    model: null,
    modelAt: null,
    effort: null,
    effortAt: null,
  });

  const f = harness({ record: hookRecord({ caption: r.caption }) });
  f.now = NOW + 10;
  let a = await f.enrich();
  assert.equal(a.model, 'claude-sonnet-5-5');
  assert.equal(a.modelName, 'Sonnet 5.5');
  assert.equal(a.effort, 'high');
  assert.equal(a.claudeModelStale, false);
  const bridge = { lastTarget: a, agents: [a] };
  assert.deepEqual(labels.modelLines(bridge), ['Model', 'Sonnet 5.5']);
  assert.deepEqual(labels.effortLines(bridge), ['Effort', 'High']);
  f.now = NOW + S.CAPTION_STALE_MS + 10;
  a = await f.enrich();
  assert.equal(a.claudeModelStale, true);
  assert.equal(a.claudeEffortStale, true);
  assert.equal(a.claudeControlsEnabled, true, 'stale captions never disable');
  const stale = { lastTarget: a, agents: [a] };
  assert.deepEqual(labels.modelLines(stale), ['Model', 'Sonnet 5.5?']);
  assert.deepEqual(labels.effortLines(stale), ['Effort', 'High?']);
  // No caption at all is still enabled, and a caption alone never enables.
  assert.equal((await harness().enrich()).claudeControlsEnabled, true);
  assert.equal(
    (
      await harness({
        record: hookRecord({ establishedBy: undefined, caption: r.caption }),
      }).enrich()
    ).claudeControlsEnabled,
    false,
  );
});

test('hook payload bodies never reach the record', () => {
  const p = { ...proc },
    secrets = [
      'PROMPT-BODY',
      'ASSISTANT-REPLY',
      'TOOL-INPUT',
      'TOOL-OUTPUT',
      '/private/transcript.jsonl',
    ];
  let r = S.reduce(
    null,
    {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'one',
      cwd: '/project',
      prompt: secrets[0],
      transcript_path: secrets[4],
      session_title: 'Named',
    },
    p,
    NOW,
  );
  assert.equal(r.establishedBy, 'UserPromptSubmit');
  assert.equal(r.title, 'Named');
  r = S.reduce(
    r,
    {
      hook_event_name: 'PreToolUse',
      session_id: 'one',
      cwd: '/project',
      tool_name: 'Bash',
      tool_input: { command: secrets[2] },
      effort: { level: 'max' },
    },
    p,
    NOW + 1,
  );
  r = S.reduce(
    r,
    {
      hook_event_name: 'PostToolUse',
      session_id: 'one',
      cwd: '/project',
      tool_name: 'Bash',
      tool_input: { command: secrets[2] },
      tool_response: secrets[3],
    },
    p,
    NOW + 2,
  );
  r = S.reduce(
    r,
    {
      hook_event_name: 'Stop',
      session_id: 'one',
      cwd: '/project',
      last_assistant_message: secrets[1],
    },
    p,
    NOW + 3,
  );
  r = S.reduce(
    r,
    {
      hook_event_name: 'PostModelSwitch',
      session_id: 'one',
      cwd: '/project',
      to_model: 'claude-haiku-5-5',
      requested_model: secrets[0],
    },
    p,
    NOW + 4,
  );
  const stored = JSON.stringify(r);
  for (const secret of secrets)
    assert.equal(stored.includes(secret), false, secret);
  assert.equal(r.caption.model, 'claude-haiku-5-5');
  assert.equal(r.caption.effort, 'max');
});

test('setup mode reads only a private active setup record and fails closed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckshep-claude-mode-'));
  try {
    fs.mkdirSync(path.join(dir, 'state'), { mode: 0o700 });
    const file = path.join(dir, 'state', 'claude-setup.json'),
      write = (value, mode = 0o600) => {
        fs.writeFileSync(file, JSON.stringify(value));
        fs.chmodSync(file, mode);
      },
      record = {
        schema: 1,
        commands: { hook: 'h', status: 'h --statusline' },
        active: true,
      };
    assert.equal(S.setupMode(dir), null, 'missing');
    write({ ...record, statusline: false });
    assert.equal(S.setupMode(dir), 'hooks');
    write({ ...record });
    assert.equal(S.setupMode(dir), 'hooks');
    write({ ...record, statusline: true });
    assert.equal(S.setupMode(dir), 'statusline');
    write({ ...record, active: false });
    assert.equal(S.setupMode(dir), null, 'removed');
    write({ ...record, statusline: false }, 0o622);
    assert.equal(S.setupMode(dir), null, 'writable by others');
    fs.writeFileSync(file, '{not json');
    fs.chmodSync(file, 0o600);
    assert.equal(S.setupMode(dir), null, 'invalid');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PostModelSwitch is an owned hook but not a doctor requirement', () => {
  assert(configure.EVENTS.includes('PostModelSwitch'));
  assert(!configure.REQUIRED_EVENTS.includes('PostModelSwitch'));
  const dir = '/fixture/plugin',
    installed = configure.plan({}, null, { dir, node: '/node' });
  assert.equal(installed.settings.hooks.PostModelSwitch.length, 1);
  assert.equal(
    installed.settings.statusLine,
    undefined,
    'hooks-only install has no status line',
  );
  assert.equal(installed.registry.statusline, false);
  const removed = configure.plan(installed.settings, installed.registry, {
    dir,
    node: '/node',
    remove: true,
  });
  assert.equal(removed.settings.hooks, undefined);
  assert.equal(S.modelLabel('claude-opus-5-5[1m]'), 'Opus 5.5');
  assert.equal(S.modelLabel('opus'), null);
});

test('any native Claude Code release is accepted; no version is pinned', async () => {
  for (const version of ['2.1.319', '2.1.322', '2.2.0', '3.0.0']) {
    const p = { ...proc, version },
      f = harness({
        record: hookRecord({ version }),
        inspect: async () => ({ ...p }),
      });
    const a = await f.enrich();
    assert.equal(a.claudeControlsEnabled, true, version + ': ' + a.claudeError);
    const r = S.reduce(
      null,
      {
        hook_event_name: 'SessionStart',
        session_id: 'hooks-session',
        cwd: '/project',
        source: 'startup',
      },
      p,
      NOW,
    );
    assert.equal(r?.version, version);
  }
  // Non-native executables and malformed versions still never produce records.
  for (const version of [null, undefined, '', '2.1', '2.1.322-beta', 'latest'])
    assert.equal(
      S.reduce(
        null,
        {
          hook_event_name: 'SessionStart',
          session_id: 'hooks-session',
          cwd: '/project',
        },
        { ...proc, version },
        NOW,
      ),
      null,
      String(version),
    );
  // The version still names the process: an update under a live record refuses.
  const f = harness({
    record: hookRecord({ version: '2.1.319' }),
    inspect: async () => ({ ...proc, version: '2.1.322' }),
  });
  assert.equal((await f.enrich()).nativeVerified, false);
});
