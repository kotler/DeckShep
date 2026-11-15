const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { test, expect } = require('../../../tools/e2e');
const { ModTerminalStream } = require('../../helpers/herdr-app-mod-stream');
const { BindingProbeChannel } = require('../herdr-app-model/binding-probe.cjs');
const {
  runReleaseCalibration,
} = require('../app-calibration/release-runner.cjs');
const { appAuthorization } = require('../app-calibration/isolation.cjs');
const { hash, readArtifact } = require('../app-calibration/artifacts.cjs');
const { reviewedRelease } = require('../app-calibration/release-stage.cjs');

const reason =
  appAuthorization() ||
  (process.env.ASW_LIVE_HERDR_APP_RELEASE !== '1' &&
    'Release authorization required') ||
  (process.env.ASW_HERDR_APP_INPUT_GATE !== '1' &&
    'Core input-gate experiment requires its explicit flag');
test.skip(!!reason, String(reason));

class InputGateChannel extends BindingProbeChannel {
  recorderRequest() {
    return {
      do: 'space.new',
      args: {
        name: 'Input gate recorder',
        folder: this.gate.root,
        machine: '',
        argv: [this.gate.env.DSH_TEST_INPUT_RECORDER],
      },
    };
  }
  validateRequests(kind, payloads) {
    if (kind === 'app' && isDeepStrictEqual(payloads, [this.recorderRequest()]))
      return;
    super.validateRequests(kind, payloads);
  }
  async createRecorder() {
    return (
      await this.exchange('app', [this.recorderRequest()], ['spaceCreated'])
    )[0];
  }
}

