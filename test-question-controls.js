'use strict';
const assert = require('node:assert/strict');
const { Bridge } = require('./com.local.rexagents.sdPlugin/core');
function fixture(first = {}, second = {}) {
  const agent = {
      session: 's',
      block: 'b',
      pid: 42,
      name: 'codex',
      app: 'codex',
      state: 'blocked',
      kind: 'question',
      ...first,
    },
    sent = [];
  const bridge = new Bridge(
    { controlVerified: { codex: true } },
    async (args) => {
      sent.push(args);
    },
  );
  let reads = 0;
  bridge.focused = async () =>
    ++reads === 1 ? agent : { ...agent, ...second };
  bridge.draft = { unsent: true };
  bridge.picker = null;
  return { bridge, sent };
}
(async () => {
  for (const key of [
    'up',
    'down',
    'left',
    'right',
    'escape',
    'tab',
    'shift+tab',
    'enter',
  ]) {
    const f = fixture(),
      draft = f.bridge.draft;
    await f.bridge.questionKey(key);
    assert.deepEqual(f.sent, [['send-key', '-s', 's', '-b', 'b', key]]);
    assert.equal(f.bridge.draft, draft);
  }
  for (const invalid of [
    { kind: 'permission' },
    { kind: 'auth' },
    { kind: undefined },
    { state: 'idle' },
    { state: 'done' },
    { state: 'working' },
    { state: 'unknown' },
    { app: 'claude-code' },
  ]) {
    const f = fixture(invalid);
    await assert.rejects(() => f.bridge.questionKey('enter'));
    assert.equal(f.sent.length, 0);
    const changed = fixture({}, invalid);
    await assert.rejects(() => changed.bridge.questionKey('enter'));
    assert.equal(changed.sent.length, 0);
  }
  for (const changed of [
    { pid: 43 },
    { block: 'different' },
    { session: 'other' },
    { name: 'other' },
  ]) {
    const f = fixture({}, changed);
    await assert.rejects(
      () => f.bridge.questionKey('enter'),
      /Focus or process changed/,
    );
    assert.equal(f.sent.length, 0);
  }
  const disabled = fixture();
  disabled.bridge.config.controlVerified.codex = false;
  await assert.rejects(() => disabled.bridge.questionKey('enter'));
  assert.equal(disabled.sent.length, 0);
  for (const invalid of ['space', 'y', '1', 'ctrl+c', 'enter enter']) {
    const f = fixture();
    await assert.rejects(() => f.bridge.questionKey(invalid));
    assert.equal(f.sent.length, 0);
  }
  const answered = fixture();
  let current = {
    session: 's',
    block: 'b',
    pid: 42,
    name: 'codex',
    app: 'codex',
    state: 'blocked',
    kind: 'question',
  };
  answered.bridge.focused = async () => current;
  await answered.bridge.questionKey('enter');
  current = { ...current, state: 'working', kind: undefined };
  await assert.rejects(() => answered.bridge.questionKey('enter'));
  assert.equal(answered.sent.length, 1);
  console.log(
    'PASS question-only native key routing, one key per press, draft preservation, approval/auth/composer refusal, changing state/focus/process guards and no repeated submission after a question completes',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
