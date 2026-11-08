const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const fixtures = require('../fixtures/backends/herdr-app/index.cjs');

/** Only synthetic peers, in a fresh directory. Never resolves a native endpoint. */
async function fakeServer(t, handler, name = 'peer.sock') {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dsha-')),
  );
  fs.chmodSync(directory, 0o700);
  const file = path.join(directory, name),
    clients = new Set(),
    calls = [];
  const server = net.createServer((socket) => {
    clients.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => clients.delete(socket));
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const request = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        calls.push(request);
        handler(socket, request, calls);
      }
    });
  });
  t.after(async () => {
    for (const client of clients) client.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(file, resolve);
  });
  fs.chmodSync(file, 0o600);
  return { directory, file, server, calls, clients };
}
function respond(socket, request, value) {
  socket.write(
    JSON.stringify({ jsonrpc: '2.0', id: request.id, result: value }) + '\n',
  );
}
function coreReply(socket, request) {
  const data = {
    hello: fixtures.hello,
    'server.status': fixtures.coreStatus,
    'terminal.list': fixtures.list,
    'terminal.get': fixtures.list.terminals[0],
    'terminal.read': fixtures.read,
  };
  respond(socket, request, data[request.method]);
}
module.exports = { fakeServer, respond, coreReply };
