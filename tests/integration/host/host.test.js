const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');
const { WebSocketServer } = require('ws');
const { once } = require('node:events');
test('official SDK bundled plugin registers, renders all coordinates, routes settings, refuses stale presses and hides disappeared keys', { timeout: 30000 }, async t => {
  const { bundle } = await import('../../../scripts/bundle.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-host-')), plugin = path.join(directory, 'com.local.rexagents.sdPlugin');
  fs.mkdirSync(path.join(plugin, 'bin'), { recursive: true });
  for (const name of ['manifest.json', 'config.json', 'assets', 'icons']) fs.cpSync(path.resolve('com.local.rexagents.sdPlugin', name), path.join(plugin, name), { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  await bundle(path.resolve('src/plugin/entry.mts'), path.join(plugin, 'bin/plugin.js'), { fixture: path.resolve('tests/integration/host/dependencies.ts') });
  assert(fs.readFileSync(path.join(plugin, 'bin/plugin.js'), 'utf8').includes('fixtureInput'), 'fixture alias must resolve before launch');
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 }); await once(server, 'listening');
  t.after(() => { for (const client of server.clients) client.terminate(); server.close(); });
  const info = { application: { version: '6.8.0', language: 'en', platform: 'mac', platformVersion: '15.0' }, plugin: { uuid: 'com.local.rexagents', version: '1.3.4.0' }, devicePixelRatio: 2, devices: [{ id: 'fixture-device', name: 'Fixture', size: { columns: 5, rows: 3 }, type: 0 }] };
  const child = fork(path.join(plugin, 'bin/plugin.js'), ['-port', String(server.address().port), '-pluginUUID', 'com.local.rexagents', '-registerEvent', 'registerPlugin', '-info', JSON.stringify(info)], { cwd: plugin, execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { PATH: process.env.PATH, HOME: directory } });
  t.after(() => child.kill());
  let errors = ''; child.stderr.on('data', data => { errors += data; });
  const input = []; child.on('message', message => input.push(message));
  const frames = [], [socket] = await once(server, 'connection');
  socket.on('message', raw => { const frame = JSON.parse(raw); frames.push(frame); if (frame.event === 'getGlobalSettings') socket.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: { version: 2, revision: 0, shared: {}, profiles: { rex: {}, herdr: {} } } } })); });
  async function until(predicate) { const end = Date.now() + 5000; while (!predicate()) { if (child.exitCode !== null) assert.fail('Bundled plugin exited: ' + errors); if (Date.now() > end) assert.fail('Host event timeout: ' + errors); await new Promise(resolve => setTimeout(resolve, 10)); } }
  await until(() => frames.some(frame => frame.event === 'registerPlugin'));
  assert.deepEqual(frames.find(frame => frame.event === 'registerPlugin'), { event: 'registerPlugin', uuid: 'com.local.rexagents' });
  function send(event, index, extra = {}) { socket.send(JSON.stringify({ event, action: 'com.local.rexagents.key', context: 'key-' + index, device: 'fixture-device', payload: { controller: 'Keypad', coordinates: { column: index % 5, row: Math.floor(index / 5) }, settings: { profileScope: 'rex' }, state: 0, isInMultiAction: false, ...extra } })); }
  for (let i = 0; i < 15; i++) send('willAppear', i);
  await until(() => new Set(frames.filter(f => f.event === 'setImage').map(f => f.context)).size === 15);
  assert.equal(new Set(frames.filter(f => f.event === 'setTitle').map(f => f.context)).size, 15);
  await new Promise(resolve => setTimeout(resolve, 400));
  send('keyDown', 0); send('keyUp', 0);
  await until(() => input.some(frame => frame.kind === 'fixtureInput'));
  assert.deepEqual(input[0].args, ['focus', '--session', 'fixture', 'a']);
  // Every coordinate gets a down/up via a per-key local inactive action. This
  // exercises host routing without granting any synthetic native input.
  for (let i = 0; i < 15; i++) { send('didReceiveSettings', i, { settings: { profileScope: 'rex', action: 'none' } }); send('keyDown', i); send('keyUp', i); }
  await new Promise(resolve => setTimeout(resolve, 50));
  const before = input.length; for (let i = 0; i < 15; i++) send('willDisappear', i);
  send('keyDown', 0); await new Promise(resolve => setTimeout(resolve, 100)); assert.equal(input.length, before);
  assert.equal(errors, ''); assert(!fs.existsSync(path.join(plugin, 'logs')), 'Host settings never reach SDK log files');
  const production = path.join(plugin, 'bin/production.js'); await bundle(path.resolve('src/plugin/entry.mts'), production);
  assert(!fs.readFileSync(production, 'utf8').includes('fixtureInput'), 'production bundle has no fixture switch');
});
