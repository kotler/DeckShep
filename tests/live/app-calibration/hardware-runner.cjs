const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { runCalibration } = require('./harness.cjs');

async function holdHardwareRun(
  run,
  root,
  { input = process.stdin, ready = (message) => console.log(message) } = {},
) {
  const nonce = randomBytes(24).toString('hex');
  const lease = path.join(root, 'lease.json'),
    heartbeat = path.join(root, 'heartbeat.json');
  fs.writeFileSync(
    lease,
    JSON.stringify({
      schema: 1,
      nonce,
      app: JSON.parse(run.gate.peers.get('app')),
    }),
    { flag: 'wx', mode: 0o600 },
  );
  const refresh = () => {
    run.gate.checkBoth();
    fs.writeFileSync(
      heartbeat + '.new',
      JSON.stringify({ nonce, at: Date.now() }),
      { mode: 0o600 },
    );
    fs.renameSync(heartbeat + '.new', heartbeat);
  };
  try {
    refresh();
    ready(
      'Test App ready. Select Herdr App. Enable plain focus requests in its setup. Press Enter here to stop.',
    );
    await new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        try {
          refresh();
        } catch {
          finish(Error('Hardware ownership lost'));
        }
      }, 250);
      const limit = setTimeout(() => finish(), 10 * 60 * 1000);
      function finish(error) {
        clearInterval(timer);
        clearTimeout(limit);
        input.removeListener('data', entered);
        run.signal.removeEventListener('abort', entered);
        input.pause();
        if (error) reject(error);
        else resolve();
      }
      const entered = () => finish();
      input.once('data', entered);
      input.resume();
      run.signal.addEventListener('abort', entered, { once: true });
      if (run.signal.aborted) finish();
    });
  } finally {
    fs.rmSync(lease, { force: true });
    fs.rmSync(heartbeat, { force: true });
  }
}

// This bundled CLI is never imported by normal builds. No live authorization
// flags are set here; the runner refuses until the owner supplies all three.
function runHardware(root) {
  runCalibration(
    { artifactDirectory: path.join(root, 'artifacts') },
    {
      runRoot: path.join(root, 'session'),
      hold: (run) => holdHardwareRun(run, root),
    },
  )
    .then((report) => {
      console.log(JSON.stringify(report));
      process.exitCode = report.outcome === 'passed' ? 0 : 1;
    })
    .catch(() => {
      console.error('Hardware run failed');
      process.exitCode = 1;
    });
}
module.exports = { holdHardwareRun, runHardware };