test('Core holds accepted viewer DATA beyond expiry and viewer close', async () => {
  test.setTimeout(120000);
  const artifactDirectory = process.env.ASW_HERDR_APP_RELEASE_ARTIFACTS;
  reviewedRelease(artifactDirectory);
  let recorder, logFile, evidence;
  const report = await runReleaseCalibration(
    { artifactDirectory },
    {
      inputGateProbe: true,
      prepareState(root, env) {
        recorder = path.join(root, 'state/input-recorder');
        logFile = path.join(root, 'state/input-receipts.jsonl');
        execFileSync(
          '/usr/bin/clang',
          [
            '-O2',
            '-Wall',
            '-Werror',
            path.resolve('tests/live/herdr-app-model/input-recorder.c'),
            '-o',
            recorder,
          ],
          { stdio: 'pipe', timeout: 20000 },
        );
        env.DSH_TEST_INPUT_RECORDER = recorder;
        env.DSH_TEST_INPUT_LOG = logFile;
      },
      additionalExecutables: () => [recorder],
      async navigation(run) {
        const channel = new InputGateChannel(run.gate);
        const created = await channel.createRecorder();
        const { hello, terminal } = await channel.coreTerminal(
          created.terminal,
        );
        run.gate.captureDescendants();
        run.owned.assert(terminal.foreground?.pid ?? terminal.pid);
        function receipts() {
          run.gate.checkBoth();
          if (!fs.existsSync(logFile)) return [];
          const fd = fs.openSync(
            logFile,
            fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
          );
          try {
            const stat = fs.fstatSync(fd);
            if (
              !stat.isFile() ||
              stat.uid !== process.getuid() ||
              stat.mode & 0o077 ||
              stat.size > 65536
            )
              throw Error('Owned receipt file refused');
            // Only complete append records are observations.
            const text = fs.readFileSync(fd, 'utf8');
            return text
              .slice(0, text.lastIndexOf('\n'))
              .split('\n')
              .filter(Boolean)
              .map((line) => JSON.parse(line));
          } finally {
            fs.closeSync(fd);
          }
        }
        await expect.poll(() => receipts()[0]?.ready).toBe(true);
        const streams = new Set();
        async function attach() {
          const stream = new ModTerminalStream(80, 24);
          streams.add(stream);
          await stream.connect(
            run.gate.files.core,
            created.terminal,
            hello.core.id,
            async (socket) => {
              await run.gate.peer('core', socket, run.signal);
            },
          );
          return stream;
        }
        const outcomes = [];
        try {
          const competitor = await attach();
          for (const mode of ['valid', 'expired', 'closed', 'partial']) {
            const writer = await attach();
            const offset = receipts().length;
            const received = () => receipts().slice(offset);
            if (mode === 'partial') {
              writer.write(Buffer.from('e'));
              await writer.probeInputBarrier();
              await expect
                .poll(() => received().filter((r) => r.byte === 101).length)
                .toBe(1);
            }
            const pauses = mode === 'valid' ? 30 : 120;
            // A separate connection owns the competitor so closing the writer
            // cannot cancel or otherwise change the controlled busy interval.
            const busy = competitor.probeKeySequence(pauses);
            // Attach rejection handling immediately even if a later assertion fails.
            busy.catch(() => {});
            await expect
              .poll(() => received().filter((r) => r.byte === 97).length)
              .toBe(1);
            const pressedAt = Date.now();
            writer.write(Buffer.from('d'));
            await writer.probeInputBarrier();
            const acceptedAtMs = Date.now() - pressedAt;
            expect(received().filter((r) => r.byte === 100)).toEqual([]);
            expect(received().filter((r) => r.byte === 99)).toEqual([]);
            let retiredAtMs = null;
            if (mode === 'closed') {
              retiredAtMs = Date.now() - pressedAt;
              writer.close();
            }
            if (mode !== 'valid') {
              await new Promise((resolve) =>
                setTimeout(resolve, Math.max(0, pressedAt + 2100 - Date.now())),
              );
              expect(received().filter((r) => r.byte === 100)).toEqual([]);
            }
            await busy;
            await expect
              .poll(() => received().filter((r) => r.byte === 100).length)
              .toBe(1);
            // The final competitor byte proves all its steps reached the
            // recipient. The RPC reply proves Core has released its held buffer.
            const records = received();
            expect(records.filter((r) => r.byte === 98)).toHaveLength(pauses);
            expect(records.filter((r) => r.byte === 99)).toHaveLength(1);
            const deliveredAtMs =
              records.find((r) => r.byte === 100).ms - pressedAt;
            if (mode === 'valid') expect(deliveredAtMs).toBeLessThan(2000);
            else expect(deliveredAtMs).toBeGreaterThanOrEqual(2000);
            outcomes.push({
              mode,
              acceptedAtMs,
              retiredAtMs,
              deliveredAtMs,
              competitorBytes: pauses + 2,
              viewerBytes: records.filter((r) => r.byte === 100).length,
              priorViewerBytes: records.filter((r) => r.byte === 101).length,
            });
            writer.close();
          }
          // The ordinary key RPC is an alternative to viewer DATA, but Core
          // retains the queued request after its client connection disappears.
          const keyWriter = await attach();
          const keyOffset = receipts().length;
          const keyReceipts = () => receipts().slice(keyOffset);
          const keyBusy = competitor.probeKeySequence(120);
          keyBusy.catch(() => {});
          await expect
            .poll(() => keyReceipts().filter((r) => r.byte === 97).length)
            .toBe(1);
          const keyPressedAt = Date.now();
          const pendingKey = keyWriter.probeQueuedKey();
          pendingKey.catch(() => {});
          await keyWriter.probeInputBarrier();
          expect(keyReceipts().filter((r) => r.byte === 102)).toEqual([]);
          keyWriter.close();
          const keyClosedAtMs = Date.now() - keyPressedAt;
          await expect(pendingKey).rejects.toThrow('stream ended');
          await keyBusy;
          await expect
            .poll(() => keyReceipts().filter((r) => r.byte === 102).length)
            .toBe(1);
          const keyDeliveredAtMs =
            keyReceipts().find((r) => r.byte === 102).ms - keyPressedAt;
          expect(keyDeliveredAtMs).toBeGreaterThanOrEqual(2000);
          evidence = {
            outcomes,
            queuedKeyAfterClose: {
              closedAtMs: keyClosedAtMs,
              deliveredAtMs: keyDeliveredAtMs,
              receivedBytes: 1,
            },
            recipient: 'test-owned raw input recorder',
            acceptance: 'same-connection terminal.get fence after viewer DATA',
            drain: 'terminal.keys reply and final recipient marker',
            rawDataMeetsPressDeadline: false,
            viewerCloseCancelsHeldInput: false,
            recorderSha256: hash(readArtifact(recorder)),
          };
        } finally {
          for (const stream of streams) stream.close();
          run.gate.captureDescendants();
        }
      },
    },
  );
  expect(report.cleanup, report.failures.join(',')).toBe(true);
  expect(report.outcome, report.failures.join(',')).toBe('passed');
  expect(report.settingsUnchanged).toBe(true);
  const file = test.info().outputPath('herdr-core-input-gate.json');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        schema: 1,
        ...evidence,
        cleanup: report.cleanup,
        settingsUnchanged: report.settingsUnchanged,
        builds: report.builds,
      },
      null,
      2,
    ),
  );
  await test.info().attach('herdr-core-input-gate', {
    path: file,
    contentType: 'application/json',
  });
});
