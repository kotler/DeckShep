const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createInterface } = require('node:readline');
const { createConnection } = require('node:net');
const { fakeServer } = require('../helpers/herdr-app-server');

// A reader-lifecycle experiment, not a native verifier or production adapter.
// The helper only fstats its own inherited FD; App bytes stay in the parent.
for (const paused of [false, true])
  test(
    'persistent helper readiness restores only an originally flowing reader: paused=' +
      paused,
    { timeout: 10000 },
    async (t) => {
      const directory = fs.mkdtempSync(
        path.join(fs.realpathSync('/tmp'), 'dsh-flow-'),
      );
      fs.chmodSync(directory, 0o700);
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
      const helperFile = path.join(directory, 'helper.cjs');
      fs.writeFileSync(
        helperFile,
        `
        const fs = require('node:fs');
        const lines = require('node:readline').createInterface({ input: process.stdin });
        if (!fs.fstatSync(3).isSocket()) process.exit(1);
        process.stdout.write('{"fixture":"captured"}\\n');
        lines.once('line', line => {
          if (line !== 'finish') process.exit(1);
          process.stdout.write('{"fixture":"finished"}\\n');
          lines.close();
          process.stdin.destroy();
          fs.closeSync(3);
        });
      `,
        { mode: 0o600 },
      );
      const peer = await fakeServer(t, (socket) => socket.end('{"ok":true}\n'));
      const socket = createConnection(peer.file);
      t.after(() => socket.destroy());
      let response = '';
      socket.on('data', (bytes) => {
        response += bytes.toString();
      });
      await once(socket, 'connect');
      if (paused) socket.pause();
      const wasFlowing = socket.readableFlowing === true;
      const helper = spawn(process.execPath, [helperFile], {
        env: { HOME: directory },
        stdio: ['pipe', 'pipe', 'ignore', socket],
      });
      t.after(() => {
        if (helper.exitCode === null) helper.kill();
      });
      const exited = once(helper, 'exit');
      const lines = createInterface({ input: helper.stdout });
      t.after(() => lines.close());
      const frames = lines[Symbol.asyncIterator]();
      assert.equal(socket.readableFlowing, false);
      assert.equal((await frames.next()).value, '{"fixture":"captured"}');
      // Resuming only after helper exit would deadlock a retained-token session.
      if (wasFlowing && !socket.destroyed) socket.resume();
      assert.equal(socket.readableFlowing, !paused);
      assert.equal(helper.exitCode, null);
      if (!paused) {
        const ended = once(socket, 'end');
        socket.write('{"status":true}\n');
        await ended;
        assert.equal(response, '{"ok":true}\n');
        assert.equal(helper.exitCode, null);
      } else assert.deepEqual(peer.calls, []);
      helper.stdin.end('finish\n');
      assert.equal((await frames.next()).value, '{"fixture":"finished"}');
      assert.deepEqual(await exited, [0, null]);
      assert.equal((await frames.next()).done, true);
    },
  );
