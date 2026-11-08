'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  P = require('../../src/app/preferences'),
  defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json'),
  { harness } = require('../helpers/plugin-harness');
test('preferences', async () => {
  const before = JSON.stringify(defaults),
    config = P.apply(defaults, {
      allowClipboardFocus: false,
      bringToFront: false,
      animationEnabled: false,
      prompts: { review: 'Review this change.' },
    });
  assert.equal(JSON.stringify(defaults), before);
  assert.equal(config.animation.enabled, false);
  assert.equal(config.bringToFront, false);
  assert.equal(config.allowClipboardFocus, false);
  assert.equal(config.prompts.review, 'Review this change.');
  assert.equal(config.prompts.tests, defaults.prompts.tests);
  assert.deepEqual(config.daemonControls, defaults.daemonControls);
  for (const value of [
    { approvalPolicy: 'never' },
    { sandboxPolicy: {} },
    { backend: 'unknown' },
    { herdrTitleIdentity: 'true' },
    { herdrSocketPath: 'relative.sock' },
    { herdrSocketPath: '/tmp/bad\npath' },
    { daemonControls: {} },
    { allowClipboardFocus: 'true' },
    { prompts: { review: 'bad\nline' } },
    { prompts: { plan: 'custom' } },
    { prompts: { tests: '' } },
    { prompts: { review: 'x'.repeat(4001) } },
  ])
    assert.throws(() => P.normalize(value));
  const connected = P.apply(defaults, {
    backend: 'herdr',
    herdrSocketPath: '~/.config/herdr/sessions/test/herdr.sock',
    herdrTitleIdentity: true,
  });
  assert.equal(connected.backend, 'herdr');
  assert.equal(connected.herdr.titleIdentity, true);
  assert.equal(P.view(connected).herdrTitleIdentity, true);
  assert.equal(defaults.herdr.titleIdentity, false);
  assert.equal(
    connected.herdr.socketPath,
    '~/.config/herdr/sessions/test/herdr.sock',
  );
  assert.deepEqual(connected.daemonControls, defaults.daemonControls);
  const h = harness();
  await h.ready();
  let reads = 0;
  const focused = h.api.bridge.focused.bind(h.api.bridge);
  h.api.bridge.focused = async () => {
    reads++;
    return focused();
  };
  const status = () =>
    h.socket.frames.filter((f) => f.event === 'sendToPropertyInspector').at(-1)
      .payload;
  await h.api.inspectorRequest({ context: '1,0', payload: { kind: 'status' } });
  assert.equal(reads, 0);
  assert.equal(status().agents, 2);
  assert.equal(status().preferences.allowClipboardFocus, false);
  await h.api.inspectorRequest({
    context: '1,0',
    payload: { kind: 'setupFooter' },
  });
  assert.equal(reads, 0);
  assert(!h.calls.length);
  assert(status().message.includes('Enable visible-pane'));
  assert.equal(status().setupBusy, false);
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'didReceiveGlobalSettings',
      payload: {
        settings: {
          version: 1,
          preferences: {
            allowClipboardFocus: true,
            animationEnabled: false,
            prompts: { tests: 'Run focused tests.' },
          },
        },
      },
    }),
  );
  await h.api.settled();
  assert.equal(reads, 1);
  assert.equal(h.api.bridge.config.allowClipboardFocus, true);
  assert.equal(h.api.bridge.config.animation.enabled, false);
  assert.equal(h.api.bridge.config.prompts.tests, 'Run focused tests.');
  assert.equal(JSON.stringify(defaults), before);
  for (let n = 0; n < 3; n++)
    await h.api.inspectorRequest({
      context: '1,0',
      payload: { kind: 'status' },
    });
  assert.equal(reads, 1, 'diagnostics must never query clipboard focus');
  h.socket.emit(
    'message',
    JSON.stringify({
      event: 'didReceiveGlobalSettings',
      payload: { settings: { preferences: { approvalPolicy: 'never' } } },
    }),
  );
  assert.equal(
    h.api.bridge.config.allowClipboardFocus,
    true,
    'invalid settings preserve last valid config',
  );
  await h.api.inspectorRequest({
    context: '1,0',
    payload: {
      kind: 'preferences',
      preferences: { allowClipboardFocus: false },
    },
  });
  assert.equal(h.api.bridge.lastTarget, null);
  assert.equal(h.api.bridge.draft, null);
  const frames = h.socket.frames.length;
  await h.api.inspectorRequest({
    context: 'not-a-key',
    payload: { kind: 'setupFooter' },
  });
  assert.equal(h.socket.frames.length, frames);
  assert(!h.calls.length);
  console.log(
    'PASS shared preferences, prompt validation, no policy fields, explicit clipboard opt-in, diagnostics without focus queries, setup consent and config preservation',
  );
});
