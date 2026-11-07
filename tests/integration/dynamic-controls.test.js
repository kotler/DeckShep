'use strict';
const assert = require('node:assert/strict'),
  { harness } = require('../helpers/plugin-harness');
(async () => {
  const h = harness();
  await h.ready();
  assert.equal(h.action(1, 4), 'more');
  assert.equal(h.action(2, 4), 'interrupt');
  assert(h.image(2, 4).includes('not running'));
  assert.deepEqual(
    [0, 1, 2, 3].map((c) => h.action(2, c)),
    ['model', 'effort', 'zoom', 'plan'],
  );
  await h.press(2, 0);
  assert.equal(h.calls.at(-1).cycle, 'model');
  await h.press(2, 1);
  assert.equal(h.calls.at(-1).cycle, 'effort');
  await h.press(2, 2);
  assert.equal(h.calls.at(-1).args[0], 'zoom');
  h.change('a', { state: 'working', statusAt: 'v2' });
  await h.api.refresh();
  h.tick();
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((c) => h.action(2, c)),
    ['steer', 'queue', 'zoom', 'none', 'interrupt'],
  );
  await h.press(2, 0);
  assert.equal(h.calls.at(-1).args.at(-1), 'enter');
  h.api.bridge.readComposer = async () => ({
    chatId: 'chat-a',
    hash: 'different message',
    cursor: { row: 2, column: 12 },
  });
  await h.press(2, 1);
  assert.equal(h.calls.at(-1).args.at(-1), 'tab');
  const old = h.api.keys.get('2,4').presented,
    count = h.calls.length;
  h.change('a', { state: 'blocked', kind: 'permission', statusAt: 'v3' });
  await h.api.refresh();
  h.tick();
  await h.press(2, 4, old);
  assert.equal(h.calls.length, count);
  assert.equal(h.action(2, 4), 'interrupt');
  assert.equal(h.action(2, 2), 'approvalConfirm');
  await h.press(2, 2);
  assert.equal(h.calls.at(-1).args.at(-1), 'enter');
  const approval = h.api.keys.get('2,2').presented,
    n = h.calls.length;
  h.change('a', { statusAt: 'different-request' });
  await h.api.refresh();
  h.tick();
  await h.press(2, 2, approval);
  assert.equal(h.calls.length, n);
  h.change('a', { kind: 'question', statusAt: 'v4' });
  await h.api.refresh();
  h.tick();
  assert.equal(h.action(2, 2), 'answer');
  await h.press(2, 2);
  assert.equal(h.calls.at(-1).args.at(-1), 'enter');
  const question = h.api.keys.get('2,2').presented,
    before = h.calls.length;
  h.change('a', { kind: 'permission', statusAt: 'v5' });
  await h.api.refresh();
  h.tick();
  await h.press(2, 2, question);
  assert.equal(h.calls.length, before);
  // A mouse switch in Rex cannot redirect the highlighted agent's action.
  h.native('b');
  h.tick();
  await h.press(2, 2);
  assert.equal(h.calls.length, before);
  assert.equal(h.api.bridge.lastTarget, null);
  assert(!h.image(0, 0).includes('id="selected-agent"'));
  assert(
    h.image(2, 0).includes('>Reselect<') && h.image(2, 0).includes('>agent<'),
  );
  h.native('a');
  await h.press(0, 0);
  // Let a transition settle before allowing context actions.
  h.change('a', { state: 'working', kind: undefined, statusAt: 'v6' });
  await h.api.refresh();
  await h.press(2, 4);
  assert.equal(h.calls.length, before);
  h.tick();
  await h.press(2, 4);
  assert.equal(h.calls.at(-1).args.at(-1), 'escape');
  for (let page = 1; page <= 3; page++) {
    await h.press(1, 4);
    assert.equal(h.api.getPage(), page % 3);
    assert.equal(h.action(1, 4), 'more');
    assert.equal(h.action(2, 4), 'interrupt');
  }
  // Existing explicit old-button overrides remain inert.
  for (const action of [
    'previous',
    'bankprev',
    'modelPicker',
    'effortPicker',
    'planPrompt',
  ])
    assert.equal(
      h.api.mapping({
        settings: { action },
        coordinates: { row: 1, column: 0 },
      }),
      'none',
    );
  // No success overlays; errors stay visible through showAlert.
  assert(!h.socket.frames.some((x) => x.event === 'showOk'));
  assert(h.socket.frames.some((x) => x.event === 'showAlert'));
  h.api.bridge.verifyRunning = async () => {
    throw Error('Read unavailable');
  };
  await h.press(2, 4);
  assert(h.image(2, 4).includes('Unavailable'));
  h.tick(4000);
  h.api.render();
  assert(
    h.image(2, 4).includes('Unavailable'),
    'error text outlasts the brief hardware warning',
  );
  h.api.bridge.verifyRunning = async () => ({});
  const target = h.live[0];
  h.setLive([
    target,
    ...Array.from({ length: 5 }, (_, i) => ({
      ...target,
      block: 'extra' + i,
      pid: 60 + i,
    })),
  ]);
  await h.api.refresh();
  await h.press(1, 1);
  assert.equal(h.api.getBank(), 1);
  await h.press(1, 1);
  assert.equal(h.api.getBank(), 0);
  h.api.bridge.slots.splice(1, 0, { session: 's', block: 'closed' });
  await h.press(1, 0);
  assert(!h.api.bridge.slots.some((s) => s.block === 'closed'));
  // Claude arrows send no post-key scan. The next action must still see a
  // changed native request and reject a confirmation captured before it.
  const q = harness();
  await q.ready();
  q.change('a', {
    app: 'claude-code',
    name: 'claude',
    nativeVerified: true,
    nativeIdentity: 'root',
    claudeControlsEnabled: true,
    state: 'blocked',
    kind: 'question',
    statusAt: 'question-one',
  });
  await q.api.refresh();
  await q.press(0, 0);
  q.tick();
  let paneReads = 0,
    scans = 0;
  const discover = q.api.bridge.discover.bind(q.api.bridge);
  q.api.bridge.discover = async () => {
    scans++;
    return discover();
  };
  q.api.bridge.agent = async (t) => {
    paneReads++;
    assert.equal(t.block, 'a');
    return { ...q.live[0] };
  };
  q.api.bridge.questionKey = async () =>
    q.change('a', { statusAt: 'question-two' });
  const oldAnswer = q.api.keys.get('2,2').presented;
  await q.press(2, 1);
  assert.equal(paneReads, 0);
  assert.equal(scans, 0);
  assert.equal(q.live[0].statusAt, 'question-two');
  let confirms = 0;
  q.api.bridge.questionKey = async () => {
    confirms++;
  };
  q.tick();
  await q.press(2, 2, oldAnswer);
  assert.equal(
    confirms,
    0,
    'queued confirmation from the old request remains invalid',
  );
  assert.equal(
    paneReads,
    1,
    'Confirm still refreshes the acted-on pane after a refused or completed action',
  );
  const m = harness();
  await m.ready();
  m.change('a', {
    app: 'claude-code',
    name: 'claude',
    nativeVerified: true,
    nativeIdentity: 'multi-root',
    claudeControlsEnabled: true,
    state: 'blocked',
    kind: 'question',
    statusAt: 'checkbox-list',
    claudeMultiSelect: true,
    claudeCheckboxList: true,
  });
  await m.api.refresh();
  await m.press(0, 0);
  m.tick();
  const nativeKeys = [];
  m.api.bridge.agent = async () => ({ ...m.live[0] });
  m.api.bridge.questionKey = async (key) => {
    nativeKeys.push(key);
    if (key === 'tab')
      m.change('a', {
        claudeMultiSelect: false,
        claudeCheckboxList: false,
        claudeQuestionReview: true,
        statusAt: 'review-answers',
      });
  };
  assert(m.image(2, 2).includes('>Review<'));
  await m.press(2, 4);
  assert.equal(nativeKeys.at(-1), 'space');
  const reviewPress = m.api.keys.get('2,2').presented;
  await m.press(2, 2);
  assert.equal(nativeKeys.at(-1), 'tab');
  assert.equal(m.api.getPage(), 0);
  assert(m.image(2, 2).includes('>Submit<'));
  m.tick();
  const nkeys = nativeKeys.length;
  await m.press(2, 2, reviewPress);
  assert.equal(
    nativeKeys.length,
    nkeys,
    'an old Review press must not become Submit',
  );
  await m.press(2, 2);
  assert.equal(nativeKeys.at(-1), 'enter');
  console.log(
    'PASS dynamic ready/running/question/approval rows, fixed Stop/page positions, contextual Steer/Queue, stale press/request rejection, focus binding, transition delay, page cycling, removed previous buttons and stable selection/bank/collapse behavior',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
