import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket, { WebSocketServer } from 'ws';
// Explicit developer proxy only. Record field shapes, never frame values,
// preferences, coordinates, device IDs, prompts, tokens or home paths.
if (process.env.ASW_CAPTURE_HOST !== '1') throw Error('Host capture requires ASW_CAPTURE_HOST=1 and an explicit development launch');
const args = process.argv.slice(2), index = args.indexOf('-port'), port = args[index + 1];
if (index < 0 || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !args.includes('-pluginUUID') || args[args.indexOf('-pluginUUID') + 1] !== 'com.local.rexagents') throw Error('Use the real development plugin launch arguments');
const known = new Set(['event', 'context', 'uuid', 'action', 'device', 'payload', 'coordinates', 'column', 'row', 'settings', 'state', 'controller', 'image', 'title', 'target', 'isInMultiAction', 'profileScope', 'version', 'revision', 'shared', 'profiles']);
function shape(value, depth = 0) {
  if (depth > 4) return 'nested';
  if (Array.isArray(value)) return ['array'];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => known.has(key)).map(([key, child]) => [key, shape(child, depth + 1)]));
  return value === null ? 'null' : typeof value;
}
const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 4e6 });
await new Promise(resolve => server.once('listening', resolve));
const shapes = new Set(), output = path.resolve('dist/host-frame-shapes.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
function capture(direction, raw) { try { const value = JSON.parse(raw.toString()); shapes.add(JSON.stringify({ direction, shape: shape(value) })); fs.writeFileSync(output, JSON.stringify([...shapes].map(value => JSON.parse(value)), null, 2) + '\n', { mode: 0o600 }); } catch { /* Ignore malformed frames without persisting them. */ } }
server.on('connection', local => {
  const remote = new WebSocket('ws://127.0.0.1:' + port, { maxPayload: 4e6 });
  const pending = [];
  local.on('message', raw => { capture('plugin', raw); if (remote.readyState === WebSocket.OPEN) remote.send(raw.toString()); else pending.push(raw.toString()); });
  remote.on('open', () => { for (const frame of pending) remote.send(frame); pending.length = 0; });
  remote.on('message', raw => { capture('host', raw); if (local.readyState === WebSocket.OPEN) local.send(raw.toString()); });
  local.on('close', () => remote.close()); remote.on('close', () => local.close());
  remote.on('error', () => local.close()); local.on('error', () => remote.close());
});
args[index + 1] = String(server.address().port);
const child = spawn(process.execPath, [path.resolve('dist/com.local.rexagents.sdPlugin/bin/plugin.js'), ...args], { cwd: path.resolve('dist/com.local.rexagents.sdPlugin'), stdio: 'ignore', env: process.env });
child.on('error', () => { server.close(); process.exitCode = 1; });
child.on('close', () => { for (const client of server.clients) client.close(); server.close(); });
process.once('SIGINT', () => { child.kill('SIGTERM'); server.close(); });
