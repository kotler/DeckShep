const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const { senderFixture } = require('../helpers/herdr-app-focus');
const { AppPeerVerifier } = require('../../src/terminals/herdr-app/peer');
const {
  GuardedAppFocusSender,
} = require('../../src/terminals/herdr-app/focus-sender');
const { backendCapabilities } = require('../../src/domain/capabilities');

test('guarded delivery writes one explicit pane request; acknowledgement never becomes completed or verified focus', async (t) => {
  const x = await senderFixture(t);
  x.world.spaces[0].tabs[0].terminals.push({
    terminal: 't2',
    pane: 'p2',
    app: 'claude-code',
    status: 'idle',
    name: null,
    sub_agents: [],
  });
  x.state.target = { space: 's1', tab: 'c1', pane: 'p2', terminal: 't2' };
  const permit = x.permit();
  assert.deepEqual(await x.sender.deliver({ kind: 'requestFocus' }, permit), {
    status: 'requested',
    verifiedFocus: false,
  });
  assert.deepEqual(x.focusCalls(), [
    { do: 'pane.focus', args: { pane: 'p2' } },
  ]);
  assert.equal((await x.sender.observe()).selected.pane, 'p1');
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, permit),
    /expired/,
  );
  assert.equal(x.focusCalls().length, 1);
  assert.deepEqual(backendCapabilities['herdr-app'], []);
  for (const name of [
    'focus',
    'focused',
    'zoom',
    'readPane',
    'run',
    'rpc',
    'send',
    'exchange',
    'authority',
    'verifier',
  ])
    assert.equal(x.sender[name], undefined);
});
test('production records remain empty; no peer probe, connection or native mutation is available by default', async () => {
  let probes = 0;
  const sender = new GuardedAppFocusSender(
    new AppPeerVerifier(async () => {
      probes++;
    }),
    {},
    { appHome: '/unavailable-fixture-home' },
  );
  await assert.rejects(sender.observe(), /Build mismatch/);
  assert.equal(probes, 0);
  assert.equal(sender.generation, 0);
  sender.dispose();
  assert.throws(() => new GuardedAppFocusSender({}, {}, {}), /unavailable/);
});
test('replacing the socket before the final write refuses the connected old peer and never falls back to the new one', async (t) => {
  let armed = false,
    replaced = false,
    replacement,
    replacementCalls = 0;
  const x = await senderFixture(t, {
    probe: async ({ peer, socket }) => {
      if (
        !armed ||
        replaced ||
        peer.calls.length !== 7 ||
        socket.bytesWritten !== 0
      )
        return;
      replaced = true;
      fs.renameSync(peer.file, peer.file + '.old');
      replacement = net.createServer((connection) => {
        connection.on('data', () => {
          replacementCalls++;
        });
        connection.on('error', () => {});
      });
      await new Promise((resolve, reject) => {
        replacement.once('error', reject);
        replacement.listen(peer.file, resolve);
      });
      fs.chmodSync(peer.file, 0o600);
    },
  });
  t.after(async () => {
    if (replacement?.listening)
      await new Promise((resolve) => replacement.close(resolve));
  });
  const permit = x.permit();
  armed = true;
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, permit),
    /refused/,
  );
  assert.equal(replaced, true);
  assert.equal(replacementCalls, 0);
  assert.deepEqual(x.focusCalls(), []);
});
test('truncated, invalid UTF-8, oversized and unsolicited extra read frames cannot reach focus dispatch', async (t) => {
  for (const bytes of [
    Buffer.from('{}'),
    Buffer.from([255, 10]),
    Buffer.alloc(1000001, 120),
    Buffer.from('[]\n[]\n'),
  ]) {
    const x = await senderFixture(t, {
      respond: (socket, request) => {
        if (!request.commands) return false;
        socket.end(bytes);
        return true;
      },
    });
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, x.permit()),
      /refused/,
    );
    assert.equal(x.sender.peerKey, '');
    assert.deepEqual(x.focusCalls(), []);
  }
});
test('forged permits, other operations and arbitrary arguments never reach the socket', async (t) => {
  const x = await senderFixture(t),
    before = x.peer.calls.length;
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, {}),
    /expired/,
  );
  for (const input of [
    { kind: 'keys', keys: ['ENTER'] },
    { kind: 'focus' },
    { kind: 'zoom' },
    { kind: 'requestFocus', args: { terminal: 't1' } },
    { kind: 'requestFocus', text: 'private' },
  ]) {
    const permit = x.permit();
    await assert.rejects(x.sender.deliver(input, permit));
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, permit),
      /expired/,
    );
  }
  assert.equal(x.peer.calls.length, before);
});
test('revoked consent and changed visibility/context are refused both before dispatch and at the final write edge', async (t) => {
  let finalChange = null;
  const x = await senderFixture(t, {
    probe: ({ peer, socket, state }) => {
      if (finalChange && peer.calls.length === 7 && socket.bytesWritten === 0) {
        state[finalChange] =
          finalChange === 'focusRequestEnabled'
            ? false
            : state[finalChange] + 1;
        finalChange = null;
      }
    },
  });
  const permit = x.permit();
  x.state.focusRequestEnabled = false;
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, permit),
    /refused/,
  );
  x.state.focusRequestEnabled = true;
  finalChange = 'focusRequestEnabled';
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, x.permit()),
    /refused/,
  );
  assert.deepEqual(x.focusCalls(), []);
});
test('missing/remapped/remote targets and changed command contracts are refused before focus', async (t) => {
  for (const mutate of [
    (x) => {
      x.world.spaces[0].tabs[0].terminals[0].terminal = 't2';
    },
    (x) => {
      x.state.target.pane = 'absent';
    },
    (x) => {
      x.world.spaces[0].machine = 'remote';
    },
    (x) => {
      x.commands[0].args[0].required = true;
    },
    (x) => {
      x.commands[0].args.pop();
    },
    (x) => {
      x.commands.push(structuredClone(x.commands[0]));
    },
  ]) {
    const x = await senderFixture(t);
    mutate(x);
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, x.permit()),
      /refused/,
    );
    assert.deepEqual(x.focusCalls(), []);
  }
});
test('peer restart or build modification before dispatch invalidate the endpoint epoch and prevent focus', async (t) => {
  for (const kind of ['peer', 'build']) {
    let armed = false,
      changed = false;
    const x = await senderFixture(t, {
      probe: ({ peer, socket, build }) => {
        if (
          armed &&
          !changed &&
          peer.calls.length === 7 &&
          socket.bytesWritten === 0
        ) {
          changed = true;
          if (kind === 'peer') build.evidence.pidVersion++;
          else fs.appendFileSync(build.executable, 'changed');
        }
      },
    });
    const permit = x.permit(),
      generation = x.sender.generation;
    armed = true;
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, permit),
      /refused/,
    );
    assert.equal(changed, true);
    assert(x.sender.generation > generation);
    assert.equal(x.sender.peerKey, '');
    assert.deepEqual(x.focusCalls(), []);
  }
});
test('refusal, malformed replies and timeout after dispatch are uncertain and cannot retry or compensate', async (t) => {
  for (const response of [
    '{"error":"private path"}\n',
    '{"ok":false}\n',
    '{"ok":true,"extra":1}\n',
    '{"ok":true}\n{"ok":true}\n',
    'timeout',
  ]) {
    const controller = new AbortController();
    const x = await senderFixture(t, {
      respond: (socket, request) => {
        if (!request.do) return false;
        if (response === 'timeout') controller.abort();
        else socket.end(response);
        return true;
      },
    });
    const permit = x.permit();
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, permit, controller.signal),
      (error) => error.message === 'Focus uncertain',
    );
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, permit),
      /expired/,
    );
    assert.equal(x.focusCalls().length, 1);
  }
});
test('unavailable post-reply peer proof refuses reads and leaves a dispatched focus uncertain', async (t) => {
  for (const action of ['read', 'focus']) {
    let baseline = Infinity;
    const fixture = await senderFixture(t, {
      probe: ({ peer }) => {
        const afterReply =
          action === 'focus'
            ? peer.calls.some((call) => call.do)
            : peer.calls.length > baseline;
        if (afterReply) throw Error('Peer unavailable after reply');
      },
    });
    baseline = fixture.peer.calls.length;
    if (action === 'read') {
      await assert.rejects(fixture.sender.status(), /App unavailable/);
      assert.equal(fixture.focusCalls().length, 0);
    } else {
      const permit = fixture.permit();
      await assert.rejects(
        fixture.sender.deliver({ kind: 'requestFocus' }, permit),
        /Focus uncertain/,
      );
      assert.equal(fixture.focusCalls().length, 1);
      await assert.rejects(
        fixture.sender.deliver({ kind: 'requestFocus' }, permit),
        /expired/,
      );
      assert.equal(fixture.focusCalls().length, 1);
    }
  }
});

