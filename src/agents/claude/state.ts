type AgentSnapshot = import("../../domain/types").AgentSnapshot;
type Config = import("../../domain/types").Config;
type PressContext = import("../../domain/types").PressContext;
'use strict';
const { pluginDirectory } = require("../../platform/paths.ts");
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { exec } = require('../../platform/exec.ts');
const { parseOwnedProcess } = require('../../platform/process.ts');
const directory: () => string = () => path.join(pluginDirectory, 'state', 'claude');
const hash: (value: any) => string = (value: any) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text: (s: any, max?: number) => boolean = (s: any, max: number | undefined = 200) => typeof s === 'string' &&
    s.length > 0 &&
    s.length <= max &&
    !/[\x00-\x1f\x7f-\x9f]/.test(s);
const session: (s: any) => boolean = (s: any) => text(s, 128) && /^[a-zA-Z0-9_-]+$/.test(s);
const modes: Set<string> = new Set([
    'default',
    'acceptEdits',
    'plan',
    'bypassPermissions',
    'auto',
    'dontAsk',
]);
function nativeVersion(file: string) {
    const resolved: string = fs.realpathSync(file);
    return /\/claude\/versions\/(\d+\.\d+\.\d+)$/.exec(resolved)?.[1] || null;
}
const processRead: (file: string, args: string[]) => Promise<string> = (file: string, args: string[]) => exec(file, args, { env: { LC_ALL: 'C' } });
function parseProcess(out: string, pid: number) {
    const value: import("../../platform/process.ts").OwnedProcess = parseOwnedProcess(out, true, 'Claude process owner unavailable');
    return { pid, ppid: value.parent, startedAt: value.startedAt, executable: value.executable, version: ((null) as string | null) };
}
async function processInfo(pid: number, execute: any = processRead) {
    if (!Number.isSafeInteger(pid) || pid <= 0)
        throw Error('Claude process unavailable');
    const args: string[] = ['-p', String(pid), '-o', 'uid=,ppid=,lstart=,comm='], before: any = await execute('/bin/ps', args), p: {
        pid: number;
        ppid: number | undefined;
        startedAt: string;
        executable: string;
        version: string | null;
    } = parseProcess(before, pid), name: string = path.basename(p.executable);
    if (/^claude(?:-|$)/.test(name) || /^\d+\.\d+\.\d+$/.test(name)) {
        const rows: any = (await execute('/usr/sbin/lsof', [
            '-n',
            '-a',
            '-p',
            String(pid),
            '-d',
            'txt',
            '-Ffn',
        ]))
            .trim()
            .split('\n');
        if (rows[0] !== 'p' + pid ||
            rows[1] !== 'ftxt' ||
            !rows[2]?.startsWith('n') ||
            !path.isAbsolute(rows[2].slice(1)))
            throw Error('Claude executable unavailable');
        const after: {
            pid: number;
            ppid: number | undefined;
            startedAt: string;
            executable: string;
            version: string | null;
        } = parseProcess(await execute('/bin/ps', args), pid);
        if (p.ppid !== after.ppid ||
            p.startedAt !== after.startedAt ||
            p.executable !== after.executable)
            throw Error('Claude process replaced');
        p.executable = rows[2].slice(1);
        try {
            p.version = nativeVersion(p.executable);
        }
        catch { }
    }
    return p;
}
async function ancestor(start: any = process.ppid, inspect: any = processInfo) {
    let pid: any = start;
    for (let i: number = 0; i < 12 && pid > 1; i++) {
        const p: any = await inspect(pid);
        if (p.version)
            return p;
        pid = p.ppid;
    }
    throw Error('No native Claude ancestor');
}
function defaultBindings(dir: string) {
    if (!text(dir, 4096) || !path.isAbsolute(dir))
        return false;
    try {
        fs.lstatSync(path.join(dir, 'keybindings.json'));
        return false;
    }
    catch (error: unknown) {
        return ((error) as Error & {
            code?: string;
        }).code === 'ENOENT';
    }
}
function privateDirectory(dir: string, create: any = false) {
    if (create)
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const s: import("node:fs").Stats = fs.lstatSync(dir);
    if (!s.isDirectory() ||
        s.isSymbolicLink() ||
        s.uid !== ((process.getuid) as () => number)() ||
        s.mode & 0o077)
        throw Error('Unsafe Claude metadata directory');
}
function readRecord(pid: number, dir: string | undefined = directory(), { allowInvalid = false }: Record<string, any> | undefined = {}) {
    privateDirectory(dir);
    if (!allowInvalid && fs.existsSync(path.join(dir, String(pid) + '.invalid')))
        throw Error('Claude lifecycle report was lost; wait for a fresh event');
    const file: string = path.join(dir, String(pid) + '.json'), fd: number = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const s: import("node:fs").Stats = fs.fstatSync(fd);
        if (!s.isFile() ||
            s.nlink !== 1 ||
            s.uid !== ((process.getuid) as () => number)() ||
            s.mode & 0o077 ||
            s.size > 16384)
            throw Error('Unsafe Claude metadata');
        const data: any = JSON.parse(fs.readFileSync(fd, 'utf8')), after: import("node:fs").Stats = fs.fstatSync(fd);
        if (s.mtimeMs !== after.mtimeMs || s.size !== after.size)
            throw Error('Claude metadata changed');
        return data;
    }
    finally {
        fs.closeSync(fd);
    }
}
function validate(record: any, agent: import("../../domain/types").AgentSnapshot, p: any, now: number | undefined = Date.now()) {
    if (record?.schema !== 1 ||
        record.pid !== p.pid ||
        agent.pid !== p.pid ||
        record.startedAt !== p.startedAt ||
        record.version !== p.version ||
        p.version !== '2.1.319' ||
        record.cwd !== agent.cwd ||
        !path.isAbsolute(record.cwd) ||
        !session(record.sessionId) ||
        !text(record.generation, 128) ||
        !text(record.turnId, 128) ||
        !['idle', 'working', 'done', 'blocked', 'unknown'].includes(record.state) ||
        record.ended ||
        !Number.isFinite(record.updatedAt) ||
        now - record.updatedAt > 86400000 ||
        record.updatedAt > now + 1000)
        throw Error('Claude session metadata unavailable or unsupported');
    if (record.state === 'blocked' &&
        (!['question', 'permission'].includes(record.kind) ||
            !text(record.requestId, 128)))
        throw Error('Claude request identity unavailable');
    return record;
}
function reduce(previous: any, data: any, p: any, now: number | undefined = Date.now(), id: any = () => crypto.randomUUID(), statusline: any = false) {
    if (!data ||
        typeof data !== 'object' ||
        data.agent_id ||
        !session(data.session_id) ||
        !text(data.cwd, 4096) ||
        !path.isAbsolute(data.cwd) ||
        p.version !== '2.1.319')
        return null;
    const same: boolean = previous?.pid === p.pid &&
        previous.startedAt === p.startedAt &&
        previous.sessionId === data.session_id;
    if (statusline) {
        if (!same || previous.ended || data.agent)
            return null;
        const model: any = text(data.model?.id) ? data.model.id : null, effort: any = ['low', 'medium', 'high', 'xhigh', 'max'].includes(data.effort?.level)
            ? data.effort.level
            : null;
        return {
            ...previous,
            title: text(data.session_name, 250) ? data.session_name : null,
            promptId: session(data.prompt_id) ? data.prompt_id : null,
            model,
            modelName: text(data.model?.display_name)
                ? data.model.display_name
                : null,
            effort,
            vimMode: ['INSERT', 'NORMAL', 'VISUAL', 'VISUAL LINE'].includes(data.vim?.mode)
                ? data.vim.mode
                : null,
            metadataAt: now,
        };
    }
    const event: any = data.hook_event_name;
    if (![
        'SessionStart',
        'SessionEnd',
        'UserPromptSubmit',
        'Stop',
        'PreToolUse',
        'PostToolUse',
        'PostToolUseFailure',
        'PermissionRequest',
        'Notification',
    ].includes(event))
        return null;
    if (!same && !['SessionStart', 'UserPromptSubmit'].includes(event))
        return null;
    if (previous?.pid === p.pid &&
        previous.startedAt === p.startedAt &&
        previous.eventAt > now)
        return null;
    const r: any = same
        ? { ...previous }
        : {
            schema: 1,
            pid: p.pid,
            startedAt: p.startedAt,
            version: p.version,
            sessionId: data.session_id,
            generation: id(),
            turnId: id(),
            cwd: data.cwd,
            state: 'unknown',
            updatedAt: now,
        };
    if (event === 'SessionStart') {
        r.generation = id();
        r.turnId = id();
        r.state = 'idle';
        r.ended = false;
        r.model = null;
        r.effort = null;
        r.metadataAt = null;
        r.title = text(data.session_title, 250) ? data.session_title : null;
    }
    if (event === 'UserPromptSubmit') {
        r.turnId = id();
        r.promptId = null;
        r.state = 'working';
        r.ended = false;
    }
    if (event === 'SessionEnd') {
        r.state = 'unknown';
        r.ended = true;
    }
    if (event === 'Stop') {
        r.state = 'done';
    }
    if (['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Stop'].includes(event)) {
        r.pendingToolDigest = null;
        r.pendingToolId = null;
    }
    if (event === 'PermissionRequest' ||
        (event === 'PreToolUse' && data.tool_name === 'AskUserQuestion')) {
        const digest: string = hash([data.tool_name, data.tool_input]), toolId: any = text(data.tool_use_id, 128)
            ? data.tool_use_id
            : r.pendingToolDigest === digest
                ? r.pendingToolId
                : null;
        r.pendingToolDigest = digest;
        r.pendingToolId = toolId || null;
        r.state = 'blocked';
        r.kind = data.tool_name === 'AskUserQuestion' ? 'question' : 'permission';
        r.requestId = hash([digest, toolId || null]);
        r.toolId = toolId || null;
    }
    else if (event === 'Notification') {
        if (data.notification_type !== 'permission_prompt')
            return null;
        if (r.state === 'blocked')
            return null;
        r.state = 'blocked';
        r.kind = 'permission';
        r.requestId = hash([event, data.message, now]);
        r.toolId = null;
    }
    else if (['PostToolUse', 'PostToolUseFailure'].includes(event)) {
        if (r.state === 'blocked' && (!r.toolId || r.toolId !== data.tool_use_id))
            return null;
        if (r.pendingToolId === data.tool_use_id) {
            r.pendingToolDigest = null;
            r.pendingToolId = null;
        }
        r.state = 'working';
    }
    else if (event === 'PreToolUse') {
        if (r.state === 'blocked')
            return null;
        r.pendingToolDigest = hash([data.tool_name, data.tool_input]);
        r.pendingToolId = text(data.tool_use_id, 128) ? data.tool_use_id : null;
        r.state = 'working';
    }
    if (r.state !== 'blocked') {
        r.kind = null;
        r.requestId = null;
        r.toolId = null;
    }
    r.cwd = data.cwd;
    r.updatedAt = now;
    r.eventAt = now;
    if (modes.has(data.permission_mode))
        r.permissionMode = data.permission_mode;
    return r;
}
function markInvalid(p: any, dir: string) {
    const file: string = path.join(dir, String(p.pid) + '.invalid'), tmp: string = file + '.' + crypto.randomUUID();
    fs.writeFileSync(tmp, crypto.randomUUID(), { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
}
async function invalidate({ dir = directory(), inspect = processInfo, parent = process.ppid, }: Record<string, any> | undefined = {}) {
    const p: any = await ancestor(parent, inspect);
    privateDirectory(dir, true);
    markInvalid(p, dir);
}
async function record(data: any, { dir = directory(), inspect = processInfo, parent = process.ppid, now = Date.now(), statusline = false, lockTimeoutMs = 1000, }: Record<string, any> | undefined = {}) {
    const p: any = await ancestor(parent, inspect);
    privateDirectory(dir, true);
    const lock: string = path.join(dir, String(p.pid) + '.lock'), invalid: string = path.join(dir, String(p.pid) + '.invalid');
    let fd: any, initialInvalid: any = null;
    try {
        initialInvalid = fs.readFileSync(invalid, 'utf8');
    }
    catch (error: unknown) {
        if (((error) as Error & {
            code?: string;
        }).code !== 'ENOENT')
            throw error;
    }
    const deadline: any = Date.now() + lockTimeoutMs;
    for (;;) {
        try {
            fd = fs.openSync(lock, 'wx', 0o600);
            break;
        }
        catch (error: unknown) {
            if (((error) as Error & {
                code?: string;
            }).code !== 'EEXIST')
                throw error;
            if (statusline || Date.now() >= deadline) {
                if (!statusline)
                    markInvalid(p, dir);
                return null;
            }
            await new Promise((resolve: (value: any) => void) => setTimeout(resolve, 15));
        }
    }
    try {
        let prior: any;
        try {
            prior = readRecord(p.pid, dir, { allowInvalid: true });
        }
        catch (error: unknown) {
            if (((error) as Error & {
                code?: string;
            }).code !== 'ENOENT')
                throw error;
        }
        if (statusline &&
            prior &&
            data &&
            !data.agent_id &&
            !data.agent &&
            session(data.session_id) &&
            prior.sessionId !== data.session_id) {
            markInvalid(p, dir);
            return null;
        }
        const next: any = reduce(prior, data, p, now, undefined, statusline);
        if (!next)
            return null;
        next.configDirectory = path.resolve(process.env.CLAUDE_CONFIG_DIR ||
            path.join(require('node:os').homedir(), '.claude'));
        const current: any = await inspect(p.pid);
        if (current.startedAt !== p.startedAt || current.version !== p.version)
            throw Error('Claude process replaced');
        const file: string = path.join(dir, String(p.pid) + '.json'), tmp: string = file + '.' + crypto.randomUUID() + '.tmp';
        try {
            fs.writeFileSync(tmp, JSON.stringify(next) + '\n', {
                mode: 0o600,
                flag: 'wx',
            });
            fs.renameSync(tmp, file);
        }
        finally {
            try {
                fs.unlinkSync(tmp);
            }
            catch { }
        }
        if (!statusline &&
            ['SessionStart', 'UserPromptSubmit', 'SessionEnd'].includes(data.hook_event_name) &&
            initialInvalid !== null) {
            try {
                if (fs.readFileSync(invalid, 'utf8') === initialInvalid)
                    fs.unlinkSync(invalid);
            }
            catch (error: unknown) {
                if (((error) as Error & {
                    code?: string;
                }).code !== 'ENOENT')
                    throw error;
            }
        }
        return next;
    }
    finally {
        fs.closeSync(fd);
        fs.unlinkSync(lock);
    }
}
module.exports = {
    directory,
    invalidate,
    defaultBindings,
    hash,
    text,
    session,
    modes,
    nativeVersion,
    processInfo,
    ancestor,
    readRecord,
    validate,
    reduce,
    record,
};

export {};
