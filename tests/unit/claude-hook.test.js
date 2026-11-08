const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { runHook } = require('../../src/agents/claude/hook');
function fixture(text = '{"session_id":"fixture","cwd":"/fixture"}') {
  const effects = [],
    saved = {
      schema: 1,
      active: true,
      commands: { hook: 'fixture-hook', status: 'fixture-status' },
    };
  const ports = {
    async *input() {
      yield Buffer.from(text);
    },
    statusline: false,
    readSetup: () => structuredClone(saved),
    record: async (value, options) => {
      options.beforeCommit();
      effects.push(['record', value]);
    },
    invalidate: async () => {
      effects.push('invalid');
    },
    chain: async (command, bytes) => {
      effects.push(['chain', command, bytes.toString()]);
    },
    write: (text) => effects.push(['text', text]),
  };
  return { ports: { ...ports, input: ports.input() }, effects, saved };
}
test('Claude hook validates bounded data and invalidates lost lifecycle reports without exposing input', async () => {
  const valid = fixture();
  await runHook(valid.ports);
  assert.equal(valid.effects[0][0], 'record');
  for (const text of [
    'not-json',
    '{"session_id":"bad\u0000id"}',
    'x'.repeat(1048577),
  ]) {
    const f = fixture(text);
    await runHook(f.ports);
    assert.deepEqual(f.effects, ['invalid']);
  }
  const disabled = fixture();
  disabled.saved.active = false;
  await runHook(disabled.ports);
  assert.deepEqual(disabled.effects, []);
  const missing = fixture();
  missing.ports.readSetup = () => {
    throw Error('private path');
  };
  await runHook(missing.ports);
  assert.deepEqual(missing.effects, []);
});
test('status-line chaining preserves exact input and removal wins before record commit or chaining', async () => {
  const text =
    '{"session_id":"fixture","cwd":"/fixture","model":{"display_name":"Fixture model"},"effort":{"level":"low"}}';
  const plain = fixture(text);
  plain.ports.statusline = true;
  await runHook(plain.ports);
  assert.deepEqual(plain.effects.at(-1), [
    'text',
    'Claude Fixture model · low',
  ]);
  const chained = fixture(text);
  chained.saved.originalStatusLine = { command: 'owned-command' };
  chained.ports.statusline = true;
  await runHook(chained.ports);
  assert.deepEqual(chained.effects.at(-1), ['chain', 'owned-command', text]);
  const removed = fixture(text);
  removed.ports.statusline = true;
  removed.ports.record = async (_data, options) => {
    removed.saved.active = false;
    options.beforeCommit();
    removed.effects.push('unsafe');
  };
  await runHook(removed.ports);
  assert.deepEqual(removed.effects, []);
  const invalid = fixture('invalid');
  invalid.ports.statusline = true;
  await runHook(invalid.ports);
  assert.deepEqual(invalid.effects, []);
});

test('status-line defaults and changed registration commands remain private and fail closed', async () => {
  const missing = fixture('{}');
  missing.ports.statusline = true;
  await runHook(missing.ports);
  assert.deepEqual(missing.effects.at(-1), ['text', 'Claude ']);
  for (const key of ['hook', 'status']) {
    const f = fixture();
    f.ports.statusline = true;
    f.ports.record = async (_value, options) => {
      f.saved.commands[key] = 'changed';
      options.beforeCommit();
      f.effects.push('unsafe');
    };
    await runHook(f.ports);
    assert.deepEqual(f.effects, []);
  }
});
