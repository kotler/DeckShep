const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { fixtureBuild } = require('./herdr-app-focus');
const {
  hash,
  treeFiles,
  treeHash,
  APP_SOURCE,
  CORE_SOURCE,
} = require('../live/app-calibration/artifacts.cjs');
const f = require('../fixtures/backends/herdr-app/index.cjs');

const authorized = {
  ASW_LIVE: '1',
  ASW_LIVE_AUTHORIZATION: 'test-owned-only',
  ASW_LIVE_HERDR_APP: '1',
};
function calibrationArtifacts(t) {
  const build = fixtureBuild(t),
    directory = build.root;
  fs.renameSync(
    path.join(directory, 'Sample.app'),
    path.join(directory, 'Herdr.app'),
  );
  for (const name of ['herdr-core', 'herdr-app-peer'])
    fs.writeFileSync(
      path.join(directory, name),
      Buffer.from('Never executed: ' + name),
      { mode: 0o700 },
    );
  const manifest = {
    schema: 1,
    buildMode: 'source-no-updater',
    appSource: APP_SOURCE,
    coreSource: CORE_SOURCE,
    appTreeSha256: treeHash(treeFiles(path.join(directory, 'Herdr.app'))),
    appRecord: build.record,
    core: {
      version: '0.1.18',
      sha256: hash(fs.readFileSync(path.join(directory, 'herdr-core'))),
      cdHash: 'b'.repeat(40),
    },
    helperSha256: hash(fs.readFileSync(path.join(directory, 'herdr-app-peer'))),
  };
  const file = path.join(directory, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(manifest), { mode: 0o600 });
  return {
    directory,
    manifest,
    decoder: build.decoder,
    save: () => fs.writeFileSync(file, JSON.stringify(manifest)),
  };
}
/** Fixture effects own only their temporary files and in-process sockets. No
 * process launch, process inspection, native helper or real HOME is needed. */
