'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { Bridge } = require('../../com.local.rexagents.sdPlugin/core'),
  {
    composerSnapshot,
  } = require('../../com.local.rexagents.sdPlugin/native-input');
const defaults = require('../../com.local.rexagents.sdPlugin/config.json');
function fixture() {
  const a = {
      session: 's',
      block: 'b',
      app: 'codex',
      pid: 42,
      name: 'codex',
      cwd: '/project',
      state: 'idle',
    },
    calls = [];
  let input = {
    chatId: 'chat',
    turnStamp: 'turn-1',
    hash: 'empty',
    empty: true,
    cursor: { row: 2, column: 3 },
  };
  const b = new Bridge(defaults, async (args, text) => {
    calls.push({ args, text });
    if (args[0] === 'send')
      input = {
        ...input,
        empty: false,
        hash: 'staged',
        cursor: { row: 2, column: 30 },
      };
  });
  b.focused = async () => ({ ...a });
  b.checked = async () => ({ ...a });
  b.method = async () => ({ modes: [{ number: 2004, set: true }] });
  b.readStagedComposer = async () => structuredClone(input);
  return {
    b,
    a,
    calls,
    get input() {
      return input;
    },
    set input(value) {
      input = value;
    },
  };
}
test('staged send', async () => {
  const id = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
  const empty = composerSnapshot(
    '› Ghost suggestion\n\n  ' + id + ' · GPT-6-Luna',
    { row: 1, column: 3 },
    id,
    { allowEmpty: true },
  );
  assert(empty.empty);
  assert(!JSON.stringify(empty).includes('Ghost'));
  const f = fixture();
  await f.b.stage('review');
  assert(f.b.draft.snapshot);
  assert(!JSON.stringify(f.b.draft).includes(defaults.prompts.review));
  await f.b.send();
  assert.equal(f.calls.filter((c) => c.args[0] === 'send-key').length, 1);
  await assert.rejects(() => f.b.send(), /No recent/);
  for (const patch of [
    { hash: 'edited' },
    { hash: 'empty', empty: true },
    { chatId: 'new-chat' },
    { turnStamp: 'turn-2' },
    { cursor: { row: 2, column: 9 } },
  ]) {
    const f = fixture();
    await f.b.stage('tests');
    f.input = { ...f.input, ...patch };
    await assert.rejects(() => f.b.send(), /Draft changed/);
    assert.equal(f.b.draft, null);
    assert.equal(f.calls.filter((c) => c.args[0] === 'send-key').length, 0);
  }
  // A manually submitted prompt that is retyped identically is still a different turn.
  const manual = fixture();
  await manual.b.stage('continue');
  manual.input = { ...manual.input, turnStamp: 'new-completed-turn' };
  await assert.rejects(() => manual.b.send());
  assert(!manual.calls.some((c) => c.args[0] === 'send-key'));
  const changed = fixture();
  await changed.b.stage('review');
  let read = 0;
  changed.b.readStagedComposer = async () => ({
    ...changed.input,
    hash: ++read === 1 ? 'staged' : 'changed-during-send',
  });
  await assert.rejects(() => changed.b.send());
  assert(!changed.calls.some((c) => c.args[0] === 'send-key'));
  const focus = fixture();
  await focus.b.stage('review');
  let checked = 0;
  focus.b.checked = async () => {
    if (++checked === 3) throw Error('Focus changed');
    return focus.a;
  };
  await assert.rejects(() => focus.b.send());
  assert(!focus.calls.some((c) => c.args[0] === 'send-key'));
  const failedRead = fixture();
  await failedRead.b.stage('review');
  failedRead.b.readStagedComposer = async () => {
    throw Error('Offline');
  };
  await assert.rejects(() => failedRead.b.send());
  assert.equal(failedRead.b.draft, null);
  const timeout = fixture();
  await timeout.b.stage('review');
  timeout.b.run = async (args) => {
    timeout.calls.push({ args });
    throw Error('timeout');
  };
  await assert.rejects(() => timeout.b.send());
  await assert.rejects(() => timeout.b.send());
  assert.equal(timeout.calls.filter((c) => c.args[0] === 'send-key').length, 1);
  const wrong = fixture();
  wrong.a.app = 'claude-code';
  await assert.rejects(() => wrong.b.stage('review'), /Reselect Claude agent/);
  assert.equal(wrong.calls.length, 0);
  const preflight = fixture();
  preflight.b.readStagedComposer = async () => {
    throw Error('Unknown composer');
  };
  await assert.rejects(() => preflight.b.stage('review'));
  assert.equal(preflight.calls.length, 0);
  const pasteTimeout = fixture();
  pasteTimeout.b.run = async (args) => {
    pasteTimeout.calls.push({ args });
    throw Error('timeout');
  };
  await assert.rejects(() => pasteTimeout.b.stage('review'));
  assert.equal(pasteTimeout.b.draft, null);
  assert.equal(pasteTimeout.calls.length, 1);
  console.log(
    'PASS staged Send checks content/chat/turn/cursor, manual submission and edits, two-read stability, final focus, no retries, unsupported agents and digest-only storage',
  );
});
