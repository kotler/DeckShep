import { test, expect } from '../../tools/e2e';
import { createHash } from 'node:crypto';
import expected from './expected/svg-sha256.json';
import { command, open, selected, labels, trace, error } from './helpers';
import { scenario } from './virtual-host/scenarios';
const focus = (block = 'a', profile = 'rex') => [
  'focus',
  '--session',
  profile === 'rex' ? 'fixture' : 'herdr:fixture',
  block,
];
test.beforeEach(async ({ page }) => {
  await open(page);
});

test('startup renders fifteen exact SVG keys and Home layout with fresh consent', async ({
  page,
}) => {
  const state = await command(page, 'snapshot');
  expect(
    state.keys.map((key) =>
      createHash('sha256')
        .update(key.svg.replace(/>\s+</g, '><').trim())
        .digest('hex'),
    ),
  ).toEqual(expected.startup);
  await expect(page.getByTestId('deck').locator('button')).toHaveCount(15);
  expect(state.keys.map((k) => [k.row, k.col])).toEqual(
    Array.from({ length: 15 }, (_, i) => [Math.floor(i / 5), i % 5]),
  );
  expect(state.keys.every((k) => k.title === '' && k.visible)).toBe(true);
  expect(await labels(page, 1, 4)).toEqual([]);
  expect(await trace(page)).toEqual([]);
});
test('a pointer press selects one agent, moves the white dot and sends only focus', async ({
  page,
}) => {
  await command(page, 'setPreferences', { allowClipboardFocus: true });
  await page.getByTestId('key-0-1').click();
  await expect(page.getByTestId('key-0-1')).toHaveAttribute(
    'data-selected',
    'true',
  );
  expect(
    (await command(page, 'snapshot')).keys
      .filter((k) => k.selected)
      .map((k) => k.col),
  ).toEqual([1]);
  expect(await trace(page)).toEqual([focus('b')]);
  await command(page, 'press', 0, 0);
  await expect(page.getByTestId('key-0-0')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(page.getByTestId('key-0-1')).toHaveAttribute(
    'data-selected',
    'false',
  );
  expect(await trace(page)).toEqual([focus('b'), focus()]);
});
test('the dot follows manual focus, shell tabs and the agent selected after closing a tab', async ({
  page,
}) => {
  const value = scenario('idle-two-codex');
  await command(page, 'setPreferences', { allowClipboardFocus: true });
  const dots = async () =>
    (await command(page, 'snapshot')).keys
      .filter((k) => k.selected)
      .map((k) => k.col);
  for (const [focused, expected] of [
    ['b', [1]],
    ['shell', []],
    ['a', [0]],
  ] as const) {
    value.focused = focused;
    if (focused === 'a')
      value.agents = value.agents.filter((agent) => agent.block !== 'b');
    await command(page, 'setScenario', value);
    expect(await dots()).toEqual(expected);
  }
  expect(await trace(page)).toEqual([]);
});
test('removed interaction pages stay inactive and group controls hide when unnecessary', async ({
  page,
}) => {
  await selected(page);
  expect(await labels(page, 1, 0)).toEqual(['Next agent']);
  expect(await labels(page, 1, 1)).toEqual([]);
  expect(await labels(page, 1, 2)).toEqual([]);
  expect((await labels(page, 2, 2))[0]).toBe('Permissions');
  for (const action of ['more', 'questions', 'prompts', 'back', 'tools']) {
    await command(page, 'setKeySettings', 1, 4, { action });
    await command(page, 'press', 1, 4);
    expect(await labels(page, 1, 4)).toEqual([]);
  }
  expect(await trace(page)).toEqual([focus()]);
});
test('Rex navigation uses terminal titles with provider identity unavailable', async ({
  page,
}) => {
  const value = scenario('overflow-banks');
  for (const agent of value.agents) {
    agent.chatName = 'Provider caption';
    agent.chatId = null;
    agent.nativeIdentity = null;
    agent.nativeVerified = false;
    agent.model = null;
    agent.effort = null;
  }
  value.agents[1].app = 'claude-code';
  value.agents[1].name = 'claude';
  value.slots = [
    ...value.agents.map((agent) => ({
      session: agent.session,
      block: agent.block,
    })),
    { session: 'fixture', block: 'closed' },
  ];
  await command(page, 'setScenario', value);
  await command(page, 'setPreferences', { allowClipboardFocus: true });
  expect(await labels(page, 0, 0)).toEqual(['Chat a', 'Fixture a', 'Ready']);
  await command(page, 'press', 0, 0);
  await command(page, 'press', 1, 0);
  expect((await command(page, 'snapshot')).keys[1].selected).toBe(true);
  await command(page, 'press', 1, 1);
  expect((await labels(page, 0, 0))[0]).toBe('Chat f');
  await command(page, 'press', 1, 2);
  expect(await labels(page, 1, 2)).toEqual([]);
  expect(await trace(page)).toEqual([focus(), focus('b')]);
  expect((await command(page, 'snapshot')).alerts).toEqual([]);
});
test('Codex settings use keyboard macros in the selected pane without thread metadata', async ({
  page,
}) => {
  await selected(page, 'keyboard-codex');
  expect(await labels(page, 2, 2)).toEqual(['Permissions', '']);
  expect(await labels(page, 2, 3)).toEqual(['Mode', '']);
  expect(await labels(page, 2, 0)).toEqual(['Model', 'GPT-6-Sol']);
  await command(page, 'press', 2, 1);
  expect(await labels(page, 2, 1)).toEqual(['Effort', 'xhigh']);
  expect(await labels(page, 2, 0)).toEqual(['Model', 'GPT-6-Sol']);
  await command(page, 'press', 2, 0);
  expect(await labels(page, 2, 0)).toContain('GPT-6-Astra');
  expect(await labels(page, 2, 1)).toEqual(['Effort', 'xhigh']);
  await command(page, 'press', 2, 3);
  expect(await labels(page, 2, 3)).toEqual(['Mode', 'Plan']);
  await command(page, 'press', 2, 2);
  await command(page, 'press', 2, 2);
  expect(await labels(page, 2, 2)).toEqual(['Permissions', 'Read Only']);
  const snapshot = await command(page, 'snapshot');
  expect(snapshot.alerts).toEqual([]);
  expect(
    (await trace(page)).filter((x) => Array.isArray(x) && x.at(-1) === 's'),
  ).toHaveLength(2);
});
test('Claude settings use the focused native picker without a hook identity', async ({
  page,
}) => {
  await selected(page, 'keyboard-claude');
  await command(page, 'setPreferences', { claudeEnabled: true });
  await command(page, 'advance', 2350);
  await command(page, 'advance', 350);
  expect(await labels(page, 2, 0)).toEqual(['Model', 'Prairie 3']);
  await command(page, 'press', 2, 0);
  expect(await labels(page, 2, 0)).toEqual(['Model', 'Summit 8']);
  await command(page, 'press', 2, 1);
  expect(await labels(page, 2, 1)).toEqual(['Effort', 'high']);
  await command(page, 'press', 2, 2);
  expect(await labels(page, 2, 2)).toEqual(['Permissions', 'plan mode']);
  await command(page, 'press', 2, 3);
  expect((await command(page, 'snapshot')).alerts).toEqual([]);
  expect(
    (await trace(page)).slice(1).map((x) => (x as string[]).at(-1)),
  ).toEqual([
    'alt+p',
    'down',
    's',
    'alt+p',
    'right',
    's',
    'shift+tab',
    'shift+tab',
  ]);
});
test('one Escape interrupts the focused working Codex pane without a thread ID', async ({
  page,
}) => {
  await selected(page, 'keyboard-interrupt');
  await command(page, 'press', 2, 4);
  expect(await trace(page)).toEqual([
    focus(),
    ['send-key', '-s', 'fixture', '-b', 'a', 'escape'],
  ]);
  expect((await command(page, 'snapshot')).alerts).toEqual([]);
});
test('working controls respect Rex composer support and Herdr limitations', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  expect(await labels(page, 2, 0)).toEqual(['Steer', 'typed text']);
  expect(await labels(page, 2, 1)).toEqual(['Queue', 'typed text']);
  expect(await labels(page, 2, 4)).toEqual(['Interrupt', 'running']);
  await command(page, 'switchProfile', 'herdr');
  expect(await labels(page, 2, 0)).toEqual([]);
  expect(await labels(page, 2, 1)).toEqual([]);
  expect(await labels(page, 2, 4)).toEqual(['Interrupt', 'running']);
  expect(await trace(page)).toEqual([focus()]);
});
test('Interrupt on a bound working Rex agent sends exactly one Escape', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  await page.getByTestId('key-2-4').click();
  await expect
    .poll(() => trace(page))
    .toEqual([focus(), ['send-key', '-s', 'fixture', '-b', 'a', 'escape']]);
  expect((await command(page, 'snapshot')).alerts).toEqual([]);
});
test('Queue on the virtual deck sends one Tab for a bound run and refuses an unbound run', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  await page.getByTestId('key-2-1').click();
  const queued = [focus(), ['send-key', '-s', 'fixture', '-b', 'a', 'tab']];
  await expect.poll(() => trace(page)).toEqual(queued);
  expect((await command(page, 'snapshot')).alerts).toEqual([]);
  const unbound = scenario('working-rex');
  delete unbound.agents[0].chatId;
  delete unbound.agents[0].runId;
  await command(page, 'setScenario', unbound);
  await command(page, 'advance', 350);
  await command(page, 'press', 2, 1);
  await error(page, 2, 1);
  expect(await trace(page)).toEqual(queued);
});
test('Interrupt on an idle agent sends no input', async ({ page }) => {
  await selected(page);
  await command(page, 'press', 2, 4);
  await error(page, 2, 4);
  expect(await trace(page)).toEqual([focus()]);
});
test('Interrupt without a Codex session binding sends no input', async ({
  page,
}) => {
  const unbound = scenario('working-rex');
  delete unbound.agents[0].chatId;
  await command(page, 'setScenario', unbound);
  await command(page, 'setPreferences', { allowClipboardFocus: true });
  await command(page, 'press', 0, 0);
  await command(page, 'advance', 350);
  await command(page, 'press', 2, 4);
  await error(page, 2, 4);
  expect(await trace(page)).toEqual([focus()]);
});

