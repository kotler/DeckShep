const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  IntegrationSetup,
  diagnostics,
  herdrSessions,
} = require('../../src/app/setup');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-setup-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const plugin = path.join(home, 'plugin.sdPlugin'),
    settings = path.join(home, '.claude/settings.json');
  fs.mkdirSync(plugin, { recursive: true });
  fs.mkdirSync(path.dirname(settings), { mode: 0o700 });
  fs.writeFileSync(path.join(plugin, 'claude-hook.js'), '// fixture');
  const original = JSON.stringify({
    permissions: { allow: ['Read'] },
    statusLine: { type: 'command', command: 'fixture-status' },
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'unrelated' }] }] },
  });
  fs.writeFileSync(settings, original, { mode: 0o600 });
  return { home, plugin, settings, original };
}
test('guided Claude setup previews exact changes, requires preview, preserves customization, privately backs up and undoes across restart', (t) => {
  const paths = fixture(t),
    setup = new IntegrationSetup(paths);
  assert.throws(() => setup.apply(), /Preview/);
  const diff = setup.preview(false, true);
  assert.deepEqual(JSON.parse(diff.before), JSON.parse(paths.original));
  assert.notEqual(diff.before, diff.after);
  assert.equal(fs.readFileSync(paths.settings, 'utf8'), paths.original);
  setup.apply();
  const after = JSON.parse(fs.readFileSync(paths.settings));
  assert.deepEqual(after.permissions, { allow: ['Read'] });
  assert.equal(after.hooks.Stop[0].hooks[0].command, 'unrelated');
  assert.equal(
    fs.statSync(path.join(paths.plugin, 'state/claude-undo.json')).mode & 0o777,
    0o600,
  );
  new IntegrationSetup(paths).undo();
  assert.equal(fs.readFileSync(paths.settings, 'utf8'), paths.original);
  assert.throws(() => new IntegrationSetup(paths).undo(), /No integration/);
});
test('preview/apply and undo refuse concurrent edits; removal restores owned status line only', (t) => {
  const paths = fixture(t),
    setup = new IntegrationSetup(paths);
  setup.preview();
  fs.writeFileSync(paths.settings, paths.original + '\n');
  assert.throws(() => setup.apply(), /changed/);
  setup.preview(false, true);
  setup.apply();
  setup.preview(true);
  setup.apply();
  assert.deepEqual(
    JSON.parse(fs.readFileSync(paths.settings)),
    JSON.parse(paths.original),
  );
  fs.writeFileSync(paths.settings, '{"unrelated":"new"}');
  assert.throws(() => setup.undo(), /changed/);
  assert.equal(fs.readFileSync(paths.settings, 'utf8'), '{"unrelated":"new"}');
});
test('doctor reasons contain no home paths or settings; unsafe session directories are ignored', async (t) => {
  const paths = fixture(t);
  const checks = await diagnostics({
    home: paths.home,
    paths,
    version: async () => 'fixture version',
    model: 0,
    online: true,
    rex: async () => ({ binary: '/fixture', application: '/fixture' }),
    selected: { chatId: 'private-chat-id', app: 'codex' },
  });
  assert.equal(checks.find((c) => c.id === 'device').ok, true);
  assert.equal(checks.find((c) => c.id === 'codex').ok, true);
  assert(!JSON.stringify(checks).includes(paths.home));
  assert(!JSON.stringify(checks).includes('private-chat-id'));
  assert.deepEqual(herdrSessions(paths.home), []);
  // Rex-only release: Herdr is reported only when its profile asks for it.
  assert.equal(
    checks.some((c) => c.id === 'herdr'),
    false,
  );
  assert.equal(
    (
      await diagnostics({
        home: paths.home,
        paths,
        version: async () => 'fixture version',
        rex: async () => ({ binary: '/fixture', application: '/fixture' }),
        herdr: true,
      })
    ).find((c) => c.id === 'herdr').ok,
    false,
  );
  assert.equal(
    (
      await diagnostics({
        paths,
        home: paths.home,
        rex: async () => {
          throw Error('secret');
        },
      })
    ).find((c) => c.id === 'rex').ok,
    false,
  );
});
test('removal disables hooks before clearing private lifecycle records and never follows a replaced state directory', (t) => {
  const paths = fixture(t),
    setup = new IntegrationSetup(paths),
    directory = path.join(paths.plugin, 'state/claude');
  setup.preview();
  setup.apply();
  fs.mkdirSync(directory, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, '42.json'), '{}', { mode: 0o600 });
  fs.writeFileSync(path.join(directory, '42.invalid'), 'fixture', {
    mode: 0o600,
  });
  setup.preview(true);
  setup.apply();
  assert.deepEqual(fs.readdirSync(directory), []);
  setup.preview();
  setup.apply();
  fs.rmSync(directory, { recursive: true });
  fs.symlinkSync(path.dirname(paths.settings), directory);
  setup.preview(true);
  assert.throws(() => setup.apply(), /Unsafe/);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(paths.settings, 'utf8')),
    JSON.parse(paths.original),
  );
});
test('session choices show verified versions, close every probe and mark unsupported sessions without reflecting paths', async () => {
  const { sessionChoices } = require('../../src/app/setup');
  let closed = 0;
  const rows = await sessionChoices('/fixture', {
    list: () => [
      { path: 'verified', label: 'Session 1' },
      { path: 'unsupported', label: 'Session 2' },
      { path: 'offline', label: 'Session 3' },
    ],
    open: async (socket) => {
      if (socket === 'offline') throw Error('PRIVATE_PATH');
      return {
        info: {
          version: socket === 'verified' ? '0.9.5' : '0.9.6',
          protocol: 22,
        },
        close() {
          closed++;
        },
      };
    },
  });
  assert.equal(closed, 2);
  assert.equal(rows[0].verified, true);
  assert.match(rows[0].label, /0.9.5.*protocol 22/);
  assert.equal(rows[1].verified, false);
  assert.equal(rows[2].verified, false);
  assert(!rows[2].label.includes('PRIVATE'));
});
test('doctor hook status checks owned commands and supported provider metadata without exposing settings', async (t) => {
  const paths = fixture(t),
    setup = new IntegrationSetup(paths);
  setup.preview();
  setup.apply();
  const options = {
    paths,
    home: paths.home,
    rex: async () => ({ binary: '/fixture', application: '/fixture' }),
    version: async () => {
      throw Error('private version path');
    },
    selected: {
      app: 'claude-code',
      nativeVerified: true,
      chatId: 'fixture-secret-id',
    },
  };
  const checks = await diagnostics(options);
  assert.equal(checks.find((c) => c.id === 'hooks').ok, true);
  assert.equal(checks.find((c) => c.id === 'codex').ok, false);
  assert.equal(checks.find((c) => c.id === 'claude').ok, true);
  assert(!JSON.stringify(checks).includes('private version path'));
  assert(!JSON.stringify(checks).includes('fixture-secret-id'));
  assert(!JSON.stringify(checks).includes(paths.home));
  const settings = JSON.parse(fs.readFileSync(paths.settings));
  settings.hooks.Stop = [];
  fs.writeFileSync(paths.settings, JSON.stringify(settings));
  assert.equal(
    (await diagnostics(options)).find((c) => c.id === 'hooks').ok,
    false,
  );
});
test(
  'doctor probes only private fixture sockets and reads the version from a test-owned app plist',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const net = require('node:net');
    const { sessionChoices } = require('../../src/app/setup');
    const home = fs.mkdtempSync('/tmp/asw-doctor-wire-'),
      paths = fixture(t),
      directory = path.join(home, '.config/herdr/sessions/fixture'),
      socketPath = path.join(directory, 'herdr.sock'),
      application = path.join(home, 'Fixture.app');
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(application, 'Contents'), { recursive: true });
    const plist = path.join(application, 'Contents/Info.plist');
    const writeVersion = (value) =>
      fs.writeFileSync(
        plist,
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${value}</string></dict></plist>`,
      );
    writeVersion('0.1.2');
    let protocol = 22;
    const calls = [],
      clients = new Set();
    const server = net.createServer((socket) => {
      clients.add(socket);
      socket.on('close', () => clients.delete(socket));
      let data = '';
      socket.on('data', (bytes) => {
        data += bytes;
        if (!data.includes('\n')) return;
        const request = JSON.parse(data.split('\n')[0]);
        calls.push(request.method);
        socket.end(
          JSON.stringify({
            id: request.id,
            result: { type: 'pong', version: '0.9.5', protocol },
          }) + '\n',
        );
      });
    });
    await new Promise((resolve) => server.listen(socketPath, resolve));
    fs.chmodSync(socketPath, 0o600);
    t.after(async () => {
      for (const socket of clients) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    });
    const rows = await sessionChoices(home);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].verified, true);
    assert.match(rows[0].label, /0.9.5.*protocol 22/);
    protocol = 23;
    assert.equal((await sessionChoices(home))[0].verified, false);
    assert.deepEqual(calls, ['ping', 'ping']);
    const options = {
      home,
      paths,
      rex: async () => ({ binary: '/fixture', application }),
    };
    assert.match(
      (await diagnostics(options)).find((c) => c.id === 'rex').reason,
      /0.1.2/,
    );
    writeVersion('PRIVATE_VERSION');
    const check = (await diagnostics(options)).find((c) => c.id === 'rex');
    assert.match(check.reason, /unknown version/);
    assert(!check.reason.includes('PRIVATE'));
  },
);
