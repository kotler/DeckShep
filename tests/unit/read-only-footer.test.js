'use strict';
// Owner rule (2026-11-08): DeckShep never changes a Codex status line. The Rex
// setup step only checks the user's own session-ID footer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { check, FOOTER_HELP } = require('../../src/agents/codex/setup-daemon');
const { AgentMetadata } = require('../../src/agents/codex/metadata');
const L = require('../../src/domain/labels');
const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
const agent = () => ({
  session: 's',
  block: 'b',
  pid: 42,
  app: 'codex',
  cwd: '/work/project',
  state: 'idle',
});
const missing = () =>
  Object.assign(Error('No footer ID'), { code: 'FOOTER_MISSING' });
function daemon(cwd = '/work/project') {
  const calls = [];
  return {
    calls,
    rpc: {
      request: async (method, params) => {
        calls.push(method);
        if (method === 'thread/loaded/list')
          return { data: [id], nextCursor: null };
        if (method === 'thread/read')
          return {
            thread: {
              id,
              cwd,
              model: 'gpt-6-luna',
              reasoningEffort: 'high',
              status: { type: 'idle' },
            },
          };
        throw Error('Unexpected method ' + method);
      },
      close() {
        calls.push('close');
      },
    },
  };
}
// Records every bridge call; any input, focus or preset write fails the test.
function recordingBridge() {
  const calls = [];
  const refuse = (name) => async () => {
    throw Error('read-only check called ' + name);
  };
  return {
    calls,
    bridge: {
      run: async (args) => {
        calls.push(args);
        if (['send', 'send-key'].includes(args[0]))
          throw Error('read-only check sent input');
        return { content: '' };
      },
      focus: refuse('focus'),
      checked: refuse('checked'),
    },
  };
}
test('footer check binds a loaded chat in the pane folder without sending input', async () => {
  const { calls, bridge } = recordingBridge(),
    d = daemon();
  const result = await check(bridge, agent(), {
    footer: async () => id,
    socketFor: async () => ({ pid: 42, socket: '/private.sock' }),
    connect: async () => d.rpc,
  });
  assert.deepEqual(result, {
    pid: 42,
    threadId: id,
    model: 'gpt-6-luna',
    effort: 'high',
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(d.calls, ['thread/loaded/list', 'thread/read', 'close']);
});
test('a footer without a session ID explains how to enable it and touches nothing', async () => {
  const { calls, bridge } = recordingBridge();
  let connected = false;
  await assert.rejects(
    () =>
      check(bridge, agent(), {
        footer: async () => {
          throw missing();
        },
        socketFor: async () => {
          connected = true;
          return { socket: '/private.sock' };
        },
      }),
    (error) => error.message === FOOTER_HELP,
  );
  assert(FOOTER_HELP.length <= 160);
  assert.match(FOOTER_HELP, /\/statusline session-id model-with-reasoning/);
  assert.equal(connected, false);
  assert.deepEqual(calls, []);
});
test('footer check refuses a chat from another folder and other read failures', async () => {
  const { bridge } = recordingBridge(),
    d = daemon('/elsewhere');
  await assert.rejects(
    () =>
      check(bridge, agent(), {
        footer: async () => id,
        socketFor: async () => ({ socket: '/private.sock' }),
        connect: async () => d.rpc,
      }),
    /does not match thread/,
  );
  assert.equal(d.calls.at(-1), 'close');
  await assert.rejects(
    () =>
      check(bridge, agent(), {
        footer: async () => {
          throw Error('Session footer unavailable; check Rex');
        },
      }),
    /Session footer unavailable/,
  );
});
test('no source path can type or store a /statusline command', () => {
  const root = path.join(__dirname, '../../src'),
    offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(ts|mts|js)$/.test(entry.name)) {
        const text = fs.readFileSync(file, 'utf8');
        // A string literal that starts with the command could be sent as input.
        if (/['"`]\/statusline\b/.test(text))
          offenders.push(path.relative(root, file));
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
function metadataFixture(footer) {
  const a = agent(),
    bridge = { config: { metadataRefreshMs: 4000 }, agents: [a] },
    d = daemon();
  let time = 1000;
  const reader = new AgentMetadata(bridge, {
    now: () => (time += 10000),
    socketFor: async () => ({ socket: '/private.sock' }),
    footer: async () => footer.value(),
    connect: async () => d.rpc,
    settings: async () => {
      throw Error('not needed');
    },
  });
  return { a, reader };
}
test('metadata marks only a missing footer ID and clears it once the footer shows one', async () => {
  const footer = { value: () => Promise.reject(missing()) },
    { a, reader } = metadataFixture(footer);
  await reader.refresh([a]);
  assert.equal(a.footerMissing, true);
  assert.equal(a.chatId, undefined);
  footer.value = async () => id;
  await reader.refresh([a], true);
  assert.equal(a.footerMissing, false);
  assert.equal(a.chatId, id);
  footer.value = () => Promise.reject(Error('Session footer unavailable'));
  await reader.refresh([a], true);
  assert.equal(a.footerMissing, false, 'other failures keep generic behaviour');
});
test('Codex keys say No footer ID; other agents are unaffected', () => {
  const a = { ...agent(), footerMissing: true },
    bridge = { lastTarget: a, agents: [a] };
  assert.deepEqual(L.modelLines(bridge), ['Model', 'No footer ID']);
  assert.deepEqual(L.effortLines(bridge), ['Effort', 'No footer ID']);
  assert.deepEqual(L.modeLines(bridge), ['Mode', 'No footer ID']);
  assert.deepEqual(L.reviewerLines(bridge), ['Reviewer', 'No footer ID']);
  for (const line of ['No footer ID']) assert(line.length <= 15);
  const claude = { ...a, app: 'claude-code' };
  assert.equal(L.footerMissing(claude), false);
  assert.deepEqual(L.modeLines({ lastTarget: claude, agents: [claude] }), [
    'Mode',
    'Use keyboard',
  ]);
  const ready = { ...a, footerMissing: false, model: 'gpt-6-luna' };
  assert.notDeepEqual(L.modelLines({ lastTarget: ready, agents: [ready] }), [
    'Model',
    'No footer ID',
  ]);
});
