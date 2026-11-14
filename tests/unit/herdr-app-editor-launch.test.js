const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchEditor } = require('../live/playwright/editor-launch.cjs');

test('an editor ownership failure after launch preserves the evidence root through unprovenLaunch', () => {
  let launched = false;
  const run = {
    root: '/fixture',
    env: { HOME: '/fixture/state' },
    children: {},
    gate: { checkBoth() {} },
    owned: {
      spawn() {
        launched = true;
        throw Error('Initial PID inspection failed');
      },
    },
  };
  assert.throws(
    () => launchEditor(run, '/fixture/editor', '/fixture/state/editor.json'),
    /Owned editor launch failed/,
  );
  assert.equal(launched, true);
  assert.equal(run.launchAttempted, true);
  assert.equal(run.unprovenLaunch, true);
  assert.deepEqual(run.children, {});
});
test('a verified editor is registered for the owned launcher cleanup; a pre-launch gate failure cannot start it', () => {
  const child = { pid: 123 },
    calls = [];
  const run = {
    root: '/fixture',
    env: { HOME: '/fixture/state' },
    children: {},
    gate: {
      checkBoth() {
        calls.push('gate');
      },
    },
    owned: {
      spawn(file, args, options) {
        calls.push([file, args, options]);
        return child;
      },
    },
  };
  assert.equal(
    launchEditor(run, '/fixture/editor', '/fixture/state/editor.json'),
    child,
  );
  assert.equal(run.children.editor, child);
  assert.deepEqual(calls, [
    'gate',
    [
      '/fixture/editor',
      ['/fixture/state/editor.json'],
      { cwd: run.root, env: run.env },
    ],
  ]);
  assert.equal(run.unprovenLaunch, undefined);
  calls.length = 0;
  run.gate.checkBoth = () => {
    throw Error('Gate refused');
  };
  assert.throws(
    () => launchEditor(run, '/fixture/editor', '/fixture/state/editor.json'),
    /Gate refused/,
  );
  assert.deepEqual(calls, []);
});
