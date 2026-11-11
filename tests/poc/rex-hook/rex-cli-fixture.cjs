'use strict';
// Subprocess fixture only: never loads or connects to a Rex implementation.
const fs = require('node:fs');
const path = require('node:path');
function main() {
  const [file, ...args] = process.argv.slice(2);
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state.fixtureOnly !== 'deckshep-rex-hook-poc-v1')
    throw Error('Fixture required');
  const session = args[8],
    block = args[10];
  const expected = [
    '--autostart=false',
    '--timeout',
    '2s',
    '--server',
    state.server,
    'block',
    'call',
    '-s',
    session,
    '-b',
    block,
    'process',
  ];
  // No focus, screen or write command exists in this fixture.
  if (
    args.length !== 12 ||
    args.some((value, index) => value !== expected[index])
  )
    throw Error('Process read only');
  const selected = state.panels[args[8] + '|' + args[10]];
  if (!selected) throw Error('Fixture panel unavailable');
  fs.appendFileSync(
    path.join(path.dirname(file), 'reads.jsonl'),
    JSON.stringify({ session: args[8], block: args[10], method: 'process' }) +
      '\n',
    { mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(selected) + '\n');
}
try {
  main();
} catch {
  process.stderr.write('Fixture CLI refused\n');
  process.exitCode = 1;
}
