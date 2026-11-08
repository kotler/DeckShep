const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { CodexProvider } = require('../../src/agents/codex/provider');
const { ClaudeProvider } = require('../../src/agents/claude/provider');
const {
  backendCapabilities,
  supported,
} = require('../../src/domain/capabilities');
for (const Provider of [CodexProvider, ClaudeProvider])
  test(`${Provider.name}: matching, binding, state and unverified-backend refusal`, async () => {
    const provider = new Provider(),
      agent = {
        app: provider.id,
        state: 'idle',
        session: 'fixture',
        block: 'fixture',
        pid: 42,
        name: 'fixture',
      };
    assert(provider.matches(agent));
    assert(!provider.matches({}));
    assert(!provider.matches({ app: 'other' }));
    assert.equal(await provider.bind({ ...agent, app: 'other' }, {}), null);
    assert.equal(await provider.bind(agent, {}), agent);
    assert.equal(await provider.state(agent), agent);
    const controls = provider.controls(agent);
    assert(controls.find((control) => control.id === 'send'));
    assert(
      controls
        .filter((control) =>
          supported(control, new Set(backendCapabilities['herdr-tui'])),
        )
        .every((control) => !['send', 'steer', 'queue'].includes(control.id)),
    );
    let delivered = 0;
    const context = {
      press: { target: agent },
      backend: { id: 'herdr-app', capabilities: new Set() },
      operations: {
        execute: async () => {
          delivered++;
        },
      },
    };
    await assert.rejects(provider.perform('model', context), /Use keyboard/);
    assert.equal(delivered, 0);
    context.backend = {
      id: 'rex',
      capabilities: new Set(backendCapabilities.rex),
    };
    await provider.perform('model', context);
    assert.equal(delivered, 1);
  });
