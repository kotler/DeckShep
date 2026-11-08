const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Bridge } = require('../../src/app/session');
const { svg, pulse } = require('../../src/render/visuals');
const c = require('../../com.local.rexagents.sdPlugin/config.json');
test('controls', async () => {
  const a = {
    session: 's',
    block: 'b',
    app: 'codex',
    pid: 1,
    name: 'codex',
    state: 'idle',
  };
  const sent = [];
  const b = new Bridge(c, async (args, input) => {
    sent.push({ args, input });
    return null;
  });
  b.focused = async () => a;
  b.checked = async () => a;
  b.method = async () => ({ modes: [{ number: 2004, set: true }] });
  await b.cyclePicker('model');
  assert.equal(b.draft.action, 'model');
  assert(sent.at(-1).input.includes('/model'));
  await b.send();
  assert.equal(sent.at(-1).args.at(-1), 'enter');
  assert.equal(b.picker.phase, 'model');
  await b.cyclePicker('model');
  assert.equal(sent.at(-1).args.at(-1), 'down');
  await b.cyclePicker('effort');
  assert.equal(sent.at(-1).args.at(-1), 'enter');
  assert.equal(b.picker.phase, 'effort');
  await b.cyclePicker('effort');
  assert.equal(sent.at(-1).args.at(-1), 'down');
  await b.send();
  assert.equal(sent.at(-1).args.at(-1), 's');
  assert.equal(b.picker, null);
  b.focused = async () => ({ ...a, app: 'claude-code' });
  await assert.rejects(() => b.cyclePicker('model'));
  b.picker = { target: a, phase: 'model', at: Date.now() - 61000 };
  await assert.rejects(() => b.pickerTarget());
  assert.equal(pulse('done', 20000, c.animation), 0);
  assert.equal(pulse('working', 0, { enabled: false }), 0);
  assert.notEqual(
    pulse('working', 0, c.animation),
    pulse('working', 550, c.animation),
  );
  assert(svg({ lines: ['<unsafe>'] }).includes('&lt;unsafe&gt;'));
  assert(svg({ icon: 'grok' }).includes('<circle'));
  console.log(
    'PASS model staging, picker navigation, session-only effort apply, unverified-agent guard, expiry, animation and SVG escaping',
  );
});