test('post-dispatch identity/context changes do not report success and never produce another action', async (t) => {
  for (const change of ['context', 'peer']) {
    let x;
    x = await senderFixture(t, {
      respond: (socket, request) => {
        if (!request.do) return false;
        if (change === 'context') x.state.visibility++;
        else x.build.evidence.pidVersion++;
        socket.end('{"ok":true}\n');
        return true;
      },
    });
    await assert.rejects(
      x.sender.deliver({ kind: 'requestFocus' }, x.permit()),
      /uncertain/,
    );
    assert.equal(x.focusCalls().length, 1);
  }
});
test('overlapping attempts burn their own permit, cancellation/expiry refuse, and disposal invalidates future work', async (t) => {
  let release,
    blocked = false;
  const x = await senderFixture(t, {
    respond: (socket, request) => {
      if (!blocked || !request.commands) return false;
      release = () => socket.end(JSON.stringify(x.commands) + '\n');
      return true;
    },
  });
  blocked = true;
  const first = x.sender.deliver({ kind: 'requestFocus' }, x.permit()),
    second = x.permit();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, second),
    /pending/,
  );
  release();
  await first;
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, second),
    /expired/,
  );
  const expired = x.permit();
  x.setNow(2000);
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, expired),
    /expired/,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, x.permit(), cancelled.signal),
    /refused/,
  );
  const permit = x.permit();
  x.sender.dispose();
  await assert.rejects(
    x.sender.deliver({ kind: 'requestFocus' }, permit),
    /pending/,
  );
  await assert.rejects(x.sender.status(), /unavailable/);
});
