type AgentSnapshot = import("../domain/types").AgentSnapshot;
type Config = import("../domain/types").Config;
type PressContext = import("../domain/types").PressContext;
'use strict';
const path = require('node:path');
const { exec } = require('./exec.ts');
const { parseOwnedProcess } = require('./process.ts');
const run: (file: string, args: string[]) => Promise<string> = (file: string, args: string[]) => exec(file, args, { env: { LC_ALL: 'C' } });
function processState(out: string) {
    const value: import("./process.ts").OwnedProcess = parseOwnedProcess(out, false, 'Codex process identity unavailable');
    if (path.basename(value.executable) !== 'codex')
        throw Error('Codex process identity unavailable');
    return [value.ownerText, value.startedAt, value.executable].join('|');
}
async function executable(pid: number, execute: any = run) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        throw Error('Invalid foreground PID');
    const args: string[] = ['-p', String(pid), '-o', 'uid=,lstart=,comm='], before: string = processState(await execute('/bin/ps', args));
    const out: any = await execute('/usr/sbin/lsof', [
        '-n',
        '-a',
        '-p',
        String(pid),
        '-d',
        'txt',
        '-Ffn',
    ]);
    const lines: any = out.trim().split('\n');
    if (lines[0] !== 'p' + pid ||
        lines[1] !== 'ftxt' ||
        !lines[2]?.startsWith('n'))
        throw Error('Codex executable unavailable');
    const file: any = lines[2].slice(1);
    if (!path.isAbsolute(file) ||
        path.basename(file) !== 'codex' ||
        /[\x00-\x1f\x7f]/.test(file))
        throw Error('Codex executable unavailable');
    if (processState(await execute('/bin/ps', args)) !== before)
        throw Error('Codex process replaced');
    return file;
}
function candidate(f: any) {
    return (f &&
        !f.path &&
        f.name === 'codex' &&
        f.user_id === ((process.getuid) as () => number)() &&
        Number.isSafeInteger(f.pid) &&
        f.pid > 0 &&
        typeof f.cwd === 'string' &&
        path.isAbsolute(f.cwd));
}
function sameForeground(a: any, b: any) {
    return (!!b &&
        ['pid', 'user_id', 'name', 'cwd', 'argv0'].every((k: string) => a[k] === b[k]) &&
        (!b.path || path.basename(b.path) === 'codex'));
}
module.exports = { executable, candidate, sameForeground };

export {};