test('a hook-bound agent routes Interrupt without requiring a footer on the deck', async ({
  page,
}) => {
  const hooked = scenario('working-rex');
  hooked.agents[0].codexHookEpoch = 'fixture-hook-epoch';
  await command(page, 'setScenario', hooked);
  await command(page, 'setPreferences', { allowClipboardFocus: true });
  await command(page, 'press', 0, 0);
  await command(page, 'advance', 350);
  await command(page, 'press', 2, 4);
  expect(await trace(page)).toEqual([
    focus(),
    ['send-key', '-s', 'fixture', '-b', 'a', 'escape'],
  ]);
});
test('a hook epoch change during pending verification refuses the captured press', async ({
  page,
}) => {
  const hooked = scenario('working-rex');
  hooked.agents[0].codexHookEpoch = 'fixture-hook-epoch';
  await command(page, 'setScenario', hooked);
  await command(page, 'setPreferences', { allowClipboardFocus: true });
  await command(page, 'press', 0, 0);
  await command(page, 'advance', 350);
  await command(page, 'pauseFocus');
  await command(page, 'down', 2, 4);
  hooked.agents[0].codexHookEpoch = 'fixture-new-epoch';
  await command(page, 'setScenario', hooked);
  await command(page, 'up', 2, 4);
  expect((await command(page, 'snapshot')).alerts).toContain('key-14');
  expect(await trace(page)).toEqual([focus()]);
});
for (const scenario of ['question', 'approval'])
  test(
    scenario + ' renders navigation and Confirm sends exactly one key',
    async ({ page }) => {
      await selected(page, scenario);
      expect((await labels(page, 2, 0))[0]).toBe('Up');
      expect((await labels(page, 2, 1))[0]).toBe('Down');
      expect((await labels(page, 2, 2))[0]).toBe('Confirm');
      expect((await labels(page, 2, 3))[0]).toBe('Esc');
      await command(page, 'press', 2, 2);
      expect(await trace(page)).toEqual([
        focus(),
        ['send-key', '-s', 'fixture', '-b', 'a', 'enter'],
      ]);
    },
  );
