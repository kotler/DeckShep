import { test, expect } from '../../tools/e2e';
import { command, open, labels, trace } from './helpers';
async function app(page: Parameters<typeof open>[0], consent = true) {
  await command(page, 'setScenario', 'herdr-app-panes');
  await command(page, 'switchProfile', 'herdr-app');
  await command(page, 'setPreferences', {
    herdrAppHome: '/virtual/app',
    herdrAppFocusRequestEnabled: consent,
  });
  return command(page, 'advance', 350);
}
test.beforeEach(async ({ page }) => {
  await open(page);
});
test('App selection and Next need separate consent and report requested rather than verified focus', async ({
  page,
}) => {
  await app(page, false);
  expect(await labels(page, 0, 1)).toContain('App reported');
  await command(page, 'press', 0, 1);
  expect(await trace(page)).toEqual([]);
  await command(page, 'setPreferences', { herdrAppFocusRequestEnabled: true });
  await command(page, 'press', 0, 1);
  expect(await trace(page)).toEqual([]);
  await command(page, 'advance', 350);
  await command(page, 'press', 0, 1);
  expect(await trace(page)).toEqual([['pane.focus', 'p2']]);
  expect(await labels(page, 0, 1)).toEqual(['Focus requested', 'Not verified']);
  await command(page, 'advance', 2500);
  expect(await labels(page, 0, 1)).toContain('Deck selected');
  await command(page, 'advance', 350);
  await command(page, 'press', 1, 1);
  expect(await trace(page)).toEqual([
    ['pane.focus', 'p2'],
    ['pane.focus', 'p3'],
  ]);
  await command(page, 'setKeySettings', 1, 2, { action: 'answer' });
  await command(page, 'press', 1, 2);
  expect(await trace(page)).toHaveLength(2);
});
test('App bank, closed slots and Collapse stay local and unsupported overrides cannot send input', async ({
  page,
}) => {
  await app(page);
  await command(page, 'press', 2, 0);
  expect(await labels(page, 0, 0)).toContain('Pane 6');
  const panes = [1, 2, 3, 4, 5, 7].map((number) => ({
    target: {
      space: 's1',
      tab: 'c1',
      pane: 'p' + number,
      terminal: 't' + number,
    },
    reportedApp: 'codex',
    reportedStatus: 'idle',
    name: 'Pane ' + number,
  }));
  await command(page, 'setScenario', {
    agents: [],
    focused: '',
    app: { panes, selected: panes[0].target, epoch: 1 },
  });
  expect(await labels(page, 0, 0)).toContain('Closed pane');
  await command(page, 'press', 0, 0);
  await command(page, 'press', 1, 0);
  expect(await labels(page, 0, 0)).toContain('Pane 7');
  for (const action of ['zoom', 'send', 'interrupt', 'approvalConfirm']) {
    await command(page, 'setKeySettings', 1, 3, { action });
    await command(page, 'press', 1, 3);
  }
  expect(await trace(page)).toEqual([]);
});
test('App focus-request consent revocation invalidates an awaiting request before synthetic dispatch', async ({
  page,
}) => {
  await app(page);
  await command(page, 'pauseFocus');
  await command(page, 'down', 0, 1);
  await command(page, 'setPreferences', { herdrAppFocusRequestEnabled: false });
  await command(page, 'up', 0, 1);
  expect(await trace(page)).toEqual([]);
});
test('switching away from a paused App request sends nothing to the old profile', async ({
  page,
}) => {
  await app(page);
  await command(page, 'pauseFocus');
  await command(page, 'down', 0, 1);
  await command(page, 'switchProfile', 'rex');
  await command(page, 'up', 0, 1);
  expect(await trace(page)).toEqual([]);
});
