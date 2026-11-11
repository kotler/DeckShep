'use strict';
const path = require('node:path');
const { execFile } = require('node:child_process');
const { collectRegistration } = require('./registration.cjs');
const { readPrivate } = require('../../../src/agents/codex/hook-files');

async function main() {
  if (process.argv.length !== 3) throw Error('Fixture required');
  const file = process.argv[2],
    directory = path.dirname(file);
  const fixture = readPrivate(file);
  if (fixture.fixtureOnly !== 'deckshep-rex-hook-poc-v1')
    throw Error('Fixture required');
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1048576) throw Error('Fixture payload too large');
    chunks.push(chunk);
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const result = await collectRegistration({
    payload,
    environment: process.env,
    directory,
    setup: path.join(directory, 'setup.json'),
    inspectReporter: async () => fixture.processes[fixture.reporterPid],
    inspect: async (pid) => fixture.processes[pid],
    now: () => 10000,
    executeRex: (args) =>
      new Promise((resolve, reject) => {
        execFile(
          process.execPath,
          [path.join(__dirname, 'rex-cli-fixture.cjs'), file, ...args],
          { env: { HOME: process.env.HOME }, timeout: 3000, maxBuffer: 32768 },
          (error, stdout) =>
            error ? reject(Error('Fixture CLI unavailable')) : resolve(stdout),
        );
      }),
  });
  process.stdout.write(
    JSON.stringify({
      originEvidence: result.originEvidence,
      controlAuthority: result.controlAuthority,
      ended: result.ended,
    }) + '\n',
  );
}
void main().catch(() => {
  process.stderr.write('Fixture hook refused\n');
  process.exitCode = 1;
});