test('350 ms arming and fresh clipboard consent refuse input with short errors', async ({
  page,
}) => {
  await command(page, 'setScenario', 'working-rex');
  await command(page, 'press', 0, 0);
  await command(page, 'press', 2, 4);
  await error(page, 2, 4);
  await command(page, 'advance', 349);
  await command(page, 'press', 2, 4);
  await error(page, 2, 4);
  await command(page, 'advance', 1);
  await command(page, 'press', 2, 4);
  await error(page, 2, 4);
  expect((await labels(page, 2, 4)).slice(1)).toEqual(['Enable', 'checks']);
  expect(await trace(page)).toEqual([focus()]);
});
test('a changed state during pending native verification refuses the captured press', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  await command(page, 'pauseFocus');
  await command(page, 'down', 2, 4);
  await command(page, 'setScenario', 'approval');
  await command(page, 'up', 2, 4);
  const state = await command(page, 'snapshot');
  expect(state.alerts).toContain('key-14');
  expect(
    state.refusals.some(
      (item) => item.context === 'key-14' && item.message.length <= 15,
    ),
  ).toBe(true);
  expect((await labels(page, 2, 2))[0]).toBe('Confirm');
  expect(await trace(page)).toEqual([focus()]);
});
test('profile change during pending verification refuses input to either backend', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  await command(page, 'pauseFocus');
  await command(page, 'down', 2, 4);
  await command(page, 'switchProfile', 'herdr');
  await command(page, 'up', 2, 4);
  expect((await command(page, 'snapshot')).profile).toBe('herdr');
  expect(await labels(page, 2, 0)).toEqual([]);
  expect(await trace(page)).toEqual([focus()]);
});
test('a disappeared key is unregistered and cannot send input', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  await command(page, 'hide', 2, 4);
  await command(page, 'press', 2, 4);
  await expect(page.getByTestId('key-2-4')).toHaveAttribute(
    'data-visible',
    'false',
  );
  expect(await trace(page)).toEqual([focus()]);
});
test('Collapse removes closed slots in order and agent banks wrap', async ({
  page,
}) => {
  await selected(page, 'closed-slot');
  expect(await labels(page, 0, 1)).toEqual(['Closed']);
  expect((await labels(page, 0, 2))[0]).toBe('Chat b');
  await command(page, 'press', 1, 2);
  expect((await labels(page, 0, 0))[0]).toBe('Chat a');
  expect((await labels(page, 0, 1))[0]).toBe('Chat b');
  expect(await labels(page, 0, 2)).toEqual(['No agent']);
  await command(page, 'setScenario', 'overflow-banks');
  await command(page, 'press', 1, 1);
  expect((await labels(page, 0, 0))[0]).toBe('Chat f');
  expect((await labels(page, 1, 1))[1]).toBe('2/2');
  await command(page, 'press', 1, 1);
  expect((await labels(page, 0, 0))[0]).toBe('Chat a');
  expect((await labels(page, 1, 1))[1]).toBe('1/2');
  expect(await trace(page)).toEqual([focus()]);
});
test('Home stays dynamic in Herdr and Claude controls require explicit settings', async ({
  page,
}) => {
  await selected(page, 'herdr-tui', 'herdr');
  await command(page, 'press', 1, 4);
  await command(page, 'press', 1, 4);
  expect(await labels(page, 1, 4)).toEqual([]);
  expect(await labels(page, 2, 0)).toEqual([]);
  expect(await trace(page)).toEqual([focus('a', 'herdr')]);
  await command(page, 'reset');
  await command(page, 'setScenario', 'claude-mixed');
  await command(page, 'press', 0, 1);
  await command(page, 'advance', 350);
  expect(await labels(page, 2, 0)).toEqual(['Check Rex', 'Enable', 'Claude']);
  expect(await trace(page)).toEqual([focus('b')]);
  await command(page, 'setPreferences', { claudeEnabled: true });
  await command(page, 'advance', 2000);
  await command(page, 'press', 0, 1);
  await command(page, 'advance', 350);
  expect((await labels(page, 2, 0))[0]).toBe('Model');
  expect(await trace(page)).toEqual([focus('b'), focus('b')]);
});

// Six visual smoke baselines complement exact SVG/label/trace assertions.
for (const [name, scenario, profile] of [
  ['idle', 'idle-two-codex', 'rex'],
  ['working', 'working-rex', 'rex'],
  ['question', 'question', 'rex'],
  ['herdr', 'herdr-tui', 'herdr'],
  ['offline', 'offline', 'rex'],
  ['overflow', 'overflow-banks', 'rex'],
] as const)
  test('exact SVG and visual smoke: ' + name, async ({ page }) => {
    const state =
      name === 'offline'
        ? await command(page, 'setScenario', scenario)
        : await selected(page, scenario, profile);
    expect(
      state.keys.map((key) =>
        createHash('sha256')
          .update(key.svg.replace(/>\s+</g, '><').trim())
          .digest('hex'),
      ),
    ).toEqual(expected[name]);
    expect(await trace(page)).toEqual(
      name === 'offline' ? [] : [focus('a', profile)],
    );
    await expect(page.getByTestId('deck')).toHaveScreenshot(name + '.png', {
      animations: 'disabled',
      maxDiffPixels: 0,
    });
  });
