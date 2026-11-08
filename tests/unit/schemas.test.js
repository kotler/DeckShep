const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../src/schemas');
const record = { schema: 1, pid: 42, startedAt: 'start', version: '2.1.319', cwd: '/fixture', sessionId: 'session-1', generation: 'generation', turnId: 'turn', state: 'idle', updatedAt: 1 };
const cases = {
  config: { backend: 'rex', allowClipboardFocus: false },
  globalSettings: { version: 2, revision: 0, shared: {}, profiles: {} },
  rexResponse: { content: '\u001b[2Jnative view\n' },
  visiblePane: { block_id: 'block:11111111-1111-1111-1111-111111111111', clipboard_restored: true },
  herdrFrame: { id: 1, result: { protocol: 22 } }, daemonFrame: { id: 1, result: {} },
  claudePayload: { session_id: 'fixture', cwd: '/fixture', prompt: 'line one\nline two' },
  claudeRecord: record, claudeSettings: { hooks: {} },
  setupRecord: { schema: 1, commands: { hook: 'node hook.js', status: 'node hook.js --statusline' } },
  modelCatalog: { models: [] }, hostEvent: { event: 'willAppear', context: 'key', payload: {} }, registry: {},
};
for (const [name, value] of Object.entries(cases)) test(`${name}: bounded valid/invalid/oversized/control-character external data`, () => {
  assert.deepEqual(S.parse(name, JSON.stringify(value)), value);
  assert.throws(() => S.parse(name, 'undefined'));
  assert.throws(() => S.parse(name, JSON.stringify({ ...value, enormous: 'x'.repeat(4000001) })));
  assert.throws(() => S.validate(name, { ...value, ['unsafe\x00key']: true }));
  assert.throws(() => S.parse(name, '{"__proto__":{"polluted":true}}'));
});
test('identity formats, versions, opt-ins and global preference versions fail closed', () => {
  for (const [schema, bad] of [[S.blockId, 'block:'.padEnd(42, '-')], [S.sessionId, 'id\x1b'], [S.version, '2.1.319\n'], [S.identifier, 'secret\0']]) assert.equal(schema.safeParse(bad).success, false);
  for (const bad of [{ allowClipboardFocus: 'true' }, { claude: { enabled: 1 } }, { herdr: { titleIdentity: 'yes' } }, { prompts: { review: '/submit' } }]) assert.throws(() => S.validate('config', bad));
  assert.throws(() => S.validate('globalSettings', { version: 99 }));
  assert.throws(() => S.validate('globalSettings', { version: 2, revision: -1, profiles: {} }));
  let deep = {}; for (let i = 0; i < 45; i++) deep = { child: deep };
  assert.throws(() => S.validate('registry', deep));
});
