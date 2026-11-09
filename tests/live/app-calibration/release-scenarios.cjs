const fs = require('node:fs');
const { once } = require('node:events');
const { CalibrationChannel } = require('./channel.cjs');
const { waitFor } = require('./scenarios.cjs');
const { AppPeerVerifier } = require('../../../src/terminals/herdr-app/peer');
const {
  GuardedAppFocusSender,
} = require('../../../src/terminals/herdr-app/focus-sender');
const { AppFocusAuthority } = require('../../../src/guards/app-focus-request');

class WindowChannel extends CalibrationChannel {
  validateRequests(kind, payloads) {
    if (
      kind === 'app' &&
      JSON.stringify(payloads) === '[{"do":"window.minimize","args":{}}]'
    )
      return;
    super.validateRequests(kind, payloads);
  }
  minimize() {
    return this.exchange(
      'app',
      [{ do: 'window.minimize', args: {} }],
      ['herdrAppFocusReply'],
    );
  }
}
function requestClient(run, record = run.artifacts.manifest.appRecord) {
  const state = {
    scope: 'herdr-app',
    control: 'requestFocus',
    appearance: 1,
    visibility: 1,
    generation: 1,
    backendKey: 'release-calibration-only',
    page: 0,
    stamp: 'release',
    armedAt: 0,
    endpointGeneration: 0,
    peerKey: '',
    recordKey: '',
    target: null,
    visible: true,
    setupBusy: false,
    focusRequestEnabled: true,
  };
  const authority = new AppFocusAuthority(() => state);
  const verifier = new AppPeerVerifier(
    (socket, signal) => run.gate.peer('app', socket, signal),
    [record],
    undefined,
    (socket, signal) => run.gate.openAppPeer(socket, signal),
  );
  return {
    state,
    authority,
    sender: new GuardedAppFocusSender(verifier, authority, {
      appHome: run.env.HERDR_APP_HOME,
    }),
  };
}
async function arm(client, target) {
  Object.assign(client.state, {
    target,
    armedAt: performance.now(),
    endpointGeneration: client.sender.generation,
    peerKey: client.sender.peerKey,
    recordKey: client.sender.recordKey,
  });
  // Timers can wake slightly early; measure the full interval before issuing.
  while (performance.now() - client.state.armedAt < 350)
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(
          1,
          Math.ceil(350 - (performance.now() - client.state.armedAt)),
        ),
      ),
    );
  return client.authority.issue({
    ...structuredClone(client.state),
    pressedAt: performance.now(),
  });
}
async function restartApp(run) {
  const child = run.children.app;
  run.gate.captureDescendants();
  run.owned.assert(child.pid);
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([
    exited,
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(Error('Owned restart timed out')),
        5000,
      );
      timer.unref();
    }),
  ]);
  // Only a proved exited test child can release this epoch. No process is adopted.
  const socket = run.gate.files.app;
  if (fs.existsSync(socket)) {
    const stat = fs.lstatSync(socket);
    if (!stat.isSocket() || stat.uid !== process.getuid())
      throw Error('Restart endpoint unsafe');
    fs.unlinkSync(socket);
  }
  run.gate.paths.delete('app');
  run.gate.peers.delete('app');
  run.children.app = run.effects.launch(run, run.artifacts.app, [], {
    cwd: run.root,
    env: run.env,
  });
  await waitFor(() => {
    run.signal.throwIfAborted();
    run.gate.assertChildren();
    if (!fs.existsSync(socket)) return false;
    run.gate.checkBoth();
    return true;
  });
}
async function releaseScenarios(run) {
  const result = (run.report.releaseScenarios = {});
  const client = requestClient(run);
  try {
    run.phase = 'release-build-refusal';
    const rejected = requestClient(run, {
      ...run.artifacts.manifest.appRecord,
      executableSha256: 'f'.repeat(64),
    });
    try {
      let refused = false;
      try {
        await rejected.sender.observe(run.signal);
      } catch {
        refused = true;
      }
      if (!refused) throw Error('Unknown build accepted');
      result.unknownBuildRefused = true;
    } finally {
      rejected.sender.dispose();
    }
    run.phase = 'release-reconnect';
    const before = await client.sender.observe(run.signal);
    const again = await client.sender.observe(run.signal);
    if (
      before.panes.length !== 2 ||
      JSON.stringify(before.selected) !== JSON.stringify(again.selected)
    )
      throw Error('Reconnect view changed');
    result.reconnectStable = true;
    run.phase = 'release-minimize';
    const reply = await new WindowChannel(run.gate).minimize();
    if (reply[0].ok !== true) throw Error('Minimize refused');
    const minimized = await client.sender.observe(run.signal);
    const request = await client.sender.deliver(
      { kind: 'requestFocus' },
      await arm(client, minimized.panes[0].target),
      run.signal,
    );
    if (request.status !== 'requested' || request.verifiedFocus !== false)
      throw Error('Minimized request failed');
    result.minimizeAcknowledged = true;
    result.minimizedRequestAcknowledged = true;
    result.verifiedFocus = false;
    const oldPermit = await arm(client, minimized.panes[0].target);
    run.phase = 'release-owned-restart';
    await restartApp(run);
    let oldBindingRefused = false;
    try {
      await client.sender.observe(run.signal);
    } catch {
      oldBindingRefused = true;
    }
    if (!oldBindingRefused) throw Error('Restart binding accepted');
    result.preRestartBindingRefused = true;
    let refused = false;
    try {
      await client.sender.deliver(
        { kind: 'requestFocus' },
        oldPermit,
        run.signal,
      );
    } catch {
      refused = true;
    }
    if (!refused) throw Error('Restart press accepted');
    result.preRestartPressRefused = true;
    const fresh = requestClient(run);
    try {
      let restored;
      await waitFor(async () => {
        try {
          restored = await fresh.sender.observe(run.signal);
        } catch (error) {
          // Startup may restore active flags between the bracketed reads. This
          // bounded readiness wait retries only reads, never a focus mutation.
          if (
            ['App selection changed', 'App selection ambiguous'].includes(
              error.message,
            )
          )
            return false;
          throw error;
        }
        return restored.panes.length === 2;
      });
      const request = await fresh.sender.deliver(
        { kind: 'requestFocus' },
        await arm(fresh, restored.panes[1].target),
        run.signal,
      );
      if (request.status !== 'requested' || request.verifiedFocus !== false)
        throw Error('Restart request failed');
      result.restartRestoredPanes = 2;
      result.freshPostRestartRequestAcknowledged = true;
    } finally {
      fresh.sender.dispose();
    }
    run.gate.captureDescendants();
  } finally {
    client.sender.dispose();
  }
  return result;
}
module.exports = { releaseScenarios, WindowChannel, requestClient, arm };
