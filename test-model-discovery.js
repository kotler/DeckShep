'use strict';
const assert = require('node:assert/strict');
const P = require('./com.local.rexagents.sdPlugin/presets');
const {
  catalog,
  snapshot,
  next,
  ModelControls,
} = require('./com.local.rexagents.sdPlugin/model-controls');
(async () => {
  const raw = {
    models: [
      {
        slug: 'first',
        display_name: 'First',
        visibility: 'list',
        supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
      },
      {
        slug: 'second',
        visibility: 'list',
        supported_reasoning_levels: [{ effort: 'medium' }],
      },
      { slug: 'hidden', visibility: 'hide', supported_reasoning_levels: [] },
    ],
  };
  const models = catalog(raw);
  assert.deepEqual(
    models.map((m) => m.id),
    ['first', 'second'],
  );
  assert.deepEqual(
    catalog(raw, ['second']).map((m) => m.id),
    ['second'],
  );
  assert.throws(() => catalog(raw, ['missing']));
  assert.deepEqual(snapshot('/model first --reasoning=high --speed=standard'), {
    model: 'first',
    effort: 'high',
    speed: 'standard',
  });
  assert.throws(() => snapshot('/model first\nuser draft'));
  assert.throws(() => snapshot('/permissions anything'));
  assert.equal(
    next('model', snapshot('/model second --reasoning=medium'), models).input,
    '/model first',
  );
  assert.equal(
    next('effort', snapshot('/model first --reasoning=low'), models).input,
    '/model --reasoning=high',
  );
  assert.equal(
    next('effort', snapshot('/model first --reasoning=high'), models).input,
    '/model --reasoning=low',
  );
  assert.throws(() => next('effort', { model: 'missing' }, models));
  const a = { pid: 42, session: 's', block: 'b' },
    calls = [],
    registry = { agents: {} },
    disk = {};
  let current = '/model first --reasoning=low';
  const b = {
    config: { modelDiscovery: {} },
    method: async () => ({
      foreground: { pid: 42, path: '/bin/codex', cwd: '/tmp' },
    }),
    checked: async () => {},
    run: async (args) => calls.push(args),
  };
  const setup = {
    currentModel: async () => {
      calls.push({ mode: 'model' });
      return current;
    },
    store: async (a, slot, input, mode) => {
      calls.push({ slot, input, mode });
      const v = mode === 'model' ? current : input;
      disk[slot] = { input: v };
      return v;
    },
  };
  const old = {
    readRegistry: P.readRegistry,
    saveRegistry: P.saveRegistry,
    readPresets: P.readPresets,
    validateOnDisk: P.validateOnDisk,
  };
  Object.assign(P, {
    readRegistry: () => registry,
    saveRegistry: () => {},
    readPresets: () => disk,
    validateOnDisk: (entries) => {
      for (const e of entries) assert.equal(disk[e.slot]?.input, e.input);
    },
  });
  try {
    const controls = new ModelControls(b, setup, async () => models);
    assert.equal((await controls.cycle('model', a, 'unused')).label, 'second');
    current = '/model second --reasoning=medium';
    assert.equal((await controls.cycle('model', a, 'unused')).label, 'First');
    assert(
      calls
        .filter(Array.isArray)
        .every((c) => c.slice(-3).join(',') === 'ctrl+x,p,0'),
    );
    assert.equal(calls.filter((c) => c.mode === 'model').length, 2);
    const before = calls.length;
    disk['0'] = { input: 'user prompt' };
    await assert.rejects(() => controls.cycle('model', a, 'unused'));
    assert.equal(calls.length, before);
    delete disk['0'];
    b.method = async () => ({ foreground: { pid: 99, path: '/bin/codex' } });
    await assert.rejects(() => controls.cycle('model', a, 'unused'));
    assert.equal(calls.length, before);
  } finally {
    Object.assign(P, old);
  }
  console.log(
    'PASS discovered/hidden catalogs, native snapshots, manual model synchronization, supported effort cycling, scratch ownership and process guards',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
