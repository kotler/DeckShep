const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  nativeModelProbe,
  daemonModelProbe,
  probeModels,
} = require('../helpers/herdr-app-model-probe');

test('real native and daemon helpers can choose different next models from different catalog orders', async () => {
  const native = await nativeModelProbe();
  const api = daemonModelProbe({
    models: [probeModels[0], probeModels[2], probeModels[1]],
  });
  await api.run();
  assert.equal(native.model, 'Beta');
  assert.equal(native.effort, 'High');
  assert.equal(api.state().model, 'gamma');
});
test('API baseline skips an incompatible adjacent entry and guesses when current is absent', async () => {
  const filtered = daemonModelProbe({
    models: [
      probeModels[0],
      { ...probeModels[1], efforts: ['low'] },
      probeModels[2],
    ],
  });
  await filtered.run();
  assert.equal(filtered.state().model, 'gamma');
  const absent = daemonModelProbe({ current: 'missing' });
  await absent.run();
  assert.equal(absent.state().model, 'alpha');
});
for (const change of ['focus', 'away-and-back', 'expiry', 'invalidation']) {
  test(`an unconditional settings receiver can apply after the client's final check (${change})`, async () => {
    const probe = daemonModelProbe({ held: true });
    const operation = probe.run();
    await probe.accepted;
    assert.equal(probe.state().effects, 0);
    if (change === 'focus') probe.focus('b');
    if (change === 'away-and-back') {
      probe.focus('b');
      probe.focus('a');
    }
    if (change === 'expiry') probe.advance(2001);
    if (change === 'invalidation') probe.invalidate();
    probe.release();
    await operation;
    assert.equal(
      probe.state().effects,
      1,
      'counterexample, not a qualified receiver',
    );
    assert.equal(probe.state().model, 'beta');
    if (change === 'away-and-back')
      assert.equal(probe.state().focusRevision, 2);
  });
}
for (const options of [{ footerless: true }, { commandFooter: true }]) {
  test(`native Model preserves supported footer behavior ${JSON.stringify(options)}`, async () => {
    const result = await nativeModelProbe(options);
    assert.equal(result.model, 'Beta');
    assert.equal(result.effort, 'High');
    assert.equal(result.trace.filter((key) => key === '/model').length, 1);
    assert.equal(result.trace.filter((key) => key === 's').length, 1);
  });
}
