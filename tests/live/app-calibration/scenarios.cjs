const { AppPeerVerifier } = require('../../../src/terminals/herdr-app/peer');
const {
  GuardedAppFocusSender,
} = require('../../../src/terminals/herdr-app/focus-sender');
const { AppFocusAuthority } = require('../../../src/guards/app-focus-request');
const { CalibrationChannel } = require('./channel.cjs');
const { hash } = require('./artifacts.cjs');

async function waitFor(
  predicate,
  {
    timeoutMs = 10000,
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => performance.now(),
  } = {},
) {
  const deadline = now() + timeoutMs;
  for (;;) {
    if (await predicate()) return;
    if (now() >= deadline) throw Error('Calibration readiness timed out');
    await delay(50);
  }
}
function requireCommand(commands, name, fields) {
  const matches = commands.filter((command) => command.name === name);
  if (
    matches.length !== 1 ||
    matches[0].args.length !== fields.length ||
    !fields.every(
      (name) =>
        matches[0].args.filter((arg) => arg.name === name && !arg.required)
          .length === 1,
    )
  )
    throw Error('Calibration command mismatch');
}
function capture(state, sender, target, now) {
  Object.assign(state, {
    target,
    endpointGeneration: sender.generation,
    peerKey: sender.peerKey,
    recordKey: sender.recordKey,
    stamp: String(++state.appearance),
    armedAt: now(),
  });
}
/** Exercises the real sender with a manifest-supplied test-only build record.
 * No observed hash is automatically trusted or written into production data. */
async function calibrate(
  gate,
  {
    decoder,
    now = () => performance.now(),
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    recordRequest = () => {},
  } = {},
) {
  const channel = new CalibrationChannel(gate),
    hello = await channel.coreStatus(),
    commands = await channel.appRead({ commands: true }, 'herdrAppCommands');
  requireCommand(commands, 'pane.focus', ['pane', 'terminal']);
  requireCommand(commands, 'space.new', [
    'name',
    'folder',
    'tab',
    'argv',
    'task',
    'machine',
  ]);
  const initial = await channel.appRead({ ls: true }, 'herdrAppWorld');
  if (initial.spaces.length) throw Error('Calibration App home not fresh');
  const state = {
      scope: 'herdr-app',
      control: 'requestFocus',
      appearance: 1,
      visibility: 1,
      generation: 1,
      backendKey: 'app-calibration-only',
      page: 0,
      stamp: 'initial',
      armedAt: 0,
      endpointGeneration: 0,
      peerKey: '',
      recordKey: '',
      target: null,
      visible: true,
      setupBusy: false,
      focusRequestEnabled: true,
    },
    authority = new AppFocusAuthority(() => state, now),
    verifier = new AppPeerVerifier(
      (socket, signal) => gate.peer('app', socket, signal),
      [gate.artifacts.manifest.appRecord],
      decoder,
    ),
    sender = new GuardedAppFocusSender(verifier, authority, {
      appHome: gate.env.HERDR_APP_HOME,
    });
  const observations = [],
    requests = [];
  try {
    // Fresh disk state alone cannot establish a usable App view. Refuse errors,
    // overlays, conflicting active flags or an unexpected pane before setup.
    gate.checkBoth();
    const empty = await sender.observe(gate.signal);
    if (empty.panes.length || empty.selected !== null)
      throw Error('Calibration App home not fresh');
    for (let count = 1; count <= 2; count++) {
      await channel.newSpace();
      gate.captureDescendants();
      await waitFor(
        async () => {
          gate.checkBoth();
          const snapshot = await sender.observe(gate.signal);
          if (snapshot.panes.length !== count) return false;
          observations.push(snapshot);
          return true;
        },
        { now, delay },
      );
    }
    gate.checkBoth();
    const snapshot = await sender.observe(gate.signal);
    if (
      snapshot.panes.length !== 2 ||
      new Set(snapshot.panes.map((pane) => pane.target.space)).size !== 2
    )
      throw Error('Calibration topology mismatch');
    // Each request gets its own 350 ms arming interval and one-use permit.
    for (const pane of snapshot.panes) {
      capture(state, sender, pane.target, now);
      const captured = { ...structuredClone(state), pressedAt: now() + 10000 };
      let refused = false;
      try {
        authority.issue(captured);
      } catch {
        refused = true;
      }
      if (!refused) throw Error('Calibration future press accepted');
      await delay(350);
      if (now() - state.armedAt < 350) throw Error('Calibration arming failed');
      const permit = authority.issue({
          ...structuredClone(state),
          pressedAt: now(),
        }),
        started = now();
      gate.checkBoth();
      let reply, failure;
      try {
        reply = await sender.deliver(
          { kind: 'requestFocus' },
          permit,
          gate.signal,
        );
      } catch (error) {
        failure = error.message === 'Focus uncertain' ? 'uncertain' : 'refused';
      }
      if (failure) {
        recordRequest({
          status: failure,
          elapsedMs: Math.round((now() - started) * 100) / 100,
          acknowledged: false,
        });
        throw Error('Calibration focus request failed');
      }
      if (reply.status !== 'requested' || reply.verifiedFocus !== false)
        throw Error('Calibration claim mismatch');
      requests.push({
        status: 'requested',
        elapsedMs: Math.round((now() - started) * 100) / 100,
        acknowledged: true,
      });
      recordRequest(requests.at(-1));
      // Model feedback is recorded separately; an ack never establishes focus.
      gate.checkBoth();
      const after = await sender.observe(gate.signal);
      requests.at(-1).modelSelectedTarget =
        after.selected?.pane === pane.target.pane;
      await expectRefusal(
        () => sender.deliver({ kind: 'requestFocus' }, permit),
        gate,
      );
    }
    capture(state, sender, snapshot.panes[0].target, now);
    await delay(350);
    const stale = authority.issue({
      ...structuredClone(state),
      pressedAt: now(),
    });
    state.generation++;
    await expectRefusal(
      () => sender.deliver({ kind: 'requestFocus' }, stale),
      gate,
    );
    capture(state, sender, snapshot.panes[0].target, now);
    await delay(350);
    const revoked = authority.issue({
      ...structuredClone(state),
      pressedAt: now(),
    });
    state.focusRequestEnabled = false;
    await expectRefusal(
      () => sender.deliver({ kind: 'requestFocus' }, revoked),
      gate,
    );
    return {
      core: {
        version: hello.version,
        generation: hello.generation,
        methodsCount: hello.methods.length,
        methodsSha256: hash(JSON.stringify([...hello.methods].sort())),
        featuresCount: hello.features.length,
        featuresSha256: hash(JSON.stringify([...hello.features].sort())),
      },
      panes: observations.at(-1).panes.length,
      requests,
      refusals: [
        'future-press',
        'reused-permit',
        'stale-generation',
        'revoked-consent',
      ],
      verifiedFocus: false,
    };
  } finally {
    sender.dispose();
  }
}
async function expectRefusal(action, gate) {
  const peerChecks = gate.peerChecks;
  let refused = false;
  try {
    await action();
  } catch {
    refused = true;
  }
  if (!refused || gate.peerChecks !== peerChecks)
    throw Error('Calibration refusal failed');
}
module.exports = { calibrate, waitFor };
