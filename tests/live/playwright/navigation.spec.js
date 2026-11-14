const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { execFileSync } = require('node:child_process');
const { test, expect } = require('../../../tools/e2e');
const { VirtualDeck } = require('../../e2e/virtual-host/deck');
const { prepareVirtualHost } = require('../../e2e/virtual-host/host');
const {
  runReleaseCalibration,
} = require('../app-calibration/release-runner.cjs');
const { holdHardwareRun } = require('../app-calibration/hardware-runner.cjs');
const { hash, readArtifact } = require('../app-calibration/artifacts.cjs');
const { appAuthorization } = require('../app-calibration/isolation.cjs');
const { requestClient } = require('../app-calibration/release-scenarios.cjs');
const { NavigationChannel } = require('./navigation-channel.cjs');
const { launchEditor } = require('./editor-launch.cjs');
const reviewed = require('../../../docs/validation/2026-11-08-herdr-app-installed-release-artifacts.json');

async function connectDeck(page, deck) {
  // Only this browser context can send events. The native run exposes no
  // preview HTTP/control listener, scenario injection, or arbitrary preferences.
  const origin = 'http://127.0.0.1:19190';
  await page.route(origin + '/**', async (route) => {
    const asset = new URL(route.request().url()).pathname;
    if (!['/', '/app.js'].includes(asset)) return route.abort();
    return route.fulfill({
      path: path.resolve(
        'tests/e2e/virtual-deck',
        asset === '/' ? 'index.html' : 'app.js',
      ),
      contentType: asset === '/' ? 'text/html' : 'text/javascript',
    });
  });
  await page.routeWebSocket('ws://127.0.0.1:19190/control', (socket) => {
    let queue = Promise.resolve();
    socket.send(JSON.stringify({ state: deck.snapshot() }));
    socket.onMessage((raw) => {
      queue = queue.then(async () => {
        const { id, method, args } = JSON.parse(String(raw));
        try {
          if (!['down', 'up', 'press', 'snapshot'].includes(method))
            throw Error();
          const state = await deck.execute(method, args);
          socket.send(JSON.stringify({ id, result: state, state }));
        } catch {
          socket.send(
            JSON.stringify({ id, error: 'Native deck command refused' }),
          );
        }
      });
    });
  });
  await page.goto(origin);
  await page.evaluate(() => globalThis.deck.ready);
}

