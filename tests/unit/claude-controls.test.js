'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { Bridge } = require('../../src/app/session'),
  C = require('../../src/guards/context'),
  {
    ClaudeControls,
    composer,
    dialog,
  } = require('../../src/agents/claude/controls'),
  defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json');
const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
function fixture(hooksOnly = false) {
  const raw = {
    session: 's',
    window: 'w',
    block: 'b',
    app: 'claude-code',
    pid: 42,
    name: 'claude',
    cwd: '/project',
    state: 'unknown',
    project: 'project',
  };
  const p = {
      pid: 42,
      startedAt: 'Fri Nov 6 12:00:00 2026',
      version: '2.1.319',
    },
    r = {
      configDirectory: '/fixture/claude',
      schema: 1,
      pid: 42,
      startedAt: p.startedAt,
      version: p.version,
      sessionId: 'claude-session',
      generation: 'generation-one',
      turnId: 'turn-one',
      cwd: '/project',
      state: 'idle',
      updatedAt: 10000,
      metadataAt: 10000,
      model: 'claude-sonnet-4-6',
      modelName: 'Sonnet 4.6',
      effort: 'high',
      permissionMode: 'default',
    };
  const state = {
      input: '',
      dialog: null,
      changed: false,
      workingHint: true,
      failWrite: false,
      viewReads: 0,
    },
    calls = [];
  const b = new Bridge(
    {
      ...structuredClone(defaults),
      allowClipboardFocus: true,
      claude: { enabled: true },
    },
    async (args, input) => {
      calls.push({ args, input });
      if (state.failWrite) throw Error('Uncertain write');
      if (args[0] === 'send')
        state.input += input.replace(/\x1b\[20[01]~/g, '');
      if (args.at(-1) === 'alt+p') state.dialog = 'picker';
    },
    async () => {},
  );
  const text = () =>
    state.dialog
      ? '────────────────────────\n' +
        (state.dialog === 'picker'
          ? 'Select model'
          : state.dialog === 'permission'
            ? 'Do you want to allow this command?'
            : 'Which color?') +
        '\n❯ 1. ' +
        (state.dialog === 'permission' ? 'Yes, once' : 'Red') +
        '\n  2. ' +
        (state.dialog === 'permission' ? 'No' : 'Blue') +
        '\n' +
        (state.dialog === 'picker'
          ? 'Enter to set as default · s to use this session only · Esc to cancel'
          : state.multiSelect
            ? 'Space to toggle · Enter to select · Esc to cancel'
            : 'Enter to confirm · Esc to cancel')
      : 'Claude session\n────────────────────────\n❯ ' +
        state.input +
        '\n────────────────────────' +
        (hooksOnly ? '' : '\nClaude Sonnet · high') +
        (r.state === 'working' && state.workingHint
          ? '\nesc to interrupt'
          : '');
  const view = async () => {
    state.viewReads++;
    const t = text() + (state.changed && state.viewReads % 2 ? ' changed' : '');
    return {
      text: t,
      hash: hash(t),
      cursor: { row: 3, column: 3 + state.input.length },
    };
  };
  const controls = new ClaudeControls(b, {
    inspect: async () => ({ ...p }),
    read: async () => ({ ...r }),
    now: () => 10000,
    view,
    ...(hooksOnly ? { setupMode: () => 'hooks' } : {}),
  });
  b.claude = controls;
  b.focused = async () => {
    const a = await controls.enrich({ ...raw });
    if (b.actionContext) {
      C.assertContext(b.actionContext, a);
      if (b.actionContext.verifyChat)
        controls.assert(b.actionContext.target, a);
    }
    b.lastTarget = { ...a };
    return a;
  };
  b.method = async (_a, method) => {
    assert.equal(method, 'modes');
    return { modes: [{ number: 2004, set: true }] };
  };
  const invoke = async (action, fn) => {
    const a = await b.focused();
    return b.withContext(
      { action, target: C.snapshot(a), verifyChat: C.needsChat(action, a) },
      fn,
    );
  };
  return { b, controls, r, p, raw, state, calls, text, invoke };
}
test('a fresh hook-bound Claude turn interrupts once without a status line', async () => {
  const f = fixture(true);
  delete f.r.metadataAt;
  Object.assign(f.r, {
    establishedBy: 'UserPromptSubmit',
    establishedAt: 9999,
    state: 'working',
  });
  assert(!f.text().includes('Sonnet'));
  f.state.workingHint = false;
  f.controls.viewReader = async () => ({
    text: f.text().replace('Claude session', '✻ Thinking… (3s · ↓ 40 tokens)'),
  });
  await f.invoke('interrupt', () => f.b.interrupt());
  await assert.rejects(
    f.invoke('interrupt', () => f.b.interrupt()),
    /already requested/,
  );
  assert.deepEqual(
    f.calls.map((c) => c.args.at(-1)),
    ['escape'],
  );
});

test('claude controls', async () => {
  const approvalPanel =
    '────────────────────────\n Bash command\n /usr/bin/printf TEST_ONLY\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n Esc to cancel · Tab to amend';
  const nativeChecks =
    '────────────────────────\n←  ☒ Deck multi  ✔ Submit  →\nWhich test colors?\n❯ 1. [✔] Red\n  2. [ ] Blue\n    Submit\nEnter to select · ↑/↓ to navigate · Esc to cancel\n──────────────── Deck Claude validation ─';
  assert(dialog(nativeChecks, 'question').multiSelect);
  assert(dialog(nativeChecks, 'question').checkboxList);
  assert(
    dialog(
      nativeChecks.replace('❯ 1.', '  1.').replace('    Submit', '❯ Submit'),
      'question',
    ).checkboxList,
  );
  assert(
    !dialog(nativeChecks.replace('✔ Submit', 'Next question'), 'question')
      .multiSelect,
    'literal checkbox labels without the native multi-select header cannot expose Toggle',
  );
  const nativeReview =
    '────────────────────────\n←  ☒ Deck multi  ✔ Submit  →\nReview your answers\n ● Which test colors?\n   → Red, Blue\nReady to submit your answers?\n❯ 1. Submit answers\n  2. Cancel\n──────────────── Deck Claude validation ─';
  assert(dialog(nativeReview, 'question').review);
  assert(!dialog(nativeReview, 'question').multiSelect);
  assert.throws(() =>
    dialog(nativeReview.replace('2. Cancel', '2. Always allow'), 'question'),
  );
  assert.throws(() =>
    dialog(nativeReview + '\nAuthentication required', 'question'),
  );
  const reviewState = fixture();
  Object.assign(reviewState.r, {
    state: 'blocked',
    kind: 'question',
    requestId: 'review-request',
  });
  reviewState.raw.state = 'done';
  reviewState.controls.viewReader = async () => ({
    text: nativeReview,
    hash: hash(nativeReview),
    cursor: null,
  });
  let reviewed = await reviewState.b.focused();
  assert.equal(C.modeOf(reviewed), 'question');
  assert(
    reviewed.claudeQuestionReview,
    'the recognized review stays actionable when the native detector says done',
  );
  reviewState.r.kind = 'permission';
  assert.equal(
    C.modeOf(await reviewState.b.focused()),
    'unknown',
    'an unrelated permission request cannot grant question-review controls',
  );
  reviewState.r.kind = 'question';
  reviewState.controls.viewReader = async () => ({
    text: nativeReview + '\nAuthentication required',
    hash: 'other',
    cursor: null,
  });
  assert.equal(C.modeOf(await reviewState.b.focused()), 'unknown');
  const first = dialog('Printing test string\n' + approvalPanel, 'permission'),
    painted = dialog(
      '⏺ Printing test string\n' + approvalPanel.replace(' · Tab to amend', ''),
      'permission',
    );
  assert.equal(
    first.semantic,
    painted.semantic,
    'chat repaint and optional hints do not replace the same native approval panel',
  );
  assert.notEqual(
    first.hash,
    painted.hash,
    'the exact Confirm viewport guard still includes every change',
  );
  assert.notEqual(
    first.semantic,
    dialog(approvalPanel.replace('TEST_ONLY', 'OTHER_COMMAND'), 'permission')
      .semantic,
    'the full command remains request-bound',
  );
  assert.notEqual(
    first.semantic,
    dialog(approvalPanel.replace('2. No', '2. Yes, always'), 'permission')
      .semantic,
    'the complete choice list remains request-bound',
  );
  assert.notEqual(
    dialog('old chat\n' + approvalPanel + '\n' + approvalPanel, 'permission')
      .semantic,
    dialog(
      'changed chat\n' + approvalPanel + '\n' + approvalPanel,
      'permission',
    ).semantic,
    'ambiguous panel boundaries retain the full comparison',
  );
  const ended = fixture();
  Object.assign(ended.r, {
    state: 'blocked',
    kind: 'permission',
    requestId: 'ended-request',
    updatedAt: 9000,
    metadataAt: 10000,
  });
  ended.raw.state = 'blocked';
  ended.state.dialog = 'permission';
  const pending = C.snapshot(await ended.b.focused());
  ended.raw.state = 'done';
  ended.state.dialog = null;
  assert.equal(
    C.modeOf(await ended.b.focused()),
    'ready',
    'native ended state plus newer heartbeat and empty composer can recover a missing completion hook',
  );
  assert.equal(
    ended.r.state,
    'blocked',
    'visible reconciliation never rewrites private lifecycle authority',
  );
  await assert.rejects(() =>
    ended.b.withContext({ target: pending, action: 'approvalConfirm' }, () =>
      ended.b.approvalKey('enter'),
    ),
  );
  assert.equal(
    ended.calls.length,
    0,
    'an old Confirm cannot survive the native-ended transition',
  );
  ended.state.input = 'draft';
  assert.equal(
    C.modeOf(await ended.b.focused()),
    'unknown',
    'a draft cannot stand in for verified empty-composer recovery',
  );
  ended.state.input = '';
  ended.r.metadataAt = 8999;
  assert.equal(
    C.modeOf(await ended.b.focused()),
    'unknown',
    'a pre-request status line cannot recover a closed request',
  );
  ended.r.metadataAt = 10000;
  ended.state.dialog = 'permission';
  assert.equal(
    C.modeOf(await ended.b.focused()),
    'unknown',
    'an actual visible dialog prevents native-idle recovery',
  );
  const f = fixture();
  let a = await f.b.focused();
  assert.equal(a.chatId, 'claude-session');
  assert.equal(a.modelName, 'Sonnet 4.6');
  assert.equal(C.modeOf(a), 'ready');
  assert.equal(C.homeRow(a)[3], 'none');
  assert.equal(C.layout(0, a)[3], 'none');
  assert.equal(C.layout(0, a)[7], 'claudeInfo');
  for (const value of ['hello', 'hello world']) {
    f.state.input = value;
    a = await f.b.focused();
    const snapshot = composer(
      f.text(),
      { row: 3, column: 3 + value.length },
      a,
    );
    assert(!JSON.stringify(snapshot).includes(value));
  }
  assert.throws(() => composer(f.text(), { row: 3, column: 1 }, a));
  f.state.input = '/model';
  assert.throws(() => composer(f.text(), { row: 3, column: 9 }, a));
  f.state.input = '! rm';
  assert.throws(() => composer(f.text(), { row: 3, column: 7 }, a));
  f.state.input = '';
  assert.throws(() => composer(f.text(), { row: 3, column: 3 }, a));
  assert.throws(() =>
    composer(
      f.text().replace('Claude Sonnet', '-- NORMAL --\nClaude Sonnet'),
      { row: 3, column: 3 },
      a,
      { allowEmpty: true },
    ),
  );
  // Native 2.1.319 uses NBSP after the prompt glyph; keep exact input hashes.
  const nbsp = f.text().replace('❯ ', '❯\u00a0');
  assert(composer(nbsp, { row: 3, column: 3 }, a, { allowEmpty: true }).empty);
  assert.throws(() =>
    composer(nbsp, { row: 3, column: 2 }, a, { allowEmpty: true }),
  );
  assert.throws(() =>
    composer(
      nbsp.replace('❯\u00a0', '❯\u00a0/model'),
      { row: 3, column: 9 },
      a,
    ),
  );
  const spaced = f.text().replace('❯ ', '❯\u00a0hello');
  assert(!composer(spaced, { row: 3, column: 8 }, a).empty);
  const namedComposer = nbsp.replace(
    '────────────────────────',
    '──────────────── Deck Claude validation ─',
  );
  assert(
    composer(namedComposer, { row: 3, column: 3 }, a, { allowEmpty: true })
      .empty,
  );
  // The model shortcut never pastes or submits text. Native confirmation is a separate press.
  f.state.input = 'unsent draft';
  await f.invoke('model', () => f.controls.openPicker());
  assert.equal(f.calls.at(-1).args.at(-1), 'alt+p');
  assert.equal(f.state.input, 'unsent draft');
  assert.equal(f.calls.filter((x) => x.args[0] === 'send').length, 0);
  a = await f.b.focused();
  assert.equal(a.claudePicker, true);
  assert.equal(C.modeOf(a), 'question');
  await f.invoke('right', () => f.b.questionKey('right'));
  assert.equal(f.calls.at(-1).args.at(-1), 'right');
  await f.invoke('answer', () => f.b.questionKey('enter'));
  assert.equal(f.calls.at(-1).args.at(-1), 's');
  assert.equal(f.controls.picker, null);
  f.state.dialog = null;
  const pausedPicker = fixture();
  await pausedPicker.invoke('model', () => pausedPicker.controls.openPicker());
  const pickerTarget = { ...pausedPicker.b.lastTarget };
  pausedPicker.controls.now = () => 40000;
  const paused = await pausedPicker.controls.enrich(pausedPicker.raw);
  assert.equal(paused.claudePicker, true);
  assert.equal(paused.claudeControlsEnabled, true);
  assert.equal(paused.nativeIdentity, pickerTarget.nativeIdentity);
  assert.equal(
    pausedPicker.b.lastTarget.nativeIdentity,
    pickerTarget.nativeIdentity,
  );
  await pausedPicker.invoke('right', () => pausedPicker.b.questionKey('right'));
  assert.equal(pausedPicker.calls.at(-1).args.at(-1), 'right');
  pausedPicker.controls.now = () => 310001;
  const expiredPicker = await pausedPicker.controls.enrich(pausedPicker.raw);
  assert.equal(expiredPicker.claudeControlsEnabled, false);
  assert(
    pausedPicker.b.lastTarget,
    'expired metadata disables controls without discarding a known root selection',
  );
  assert.notEqual(expiredPicker.nativeIdentity, pickerTarget.nativeIdentity);
  const pausedChanged = fixture();
  await pausedChanged.invoke('model', () =>
    pausedChanged.controls.openPicker(),
  );
  pausedChanged.controls.now = () => 40000;
  pausedChanged.r.sessionId = 'different-root';
  assert.equal(
    (await pausedChanged.controls.enrich(pausedChanged.raw))
      .claudeControlsEnabled,
    false,
  );
  assert.equal(
    pausedChanged.b.lastTarget,
    null,
    'a modal cannot mask a root session change',
  );
  for (const kind of ['question', 'permission']) {
    const pausedRequest = fixture();
    await pausedRequest.b.focused();
    pausedRequest.r.state = 'blocked';
    pausedRequest.r.kind = kind;
    pausedRequest.r.requestId = 'request-one';
    pausedRequest.state.dialog = kind;
    pausedRequest.controls.now = () => 40000;
    const visible = await pausedRequest.controls.enrich(pausedRequest.raw);
    assert.equal(visible.claudeControlsEnabled, true);
    assert.equal(visible.kind, kind);
    await pausedRequest.invoke(
      kind === 'question' ? 'answer' : 'approvalConfirm',
      () =>
        kind === 'question'
          ? pausedRequest.b.questionKey('enter')
          : pausedRequest.b.approvalKey('enter'),
    );
    assert.equal(pausedRequest.calls.at(-1).args.at(-1), 'enter');
  }
  const unconfirmedRequest = fixture();
  unconfirmedRequest.r.metadataAt = null;
  unconfirmedRequest.r.state = 'blocked';
  unconfirmedRequest.r.kind = 'question';
  unconfirmedRequest.r.requestId = 'request';
  unconfirmedRequest.state.dialog = 'question';
  await unconfirmedRequest.controls.enrich(unconfirmedRequest.raw);
  assert.equal(
    (await unconfirmedRequest.controls.enrich(unconfirmedRequest.raw))
      .claudeControlsEnabled,
    false,
    'waiting UI cannot establish root identity without an earlier matching heartbeat',
  );
  const efficient = fixture();
  efficient.r.state = 'blocked';
  efficient.r.kind = 'permission';
  efficient.r.requestId = 'request';
  efficient.state.dialog = 'permission';
  const efficientTarget = C.snapshot(await efficient.b.focused());
  let focusChecks = 0;
  const originalFocus = efficient.b.focused;
  efficient.b.focused = async () => {
    focusChecks++;
    return originalFocus();
  };
  await efficient.b.withContext(
    { action: 'approvalDown', target: efficientTarget, verifyChat: false },
    () => efficient.b.approvalKey('down'),
  );
  assert.equal(
    focusChecks,
    2,
    'one initial and one final focus check per Claude waiting key',
  );
  assert.equal(efficient.calls.length, 1);
  const selectionRace = fixture();
  selectionRace.r.state = 'blocked';
  selectionRace.r.kind = 'permission';
  selectionRace.r.requestId = 'request';
  selectionRace.state.dialog = 'permission';
  const raceTarget = C.snapshot(await selectionRace.b.focused()),
    originalView = selectionRace.controls.viewReader;
  let reads = 0;
  selectionRace.controls.viewReader = async (a) => {
    const v = await originalView(a);
    if (++reads >= 2) {
      v.text = v.text.replace('❯ 1.', '  1.').replace('  2.', '❯ 2.');
      v.hash = hash(v.text);
    }
    return v;
  };
  await assert.rejects(
    () =>
      selectionRace.b.withContext(
        { action: 'approvalConfirm', target: raceTarget, verifyChat: false },
        () => selectionRace.b.approvalKey('enter'),
      ),
    /view changed/,
  );
  assert.equal(
    selectionRace.calls.length,
    0,
    'a selected-choice race is refused even when the request body is unchanged',
  );
  const namedQuestion =
    'Which color?\n❯ 1. Red\n  2. Blue\nEnter to select · ↑/↓ to navigate · Esc to cancel\n──────────────── Deck Claude validation ─';
  assert(dialog(namedQuestion, 'question'));
  assert(
    dialog(
      namedQuestion.replace(
        'Enter to select',
        'Space to toggle · Enter to submit',
      ),
      'question',
    ).multiSelect,
  );
  const stage = fixture();
  await stage.invoke('review', () => stage.b.stage('review'));
  assert(stage.b.draft.snapshot);
  assert(stage.calls[0].input.startsWith('\x1b[200~'));
  assert(
    !JSON.stringify(stage.b.draft).includes(stage.b.config.prompts.review),
  );
  stage.state.input += ' edited';
  const writes = stage.calls.length;
  await assert.rejects(
    () => stage.invoke('send', () => stage.b.send()),
    /draft changed/,
  );
  assert.equal(stage.calls.length, writes);
  assert.equal(stage.b.draft, null);
  const send = fixture();
  await send.invoke('review', () => send.b.stage('review'));
  await send.invoke('send', () => send.b.send());
  assert.equal(send.calls.at(-1).args.at(-1), 'enter');
  assert.equal(send.b.draft, null);
  await assert.rejects(() => send.b.send());
  const uncertain = fixture();
  await uncertain.invoke('review', () => uncertain.b.stage('review'));
  uncertain.state.failWrite = true;
  await assert.rejects(
    () => uncertain.invoke('send', () => uncertain.b.send()),
    /Uncertain/,
  );
  assert.equal(uncertain.b.draft, null);
  const after = uncertain.calls.length;
  await assert.rejects(() => uncertain.b.send());
  assert.equal(uncertain.calls.length, after);
  for (const kind of ['steer', 'queue']) {
    const x = fixture();
    x.r.state = 'working';
    x.state.input = 'Please continue';
    await x.invoke(kind, () => x.b.submitRunning(kind));
    assert.deepEqual(
      x.calls.at(-1).args.slice(5),
      kind === 'queue' ? ['ctrl+x', 'enter'] : ['ctrl+x', 'ctrl+s'],
    );
    const n = x.calls.length;
    await assert.rejects(
      () => x.invoke(kind, () => x.b.submitRunning(kind)),
      /Already submitted/,
    );
    assert.equal(x.calls.length, n);
  }
  const running = fixture();
  running.r.state = 'working';
  await running.invoke('interrupt', () => running.b.interrupt());
  assert.equal(running.calls.at(-1).args.at(-1), 'escape');
  await assert.rejects(
    () => running.invoke('interrupt', () => running.b.interrupt()),
    /already requested/,
  );
  running.state.workingHint = false;
  await assert.rejects(() => running.b.interrupt());
  for (const kind of ['question', 'permission']) {
    const x = fixture();
    x.r.state = 'blocked';
    x.r.kind = kind;
    x.r.requestId = 'request-one';
    x.state.dialog = kind;
    await x.invoke(kind === 'question' ? 'answer' : 'approvalConfirm', () =>
      kind === 'question' ? x.b.questionKey('enter') : x.b.approvalKey('enter'),
    );
    assert.equal(x.calls.at(-1).args.at(-1), 'enter');
  }
  const multi = fixture();
  multi.r.state = 'blocked';
  multi.r.kind = 'question';
  multi.r.requestId = 'checkbox-request';
  multi.state.dialog = 'question';
  multi.state.multiSelect = true;
  assert.equal(C.homeRow(await multi.b.focused()).at(-1), 'claudeToggle');
  await multi.invoke('claudeToggle', () => multi.b.questionKey('space'));
  assert.equal(multi.calls.at(-1).args.at(-1), 'space');
  multi.state.multiSelect = false;
  const toggles = multi.calls.length;
  await assert.rejects(() => multi.b.questionKey('space'));
  assert.equal(multi.calls.length, toggles);
  const unstable = fixture();
  unstable.r.state = 'blocked';
  unstable.r.kind = 'permission';
  unstable.r.requestId = 'approval';
  unstable.state.dialog = 'permission';
  const stableTarget = C.snapshot(await unstable.b.focused());
  unstable.state.changed = true;
  await assert.rejects(() =>
    unstable.b.withContext(
      { target: stableTarget, action: 'approvalConfirm', verifyChat: true },
      () => unstable.b.approvalKey('enter'),
    ),
  );
  assert.equal(unstable.calls.length, 0);
  const redraw = fixture();
  redraw.r.state = 'blocked';
  redraw.r.kind = 'permission';
  redraw.r.requestId = 'request';
  redraw.state.dialog = 'permission';
  const beforeRedraw = await redraw.b.focused(),
    readBefore = redraw.controls.viewReader;
  redraw.controls.viewReader = async () => {
    throw Error('Claude view changed');
  };
  const pendingView = await redraw.controls.enrich(redraw.raw);
  assert.equal(pendingView.nativeVerified, true);
  assert.equal(pendingView.nativeIdentity, beforeRedraw.nativeIdentity);
  assert.equal(pendingView.claudeControlsEnabled, false);
  assert(redraw.b.lastTarget);
  redraw.controls.viewReader = readBefore;
  const settledView = await redraw.controls.enrich(redraw.raw);
  assert.notEqual(settledView.claudeUiEpoch, beforeRedraw.claudeUiEpoch);
  await assert.rejects(
    () =>
      redraw.b.withContext(
        {
          target: C.snapshot(beforeRedraw),
          action: 'approvalConfirm',
          verifyChat: false,
        },
        () => redraw.b.approvalKey('enter'),
      ),
    /updating/,
  );
  assert.equal(redraw.calls.length, 0);
  const newTurn = fixture();
  newTurn.r.state = 'working';
  newTurn.state.input = 'Message';
  const priorTurn = C.snapshot(await newTurn.b.focused()),
    readView = newTurn.controls.viewReader;
  newTurn.controls.viewReader = async (a) => {
    const view = await readView(a);
    newTurn.r.turnId = 'changed-turn';
    return view;
  };
  await assert.rejects(() =>
    newTurn.b.withContext(
      { target: priorTurn, action: 'queue', verifyChat: true },
      () => newTurn.b.submitRunning('queue'),
    ),
  );
  assert.equal(newTurn.calls.length, 0);
  const changed = fixture();
  changed.r.state = 'blocked';
  changed.r.kind = 'permission';
  changed.r.requestId = 'request-one';
  changed.state.dialog = 'permission';
  const target = C.snapshot(await changed.b.focused());
  changed.r.requestId = 'request-two';
  await assert.rejects(
    () =>
      changed.b.withContext(
        { target, action: 'approvalConfirm', verifyChat: true },
        () => changed.b.approvalKey('enter'),
      ),
    /changed/,
  );
  assert.equal(changed.calls.length, 0);
  const replace = fixture();
  const old = C.snapshot(await replace.b.focused());
  replace.r.sessionId = 'other-chat';
  await assert.rejects(() =>
    replace.b.withContext(
      { target: old, action: 'model', verifyChat: true },
      () => replace.b.cycleControl('model'),
    ),
  );
  assert.equal(replace.calls.length, 0);
  const lost = fixture();
  const original = await lost.b.focused();
  lost.controls.read = async () => {
    throw Error('missing');
  };
  await lost.controls.enrich(lost.raw);
  lost.controls.read = async () => ({ ...lost.r });
  const restored = await lost.b.focused();
  assert.notEqual(original.nativeIdentity, restored.nativeIdentity);
  const disabled = fixture();
  disabled.b.config.claude.enabled = false;
  assert.equal(C.modeOf(await disabled.b.focused()), 'unknown');
  await assert.rejects(() => disabled.b.cycleControl('model'));
  assert.equal(disabled.calls.length, 0);
  const remapped = fixture(),
    originalBindings = await remapped.b.focused();
  remapped.controls.bindingsDefault = () => false;
  assert.equal(C.modeOf(await remapped.b.focused()), 'unknown');
  await assert.rejects(() => remapped.b.cycleControl('model'));
  assert.equal(remapped.calls.length, 0);
  remapped.controls.bindingsDefault = () => true;
  const restoredBindings = await remapped.b.focused();
  assert.notEqual(
    originalBindings.nativeIdentity,
    restoredBindings.nativeIdentity,
    'restoring default bindings does not revive an old key press',
  );
  const heartbeat = fixture(),
    beforeHeartbeat = await heartbeat.b.focused();
  heartbeat.r.metadataAt = 1;
  heartbeat.controls.now = () => 20000;
  const staleHeartbeat = await heartbeat.controls.enrich(heartbeat.raw);
  assert.equal(C.modeOf(staleHeartbeat), 'unknown');
  assert.equal(
    heartbeat.b.lastTarget.nativeIdentity,
    staleHeartbeat.nativeIdentity,
    'same root keeps its selection when metadata freshness changes',
  );
  await assert.rejects(() => heartbeat.b.cycleControl('model'));
  assert.equal(heartbeat.calls.length, 0);
  heartbeat.r.metadataAt = 20000;
  const afterHeartbeat = await heartbeat.b.focused();
  assert.notEqual(
    beforeHeartbeat.nativeIdentity,
    afterHeartbeat.nativeIdentity,
  );
  const other = fixture();
  other.p.version = 'future';
  assert.equal((await other.b.focused()).nativeVerified, false);
  assert.equal(C.modeOf(await other.b.focused()), 'unknown');
  await assert.rejects(() => other.b.submitRunning('queue'));
  assert.equal(other.calls.length, 0);
  const view = fixture();
  view.r.state = 'blocked';
  view.r.kind = 'permission';
  view.r.requestId = 'r';
  view.state.dialog = 'permission';
  const snapshot = dialog(view.text(), 'permission');
  view.state.dialog = 'question';
  assert.throws(() => dialog(view.text(), 'permission'));
  assert(snapshot.hash);
  assert.throws(
    () =>
      dialog(
        'Select model\n❯ 1. Default\nEnter to confirm · Esc to exit',
        'picker',
      ),
    'a picker without a visible session-only apply hint cannot be confirmed',
  );
  console.log(
    'PASS Claude native picker/effort navigation, explicit Confirm, no mode expansion, staged/edited/uncertain Send, provider-specific Queue/Send-now, guarded Interrupt, waiting-request/session changes, rebindings, opt-in and unsupported-version refusal',
  );
});
