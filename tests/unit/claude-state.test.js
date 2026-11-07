'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const S = require('../../com.local.rexagents.sdPlugin/claude-state');
(async () => {
  const own = await S.processInfo(process.pid);
  assert.equal(own.pid, process.pid);
  assert(own.startedAt);
  const executableDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'switchboard-claude-image-'),
    ),
    image = path.join(executableDir, 'claude/versions/2.1.319');
  fs.mkdirSync(path.dirname(image), { recursive: true });
  fs.writeFileSync(image, 'fixture');
  try {
    const state =
      String(process.getuid()) + ' 1 Sat Nov 7 12:00:00 2026 claude\n';
    const found = await S.processInfo(42, async (file) =>
      file === '/bin/ps' ? state : 'p42\nftxt\nn' + image + '\n',
    );
    assert.equal(found.version, '2.1.319');
    assert.equal(found.executable, image);
    const spoof = await S.processInfo(42, async (file) =>
      file === '/bin/ps' ? state : 'p42\nftxt\nn/bin/sh\n',
    );
    assert.equal(
      spoof.version,
      null,
      'a Claude-looking argv0 cannot establish native executable identity',
    );
    let reads = 0;
    await assert.rejects(
      () =>
        S.processInfo(42, async (file) =>
          file === '/bin/ps'
            ? ++reads === 1
              ? state
              : state.replace('12:00:00', '12:01:00')
            : 'p42\nftxt\nn' + image + '\n',
        ),
      /replaced/,
    );
  } finally {
    fs.rmSync(executableDir, { recursive: true, force: true });
  }
  const p = {
      pid: 42,
      ppid: 1,
      startedAt: 'Fri Nov 6 12:00:00 2026',
      version: '2.1.319',
    },
    a = { pid: 42, cwd: '/project' },
    base = {
      session_id: 'chat-one',
      cwd: '/project',
      permission_mode: 'default',
    },
    event = (hook, fields = {}) => ({
      ...base,
      hook_event_name: hook,
      ...fields,
    });
  let n = 0;
  const id = () => String(++n);
  let r = S.reduce(
    null,
    event('SessionStart', {
      session_title: 'Named chat',
      model: 'secret-ignored',
      transcript_path: '/PRIVATE_TRANSCRIPT',
    }),
    p,
    1000,
    id,
  );
  assert.equal(r.state, 'idle');
  assert.equal(r.title, 'Named chat');
  assert.equal(r.model, null);
  assert.equal(S.validate(r, a, p, 1000), r);
  for (const patch of [
    { pid: 43 },
    { startedAt: 'reused PID' },
    { version: '2.1.320' },
    { cwd: '/other' },
    { ended: true },
    { updatedAt: 2002 },
    { state: 'blocked', kind: 'permission', requestId: null },
  ])
    assert.throws(() => S.validate({ ...r, ...patch }, a, p, 1000));
  assert.throws(() => S.validate(r, a, p, 86402000));
  r = S.reduce(
    r,
    {
      ...base,
      model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' },
      effort: { level: 'high' },
      session_name: 'Renamed chat',
      prompt_id: 'native-prompt-id',
      vim: { mode: 'INSERT' },
      cost: { private: 'SECRET_COST' },
      transcript_path: 'PRIVATE',
    },
    p,
    1100,
    id,
    true,
  );
  assert.equal(r.title, 'Renamed chat');
  assert.equal(r.promptId, 'native-prompt-id');
  assert.equal(r.model, 'claude-sonnet-4-6');
  assert.equal(r.effort, 'high');
  assert.equal(r.vimMode, 'INSERT');
  assert(!JSON.stringify(r).includes('PRIVATE'));
  assert(!JSON.stringify(r).includes('SECRET'));
  assert.equal(
    S.reduce(
      r,
      { ...base, session_id: 'child', model: { id: 'untrusted' } },
      p,
      1101,
      id,
      true,
    ),
    null,
  );
  assert.equal(
    S.reduce(r, { ...base, agent: { name: 'subagent' } }, p, 1102, id, true),
    null,
  );
  const rootGeneration = r.generation;
  r = S.reduce(
    r,
    event('UserPromptSubmit', {
      prompt: 'PRIVATE_PROMPT',
      transcript_path: 'PRIVATE',
    }),
    p,
    1200,
    id,
  );
  const turn = r.turnId;
  assert.equal(r.state, 'working');
  assert(!JSON.stringify(r).includes('PRIVATE'));
  assert.equal(
    S.reduce(
      r,
      event('Stop', { agent_id: 'child', last_assistant_message: 'SECRET' }),
      p,
      1201,
      id,
    ),
    null,
  );
  r = S.reduce(
    r,
    event('PreToolUse', {
      tool_name: 'AskUserQuestion',
      tool_use_id: 'tool-q',
      tool_input: { questions: ['PRIVATE QUESTION'] },
    }),
    p,
    1300,
    id,
  );
  assert.equal(r.state, 'blocked');
  assert.equal(r.kind, 'question');
  assert(!JSON.stringify(r).includes('PRIVATE'));
  const initialQuestion = r.requestId;
  r = S.reduce(
    r,
    event('PermissionRequest', {
      tool_name: 'AskUserQuestion',
      tool_input: { questions: ['PRIVATE QUESTION'] },
    }),
    p,
    1310,
    id,
  );
  assert.equal(
    r.kind,
    'question',
    'manual-mode permission hook for AskUserQuestion remains a question',
  );
  assert.equal(r.toolId, 'tool-q');
  assert.equal(
    r.requestId,
    initialQuestion,
    'an ID-less permission event preserves the same exact tool request',
  );
  const different = S.reduce(
    r,
    event('PermissionRequest', {
      tool_name: 'AskUserQuestion',
      tool_input: { questions: ['DIFFERENT PRIVATE QUESTION'] },
    }),
    p,
    1320,
    id,
  );
  assert.equal(
    different.toolId,
    null,
    'a different tool body cannot inherit the old completion ID',
  );
  assert.equal(
    S.reduce(
      different,
      event('PostToolUse', { tool_use_id: 'tool-q' }),
      p,
      1330,
      id,
    ),
    null,
  );
  const questionId = r.requestId;
  assert.equal(
    S.reduce(r, event('PostToolUse', { tool_use_id: 'other' }), p, 1350, id),
    null,
  );
  assert.equal(
    S.reduce(r, event('PreToolUse', { tool_name: 'Bash' }), p, 1350, id),
    null,
    'parallel tool cannot dismiss waiting request',
  );
  r = S.reduce(
    r,
    event('PostToolUse', {
      tool_use_id: 'tool-q',
      tool_response: 'PRIVATE ANSWERS',
    }),
    p,
    1400,
    id,
  );
  assert.equal(r.state, 'working');
  assert.equal(r.turnId, turn);
  assert.equal(r.requestId, null);
  assert.equal(r.pendingToolId, null);
  assert.equal(r.pendingToolDigest, null);
  let command = S.reduce(
    r,
    event('PreToolUse', {
      tool_name: 'Bash',
      tool_use_id: 'command-one',
      tool_input: { command: 'PRIVATE COMMAND' },
    }),
    p,
    1410,
    id,
  );
  command = S.reduce(
    command,
    event('PermissionRequest', {
      tool_name: 'Bash',
      tool_input: { command: 'PRIVATE COMMAND' },
    }),
    p,
    1420,
    id,
  );
  assert.equal(command.toolId, 'command-one');
  assert(!JSON.stringify(command).includes('PRIVATE'));
  command = S.reduce(
    command,
    event('PostToolUseFailure', { tool_use_id: 'command-one' }),
    p,
    1430,
    id,
  );
  assert.equal(command.state, 'working');
  const nextTurn = S.reduce(
    S.reduce(
      r,
      event('PreToolUse', {
        tool_name: 'Bash',
        tool_use_id: 'old',
        tool_input: { command: 'PRIVATE COMMAND' },
      }),
      p,
      1410,
      id,
    ),
    event('UserPromptSubmit'),
    p,
    1440,
    id,
  );
  assert.equal(
    S.reduce(
      nextTurn,
      event('PermissionRequest', {
        tool_name: 'Bash',
        tool_input: { command: 'PRIVATE COMMAND' },
      }),
      p,
      1450,
      id,
    ).toolId,
    null,
    'old-turn tool IDs cannot grant completion authority',
  );
  r = S.reduce(
    r,
    event('PermissionRequest', {
      tool_name: 'Bash',
      tool_use_id: 'tool-p',
      tool_input: { command: 'PRIVATE COMMAND' },
    }),
    p,
    1500,
    id,
  );
  assert.equal(r.kind, 'permission');
  assert.notEqual(r.requestId, questionId);
  assert(!JSON.stringify(r).includes('PRIVATE'));
  assert.equal(
    S.reduce(
      r,
      event('Notification', {
        notification_type: 'permission_prompt',
        message: 'text',
      }),
      p,
      1501,
      id,
    ),
    null,
  );
  r = S.reduce(
    r,
    event('Stop', { last_assistant_message: 'PRIVATE RESULT' }),
    p,
    1600,
    id,
  );
  assert.equal(r.state, 'done');
  assert.equal(r.requestId, null);
  assert.equal(
    S.reduce(r, event('PreToolUse'), p, 1500, id),
    null,
    'late earlier event refused',
  );
  r = S.reduce(r, event('SessionStart', { source: 'clear' }), p, 1700, id);
  assert.notEqual(r.generation, rootGeneration);
  assert.equal(r.state, 'idle');
  r = S.reduce(r, event('SessionEnd'), p, 1800, id);
  assert(r.ended);
  assert.throws(() => S.validate(r, a, p, 1800));
  assert.equal(S.reduce(null, event('Stop'), p, 1, id), null);
  assert.equal(
    S.reduce(null, event('SessionStart'), { ...p, version: 'future' }, 1, id),
    null,
  );
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'switchboard-claude-state-'));
  fs.chmodSync(d, 0o700);
  try {
    assert.equal(S.defaultBindings(d), true);
    fs.writeFileSync(path.join(d, 'keybindings.json'), '{}');
    assert.equal(S.defaultBindings(d), false);
    fs.unlinkSync(path.join(d, 'keybindings.json'));
    const inspect = async (pid) =>
      pid === 77 ? { pid, ppid: 42, version: null } : p;
    await S.record(event('SessionStart'), {
      dir: d,
      inspect,
      parent: 77,
      now: 2000,
    });
    assert.equal(S.readRecord(42, d).sessionId, 'chat-one');
    assert.equal(fs.statSync(path.join(d, '42.json')).mode & 0o777, 0o600);
    fs.writeFileSync(path.join(d, '42.lock'), '');
    assert.equal(
      await S.record(event('UserPromptSubmit'), {
        dir: d,
        inspect,
        parent: 77,
        now: 2100,
        lockTimeoutMs: 0,
      }),
      null,
    );
    fs.unlinkSync(path.join(d, '42.lock'));
    assert.throws(
      () => S.readRecord(42, d),
      'a skipped lifecycle report invalidates stale authority',
    );
    await S.record(event('UserPromptSubmit'), {
      dir: d,
      inspect,
      parent: 77,
      now: 2150,
    });
    assert.equal(S.readRecord(42, d).state, 'working');
    await S.invalidate({ dir: d, inspect, parent: 77 });
    assert.throws(() => S.readRecord(42, d));
    await S.record(event('PostToolUse', { tool_use_id: 'parallel' }), {
      dir: d,
      inspect,
      parent: 77,
      now: 2155,
    });
    assert.throws(
      () => S.readRecord(42, d),
      'a tool callback cannot repair a lost input epoch',
    );
    await S.record(event('UserPromptSubmit'), {
      dir: d,
      inspect,
      parent: 77,
      now: 2160,
    });
    assert.equal(S.readRecord(42, d).state, 'working');
    await S.record(
      { ...base, session_id: 'another-root', model: { id: 'claude-test' } },
      { dir: d, inspect, parent: 77, now: 2170, statusline: true },
    );
    assert.throws(
      () => S.readRecord(42, d),
      'a different status-line session revokes stale root authority',
    );
    await S.record(
      { ...base, model: { id: 'claude-test' } },
      { dir: d, inspect, parent: 77, now: 2180, statusline: true },
    );
    assert.throws(
      () => S.readRecord(42, d),
      'metadata refresh cannot repair invalid identity',
    );
    await S.record(event('UserPromptSubmit'), {
      dir: d,
      inspect,
      parent: 77,
      now: 2190,
    });
    assert.equal(S.readRecord(42, d).state, 'working');
    await Promise.all([
      S.record(event('PreToolUse', { tool_name: 'Read' }), {
        dir: d,
        inspect,
        parent: 77,
        now: 2191,
      }),
      S.record(event('PreToolUse', { tool_name: 'Read' }), {
        dir: d,
        inspect,
        parent: 77,
        now: 2192,
      }),
    ]);
    assert.equal(
      S.readRecord(42, d).state,
      'working',
      'concurrent ordinary lifecycle writes serialize without revoking identity',
    );
    let count = 0;
    await assert.rejects(() =>
      S.record(event('UserPromptSubmit'), {
        dir: d,
        inspect: async (pid) =>
          pid === 77
            ? { pid, ppid: 42 }
            : ++count > 1
              ? { ...p, startedAt: 'replaced' }
              : p,
        parent: 77,
        now: 2200,
      }),
    );
    fs.chmodSync(path.join(d, '42.json'), 0o644);
    assert.throws(() => S.readRecord(42, d));
    fs.unlinkSync(path.join(d, '42.json'));
    fs.symlinkSync('/dev/null', path.join(d, '42.json'));
    assert.throws(() => S.readRecord(42, d));
    fs.chmodSync(d, 0o755);
    assert.throws(() => S.readRecord(42, d));
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
  console.log(
    'PASS Claude metadata privacy, root/subagent isolation, lifecycle/request epochs, version/cwd/PID-reuse guards, exact tool completion, private atomic records and no authority from status-line callbacks',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
