const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), net = require('node:net');
const { spawnSync } = require('node:child_process');
const { authorization, settingsHashes, OwnedProcesses } = require('./safety.cjs');
const reason = authorization('herdr-tui');
test('live Herdr: isolated server, disposable providers, native selection/zoom and settings fingerprints', { skip: reason || false, timeout: 180000 }, async t => {
  const before = settingsHashes(os.homedir()), directory = fs.mkdtempSync(path.join('/tmp', 'asw-live-')), owned = new OwnedProcesses();
  t.after(() => { try { owned.close(); } finally { assert.deepEqual(settingsHashes(os.homedir()), before, 'GLOBAL SETTINGS CHANGED'); fs.rmSync(directory, { recursive: true, force: true }); } });
  assert(process.env.ASW_CODEX_MODEL && process.env.ASW_CLAUDE_MODEL, 'Select the cheapest supported models explicitly for this run');
  assert(process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY, 'Provide test credentials; no global auth/config files are copied');
  const socket = path.join(directory, 'herdr.sock'), home = path.join(directory, 'home'), repo = path.join(directory, 'repo');
  fs.mkdirSync(home, { mode: 0o700 }); fs.mkdirSync(repo); assert.equal(spawnSync('git', ['init', repo], { stdio: 'ignore' }).status, 0);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(directory, 'config'), XDG_STATE_HOME: path.join(directory, 'state'), HERDR_SOCKET_PATH: socket, CODEX_HOME: path.join(home, '.codex'), CLAUDE_CONFIG_DIR: path.join(home, '.claude'), REX_SESSION: '', REX_BLOCK: '', REX_CLIENT: '' };
  delete env.HERDR_SESSION; delete env.HERDR_PANE_ID;
  const server = owned.spawn(process.env.ASW_HERDR_BINARY || 'herdr', ['server'], { cwd: repo, env });
  const wait = async predicate => { const end = Date.now() + 30000; for (;;) { owned.assert(server.pid); if (await predicate()) return; if (Date.now() > end) throw Error('Isolated native state timed out'); await new Promise(resolve => setTimeout(resolve, 100)); } };
  await wait(async () => fs.existsSync(socket)); fs.chmodSync(socket, 0o600);
  let id = 0;
  async function request(method, params = {}) {
    owned.assert(server.pid);
    assert(fs.realpathSync(socket).startsWith(directory + '/'));
    return new Promise((resolve, reject) => {
      const client = net.createConnection(socket); let data = ''; const requestId = String(++id);
      const timer = setTimeout(() => { client.destroy(); reject(Error('Isolated RPC timeout; no retry')); }, 35000);
      client.on('error', () => { clearTimeout(timer); reject(Error('Isolated RPC unavailable')); });
      client.on('connect', () => client.write(JSON.stringify({ id: requestId, method, params }) + '\n'));
      client.on('data', bytes => { data += bytes; if (data.length > 4e6) { client.destroy(); clearTimeout(timer); reject(Error('Oversized isolated reply')); return; } if (!data.includes('\n')) return; clearTimeout(timer); client.destroy(); try { const reply = require('../../src/schemas').parse('herdrFrame', data.split('\n')[0]); assert.equal(reply.id, requestId); if (reply.error) throw Error('Isolated request refused'); resolve(reply.result); } catch { reject(Error('Invalid isolated RPC response')); } });
    });
  }
  const ping = await request('ping'); assert.equal(ping.protocol, 22, 'Only the verified Herdr protocol is accepted');
  const workspace = await request('workspace.create', { cwd: repo, focus: true, label: 'asw-owned' });
  const snapshot = await request('session.snapshot');
  // The installed protocol-22 shape is also checked by the production bridge;
  // fail rather than guessing IDs on an unverified native version.
  assert.equal(snapshot.snapshot?.protocol, 22);
  assert.equal(ping.version, '0.9.5');
  const firstPane = workspace.root_pane?.pane_id;
  assert(firstPane && snapshot.snapshot.panes.some(pane => pane.pane_id === firstPane), 'Dedicated pane creation failed');
  await request('agent.start', { name: 'asw-codex', kind: 'codex', pane_id: firstPane, args: ['--model', process.env.ASW_CODEX_MODEL, '-c', 'model_reasoning_effort="low"'] });
  const split = await request('pane.split', { target_pane_id: firstPane, direction: 'right', cwd: repo, focus: false });
  const secondPane = split.root_pane?.pane_id || split.pane?.pane_id; assert(secondPane && secondPane !== firstPane);
  await request('agent.start', { name: 'asw-claude', kind: 'claude', pane_id: secondPane, args: ['--model', process.env.ASW_CLAUDE_MODEL, '--effort', 'low'] });
  const { HerdrBridge } = require('../../src/app/herdr-session');
  const defaults = require('../../com.local.rexagents.sdPlugin/config.json');
  const bridge = new HerdrBridge({ ...defaults, backend: 'herdr', herdr: { socketPath: socket, titleIdentity: false } });
  await wait(async () => (await bridge.discover()).length === 2);
  const agents = await bridge.discover();
  for (const agent of agents) owned.assert(agent.pid);
  const { createApplication } = require('../../src/app/controller');
  const { EventEmitter } = require('node:events');
  const host = new EventEmitter(), frames = []; host.readyState = 1; host.send = raw => frames.push(JSON.parse(raw));
  const config = { ...defaults, backend: 'herdr', herdr: { socketPath: socket, titleIdentity: false } };
  const app = createApplication({ socket: host, fs: { readFileSync: () => JSON.stringify(config) }, backendFactory: () => bridge, setInterval: () => {} });
  for (let index = 0; index < 15; index++) app.receive({ event: 'willAppear', context: 'live-' + index, payload: { coordinates: { column: index % 5, row: Math.floor(index / 5) }, settings: { profileScope: 'herdr' } } });
  await app.settled();
  async function press(index) { for (const agent of await bridge.discover()) owned.assert(agent.pid); await new Promise(resolve => setTimeout(resolve, 400)); app.receive({ event: 'keyDown', context: 'live-' + index }); await app.settled(); }
  await press(0); assert.equal((await bridge.focused()).block, agents[0].block);
  await press(7); assert.equal((await bridge.focused()).block, agents[1].block);
  await press(7); assert.equal((await bridge.focused()).block, agents[0].block);
  await press(12); // Zoom uses the production native-focus and input guards.
  owned.assert(agents[1].pid); await request('agent.focus', { target: agents[1].block });
  const beforeAlerts = frames.filter(frame => frame.event === 'showAlert').length;
  await press(14); assert(frames.filter(frame => frame.event === 'showAlert').length > beforeAlerts, 'Stale native focus must refuse Interrupt');
  assert.equal((await bridge.focused()).block, agents[1].block);
  assert.deepEqual(settingsHashes(os.homedir()), before);
});
