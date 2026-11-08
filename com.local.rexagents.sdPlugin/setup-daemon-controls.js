// @ts-check
/** @typedef {import("../src/domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../src/domain/types").Config} Config */
/** @typedef {import("../src/domain/types").PressContext} PressContext */
'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { Bridge, token } = require('./core'),
  { Setup } = require('./setup-presets'),
  P = require('./presets');
const {
  readFooter,
  socketFor,
  DaemonRpc,
  loadedThread,
} = require('./daemon-controls');
/** @param {string} original */
function statusLineWithId(original) {
  if (!/^\/statusline(?: [a-z0-9-]+)+$/.test(original))
    throw Error('Invalid native status-line command');
  // Codex exports session-id under its canonical thread-id alias.
  const fields = original
    .split(' ')
    .slice(1)
    .filter((x) => !['session-id', 'thread-id', '--clear'].includes(x));
  if (!fields.includes('model-with-reasoning'))
    fields.unshift('model-with-reasoning');
  return '/statusline session-id ' + fields.join(' ');
}
/** @param {Record<string, any>} bridge
 * @param {AgentSnapshot} agent
 * @param {string} directory */
async function configure(bridge, agent, directory) {
  const setup = new Setup(bridge),
    file = path.join(directory, 'state', 'native-presets.json'),
    registry = P.readRegistry(file),
    onDisk = P.readPresets()['0']?.input;
  if (onDisk && onDisk !== registry.scratch?.input)
    throw Error('Preset 0 belongs to you or changed');
  await bridge.focus(agent);
  await bridge.checked(agent, true);
  const endpoint = await socketFor(agent.pid),
    rpc = new DaemonRpc(endpoint.socket);
  try {
    await rpc.connect();
    const original = await setup.currentStatusLine(agent),
      input = statusLineWithId(original);
    const stateFile = path.join(directory, 'state', 'daemon-controls.json'),
      state = P.readRegistry(stateFile);
    state.agents[token(agent)] ??= { originalStatusLine: original };
    P.saveRegistry(stateFile, state);
    await setup.store(agent, '0', input);
    registry.scratch = { slot: '0', input };
    P.saveRegistry(file, registry);
    P.validateOnDisk([registry.scratch]);
    await setup.key(agent, 'ctrl+x', 'p', '0');
    // The inline override resets on /new. Saving the effective selection in Codex's own
    // picker updates this TUI's configuration and future launches without a restart.
    await setup.store(agent, '0', '/statusline');
    registry.scratch = { slot: '0', input: '/statusline' };
    P.saveRegistry(file, registry);
    await setup.key(agent, 'ctrl+x', 'p', '0');
    await setup.wait(
      agent,
      /** @param {any} s */ (s) => /^\s*Configure Status Line\s*$/m.test(s),
      'Status-line picker missing',
    );
    const picker = await setup.screen(agent);
    if (
      !/^\s*(?:› )?\[x\] thread-id\s/m.test(picker) ||
      !/^\s*(?:› )?\[x\] model-with-reasoning\s/m.test(picker)
    )
      throw Error('Footer selection not verified');
    await setup.key(agent, 'enter');
    await setup.wait(
      agent,
      /** @param {any} s */ (s) => !/^\s*Configure Status Line\s*$/m.test(s),
      'Footer preferences were not saved',
    );
    let id;
    for (let i = 0; i < 15; i++) {
      try {
        id = await readFooter(bridge, agent);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    if (!id) throw Error('Session-ID footer was not confirmed');
    const thread = await loadedThread(rpc, id);
    if (thread.cwd !== agent.cwd)
      throw Error('Pane directory does not match thread');
    state.agents[token(agent)].statusLine = input;
    P.saveRegistry(stateFile, state);
    return {
      pid: agent.pid,
      threadId: id,
      model: thread.model,
      effort: thread.effort,
    };
  } finally {
    rpc.close();
  }
}
module.exports = { configure, statusLineWithId };
if (require.main === module) {
  (async () => {
    const directory = process.argv[2] || __dirname,
      config = JSON.parse(
        /** @type {any} */ (
          fs.readFileSync(path.join(directory, 'config.json'))
        ),
      ),
      bridge = new Bridge(config),
      original = await bridge.focused();
    try {
      for (const agent of (await bridge.discover()).filter(
        (a) => a.app === 'codex' && ['idle', 'done'].includes(a.state),
      ))
        console.log(JSON.stringify(await configure(bridge, agent, directory)));
    } finally {
      await bridge.focus(original);
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
