'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readHookPanel } = require('../../src/terminals/rex/hook-panel');
const { panelAddress } = require('../../src/schemas/panel-observation');
const { session, block } = require('../helpers/codex-hook-fixture');
const target = { session, block, server: 'unix:///fixture/rex.sock' };
const reply = {
  generation: 7,
  foreground: {
    pid: 42,
    user_id: process.getuid(),
    name: 'codex',
    cwd: '/fixture',
    path: '/PRIVATE/codex',
    argv: 'PRIVATE PROMPT',
  },
};

test('hook panel reader makes one bounded process-only CLI call to an explicit local target', async () => {
  const calls = [];
  const progress = [];
  const result = await readHookPanel(
    target,
    '/fixture/override',
    {
      discover: async (override) => {
        assert.equal(override, '/fixture/override');
        return { binary: '/fixture/rex', application: '/fixture/Rex.app' };
      },
      execute: async (binary, args, options) => {
        calls.push(args);
        assert.equal(binary, '/fixture/rex');
        assert.deepEqual(args, [
          '--autostart=false',
          '--timeout',
          '1s',
          '--server',
          target.server,
          'block',
          'call',
          '-s',
          session,
          '-b',
          block,
          'process',
        ]);
        assert.equal(options.timeout, 1200);
        assert.equal(options.maxBuffer, 32768);
        assert.deepEqual(options.env, { REX_SERVER: '' });
        return JSON.stringify(reply);
      },
    },
    (phase) => progress.push(phase),
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(progress, ['rex-discovery', 'rex-query', 'rex-reply']);
  assert.deepEqual(result, {
    generation: 7,
    pid: 42,
    userId: process.getuid(),
    name: 'codex',
    cwd: '/fixture',
  });
  assert(!JSON.stringify(result).includes('PRIVATE'));
  const legacy = await readHookPanel(target, undefined, {
    discover: async () => ({ binary: '/fixture/rex' }),
    execute: async () => JSON.stringify({ foreground: reply.foreground }),
  });
  assert.equal(Object.hasOwn(legacy, 'generation'), false);
});

test('hook addresses never infer a missing panel, remote server or URI with hidden controls', async () => {
  for (const patch of [
    { session: '' },
    { block: '' },
    { server: undefined },
    { server: 'http://host' },
    { server: 'unix://host/fixture.sock' },
    { server: 'unix:///fixture.sock?x=1' },
    { server: 'unix:///fixture.sock#x' },
    { server: 'unix:///%00' },
    { server: 'unix:///%ZZ' },
  ]) {
    assert.equal(
      panelAddress.safeParse({ ...target, ...patch }).success,
      false,
    );
    await assert.rejects(
      readHookPanel({ ...target, ...patch }, undefined, {
        discover: async () =>
          assert.fail('invalid target cannot discover or connect'),
        execute: async () => assert.fail('no CLI invocation'),
      }),
      /Rex hook panel unavailable/,
    );
  }
});

test('Rex query diagnostics map an execution failure to a fixed safe phase', async () => {
  const phases = [];
  await assert.rejects(
    readHookPanel(
      target,
      undefined,
      {
        discover: async () => ({ binary: '/fixture/rex' }),
        execute: async (_binary, _args, options) => {
          options.onFailure({ kind: 'permission', exitCode: 1 });
          throw Error('/PRIVATE/path?token=SECRET');
        },
      },
      (phase) => phases.push(phase),
    ),
  );
  assert.equal(phases.at(-1), 'rex-permission');
  assert(!/PRIVATE|SECRET/.test(JSON.stringify(phases)));
});

test('hook panel reader redacts malformed/oversized replies and never retries a failed read', async () => {
  for (const value of [
    'PRIVATE not JSON',
    'x'.repeat(32769),
    JSON.stringify({ foreground: null }),
    JSON.stringify({ ...reply, generation: -1 }),
    JSON.stringify({ foreground: { ...reply.foreground, cwd: 'relative' } }),
    JSON.stringify({ foreground: { ...reply.foreground, pid: '42' } }),
    JSON.stringify({ foreground: { ...reply.foreground, user_id: -1 } }),
  ]) {
    let reads = 0;
    await assert.rejects(
      readHookPanel(target, undefined, {
        discover: async () => ({ binary: '/fixture/rex' }),
        execute: async () => {
          reads++;
          return value;
        },
      }),
      (error) => error.message === 'Rex hook panel unavailable' && !error.cause,
    );
    assert.equal(reads, 1);
  }
  for (const stage of ['discover', 'execute']) {
    let reads = 0;
    await assert.rejects(
      readHookPanel(target, undefined, {
        discover: async () => {
          if (stage === 'discover') throw Error('/PRIVATE/path');
          return { binary: '/fixture/rex' };
        },
        execute: async () => {
          reads++;
          throw Error('PRIVATE token=SECRET');
        },
      }),
      (error) => error.message === 'Rex hook panel unavailable' && !error.cause,
    );
    assert.equal(reads, stage === 'execute' ? 1 : 0);
  }
});
