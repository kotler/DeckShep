const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
test(
  'loopback preview serves only fixed assets, refuses foreign origins and drives the bundled plugin',
  { timeout: 30000 },
  async (t) => {
    const { startVirtualDeck } =
      await import('../../e2e/virtual-host/server.ts');
    const server = await startVirtualDeck();
    t.after(() => server.close());
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    const page = await fetch(server.origin);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get('content-security-policy'),
      /frame-ancestors 'none'/,
    );
    assert.match(await page.text(), /data-testid="deck"/);
    assert.equal((await fetch(server.origin + '/config.json')).status, 404);
    const refused = new WebSocket(
      server.origin.replace('http:', 'ws:') + '/control',
      { origin: 'https://example.invalid' },
    );
    await once(refused, 'error');
    const socket = new WebSocket(
      server.origin.replace('http:', 'ws:') + '/control',
      { origin: server.origin },
    );
    t.after(() => socket.terminate());
    const initial = once(socket, 'message');
    let state = JSON.parse((await initial)[0].toString()).state;
    assert.equal(state.keys.length, 15);
    assert.equal(
      state.keys.every((k) => k.image.startsWith('data:image/svg+xml;base64,')),
      true,
    );
    assert.deepEqual(state.trace, []);
    let id = 0;
    async function command(method, ...args) {
      const current = ++id;
      const result = new Promise((resolve, reject) => {
        function received(raw) {
          const frame = JSON.parse(raw.toString());
          if (frame.id === current) {
            socket.off('message', received);
            if (frame.error) reject(Error(frame.error));
            else resolve(frame.result);
          }
        }
        socket.on('message', received);
      });
      socket.send(JSON.stringify({ id: current, method, args }));
      return result;
    }
    await command('setPreferences', { allowClipboardFocus: true });
    state = await command('press', 0, 1);
    assert.deepEqual(state.trace, [['focus', '--session', 'fixture', 'b']]);
    assert.equal(state.keys[1].selected, true);
    assert.equal(state.keys[0].selected, false);
    state = await command('switchProfile', 'herdr');
    assert.equal(state.profile, 'herdr');
    state = await command('setScenario', 'offline');
    assert(state.keys[0].labels.includes('Herdr offline'));
    state = await command('reset');
    assert.equal(state.profile, 'rex');
    assert.deepEqual(state.trace, []);
    await assert.rejects(() => command('press', 20, 0), /refused/);
    await assert.rejects(() => command('setScenario', 'unknown'), /refused/);
    socket.terminate();
    await server.close();
    await assert.rejects(() => fetch(server.origin));
  },
);
