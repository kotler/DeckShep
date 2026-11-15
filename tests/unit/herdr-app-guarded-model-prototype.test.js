const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  GuardedModelPrototype,
} = require('../helpers/herdr-app-guarded-model-prototype');
function fixture() {
  const p = new GuardedModelPrototype();
  p.now += 350;
  return p;
}
for (const route of ['native', 'api']) {
  test(`${route} reference receiver advances once in Rex order, wraps and preserves effort and the other chat`, async () => {
    const p = fixture(),
      other = structuredClone(p.screens.get('chat-b'));
    for (const model of ['Beta', 'Gamma', 'Alpha']) {
      const result = await p.run(route);
      assert.equal(result.kind, 'confirmed');
      assert.equal(result.model, model);
      assert.equal(result.effort, 'High');
    }
    assert.deepEqual(structuredClone(p.screens.get('chat-b')), other);
    assert.equal(p.calls.length, 3);
  });
  for (const change of [
    'focus',
    'app',
    'aba',
    'working',
    'expiry',
    'revoke',
    'source',
    'core',
    'connection',
    'terminal',
    'cli',
    'chat',
    'view',
  ]) {
    test(`${route} recipient rejects held first effect after ${change}`, async () => {
      const p = fixture(),
        hold = p.holdNextEffect();
      const run = p.run(route);
      await hold.accepted;
      if (change === 'focus') p.focus('chat-b');
      if (change === 'app') p.binding.appLifetime = 'replacement';
      if (change === 'aba') {
        p.focus('chat-b');
        p.focus('chat-a');
      }
      if (change === 'working') p.startWork();
      if (change === 'expiry') p.now += 2000;
      if (change === 'revoke')
        assert.deepEqual(p.invalidate(), { pending: false, effects: 0 });
      if (change === 'source') p.binding.source = 'replacement';
      if (change === 'core') p.binding.coreLifetime = 'other-core-same-t1';
      if (change === 'connection') p.binding.connection++;
      if (change === 'terminal') p.binding.terminalLifetime = 'replacement';
      if (change === 'cli') p.binding.cliLifetime = 'same-pid-new-start';
      if (change === 'chat') p.binding.chat = 'chat-b';
      if (change === 'view') p.screens.get('chat-a').draft = 'new draft';
      hold.release();
      assert.deepEqual(await run, { kind: 'refused', effects: 0 });
      assert.deepEqual(p.effects, []);
    });
  }
  test(`${route} refuses a nonempty composer and keeps rapid repeats and uncertain delivery from replaying`, async () => {
    const p = fixture();
    p.screens.get('chat-a').draft = 'keep draft';
    assert.equal((await p.run(route)).kind, 'refused');
    assert.deepEqual(p.effects, []);
    p.screens.get('chat-a').draft = '';
    const hold = p.holdNextEffect(),
      run = p.run(route);
    await hold.accepted;
    assert.equal((await p.run(route)).kind, 'refused');
    p.loseReply();
    hold.release();
    const result = await run;
    assert.equal(result.kind, 'uncertain');
    assert.equal(result.effects, 1);
    assert.equal(p.effects.length, 1);
    assert.equal((await p.run(route)).kind, 'refused');
    assert.deepEqual(p.calls, [route, route]);
  });
}
test('reference captures are single-use and bind route and immutable target facts', async () => {
  const p = fixture();
  const capture = p.capture('native');
  assert.equal((await p.run('native', capture)).kind, 'confirmed');
  assert.deepEqual(await p.run('native', capture), {
    kind: 'refused',
    effects: 0,
  });
  const altered = p.capture('native');
  altered.binding.chat = 'chat-b';
  assert.deepEqual(await p.run('native', altered), {
    kind: 'refused',
    effects: 0,
  });
  assert.deepEqual(await p.run('api', p.capture('native')), {
    kind: 'refused',
    effects: 0,
  });
});
test('reference authority enforces initial arming, clock domain and original press time', async () => {
  for (const change of ['arming', 'clock', 'future']) {
    const p = fixture();
    if (change === 'arming') p.now -= 1;
    const captured = p.capture();
    if (change === 'clock') captured.clockDomain = 'other-clock';
    if (change === 'future') captured.pressedAt++;
    assert.equal((await p.run('native', captured)).kind, 'refused');
    assert.deepEqual(p.effects, []);
  }
});
test('retirement after opening a command stops later keys and requires read-only recovery', async () => {
  const p = fixture(),
    hold = p.holdNextEffect(1),
    run = p.run('native');
  await hold.accepted;
  assert.deepEqual(
    p.effects.map((e) => e.input),
    ['/model'],
  );
  assert.deepEqual(p.invalidate(), { pending: false, effects: 1 });
  hold.release();
  assert.deepEqual(await run, { kind: 'partial', effects: 1 });
  assert.equal((await p.run('native')).kind, 'refused');
  const before = p.effects.length;
  p.refresh();
  assert.equal(p.effects.length, before, 'recovery sends no cleanup or retry');
  p.now += 350;
  assert.equal(
    (await p.run('native')).kind,
    'refused',
    'the partial /model command is not an eligible composer',
  );
  assert.equal(p.effects.length, before);
});
