import { test, expect } from '../../tools/e2e';
import { createHash } from 'node:crypto';
import expected from './expected/svg-sha256.json';
import { command, open, selected, labels, trace, error } from './helpers';
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
  expect(await labels(page, 1, 4)).toEqual([
    'Page 1/3',
    'Home',
    'Select agent',
  ]);
  expect(await trace(page)).toEqual([]);
});
test('a pointer press selects one agent, moves the white dot and sends only focus', async ({
  page,
}) => {
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
test('Page cycles Home, Questions, Prompts, Home at the same coordinate without input', async ({
  page,
}) => {
  await selected(page);
  for (const [name, number] of [
    ['Questions', 2],
    ['Prompts', 3],
    ['Home', 1],
  ] as const) {
    await command(page, 'press', 1, 4);
    expect((await labels(page, 1, 4)).slice(0, 2)).toEqual([
      'Page ' + number + '/3',
      name,
    ]);
  }
  expect(await trace(page)).toEqual([focus()]);
});
test('working controls respect Rex composer support and Herdr limitations', async ({
  page,
}) => {
  await selected(page, 'working-rex');
  expect(await labels(page, 2, 0)).toEqual(['Steer', 'typed message']);
  expect(await labels(page, 2, 1)).toEqual(['Queue', 'typed message']);
  expect(await labels(page, 2, 4)).toEqual(['Interrupt', 'running']);
  await command(page, 'switchProfile', 'herdr');
  expect(await labels(page, 2, 0)).toEqual([]);
  expect(await labels(page, 2, 1)).toEqual([]);
  expect(await labels(page, 2, 4)).toEqual(['Interrupt', 'running']);
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
  expect((await labels(page, 2, 4))[1]).toBe('Enable visible-');
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
  await command(page, 'press', 1, 0);
  expect((await labels(page, 0, 0))[0]).toBe('Chat a');
  expect((await labels(page, 0, 1))[0]).toBe('Chat b');
  expect(await labels(page, 0, 2)).toEqual(['No agent']);
  await command(page, 'setScenario', 'overflow-banks');
  await command(page, 'press', 1, 1);
  expect((await labels(page, 0, 0))[0]).toBe('Chat f');
  expect((await labels(page, 1, 1))[1]).toBe('bank 2/2');
  await command(page, 'press', 1, 1);
  expect((await labels(page, 0, 0))[0]).toBe('Chat a');
  expect((await labels(page, 1, 1))[1]).toBe('bank 1/2');
  expect(await trace(page)).toEqual([focus()]);
});
test('Herdr Prompts uses the keyboard and Claude controls require explicit settings', async ({
  page,
}) => {
  await selected(page, 'herdr-tui', 'herdr');
  await command(page, 'press', 1, 4);
  await command(page, 'press', 1, 4);
  expect(await labels(page, 1, 0)).toEqual(['Use Herdr', 'keyboard']);
  expect(await trace(page)).toEqual([focus('a', 'herdr')]);
  await command(page, 'reset');
  await command(page, 'setScenario', 'claude-mixed');
  await command(page, 'press', 0, 1);
  await command(page, 'advance', 350);
  expect(await labels(page, 2, 0)).toEqual(['Check Rex', 'Enable Claude']);
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
