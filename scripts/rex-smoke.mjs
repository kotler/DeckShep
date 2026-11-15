import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { authorization } from '../tests/live/safety.cjs';
import { checked } from './process.mjs';

export function rexSmoke(env = process.env, run = checked) {
  const reason = authorization('rex', env);
  if (reason) throw Error(reason);
  const safe = { ...env, ASW_LIVE_AUTH: 'offline' };
  for (const name of [
    'PROVIDERS',
    'STATES',
    'BROWSER',
    'CASES',
    'CLAUDE_HOOKS',
    'CODEX_HOOKS',
  ])
    safe['ASW_LIVE_REX_' + name] = '0';
  run(
    process.execPath,
    ['--import', 'tsx', '--test', 'tests/live/rex.test.js'],
    {
      cwd: path.resolve(fileURLToPath(new URL('..', import.meta.url))),
      env: safe,
      message: 'Isolated Rex smoke test failed',
    },
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw Error('Rex smoke takes no arguments');
    rexSmoke();
  } catch {
    console.error(
      'Rex smoke refused or failed; current live authorization and owned-instance checks are required',
    );
    process.exitCode = 1;
  }
}
