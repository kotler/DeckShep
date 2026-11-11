import path from 'node:path';
import { exec } from './exec';
import { parseOwnedProcess } from './process';
import type { OwnedProcess } from './process';

/** Rex's report of the process in the foreground of one pane. */
export interface ForegroundProcess {
  pid: number;
  user_id: number;
  name: string;
  cwd: string;
  argv0?: string;
  path?: string;
}
type Execute = (file: string, args: string[]) => Promise<string>;
const run: Execute = (file: string, args: string[]) =>
  exec(file, args, { env: { LC_ALL: 'C' } });
function processState(out: string) {
  const value: OwnedProcess = parseOwnedProcess(
    out,
    false,
    'Codex process identity unavailable',
  );
  if (path.basename(value.executable) !== 'codex')
    throw Error('Codex process identity unavailable');
  return [value.ownerText, value.startedAt, value.executable].join('|');
}
export async function executable(pid: number, execute: Execute = run) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw Error('Invalid foreground PID');
  const args: string[] = ['-p', String(pid), '-o', 'uid=,lstart=,comm='],
    before: string = processState(await execute('/bin/ps', args));
  const out: string = await execute('/usr/sbin/lsof', [
    '-n',
    '-a',
    '-p',
    String(pid),
    '-d',
    'txt',
    '-Ffn',
  ]);
  const lines: string[] = out.trim().split('\n');
  if (
    lines[0] !== 'p' + pid ||
    lines[1] !== 'ftxt' ||
    !lines[2]?.startsWith('n')
  )
    throw Error('Codex executable unavailable');
  const file: string = lines[2].slice(1);
  if (
    !path.isAbsolute(file) ||
    path.basename(file) !== 'codex' ||
    /[\x00-\x1f\x7f]/.test(file)
  )
    throw Error('Codex executable unavailable');
  if (processState(await execute('/bin/ps', args)) !== before)
    throw Error('Codex process replaced');
  return file;
}
export function candidate(f: ForegroundProcess | null | undefined) {
  return (
    f &&
    !f.path &&
    f.name === 'codex' &&
    f.user_id === (process.getuid as () => number)() &&
    Number.isSafeInteger(f.pid) &&
    f.pid > 0 &&
    typeof f.cwd === 'string' &&
    path.isAbsolute(f.cwd)
  );
}
export function sameForeground(
  a: ForegroundProcess,
  b: ForegroundProcess | null | undefined,
) {
  return (
    !!b &&
    (['pid', 'user_id', 'name', 'cwd', 'argv0'] as const).every(
      (k) => a[k] === b[k],
    ) &&
    (!b.path || path.basename(b.path) === 'codex')
  );
}