async function walkthrough(page, run, root) {
  const { manifest, helper } = run.artifacts;
  const fixture = path.join(root, 'dependencies.cjs');
  const factory = require.resolve('../app-calibration/hardware-backend.cjs');
  const args = [
    root,
    manifest.appRecord,
    manifest.helperSha256,
    run.env.HERDR_APP_HOME,
  ]
    .map((x) => JSON.stringify(x))
    .join(',');
  fs.writeFileSync(
    fixture,
    'const {hardwareBackend}=require(' +
      JSON.stringify(factory) +
      ');\n' +
      'exports.applicationDependencies=()=>({experimentalHerdrApp:true,appFocusBackend:hardwareBackend(' +
      args +
      '),appSelectionReader:()=>null,appCoreStatus:()=>null});\n',
    { flag: 'wx', mode: 0o600 },
  );
  const deck = new VirtualDeck(
    () =>
      prepareVirtualHost({
        fixture,
        peerHelper: { file: helper, sha256: manifest.helperSha256 },
      }),
    'herdr-app',
  );
  const observer = requestClient(run).sender;
  const model = () => observer.observe(run.signal);
  const selected = async () => (await model()).selected?.pane;
  const key = (row, col) => page.getByTestId('key-' + row + '-' + col);
  const refresh = () => page.evaluate(() => globalThis.deck.snapshot());
  async function waitLabel(button, pattern) {
    await expect
      .poll(
        async () => {
          await refresh();
          return button.getAttribute('aria-label');
        },
        { timeout: 12000 },
      )
      .toMatch(pattern);
  }
  const consent = (enabled) =>
    deck.execute('setPreferences', [
      {
        herdrAppHome: run.env.HERDR_APP_HOME,
        herdrAppFocusRequestEnabled: enabled,
      },
    ]);
  async function clickArmed(button) {
    // Real monotonic time, deliberately beyond the controller's 350 ms arming delay.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await button.click();
    await refresh();
  }
  let verifyEditor = async () => {};
  try {
    await deck.reset();
    await consent(false);
    await connectDeck(page, deck);
    await test.step('Connected calibration terminals produce an empty agent roster', async () => {
      expect((await model()).panes).toHaveLength(2);
      await waitLabel(key(0, 0), /No agent/);
      await waitLabel(key(1, 0), /^Empty key$/);
      await waitLabel(key(1, 4), /^Empty key$/);
    });
    const channel = new NavigationChannel(run.gate);
    await channel.createPanes();
    let view;
    await expect
      .poll(
        async () => {
          try {
            view = await model();
          } catch (error) {
            // The App may be switching spaces while the startup reads are bracketed.
            if (
              ['App selection changed', 'App selection ambiguous'].includes(
                error.message,
              )
            )
              return false;
            if (error.message === 'App view unavailable') {
              const status = await channel.appRead(
                { status: true },
                'herdrAppStatus',
              );
              if (
                !status.errors.length &&
                !Object.keys(status.floats).length &&
                status.overlays.every((name) => name === 'toast')
              )
                return false;
              throw Error(
                'App readiness refused: ' +
                  status.errors.length +
                  ' errors, ' +
                  status.overlays.length +
                  ' overlays, ' +
                  Object.keys(status.floats).length +
                  ' floats',
              );
            }
            throw error;
          }
          return (
            view.panes.some(
              (p) => p.reportedApp === 'codex' && p.reportedStatus === 'idle',
            ) &&
            view.panes.some(
              (p) =>
                p.reportedApp === 'claude-code' &&
                p.reportedStatus === 'blocked' &&
                p.target.pane === view.selected?.pane,
            )
          );
        },
        { timeout: 12000 },
      )
      .toBe(true);
    const codex = view.panes.find((p) => p.reportedApp === 'codex');
    const claude = view.panes.find((p) => p.reportedApp === 'claude-code');
    expect(claude.reportedStatus).toBe('blocked');
    expect(await selected()).toBe(claude.target.pane);
    await waitLabel(key(1, 0), /Next agent.*Deck only/);
    const tileFor = (target) =>
      page.getByRole('button', {
        name:
          target === codex
            ? /^(codex|Codex).*Ready/
            : /^(claude|Claude).*Waiting/,
      });
    const waitForDot = async (target) => {
      await expect
        .poll(
          async () => {
            await refresh();
            return tileFor(target).getAttribute('data-selected');
          },
          { timeout: 10000 },
        )
        .toBe('true');
    };
    await waitForDot(claude);
    await test.step('Next and Attention select locally with focus consent off', async () => {
      await clickArmed(key(1, 0));
      await waitLabel(key(1, 4), /Attention.*waiting.*Deck only/);
      expect(await selected()).toBe(claude.target.pane);
      await clickArmed(key(1, 4));
      await waitLabel(key(1, 4), /^Empty key$/);
      expect(await selected()).toBe(claude.target.pane);
    });
    await test.step('An agent tile changes the deck marker while the native dot stays put', async () => {
      await clickArmed(tileFor(codex));
      await waitLabel(tileFor(codex), /On deck/);
      expect(await selected()).toBe(claude.target.pane);
      await waitForDot(claude);
    });
    await consent(true);
    for (const [name, column, target] of [
      ['Next', 0, codex],
      ['Attention', 4, claude],
    ]) {
      await test.step(
        name + ' requests the displayed pane and Herdr confirms the selection',
        async () => {
          await waitLabel(
            key(1, column),
            name === 'Next'
              ? /^Next agent(?!.*Deck only)/
              : /^Attention(?!.*Deck only)/,
          );
          await clickArmed(key(1, column));
          if (name === 'Next')
            await waitLabel(key(1, column), /^Next agent(?!.*Deck only)/);
          else await waitLabel(key(1, column), /^Empty key$/);
          await expect.poll(selected).toBe(target.target.pane);
          // Present the new native selection before capturing the next press.
          // Only a new App observation can move the selection dot.
          await waitForDot(target);
        },
      );
    }
    await test.step('Informational Model follows the App while an owned editor keeps focus', async () => {
      const editor = path.join(run.root, 'editor');
      const editorReport = path.join(run.root, 'state/editor.json');
      execFileSync(
        '/usr/bin/clang',
        [
          '-fobjc-arc',
          '-framework',
          'Cocoa',
          path.resolve('tests/live/playwright/editor.m'),
          '-o',
          editor,
        ],
        { stdio: 'pipe', timeout: 20000 },
      );
      const child = launchEditor(run, editor, editorReport);
      const editorState = () => {
        run.owned.assert(child.pid);
        if (!fs.existsSync(editorReport)) return null;
        return JSON.parse(fs.readFileSync(editorReport, 'utf8'));
      };
      verifyEditor = async () => {
        const previous = editorState();
        await expect
          .poll(() => editorState()?.samples)
          .toBeGreaterThan(previous.samples);
        const state = editorState();
        expect(state.pid).toBe(child.pid);
        expect(state.frontmost).toBe(child.pid);
        expect(state.focused).toBe(true);
        expect(state.focusLosses).toBe(0);
        expect(state.keyEvents).toBe(0);
      };
      await expect
        .poll(() => editorState()?.focused, { timeout: 12000 })
        .toBe(true);
      await waitLabel(key(2, 0), /^Empty key$/);
      await clickArmed(key(1, 0));
      await expect.poll(selected).toBe(codex.target.pane);
      await waitLabel(key(2, 0), /^Model.*Codex/i);
      const before = editorState();
      const presented = deck.snapshot().keys[10];
      await clickArmed(key(2, 0));
      await refresh();
      expect(await selected()).toBe(codex.target.pane);
      expect(deck.snapshot().keys[10].labels).toEqual(presented.labels);
      const after = editorState();
      expect(after.pid).toBe(child.pid);
      expect(after.frontmost).toBe(child.pid);
      expect(after.focused).toBe(true);
      expect(after.focusLosses).toBe(0);
      expect(after.keyEvents).toBe(0);
      expect(after.samples).toBeGreaterThan(before.samples);
      await clickArmed(key(1, 4));
      await expect.poll(selected).toBe(claude.target.pane);
      await waitLabel(key(2, 0), /^Empty key$/);
      await verifyEditor();
    });
    await test.step('Revoking consent restores local navigation', async () => {
      await consent(false);
      await waitLabel(key(1, 0), /Deck only/);
      await clickArmed(key(1, 0));
      await waitLabel(key(1, 4), /waiting.*Deck only/);
      expect(await selected()).toBe(claude.target.pane);
      await verifyEditor();
    });
  } finally {
    observer.dispose();
    await deck.stop();
  }
}