function calibrationFixture(t, options = {}) {
  const artifacts = calibrationArtifacts(t),
    launches = [],
    calls = [],
    probes = [],
    servers = [],
    clients = new Set(),
    world = { spaces: [], recent: [] },
    status = {
      ...f.status,
      space: null,
      tab: null,
      focused_pane: null,
      agent: null,
    };
  let now = 1000,
    shutdowns = 0,
    fingerprints = 0;
  const commands = [
    {
      name: 'pane.focus',
      about: '',
      args: ['pane', 'terminal'].map((name) => ({ name, required: false })),
    },
    {
      name: 'space.new',
      about: '',
      args: ['name', 'folder', 'tab', 'argv', 'task', 'machine'].map(
        (name) => ({ name, required: false }),
      ),
    },
  ];
  function activate(index) {
    for (const [position, space] of world.spaces.entries())
      space.active = position === index;
    const space = world.spaces[index];
    Object.assign(status, {
      space: space.id,
      tab: space.tabs[0].id,
      focused_pane: space.tabs[0].terminals[0].pane,
      agent: null,
    });
  }
  function respond(kind, socket, request) {
    calls.push({ kind, request });
    if (
      options.respond?.({ kind, socket, request, world, status, commands }) ===
      true
    )
      return;
    let value;
    if (kind === 'core') {
      value =
        request.method === 'hello'
          ? structuredClone(f.hello)
          : { ...f.coreStatus, pid: 111 };
      value = { jsonrpc: '2.0', id: request.id, result: value };
    } else if (request.commands) value = commands;
    else if (request.ls) value = world;
    else if (request.status) value = status;
    else if (request.do === 'space.new') {
      const index = world.spaces.length + 1;
      world.spaces.push({
        id: 'sp' + index,
        name: '',
        folder: '',
        machine: null,
        active: true,
        tabs: [
          {
            id: 'tb' + index,
            name: '',
            active: true,
            settled: true,
            terminals: [
              {
                terminal: 't' + index,
                pane: 'p' + index,
                app: null,
                status: null,
                name: null,
                sub_agents: [],
              },
            ],
          },
        ],
      });
      activate(index - 1);
      value = { space: 'sp' + index, tab: 'tb' + index, terminal: 't' + index };
    } else {
      if (!options.ackOnly)
        activate(
          world.spaces.findIndex(
            (space) => space.tabs[0].terminals[0].pane === request.args.pane,
          ),
        );
      value = { ok: true };
    }
    socket.write(JSON.stringify(value) + '\n');
  }
  const owned = {
    spawn(file, args, launchOptions) {
      const kind = args[0] === 'serve' ? 'core' : 'app',
        child = {
          pid: kind === 'core' ? 111 : 222,
          exitCode: null,
          signalCode: null,
        };
      launches.push({ kind, file, args, ...launchOptions, child });
      options.onSpawn?.({ kind, file, args, ...launchOptions });
      const endpoint =
          kind === 'core'
            ? launchOptions.env.HC_SOCKET
            : path.join(launchOptions.env.HERDR_APP_HOME, 'herdr-app.sock'),
        server = net.createServer((socket) => {
          clients.add(socket);
          socket.on('error', () => {});
          socket.on('close', () => clients.delete(socket));
          let buffer = '';
          socket.on('data', (bytes) => {
            buffer += bytes.toString();
            for (;;) {
              const end = buffer.indexOf('\n');
              if (end < 0) break;
              const line = buffer.slice(0, end);
              buffer = buffer.slice(end + 1);
              respond(kind, socket, JSON.parse(line));
            }
          });
        });
      servers.push(server);
      server.on('error', () => {
        child.exitCode = 1;
      });
      server.listen(endpoint);
      // Private umask is set by the runner before any synthetic launch.
      return child;
    },
    assert(pid) {
      if (
        !launches.some(
          (launch) =>
            launch.child.pid === pid && launch.child.exitCode === null,
        )
      )
        throw Error('Fixture unowned PID');
    },
    observe(pid) {
      this.assert(pid);
    },
    captureDescendants() {
      for (const launch of launches) this.assert(launch.child.pid);
    },
    async shutdown() {
      shutdowns++;
      await close();
      if (options.cleanupFails)
        throw Error('private fixture path must not escape');
      for (const launch of launches) launch.child.exitCode = 0;
    },
  };
  async function close() {
    for (const client of clients) client.destroy();
    for (const server of servers)
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
  }
  t.after(async () => {
    await close();
    for (const directory of new Set(launches.map((launch) => launch.cwd)))
      fs.rmSync(directory, { recursive: true, force: true });
  });
  const effects = {
    platform: 'darwin',
    owned,
    decoder: artifacts.decoder,
    settingsHashes: () => ({
      fingerprint:
        ++fingerprints > 1 && options.settingsChanged ? 'changed' : 'same',
    }),
    now: () => now,
    delay: async (ms) => {
      now += ms;
      await new Promise((resolve) => setImmediate(resolve));
    },
    async probe(socket, signal, kind) {
      const launch = launches.find((launch) => launch.kind === kind);
      const evidence = {
        protocol: 1,
        pid: launch.child.pid,
        uid: process.getuid(),
        pidVersion: 1,
        startSeconds: '123',
        startMicros: 456,
        executable: launch.file,
        cdHash:
          kind === 'core'
            ? artifacts.manifest.core.cdHash
            : artifacts.manifest.appRecord.cdHash,
      };
      probes.push(kind);
      await options.onProbe?.({
        kind,
        evidence,
        launches,
        calls,
        count: probes.length,
        signal,
      });
      return evidence;
    },
  };
  return {
    artifacts,
    effects,
    launches,
    calls,
    probes,
    world,
    status,
    commands,
    runOptions: { artifactDirectory: artifacts.directory, env: authorized },
    shutdowns: () => shutdowns,
  };
}
module.exports = { authorized, calibrationArtifacts, calibrationFixture };
