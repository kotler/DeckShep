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
test('clicking virtual deck keys switches from local selection to a consented focus request', async ({
  page,
}) => {
  await app(page, false);
  const second = page.getByTestId('key-0-1');
  await second.click();
  await expect(second).toHaveAccessibleName(
    /^Pane 2 · DeckShep · Ready · Deck only$/,
  );
  expect(await trace(page)).toEqual([]);

  await page.getByRole('button', { name: 'Enable fixture consent' }).click();
  const next = page.getByTestId('key-1-0');
  await expect(next).toHaveAccessibleName(/^Next agent · Pane 2$/);
  await expect(second).toHaveAccessibleName(/^Pane 2 · DeckShep · Ready$/);
  await command(page, 'advance', 350);
  await expect(next).toHaveAccessibleName(/Next agent.*Pane 2/);
  await next.click();
  await expect(next).toHaveAccessibleName(/Next agent.*Pane 3/);
  expect(await trace(page)).toEqual([['pane.focus', 'p2']]);
  await command(page, 'advance', 350);
  await next.click();
  await expect(next).toHaveAccessibleName(/Next agent.*Pane 4/);
  expect(await trace(page)).toEqual([
    ['pane.focus', 'p2'],
    ['pane.focus', 'p3'],
  ]);
});
test('rapid Next and Page presses leave the new destination visible without a warning', async ({
  page,
}) => {
  await app(page);
  for (const col of [0, 1]) {
    await command(page, 'advance', 350);
    const accepted = await command(page, 'press', 1, col);
    await command(page, 'advance', 349);
    const repeat = await command(page, 'press', 1, col);
    expect(repeat.alerts).toEqual(accepted.alerts);
    expect(repeat.refusals).toEqual(accepted.refusals);
    expect(repeat.trace).toEqual(accepted.trace);
    expect(repeat.keys[5 + col].labels).toEqual(accepted.keys[5 + col].labels);
    await command(page, 'advance', 1);
    const next = await command(page, 'press', 1, col);
    expect(next.keys[5 + col].labels).not.toEqual(repeat.keys[5 + col].labels);
  }
});
test('App tile acknowledgement keeps its name and status visible with a separate selection marker', async ({
  page,
}) => {
  await app(page, false);
  expect(await labels(page, 0, 1)).toContain('Deck only');
  await command(page, 'press', 0, 1);
  expect(await trace(page)).toEqual([]);
  await command(page, 'setPreferences', { herdrAppFocusRequestEnabled: true });
  await command(page, 'press', 0, 1);
  expect(await trace(page)).toEqual([]);
  await command(page, 'advance', 350);
  await command(page, 'press', 0, 1);
  expect(await trace(page)).toEqual([['pane.focus', 'p2']]);
  expect(await labels(page, 0, 1)).toEqual(['Pane 2', 'DeckShep', 'Ready']);
  await expect(page.getByTestId('key-0-1')).toHaveAttribute(
    'data-selected',
    'false',
  );
  await command(page, 'advance', 350);
  await command(page, 'press', 1, 0);
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
  await command(page, 'press', 1, 1);
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
  await command(page, 'advance', 350);
  await command(page, 'press', 1, 2);
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

for (const consent of [false, true]) {
  test(`Attention reveals a waiting Claude on the second bank (consent=${consent})`, async ({
    page,
  }) => {
    await app(page, consent);
    const panes = Array.from({ length: 6 }, (_, i) => ({
      target: {
        space: 's1',
        tab: 'c1',
        pane: 'p' + (i + 1),
        terminal: 't' + (i + 1),
      },
      reportedApp: i === 5 ? 'claude-code' : 'codex',
      reportedStatus: i === 5 ? 'blocked' : 'idle',
      name: i === 5 ? 'Review' : 'Job ' + (i + 1),
    }));
    await command(page, 'setScenario', {
      agents: [],
      focused: '',
      app: { panes, selected: panes[0].target, epoch: 1 },
    });
    await command(page, 'advance', 350);
    expect(await labels(page, 1, 4)).toEqual([
      'Attention',
      'Review',
      'waiting',
      ...(consent ? [] : ['Deck only']),
    ]);
    await command(page, 'press', 1, 4);
    expect(await labels(page, 0, 0)).toEqual([
      'Review',
      'No folder',
      'Waiting',
      ...(consent ? [] : ['Deck only']),
    ]);
    expect(await labels(page, 1, 4)).toEqual([]);
    expect(await trace(page)).toEqual(consent ? [['pane.focus', 'p6']] : []);
  });
}

function pane(id: number, reportedStatus = 'idle') {
  return {
    target: { space: 's1', tab: 'c1', pane: 'p' + id, terminal: 't' + id },
    name: 'Pane ' + id,
    reportedApp: 'codex',
    reportedStatus,
  };
}
function world(panes: ReturnType<typeof pane>[], selected = 1) {
  return {
    agents: [],
    focused: '',
    app: { epoch: 1, panes, selected: pane(selected).target },
  };
}
test('App selection reveals its bank once while bottom-row controls stay blank', async ({
  page,
}) => {
  await app(page, false);
  const panes = Array.from({ length: 7 }, (_, i) => pane(i + 1));
  await command(page, 'setScenario', world(panes));
  const model = page.getByTestId('key-2-0');
  await expect(model).toHaveAccessibleName('Empty key');
  await command(page, 'press', 1, 1);
  await command(page, 'advance', 350);
  await command(page, 'press', 0, 0);
  await expect(page.getByTestId('key-0-0')).toHaveAccessibleName(
    /Pane 6.*Deck only/,
  );
  await expect(model).toHaveAccessibleName('Empty key');
  await model.click();
  expect(await trace(page)).toEqual([]);

  await command(page, 'setScenario', world(panes, 7));
  await expect(page.getByTestId('key-0-1')).toHaveAccessibleName(/Pane 7/);
  await expect(model).toHaveAccessibleName('Empty key');
  await command(page, 'advance', 350);
  await command(page, 'press', 1, 1);
  await command(page, 'setScenario', world(panes, 7));
  await expect(page.getByTestId('key-0-0')).toHaveAccessibleName(/Pane 1/);
  await expect(model).toHaveAccessibleName('Empty key');
  for (const status of ['working', 'blocked']) {
    await command(
      page,
      'setScenario',
      world([...panes.slice(0, 6), pane(7, status)], 7),
    );
    await expect(model).toHaveAccessibleName('Empty key');
  }
  await command(page, 'setScenario', world(panes.slice(0, 6), 7));
  await expect(model).toHaveAccessibleName('Empty key');
  expect(await trace(page)).toEqual([]);
});
test('Next refuses a pane closed mid-press and Collapse restores its slot for the surviving agent', async ({
  page,
}) => {
  await app(page);
  await command(page, 'setScenario', world([pane(1), pane(2), pane(3)]));
  await command(page, 'advance', 350);
  const next = page.getByTestId('key-1-0');
  await expect(next).toHaveAccessibleName(/Next agent.*Pane 2/);
  await command(page, 'pauseFocus');
  await command(page, 'down', 1, 0);
  await command(page, 'setScenario', world([pane(1), pane(3)]));
  await command(page, 'up', 1, 0);
  expect(await trace(page)).toEqual([]);
  await expect(page.getByTestId('key-0-1')).toHaveAccessibleName(/Closed pane/);
  const collapse = page.getByTestId('key-1-2');
  await expect(collapse).toHaveAccessibleName(/Collapse/);
  await command(page, 'advance', 350);
  await collapse.click();
  await expect(page.getByTestId('key-0-1')).toHaveAccessibleName(/Pane 3/);
  await command(page, 'advance', 350);
  await next.click();
  await expect(next).toHaveAccessibleName(/Next agent.*Pane 1/);
  expect(await trace(page)).toEqual([['pane.focus', 'p3']]);
});
test('two plain calibration terminals leave all five agent tiles, Next and Attention inactive', async ({
  page,
}) => {
  await app(page);
  const plain = [pane(1), pane(2)].map((p) => ({
    ...p,
    name: 'cat',
    reportedApp: 'cat',
  }));
  await command(page, 'setScenario', world(plain));
  // The original agents have closed. Collapse their retained slots first.
  await command(page, 'advance', 350);
  await page.getByTestId('key-1-2').click();
  for (let column = 0; column < 5; column++)
    await expect(page.getByTestId('key-0-' + column)).toHaveAccessibleName(
      /No agent/,
    );
  for (const key of ['key-1-0', 'key-1-4']) {
    const button = page.getByTestId(key);
    await expect(button).toHaveAccessibleName('Empty key');
    await button.click();
  }
  expect(await trace(page)).toEqual([]);
});
for (const action of ['Attention', 'Next']) {
  test(`${action} refuses a superseded destination at verified preflight`, async ({
    page,
  }) => {
    await app(page);
    const attention = action === 'Attention';
    const col = attention ? 4 : 0;
    const before = attention
      ? [pane(1), pane(2, 'done'), pane(3)]
      : [pane(1), pane(3)];
    const after = attention
      ? [pane(1), pane(2, 'done'), pane(3, 'blocked')]
      : [pane(3), pane(2), pane(1)];
    await command(page, 'setScenario', world(before));
    await command(page, 'advance', 350);
    expect(await labels(page, 1, col)).toContain(
      attention ? 'Pane 2' : 'Pane 3',
    );
    await command(page, 'pauseFocus');
    await command(page, 'down', 1, col);
    await command(page, 'setScenario', world(after));
    await command(page, 'up', 1, col);
    expect(await trace(page)).toEqual([]);
    expect(await labels(page, 1, col)).toContain('Press again');
  });
}
test('a fresh tile preflight updates the App dot independently of the acknowledged deck choice', async ({
  page,
}) => {
  await app(page);
  await command(page, 'setScenario', world([pane(1), pane(2), pane(3)]));
  await command(page, 'advance', 350);
  await command(page, 'pauseFocus');
  await command(page, 'down', 0, 1);
  const changed = world([pane(1), pane(2), pane(3)], 3);
  await command(page, 'setScenario', changed);
  const ack = await command(page, 'up', 0, 1);
  expect(await trace(page)).toEqual([['pane.focus', 'p2']]);
  expect(ack.keys[0].selected).toBe(false);
  expect(ack.keys[2].selected).toBe(true);
  await command(page, 'setScenario', changed);
  await command(page, 'advance', 2500);
  expect(await labels(page, 0, 1)).toEqual(['Pane 2', 'No folder', 'Ready']);
});
