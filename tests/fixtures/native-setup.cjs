const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { Setup } = require('../../src/agents/codex/setup-presets');
const P = require('../../src/agents/codex/presets');
const TOML = require('@iarna/toml');
const file = P.codexFile();
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, '[tui.presets]\n');
const entries = {},
  calls = [],
  agent = {
    session: 'fixture',
    block: 'fixture',
    pid: 42,
    app: 'codex',
    name: 'codex',
  };
let dialog = 'composer',
  downs = 0,
  field = '',
  slot = '',
  time = Date.now();
function screen() {
  return {
    composer: '› unsent composer',
    presets: 'Presets',
    start: 'Start preset from current settings',
    new: 'New preset\n› ' + field,
    slot: 'Save preset to slot',
    replace: 'Replace preset ' + slot + '?',
  }[dialog];
}
function save() {
  entries[slot] = { input: field };
  fs.writeFileSync(file, TOML.stringify({ tui: { presets: entries } }));
  time += 1000;
  fs.utimesSync(file, time / 1000, time / 1000);
  dialog = 'composer';
}
const bridge = {
  async checked() {
    calls.push('checked');
  },
  async focus() {
    calls.push('focus');
  },
  async method(_agent, method) {
    assert.equal(method, 'size');
    return { rows: 30 };
  },
  async run(args, input) {
    if (args[0] === 'block') return { content: screen() };
    assert.equal(
      calls.at(-1),
      'checked',
      'native keys/paste require a fresh preflight',
    );
    if (args[0] === 'send') {
      assert.equal(dialog, 'new');
      field = input.slice(6, -6);
      return;
    }
    assert.equal(args[0], 'send-key');
    for (const key of args.slice(5)) {
      calls.push(key);
      if (key === 'ctrl+x' || key === 'end' || key === 'ctrl+u') continue;
      if (key === 'p') {
        dialog = 'presets';
        continue;
      }
      if (key === 's' && dialog === 'presets') {
        dialog = 'start';
        downs = 0;
        continue;
      }
      if (key === 'down' && dialog === 'start') {
        downs++;
        continue;
      }
      if (key === 'escape') {
        dialog = 'composer';
        continue;
      }
      if (key === 'enter' && dialog === 'start') {
        dialog = 'new';
        field =
          downs === 3
            ? '/statusline model-with-reasoning cost'
            : downs === 1
              ? '/permissions workspace-write --approval-policy=on-request --reviewer=user'
              : '/model gpt-6-luna --reasoning=low --speed=standard';
        continue;
      }
      if (key === 'enter' && dialog === 'new') {
        dialog = 'slot';
        continue;
      }
      if (/^[0-9]$/.test(key) && dialog === 'slot') {
        slot = key;
        if (entries[slot]) dialog = 'replace';
        else save();
        continue;
      }
      if (key === 'enter' && dialog === 'replace') {
        save();
        continue;
      }
      assert.fail('Unexpected fixture UI key/state');
    }
  },
};
(async () => {
  const setup = new Setup(bridge);
  assert.equal(
    await setup.currentModel(agent),
    '/model gpt-6-luna --reasoning=low --speed=standard',
  );
  assert.equal(
    await setup.currentStatusLine(agent),
    '/statusline model-with-reasoning cost',
  );
  assert.equal(
    await setup.currentPermissions(agent),
    '/permissions workspace-write --approval-policy=on-request --reviewer=user',
  );
  assert.equal(
    await setup.store(agent, '0', '/statusline session-id'),
    '/statusline session-id',
  );
  assert.equal(await setup.store(agent, '0', '/statusline'), '/statusline');
  delete entries['0'];
  fs.writeFileSync(file, TOML.stringify({ tui: { presets: entries } }));
  const config = {
      models: [
        { id: 'model-a', label: 'A' },
        { id: 'model-b', label: 'B' },
        { id: 'model-c', label: 'C' },
      ],
      efforts: ['low', 'medium', 'high', 'xhigh'],
    },
    registry = path.join(process.env.HOME, 'fixture-registry.json');
  await setup.configure(agent, config, registry);
  const saved = P.readRegistry(registry);
  assert.equal(Object.values(saved.agents)[0].entries.length, 9);
  assert(P.readPresets()['9'].input.endsWith('--reviewer=user'));
  assert(P.readPresets()['8'].input.endsWith('--reviewer=auto_review'));
  const count = calls.length;
  await setup.configure(agent, config, registry);
  assert.equal(
    calls.length,
    count + 2,
    'idempotent setup verifies native presets without reopening a dialog',
  );
  entries['1'].input = '/model user-custom';
  fs.writeFileSync(file, TOML.stringify({ tui: { presets: entries } }));
  await assert.rejects(setup.configure(agent, config, registry), /changed/);
  assert.throws(() => P.readRegistry(file), /JSON/);
  assert.deepEqual(
    P.readRegistry(path.join(process.env.HOME, 'missing.json')),
    { agents: {} },
  );
  assert.equal(dialog, 'composer');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
