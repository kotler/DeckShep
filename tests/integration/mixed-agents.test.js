'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  { Bridge, identify } = require('../../src/app/session'),
  { AgentMetadata } = require('../../src/agents/codex/metadata'),
  { modelLines, sameTarget } = require('../../src/domain/labels'),
  { harness } = require('../helpers/plugin-harness'),
  { svg } = require('../../src/render/visuals'),
  defaults = require('../../com.kotl3r.deckshep.sdPlugin/config.json'),
  C = require('../../src/guards/context');
test('mixed agents', async () => {
  const entries = Array.from({ length: 7 }, (_, i) => ({
    session: 's',
    window: 'w' + i,
    block: 'b' + i,
    pid: 42 + i,
    name: i % 2 ? 'claude' : 'codex',
    app: i % 2 ? 'claude-code' : 'codex',
    cwd: '/project',
    state: 'idle',
  }));
  let focus = 'b0';
  const writes = [];
  const run = async (args) => {
    if (args[0] === 'client')
      return {
        clients: [
          {
            client_id: 'c',
            info: { kind: 'app', platform: 'macos', name: 'Rex Beta' },
            connection_state: 'connected',
          },
        ],
      };
    if (args[0] === 'ls') return { sessions: [{ session_id: 's' }] };
    if (args[0] === 'session')
      return {
        windows: entries.map((a) => ({
          window_id: a.window,
          layers: [
            {
              blocks: [
                {
                  block_id: a.block,
                  creator_name: 'com.superlogical.terminal',
                },
              ],
            },
          ],
        })),
      };
    if (args[0] === 'focus') {
      focus = args[3];
      return;
    }
    if (args[0] === '-C' || args[0] === 'zoom') {
      writes.push(args);
      return;
    }
    if (args[0] === 'block') {
      const a = entries.find((a) => a.block === args[5]);
      if (args.at(-1) === 'process')
        return {
          foreground: {
            ...a,
            user_id: process.getuid(),
            path: '/bin/' + a.name,
          },
        };
      if (args.at(-1) === 'program_status')
        return {
          records: [
            {
              app: a.app,
              state: a.state,
              updated_at: new Date().toISOString(),
              owner: { pid: a.pid, name: a.name },
            },
          ],
        };
    }
    throw Error('Unexpected transport operation ' + args[0]);
  };
  const b = new Bridge(
    {
      ...structuredClone(defaults),
      allowClipboardFocus: true,
      bringToFront: false,
    },
    run,
    async () => {},
    async () => focus,
  );
  // Discovery and slot ordering require no Claude login, hooks, daemon or native input.
  b.claude.enrich = async (a) => ({
    ...a,
    nativeVerified: false,
    claudeControlsEnabled: false,
  });
  let found = await b.discover();
  assert.deepEqual(
    found.map((a) => a.app),
    entries.map((a) => a.app),
  );
  assert.equal(b.slots.length, 7);
  await b.focus(found[4]);
  await b.navigate(1);
  assert.equal(b.lastTarget.block, 'b5');
  assert.equal(b.lastTarget.app, 'claude-code');
  await b.navigate(1);
  await b.navigate(1);
  assert.equal(b.lastTarget.block, 'b0');
  entries.splice(2, 1);
  await b.discover();
  assert.equal(b.slots[2].block, 'b2');
  assert.equal(b.slotGaps(), 1);
  await b.collapse();
  assert.deepEqual(
    b.slots.map((a) => a.block),
    ['b0', 'b1', 'b3', 'b4', 'b5', 'b6'],
  );
  const metadata = new AgentMetadata(b, {
    socketFor: async () => {
      throw Error('Claude must never query Codex daemon');
    },
  });
  const claude = {
    ...found[1],
    chatName: 'Claude chat',
    model: 'claude-sonnet',
    nativeIdentity: 'claude-binding',
  };
  await metadata.refresh([claude], true);
  assert.equal(claude.model, 'claude-sonnet');
  assert.equal(metadata.cache.size, 0);
  metadata.cache.set(
    [
      claude.session,
      claude.block,
      'codex',
      claude.pid,
      claude.cwd,
      '',
      '',
      '',
    ].join('|'),
    { value: { chatName: 'Wrong Codex title', model: 'gpt-6-astra' } },
  );
  metadata.hydrate([claude]);
  assert.equal(claude.chatName, 'Claude chat');
  assert(!sameTarget({ ...claude, app: 'codex' }, claude));
  assert.equal(
    identify({
      foreground: {
        pid: 10,
        user_id: process.getuid(),
        path: '/Users/u/.local/share/claude/versions/2.1.319',
        name: '2.1.319',
        cwd: '/project',
      },
    }).app,
    'claude-code',
  );
  const h = harness();
  await h.ready();
  const base = h.live[0];
  h.api.bridge.slots = [];
  h.setLive(
    Array.from({ length: 7 }, (_, i) => ({
      ...base,
      block: 'm' + i,
      pid: 70 + i,
      name: i % 2 ? 'claude' : 'codex',
      app: i % 2 ? 'claude-code' : 'codex',
      chatId: 'chat-' + i,
      nativeIdentity: i % 2 ? 'claude-' + i : undefined,
      nativeVerified: true,
      claudeControlsEnabled: true,
      model: i % 2 ? 'claude-sonnet-4-6' : 'gpt-6.1-sol',
      modelName: i % 2 ? 'Sonnet 4.6' : undefined,
      chatName: 'Chat ' + i,
    })),
  );
  await h.api.refresh();
  await h.press(0, 1);
  h.tick();
  assert.equal(h.action(1, 3), 'none');
  assert.equal(h.action(2, 2), 'claudeInfo');
  assert.equal(h.action(2, 3), 'claudeModeInfo');
  assert(h.image(0, 1).includes('claude-watermark'));
  assert(!h.image(0, 1).includes('agent-watermark'));
  assert(h.image(2, 0).includes('Sonnet'));
  const stale = h.api.keys.get('2,0').presented;
  await h.press(0, 0);
  h.tick();
  const n = h.calls.length;
  await h.press(2, 0, stale);
  assert.equal(
    h.calls.length,
    n,
    'captured Claude press cannot become Codex action',
  );
  assert.equal(h.action(1, 3), 'none');
  assert.equal(h.action(2, 2), 'permissions');
  assert.equal(h.action(2, 3), 'plan');
  assert(h.image(0, 0).includes('agent-watermark'));
  assert(h.image(0, 0).includes('<title>Codex</title>'));
  assert(!h.image(0, 0).includes('data:image/png'));
  assert(h.image(0, 1).includes('<title>Claude</title>'));
  h.change('m0', {
    app: 'claude-code',
    name: 'claude',
    nativeIdentity: 'replaced-provider',
    nativeVerified: true,
    claudeControlsEnabled: true,
  });
  await h.api.refresh();
  assert.equal(h.api.selected(), undefined);
  assert(!h.image(0, 0).includes('id="selected-agent"'));
  assert(
    !svg({
      icon: 'claude-code',
      agent: true,
      lines: ['Claude', 'project', 'READY'],
    }).includes('data:image/png'),
  );
  const prefs = require('../../src/app/preferences');
  assert.equal(
    prefs.apply(defaults, { claudeEnabled: true }).claude.enabled,
    true,
  );
  assert.equal(defaults.claude.enabled, false);
  assert.throws(() => prefs.normalize({ claudeEnabled: 'yes' }));
  assert.equal(
    C.homeRow({
      ...claude,
      nativeVerified: true,
      claudeControlsEnabled: true,
      state: 'working',
      composerSupported: false,
    })[0],
    'none',
  );
  console.log(
    'PASS mixed Claude/Codex discovery, cross-provider next/wrap, stable overflow/hole Collapse, process replacement, provider-specific captions/artwork, native metadata isolation and stale cross-provider press refusal',
  );
});
