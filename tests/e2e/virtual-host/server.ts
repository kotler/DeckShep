import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { VirtualDeck } from './deck';

/** Serves only the fixture page and two fixed assets; no filesystem routing. */
export async function startVirtualDeck() {
  const deck = new VirtualDeck();
  const server = http.createServer((request, response) => {
    const files: Record<string, string> = {
      '/': 'index.html',
      '/app.js': 'app.js',
    };
    const file = files[request.url ?? ''];
    if (request.method !== 'GET' || !file) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader(
      'Content-Type',
      file.endsWith('.js') ? 'text/javascript' : 'text/html',
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    response.end(fs.readFileSync(path.resolve('tests/e2e/virtual-deck', file)));
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  let queue = Promise.resolve();
  let origin = '';
  let stopped = false;
  async function close(): Promise<void> {
    if (stopped) return;
    stopped = true;
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    await deck.stop();
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try {
    await deck.reset();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw Error('Preview port unavailable');
    origin = 'http://127.0.0.1:' + address.port;
    server.on('upgrade', (request, socket, head) => {
      if (
        request.url !== '/control' ||
        request.headers.origin !== origin ||
        request.headers.host !== '127.0.0.1:' + address.port
      ) {
        socket.destroy();
        return;
      }
      sockets.handleUpgrade(request, socket, head, (client) =>
        sockets.emit('connection', client),
      );
    });
    sockets.on('connection', (socket) => {
      socket.send(JSON.stringify({ state: deck.snapshot() }));
      socket.on('message', (raw) => {
        queue = queue.then(async () => {
          let id: unknown;
          try {
            const command = JSON.parse(raw.toString()) as {
              id: number;
              method: string;
              args?: unknown[];
            };
            id = command.id;
            if (!Number.isSafeInteger(id) || !Array.isArray(command.args ?? []))
              throw Error('Invalid command');
            const state = await deck.execute(command.method, command.args);
            for (const peer of sockets.clients)
              if (peer.readyState === 1) peer.send(JSON.stringify({ state }));
            if (socket.readyState === 1)
              socket.send(JSON.stringify({ id, result: state }));
          } catch {
            if (socket.readyState === 1)
              socket.send(
                JSON.stringify({ id, error: 'Virtual deck command refused' }),
              );
          }
        });
      });
    });
    return { origin, close };
  } catch (error) {
    await close();
    throw error;
  }
}