const reason =
  appAuthorization() ||
  (process.env.ASW_LIVE_HERDR_APP_RELEASE !== '1' &&
    'Release live authorization required');
test.skip(!!reason, String(reason));

test('virtual Stream Deck navigates the owned, signed Herdr App', async ({
  page,
}) => {
  const artifactDirectory = process.env.ASW_HERDR_APP_RELEASE_ARTIFACTS;
  if (
    !artifactDirectory ||
    hash(
      readArtifact(
        path.join(artifactDirectory, 'release-candidate.json'),
        65536,
      ),
    ) !== reviewed.candidateReportSha256
  )
    throw Error('The reviewed signed App/Core candidate directory is required');
  const root = fs.mkdtempSync('/private/tmp/dsh-pw-');
  let browserError;
  const report = await runReleaseCalibration(
    { artifactDirectory },
    {
      runRoot: path.join(root, 'session'),
      async navigation(run) {
        const input = new PassThrough();
        const held = holdHardwareRun(run, root, { input, ready: () => {} });
        const work = walkthrough(page, run, root);
        try {
          await Promise.race([
            work,
            held.then(() => {
              throw Error('Owned session ended');
            }),
          ]);
        } catch (error) {
          browserError = error;
          throw error;
        } finally {
          input.write('\n');
          try {
            await held;
          } finally {
            input.destroy();
            await work.catch(() => {});
          }
        }
      },
    },
  );
  if (report.cleanup) fs.rmSync(root, { recursive: true, force: true });
  expect(report.cleanup).toBe(true);
  expect(report.settingsUnchanged).toBe(true);
  if (browserError) throw browserError;
  expect(report.failures, report.failedCheck || report.failureReason).toEqual(
    [],
  );
  expect(report.outcome).toBe('passed');
});
