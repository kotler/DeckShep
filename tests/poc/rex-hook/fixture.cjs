'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { digest } = require('../../../src/agents/codex/hook-contract');
const {
  readPrivate,
  writePrivate,
} = require('../../../src/agents/codex/hook-files');
const session = 'session:01a1ae31-d050-7503-afec-fd2b40d2bc27';
const blockA = 'block:01a1ae31-d050-7503-afec-fd2b40d2bc28';
const blockB = 'block:01a1ae31-d050-7503-afec-fd2b40d2bc29';
const threadA = '01a1ae31-d050-7503-afec-fd2b40d2bc26';
const threadB = '01a1ae31-d050-7503-afec-fd2b40d2bc30';
const pidA = 42001,
  pidB = 42002,
  daemonPid = 43000;
function fact(pid) {
  return {
    pid,
    startedAt: '1794000000.123456',
    image: digest('/fixture/codex'),
    codex: true,
  };
}
function payload(threadId = threadA, event = 'SessionStart') {
  return {
    session_id: threadId,
    hook_event_name: event,
    cwd: '/fixture/project',
    prompt: 'PRIVATE_POC_PROMPT',
    transcript_path: '/fixture/private/transcript',
  };
}
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-rex-hook-poc-'));
  fs.chmodSync(directory, 0o700);
  const home = path.join(directory, 'home');
  fs.mkdirSync(home, { mode: 0o700 });
  const file = path.join(directory, 'fixture.json'),
    setup = path.join(directory, 'setup.json');
  const saved = {
    schema: 1,
    active: true,
    epoch: randomUUID(),
    command: 'fixture-hook',
    hooksFile: '/fixture/hooks.json',
  };
  const panel = (pid) => ({
    generation: 1,
    foreground: {
      pid,
      user_id: process.getuid(),
      name: 'codex',
      cwd: '/fixture/project',
    },
  });
  const data = {
    fixtureOnly: 'deckshep-rex-hook-poc-v1',
    server: 'unix:///fixture/rex-poc.sock',
    activeBlock: blockB,
    reporterPid: pidA,
    panels: {
      [session + '|' + blockA]: panel(pidA),
      [session + '|' + blockB]: panel(pidB),
    },
    processes: {
      [pidA]: fact(pidA),
      [pidB]: fact(pidB),
      [daemonPid]: fact(daemonPid),
    },
  };
  writePrivate(file, data);
  writePrivate(setup, saved);
  const environment = {
    REX_SESSION: session,
    REX_BLOCK: blockA,
    REX_SERVER: data.server,
  };
  function executeRex(args) {
    return new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(__dirname, 'rex-cli-fixture.cjs'), file, ...args],
        { cwd: home, env: { HOME: home }, timeout: 3000, maxBuffer: 32768 },
        (error, stdout) =>
          error ? reject(Error('Fixture CLI unavailable')) : resolve(stdout),
      );
    });
  }
  function runHook(input = payload(), context = environment, reporter = pidA) {
    data.reporterPid = reporter;
    writePrivate(file, data);
    return new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [
          '--import',
          pathToFileURL(require.resolve('tsx')).href,
          path.join(__dirname, 'hook-entry.cjs'),
          file,
        ],
        {
          cwd: home,
          env: {
            HOME: home,
            CODEX_HOME: path.join(home, '.codex'),
            XDG_CONFIG_HOME: path.join(home, '.config'),
            ...context,
          },
          timeout: 8000,
          maxBuffer: 32768,
        },
        (error, stdout) =>
          error
            ? reject(Error('Fixture hook unavailable'))
            : resolve(JSON.parse(stdout)),
      );
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(input));
    });
  }
  const ports = {
    payload: payload(),
    environment,
    setup,
    directory,
    inspectReporter: async () => data.processes[data.reporterPid],
    inspect: async (pid) => data.processes[pid],
    executeRex,
    now: () => 10000,
  };
  return {
    directory,
    home,
    file,
    setup,
    saved,
    data,
    environment,
    ports,
    runHook,
    record: (threadId) =>
      readPrivate(path.join(directory, `candidate-${threadId}.json`)),
    records: () =>
      fs.readdirSync(directory).filter((name) => name.startsWith('candidate-')),
    reads: () => {
      const trace = path.join(directory, 'reads.jsonl');
      return fs.existsSync(trace)
        ? fs
            .readFileSync(trace, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map(JSON.parse)
        : [];
    },
    write: () => writePrivate(file, data),
    close: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}
module.exports = {
  fixture,
  payload,
  fact,
  session,
  blockA,
  blockB,
  threadA,
  threadB,
  pidA,
  pidB,
  daemonPid,
};
