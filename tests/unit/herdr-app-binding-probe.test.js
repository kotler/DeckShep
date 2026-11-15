const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  prepareBindingMod,
  BindingProbeChannel,
  snapshotSchema,
} = require('../live/herdr-app-model/binding-probe.cjs');

test('binding mod setup is confined to a fresh owned home and preserves unrelated shared state', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-probe-unit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'state/app');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(
    path.join(home, 'shared.json'),
    JSON.stringify({ 'frame.welcomed': 'test' }),
  );
  prepareBindingMod(root, { HERDR_APP_HOME: home });
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(home, 'shared.json')))[
      'frame.welcomed'
    ],
    'test',
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(home, 'shared.json'))).layout,
    'dsh-model-probe',
  );
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(home, 'mods/dsh-model-probe/mod.json')),
    ).focusable,
    false,
  );
  assert.throws(
    () => prepareBindingMod(root, { HERDR_APP_HOME: home }),
    /EEXIST/,
  );
  assert.throws(
    () =>
      prepareBindingMod(root, {
        HERDR_APP_HOME: path.join(root, 'owner-home'),
      }),
    /Non-owned/,
  );
});
test('the mod transport adds only the exact snapshot command and bounded local Core reads', () => {
  const channel = new BindingProbeChannel({});
  channel.validateRequests('app', [
    { do: 'dsh-model-probe.snapshot', args: {} },
  ]);
  for (const request of [
    { do: 'dsh-model-probe.model', args: {} },
    { do: 'dsh-model-probe.snapshot', args: { text: 'untrusted' } },
    { do: 'terminal.keys', args: { keys: ['enter'] } },
  ])
    assert.throws(() => channel.validateRequests('app', [request]));
  const hello = {
    jsonrpc: '2.0',
    id: 1,
    method: 'hello',
    params: { generation: 1, framed: false },
  };
  const get = {
    jsonrpc: '2.0',
    id: 2,
    method: 'terminal.get',
    params: { terminal: 't1' },
  };
  channel.validateRequests('core', [hello, get]);
  for (const terminal of ['remote/t1', 't0', '../t1'])
    assert.throws(() =>
      channel.validateRequests('core', [
        hello,
        { ...get, params: { terminal } },
      ]),
    );
  assert.throws(() =>
    channel.validateRequests('core', [
      hello,
      { ...get, method: 'terminal.keys' },
    ]),
  );
});
test('prototype metadata never accepts a forged authority result or transcript', () => {
  const sample = {
    protocol: 1,
    sequence: 1,
    focusRevision: 1,
    exports: [],
    focusedKeys: [],
    windowKeys: [],
    focused: null,
    panes: [],
    terminals: [],
  };
  assert(snapshotSchema.safeParse(sample).success);
  assert(
    !snapshotSchema.safeParse({ ...sample, bindingQualified: true }).success,
  );
  assert(
    !snapshotSchema.safeParse({ ...sample, transcript: 'private' }).success,
  );
});
