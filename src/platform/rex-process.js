// @ts-check
/** @typedef {import("../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../domain/types").Config} Config */
/** @typedef {import("../domain/types").PressContext} PressContext */
'use strict';
// Rex can omit path for a still-running binary removed/replaced by an upgrade.
// Resolve only the exact foreground PID; never infer an agent from ancestors.
const { execFile } = require('node:child_process'),
  path = require('node:path');
const run =
  /** @param {string} file
   * @param {string[]} args */
  (file, args) =>
    new Promise((resolve, reject) =>
      execFile(
        file,
        args,
        {
          timeout: 1800,
          maxBuffer: 32768,
          env: { ...process.env, LC_ALL: 'C' },
        },
        (error, out) => (error ? reject(error) : resolve(out)),
      ),
    );
/** @param {string} out */
function processState(out) {
  const m =
    /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/.exec(
      out || '',
    );
  if (
    !m ||
    Number(m[1]) !== /** @type {() => number} */ (process.getuid)() ||
    path.basename(m[3]) !== 'codex'
  )
    throw Error('Codex process identity unavailable');
  return [m[1], m[2].replace(/\s+/g, ' '), m[3]].join('|');
}
/** @param {number} pid
 * @param {any} [execute] */
async function executable(pid, execute = run) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw Error('Invalid foreground PID');
  const args = ['-p', String(pid), '-o', 'uid=,lstart=,comm='],
    before = processState(await execute('/bin/ps', args));
  const out = await execute('/usr/sbin/lsof', [
    '-n',
    '-a',
    '-p',
    String(pid),
    '-d',
    'txt',
    '-Ffn',
  ]);
  const lines = out.trim().split('\n');
  if (
    lines[0] !== 'p' + pid ||
    lines[1] !== 'ftxt' ||
    !lines[2]?.startsWith('n')
  )
    throw Error('Codex executable unavailable');
  const file = lines[2].slice(1);
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
/** @param {any} f */
function candidate(f) {
  return (
    f &&
    !f.path &&
    f.name === 'codex' &&
    f.user_id === /** @type {() => number} */ (process.getuid)() &&
    Number.isSafeInteger(f.pid) &&
    f.pid > 0 &&
    typeof f.cwd === 'string' &&
    path.isAbsolute(f.cwd)
  );
}
/** @param {any} a
 * @param {any} b */
function sameForeground(a, b) {
  return (
    !!b &&
    ['pid', 'user_id', 'name', 'cwd', 'argv0'].every((k) => a[k] === b[k]) &&
    (!b.path || path.basename(b.path) === 'codex')
  );
}
module.exports = { executable, candidate, sameForeground };
