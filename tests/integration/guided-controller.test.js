const { test } = require('node:test'), assert = require('node:assert/strict');
const { harness } = require('../helpers/plugin-harness');
test('setup panel routes preview/apply/undo/removal and diagnostics through the visible profile; errors contain no received data', async () => {
  const calls = [], setup = { preview(remove, statusline) { calls.push(['preview', remove, statusline]); return { before: '{}', after: '{"hooks":{}}' }; }, apply() { calls.push('apply'); }, undo() { calls.push('undo'); } };
  const h = harness({ integrationSetup: setup, diagnostics: async () => [{ id: 'fixture', ok: true, reason: 'Fixture reachable' }], herdrSessions: () => [{ path: '/tmp/fixture.sock', label: 'Fixture' }] });
  await h.ready();
  const request = payload => h.api.inspectorRequest({ context: '0,0', payload });
  await request({ kind: 'doctor', model: 0 }); assert.equal(h.socket.frames.at(-1).payload.checks[0].id, 'fixture');
  await request({ kind: 'claudePreview', statusline: true }); assert.deepEqual(calls[0], ['preview', false, true]); assert.equal(h.socket.frames.at(-2).payload.after, '{"hooks":{}}');
  await request({ kind: 'claudeApply' }); await request({ kind: 'claudeUndo' }); await request({ kind: 'removeIntegrations' }); assert.deepEqual(calls, [['preview', false, true], 'apply', 'undo', ['preview', true, false]]);
  setup.apply = () => { throw Error('SECRET /home/private'); }; await request({ kind: 'claudeApply' }); assert(!h.socket.frames.at(-1).payload.message.includes('SECRET'));
  const count = calls.length; await h.api.inspectorRequest({ context: 'hidden', payload: { kind: 'claudePreview' } }); assert.equal(calls.length, count);
  await request({ kind: 'preferences', preferences: { animationEnabled: false } }); assert.equal(h.socket.frames.at(-1).payload.preferences.animationEnabled, false);
  await request({ kind: 'preferences', preferences: { herdrTitleIdentity: true } }); assert.match(h.socket.frames.at(-1).payload.message, /different profile/);
});
test('explicit Codex setup owns its busy interval while ordinary keys captured during setup remain refused', async () => {
  let during;
  const h = harness({ fixtureConsent: true, setupCodex: async (bridge, agent) => {
    assert.equal(h.api.setupBusy, true);
    h.socket.emit('message', JSON.stringify({ event: 'keyDown', context: 'rex:2,3' }));
    await bridge.run(['send-key', '-s', agent.session, '-b', agent.block, 'fixture-setup']);
    during = h.calls.length;
  } });
  await h.appear('rex'); await h.ready();
  h.socket.emit('message', JSON.stringify({ event: 'sendToPlugin', context: 'rex:0,0', payload: { kind: 'setupFooter' } }));
  await h.api.settled();
  assert.equal(h.api.setupBusy, false);
  assert(h.calls.some(call => call.args?.at(-1) === 'fixture-setup'));
  assert.equal(h.calls.length, during, 'queued ordinary key cannot execute after setup');
  assert(h.socket.frames.some(frame => frame.event === 'showAlert'));
});
