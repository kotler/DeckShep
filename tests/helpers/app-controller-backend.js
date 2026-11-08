const { fixtureBuild } = require('./herdr-app-focus');
const { fakeServer } = require('./herdr-app-server');
const { AppPeerVerifier } = require('../../src/terminals/herdr-app/peer');
const {
  GuardedAppFocusSender,
} = require('../../src/terminals/herdr-app/focus-sender');
const f = require('../fixtures/backends/herdr-app/index.cjs');
async function appControllerBackend(t) {
  const build = fixtureBuild(t),
    world = structuredClone(f.world),
    status = structuredClone(f.status),
    commands = [
      {
        name: 'pane.focus',
        about: 'Focus a pane.',
        args: [
          { name: 'pane', required: false },
          { name: 'terminal', required: false },
        ],
      },
    ];
  let pause = false,
    release,
    paused;
  const waiting = new Promise((resolve) => {
    paused = resolve;
  });
  for (let index = 2; index <= 7; index++)
    world.spaces[0].tabs[0].terminals.push({
      terminal: 't' + index,
      pane: 'p' + index,
      app: 'codex',
      status: 'idle',
      name: 'Pane ' + index,
      sub_agents: [],
    });
  const peer = await fakeServer(
    t,
    (socket, request) => {
      socket.end(
        JSON.stringify(
          request.ls
            ? world
            : request.status
              ? status
              : request.commands
                ? commands
                : { ok: true },
        ) + '\n',
      );
    },
    'herdr-app.sock',
  );
  const backend = {
    recordCount: 1,
    helperAvailable: () => true,
    create(config, authority) {
      return new GuardedAppFocusSender(
        new AppPeerVerifier(
          async (socket) => {
            const tail = peer.calls
              .slice(-4)
              .map((call) =>
                call.commands
                  ? 'commands'
                  : call.ls
                    ? 'ls'
                    : call.status
                      ? 'status'
                      : 'focus',
              );
            if (
              pause &&
              socket.bytesWritten === 0 &&
              JSON.stringify(tail) ===
                JSON.stringify(['commands', 'status', 'ls', 'status'])
            ) {
              pause = false;
              paused();
              await new Promise((resolve) => {
                release = resolve;
              });
            }
            return structuredClone(build.evidence);
          },
          [build.record],
          build.decoder,
        ),
        authority,
        { appHome: config.herdrApp.home },
      );
    },
  };
  return {
    backend,
    home: peer.directory,
    world,
    status,
    peer,
    build,
    inputs: () => peer.calls.filter((request) => request.do),
    pause: () => {
      pause = true;
      return waiting;
    },
    release: () => release?.(),
  };
}
module.exports = { appControllerBackend };
