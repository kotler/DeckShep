const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppCodexControls } = require('../../src/app/herdr-app-codex');

const terminal = { address: 't2', pid: 42, cwd: '/w', title: 'abc...' };
function setup({ change } = {}) {
  const log = [];
  let reads = 0;
  const core = {
    async terminal(address) {
      log.push('core:' + address);
      reads++;
      return change && reads > 1 ? { ...terminal, pid: 43 } : terminal;
    },
  };
  const identity = {
    async resolve(agent, title) {
      log.push('identity:' + agent.pid + ':' + title);
      return { chatId: 'chat-' + agent.pid, nativeIdentity: 'sock' };
    },
  };
  const daemon = (bridge, { footer }) => ({
    async cycleEffort(agent) {
      assert.equal(await footer(), 'chat-42');
      await bridge.checked(agent, true);
      await bridge.deliverMutation(
        agent,
        'thread/settings/update',
        (before) => {
          before();
          log.push('write');
          return Promise.resolve();
        },
      );
      await assert.rejects(
        bridge.deliverMutation(agent, 'thread/settings/update', async () => {}),
        /no input sent/,
      );
      return { kind: 'effort', label: 'high' };
    },
    async cycle(agent) {
      await bridge.deliverMutation(agent, 'turn/start', async () => {});
    },
  });
  return {
    log,
    core,
    controls: new AppCodexControls({ config: () => ({}), identity, daemon }),
  };
}
test('daemon controls bind through core facts and title identity, guard the single write', async () => {
  const { log, core, controls } = setup();
  const guards = [];
  const result = await controls.run('effort', core, 't2', () =>
    guards.push(log.length),
  );
  assert.deepEqual(result, { kind: 'effort', label: 'high' });
  assert.equal(log.filter((entry) => entry === 'write').length, 1);
  assert.equal(
    guards.length,
    1,
    'press guard runs immediately before the write',
  );
  assert(log.every((entry) => !entry.startsWith('keys')));
  assert.equal(log.filter((entry) => entry.startsWith('identity')).length, 3);
});
test('a changed process refuses before any write and other methods are denied', async () => {
  const changed = setup({ change: true });
  await assert.rejects(
    changed.controls.run('effort', changed.core, 't2', () => {}),
    /changed/,
  );
  assert(!changed.log.includes('write'));
  const other = setup();
  await assert.rejects(
    other.controls.run('model', other.core, 't2', () => {}),
    /no input sent/,
  );
  const revoked = setup();
  await assert.rejects(
    revoked.controls.run('effort', revoked.core, 't2', () => {
      throw Error('Request stale');
    }),
    /stale/,
  );
  assert(!revoked.log.includes('write'));
});
