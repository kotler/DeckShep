const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const TOML = require('@iarna/toml');
const { test, expect } = require('../../../tools/e2e');
const {
  runReleaseCalibration,
} = require('../app-calibration/release-runner.cjs');
const { appAuthorization } = require('../app-calibration/isolation.cjs');
const { hash, readArtifact } = require('../app-calibration/artifacts.cjs');
const { reviewedRelease } = require('../app-calibration/release-stage.cjs');
const {
  requestClient,
  arm,
} = require('../app-calibration/release-scenarios.cjs');
const {
  modelModSource,
  prepareDeliveryMod,
  ModDeliveryRig,
} = require('../herdr-app-model/delivery-rig.cjs');
const {
  readCodexSettings,
} = require('../../../src/agents/codex/keyboard-settings');
const { launchEditor } = require('./editor-launch.cjs');
const reason =
  appAuthorization() ||
  (process.env.ASW_LIVE_HERDR_APP_RELEASE !== '1' &&
    'Release authorization required') ||
  (process.env.ASW_HERDR_APP_MOD_MODEL !== '1' &&
    'Mod delivery prototype requires its explicit flag');
test.skip(!!reason, String(reason));

function surface(view) {
  return {
    prompt: /^\s*› /m.test(view.text),
    model: /Select Model/.test(view.text),
    login: /Sign in|Log in|API key/.test(view.text),
    trust: /trust this|Trust this/i.test(view.text),
    welcome: /Welcome to Codex/.test(view.text),
    error: /Error loading|error:|failed to/i.test(view.text),
    cursor: view.cursor,
  };
}
test('Herdr mod delivers Model to an isolated Codex while an editor stays frontmost', async ({
  page,
}) => {
  test.setTimeout(150000);
  const artifactDirectory = process.env.ASW_HERDR_APP_RELEASE_ARTIFACTS;
  reviewedRelease(artifactDirectory);
  const codexFile = process.env.ASW_HERDR_APP_MOD_CODEX;
  if (!codexFile || !path.isAbsolute(codexFile))
    throw Error('Explicit isolated Codex executable required');
  const source = await modelModSource();
  let evidence,
    failed,
    stage = 'prepare',
    files;
  const report = await runReleaseCalibration(
    { artifactDirectory },
    {
      modelDelivery: true,
      prepareState(root, env) {
        files = prepareDeliveryMod(root, env, source, codexFile);
      },
      additionalExecutables: () => [files.relay, files.codex],
      async navigation(run) {
        const rig = new ModDeliveryRig(run);
        const client = requestClient(run);
        let lastView, streamB, lastResult, originalSetting;
        try {
          stage = 'mod server';
          await rig.start();
          stage = 'create Codex';
          const a = await rig.channel.create('A');
          const b = await rig.channel.create('B');
          stage = 'attach Codex';
          const streamA = await rig.attach(a.terminal);
          streamB = await rig.attach(b.terminal);
          stage = 'ready Codex';
          await expect
            .poll(
              async () => {
                lastView = await streamB.read();
                try {
                  readCodexSettings(lastView);
                  return surface(lastView).prompt &&
                    lastView.cursor?.column === 3
                    ? 'ready'
                    : surface(lastView);
                } catch {
                  return surface(lastView);
                }
              },
              { timeout: 15000 },
            )
            .toBe('ready');
          async function inspect() {
            const id = rig.begin(await rig.capture());
            await rig.channel.command('inspect');
            lastResult = await rig.result(id);
            expect(lastResult.kind).toBe('confirmed');
            return lastResult.state;
          }
          stage = 'inspect initial setting';
          const originalB = await inspect();
          originalSetting = originalB;
          expect(originalB.effort).toBe('high');
          const defaults = () => {
            const config = TOML.parse(
              fs.readFileSync(
                path.join(run.env.CODEX_HOME, 'config.toml'),
                'utf8',
              ),
            );
            return {
              model: config.model,
              effort: config.model_reasoning_effort,
              provider: config.model_provider,
            };
          };
          const originalDefaults = defaults();
          const readyConfigHash = hash(
            fs.readFileSync(path.join(run.env.CODEX_HOME, 'config.toml')),
          );
          stage = 'background editor';
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
            return fs.existsSync(editorReport)
              ? JSON.parse(fs.readFileSync(editorReport, 'utf8'))
              : null;
          };
          await expect.poll(() => editorState()?.focused).toBe(true);
          // A test-only Model key dispatches through the real mod command. The
          // installed production controller remains informational and unchanged.
          let capture, nonce, result;
          await page.exposeBinding('modelKeyDown', async () => {
            nonce = rig.begin(capture, Date.now());
            await rig.channel.command();
            result = await rig.result(nonce);
            lastResult = result;
            return result.kind;
          });
          await page.setContent(
            '<button data-testid="prototype-model">Model</button>',
          );
          stage = 'mod Model positive';
          capture = await rig.capture();
          await new Promise((resolve) => setTimeout(resolve, 400));
          await page.getByTestId('prototype-model').evaluate((button) => {
            button.addEventListener('pointerdown', () => {
              globalThis.modelResult = globalThis.modelKeyDown();
            });
          });
          await page.getByTestId('prototype-model').click();
          await page.evaluate(() => globalThis.modelResult);
          expect(result).toMatchObject({ kind: 'confirmed' });
          const modelNonce = nonce;
          stage = 'inspect changed setting';
          const changed = await inspect();
          stage = 'verify changed model';
          expect(changed.model).not.toBe(originalB.model);
          stage = 'verify preserved effort';
          expect(changed.effort).toBe(originalB.effort);
          stage = 'verify other chat';
          expect(rig.effects.filter((e) => e.terminal === a.terminal)).toEqual(
            [],
          );
          readCodexSettings(await streamA.read());
          stage = 'verify defaults';
          expect(defaults()).toEqual(originalDefaults);
          const configBytesUnchanged =
            hash(
              fs.readFileSync(path.join(run.env.CODEX_HOME, 'config.toml')),
            ) === readyConfigHash;
          const editorAfter = editorState();
          stage = 'verify background focus';
          expect(editorAfter.frontmost).toBe(child.pid);
          expect(editorAfter.keyEvents).toBe(0);
          expect(editorAfter.focusLosses).toBe(0);
          const positive = {
            model: changed.model,
            effort: changed.effort,
            writes: result.writes,
            lastWriteMs: Math.max(
              ...rig.effects
                .filter((e) => e.nonce === modelNonce)
                .map((e) => e.elapsedMs),
            ),
          };
          stage = 'expiry refusal';
          nonce = rig.begin(await rig.capture(), Date.now() - 2100);
          await rig.channel.command();
          const expired = await rig.result(nonce);
          expect(expired).toMatchObject({
            kind: 'refused',
            reason: 'expired',
            writes: 0,
          });
          stage = 'focus refusal';
          const stale = await rig.capture();
          const selection = await client.sender.observe(run.signal);
          const paneA = selection.panes.find(
            (p) => p.target.terminal === a.terminal,
          );
          expect(paneA).toBeTruthy();
          await client.sender.deliver(
            { kind: 'requestFocus' },
            await arm(client, paneA),
            run.signal,
          );
          await expect
            .poll(async () => (await rig.capture()).focused.terminal)
            .toBe(a.terminal);
          nonce = rig.begin(stale);
          await rig.channel.command();
          const moved = await rig.result(nonce);
          expect(moved).toMatchObject({
            kind: 'refused',
            reason: 'target changed',
            writes: 0,
          });
          stage = 'retirement refusal';
          nonce = rig.begin(await rig.capture());
          rig.retire(nonce);
          await rig.channel.command();
          const retired = await rig.result(nonce);
          expect(retired).toMatchObject({
            kind: 'refused',
            reason: 'retired',
            writes: 0,
          });
          async function select(address) {
            const view = await client.sender.observe(run.signal);
            const pane = view.panes.find((p) => p.target.terminal === address);
            expect(pane).toBeTruthy();
            await client.sender.deliver(
              { kind: 'requestFocus' },
              await arm(client, pane),
              run.signal,
            );
            await expect
              .poll(async () => (await rig.capture()).focused.terminal)
              .toBe(address);
          }
          async function held(change, afterWrites = 0) {
            let arrived, release, timer;
            const entered = new Promise((resolve) => {
              arrived = resolve;
            });
            const resume = new Promise((resolve) => {
              release = resolve;
            });
            rig.hold = async (_message, operation) => {
              if (operation.writes !== afterWrites) return;
              rig.hold = null;
              arrived();
              await resume;
            };
            const id = rig.begin(await rig.capture());
            try {
              await rig.channel.command();
              await Promise.race([
                entered,
                new Promise((_, reject) => {
                  timer = setTimeout(
                    () => reject(Error('Prototype hold unavailable')),
                    2500,
                  );
                }),
              ]);
              clearTimeout(timer);
              await change(id);
              release();
              return await rig.result(id);
            } finally {
              clearTimeout(timer);
              release();
              rig.hold = null;
            }
          }
          stage = 'held retirement refusal';
          const heldRetired = await held(async (id) => rig.retire(id));
          expect(heldRetired).toMatchObject({
            kind: 'refused',
            reason: 'retired',
            writes: 0,
          });
          stage = 'held focus refusal';
          const heldFocus = await held(async () => select(b.terminal));
          expect(heldFocus).toMatchObject({
            kind: 'refused',
            reason: 'target changed',
            writes: 0,
          });
          stage = 'held focus ABA refusal';
          const heldABA = await held(async () => {
            await select(a.terminal);
            await select(b.terminal);
          });
          expect(heldABA).toMatchObject({
            kind: 'refused',
            reason: 'target changed',
            writes: 0,
          });
          stage = 'held expiry refusal';
          const heldExpired = await held(async (id) => {
            const deadline = rig.operations.get(id).request.pressedAt + 2050;
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(0, deadline - Date.now())),
            );
          });
          expect(heldExpired).toMatchObject({
            kind: 'refused',
            reason: 'expired',
            writes: 0,
          });
          stage = 'partial native operation';
          const partial = await held(async () => select(a.terminal), 2);
          expect(partial).toMatchObject({ kind: 'uncertain', writes: 2 });
          await new Promise((resolve) => setTimeout(resolve, 200));
          expect(readCodexSettings(await streamB.read()).model).toBe(
            changed.model,
          );
          expect(
            rig.effects.filter((e) => e.nonce === partial.nonce),
          ).toHaveLength(2);
          expect(defaults()).toEqual(originalDefaults);
          expect(editorState().focusLosses).toBe(0);
          evidence = {
            schema: 1,
            appModExecuted: true,
            realCodexMutation: true,
            authenticated: false,
            background: true,
            editorInputEvents: editorState().keyEvents,
            positive,
            expired,
            moved,
            retired,
            heldRetired,
            heldFocus,
            heldABA,
            heldExpired,
            partial,
            defaultsUnchanged: true,
            configBytesUnchanged,
            otherChatUnchanged: true,
            cliSha256: files.cliHash,
            cliVersion: files.cliVersion,
            relaySha256: files.relayHash,
            modSha256: files.modHash,
            route: 'mod + local relay + Core attach DATA',
            productionQualified: false,
          };
        } catch (error) {
          if (streamB) lastView = await streamB.finalView();
          failed = Error(
            'Model prototype failed at ' +
              stage +
              (lastView
                ? '; surface ' + JSON.stringify(surface(lastView))
                : '') +
              '; ending ' +
              JSON.stringify(streamB?.ending) +
              '; result ' +
              JSON.stringify(
                lastResult && {
                  kind: lastResult.kind,
                  reason: lastResult.reason,
                  steps: lastResult.steps,
                  writes: lastResult.writes,
                  state: lastResult.state,
                },
              ) +
              '; original ' +
              JSON.stringify(originalSetting) +
              '; ' +
              error.name,
          );
          throw Error('Model prototype failed');
        } finally {
          client.sender.dispose();
          await rig.close();
        }
      },
    },
  );
  expect(report.cleanup, report.failures.join(',')).toBe(true);
  if (failed) throw failed;
  expect(report.outcome, report.failures.join(',')).toBe('passed');
  expect(report.settingsUnchanged).toBe(true);
  const file = test.info().outputPath('herdr-mod-model-delivery.json');
  // Request nonces are private transport data, not retained evidence.
  for (const key of [
    'expired',
    'moved',
    'retired',
    'heldRetired',
    'heldFocus',
    'heldABA',
    'heldExpired',
    'partial',
  ])
    delete evidence[key].nonce;
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...evidence,
        cleanup: report.cleanup,
        settingsUnchanged: report.settingsUnchanged,
        builds: report.builds,
        outcome: report.outcome,
      },
      null,
      2,
    ),
  );
  await test.info().attach('herdr-mod-model-delivery', {
    path: file,
    contentType: 'application/json',
  });
});
