// @ts-check
/** @typedef {import("../../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../../domain/types").Config} Config */
/** @typedef {import("../../domain/types").PressContext} PressContext */
'use strict';
const { pluginDirectory } = require("../../platform/paths.ts");

// Metadata only: no transcripts, prompts, tool inputs/outputs or credentials on disk.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFile } = require('node:child_process');
const directory = () => path.join(pluginDirectory, 'state', 'claude');
const hash =
  /** @param {any} value */
  (value) =>
    crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text =
  /** @param {any} s
   * @param {number} [max] */
  (s, max = 200) =>
    typeof s === 'string' &&
    s.length > 0 &&
    s.length <= max &&
    !/[\x00-\x1f\x7f-\x9f]/.test(s);
const session =
  /** @param {any} s */
  (s) => text(s, 128) && /^[a-zA-Z0-9_-]+$/.test(s);
const modes = new Set([
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'auto',
  'dontAsk',
]);
/** @param {string} file */
function nativeVersion(file) {
  const resolved = fs.realpathSync(file);
  return /\/claude\/versions\/(\d+\.\d+\.\d+)$/.exec(resolved)?.[1] || null;
}
const processRead =
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
/** @param {string} out
 * @param {number} pid */
function parseProcess(out, pid) {
  const m =
    /^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/.exec(
      out || '',
    );
  if (!m || Number(m[1]) !== /** @type {() => number} */ (process.getuid)())
    throw Error('Claude process owner unavailable');
  return {
    pid,
    ppid: Number(m[2]),
    startedAt: m[3].replace(/\s+/g, ' '),
    executable: m[4],
    version: /** @type {string | null} */ (null),
  };
}
/** @param {number} pid
 * @param {any} [execute] */
async function processInfo(pid, execute = processRead) {
  if (!Number.isSafeInteger(pid) || pid <= 0)
    throw Error('Claude process unavailable');
  const args = ['-p', String(pid), '-o', 'uid=,ppid=,lstart=,comm='],
    before = await execute('/bin/ps', args),
    p = parseProcess(before, pid),
    name = path.basename(p.executable);
  if (/^claude(?:-|$)/.test(name) || /^\d+\.\d+\.\d+$/.test(name)) {
    // comm/argv0 can be a bare name (Herdr) or an alias. Verify the kernel's
    // executable image rather than interpreting either as an executable path.
    const rows = (
      await execute('/usr/sbin/lsof', [
        '-n',
        '-a',
        '-p',
        String(pid),
        '-d',
        'txt',
        '-Ffn',
      ])
    )
      .trim()
      .split('\n');
    if (
      rows[0] !== 'p' + pid ||
      rows[1] !== 'ftxt' ||
      !rows[2]?.startsWith('n') ||
      !path.isAbsolute(rows[2].slice(1))
    )
      throw Error('Claude executable unavailable');
    const after = parseProcess(await execute('/bin/ps', args), pid);
    if (
      p.ppid !== after.ppid ||
      p.startedAt !== after.startedAt ||
      p.executable !== after.executable
    )
      throw Error('Claude process replaced');
    p.executable = rows[2].slice(1);
    try {
      p.version = nativeVersion(p.executable);
    } catch {}
  }
  return p;
}
/** @param {any} [start]
 * @param {any} [inspect] */
async function ancestor(start = process.ppid, inspect = processInfo) {
  let pid = start;
  for (let i = 0; i < 12 && pid > 1; i++) {
    const p = await inspect(pid);
    if (p.version) return p;
    pid = p.ppid;
  }
  throw Error('No native Claude ancestor');
}
/** @param {string} dir */
function defaultBindings(dir) {
  if (!text(dir, 4096) || !path.isAbsolute(dir)) return false;
  try {
    fs.lstatSync(path.join(dir, 'keybindings.json'));
    return false;
  } catch (error) {
    return /** @type {Error & {code?: string}} */ (error).code === 'ENOENT';
  }
}
/** @param {string} dir
 * @param {any} [create] */
function privateDirectory(dir, create = false) {
  if (create) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const s = fs.lstatSync(dir);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    s.uid !== /** @type {() => number} */ (process.getuid)() ||
    s.mode & 0o077
  )
    throw Error('Unsafe Claude metadata directory');
}
/** @param {number} pid
 * @param {string} [dir]
 * @param {Record<string, any>} [options] */
function readRecord(pid, dir = directory(), { allowInvalid = false } = {}) {
  privateDirectory(dir);
  if (!allowInvalid && fs.existsSync(path.join(dir, String(pid) + '.invalid')))
    throw Error('Claude lifecycle report was lost; wait for a fresh event');
  const file = path.join(dir, String(pid) + '.json'),
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const s = fs.fstatSync(fd);
    if (
      !s.isFile() ||
      s.nlink !== 1 ||
      s.uid !== /** @type {() => number} */ (process.getuid)() ||
      s.mode & 0o077 ||
      s.size > 16384
    )
      throw Error('Unsafe Claude metadata');
    const data = JSON.parse(fs.readFileSync(fd, 'utf8')),
      after = fs.fstatSync(fd);
    if (s.mtimeMs !== after.mtimeMs || s.size !== after.size)
      throw Error('Claude metadata changed');
    return data;
  } finally {
    fs.closeSync(fd);
  }
}
/** @param {any} record
 * @param {AgentSnapshot} agent
 * @param {any} p
 * @param {number} [now] */
function validate(record, agent, p, now = Date.now()) {
  if (
    record?.schema !== 1 ||
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
    record.updatedAt > now + 1000
  )
    throw Error('Claude session metadata unavailable or unsupported');
  if (
    record.state === 'blocked' &&
    (!['question', 'permission'].includes(record.kind) ||
      !text(record.requestId, 128))
  )
    throw Error('Claude request identity unavailable');
  return record;
}
/** @param {any} previous
 * @param {any} data
 * @param {any} p
 * @param {number} [now]
 * @param {any} [id]
 * @param {any} [statusline] */
function reduce(
  previous,
  data,
  p,
  now = Date.now(),
  id = () => crypto.randomUUID(),
  statusline = false,
) {
  if (
    !data ||
    typeof data !== 'object' ||
    data.agent_id ||
    !session(data.session_id) ||
    !text(data.cwd, 4096) ||
    !path.isAbsolute(data.cwd) ||
    p.version !== '2.1.319'
  )
    return null;
  const same =
    previous?.pid === p.pid &&
    previous.startedAt === p.startedAt &&
    previous.sessionId === data.session_id;
  if (statusline) {
    // A subagent/status-line callback can never establish or replace root identity.
    if (!same || previous.ended || data.agent) return null;
    const model = text(data.model?.id) ? data.model.id : null,
      effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(
        data.effort?.level,
      )
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
      vimMode: ['INSERT', 'NORMAL', 'VISUAL', 'VISUAL LINE'].includes(
        data.vim?.mode,
      )
        ? data.vim.mode
        : null,
      metadataAt: now,
    };
  }
  const event = data.hook_event_name;
  if (
    ![
      'SessionStart',
      'SessionEnd',
      'UserPromptSubmit',
      'Stop',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PermissionRequest',
      'Notification',
    ].includes(event)
  )
    return null;
  if (!same && !['SessionStart', 'UserPromptSubmit'].includes(event))
    return null;
  if (
    previous?.pid === p.pid &&
    previous.startedAt === p.startedAt &&
    previous.eventAt > now
  )
    return null;
  const r = same
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
  if (
    ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'Stop'].includes(event)
  ) {
    r.pendingToolDigest = null;
    r.pendingToolId = null;
  }
  if (
    event === 'PermissionRequest' ||
    (event === 'PreToolUse' && data.tool_name === 'AskUserQuestion')
  ) {
    const digest = hash([data.tool_name, data.tool_input]),
      toolId = text(data.tool_use_id, 128)
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
  } else if (event === 'Notification') {
    if (data.notification_type !== 'permission_prompt') return null;
    if (r.state === 'blocked') return null; // Do not replace the stronger exact tool request.
    r.state = 'blocked';
    r.kind = 'permission';
    r.requestId = hash([event, data.message, now]);
    r.toolId = null;
  } else if (['PostToolUse', 'PostToolUseFailure'].includes(event)) {
    if (r.state === 'blocked' && (!r.toolId || r.toolId !== data.tool_use_id))
      return null;
    if (r.pendingToolId === data.tool_use_id) {
      r.pendingToolDigest = null;
      r.pendingToolId = null;
    }
    r.state = 'working';
  } else if (event === 'PreToolUse') {
    if (r.state === 'blocked') return null;
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
  if (modes.has(data.permission_mode)) r.permissionMode = data.permission_mode;
  return r;
}
/** @param {any} p
 * @param {string} dir */
function markInvalid(p, dir) {
  const file = path.join(dir, String(p.pid) + '.invalid'),
    tmp = file + '.' + crypto.randomUUID();
  fs.writeFileSync(tmp, crypto.randomUUID(), { mode: 0o600, flag: 'wx' });
  fs.renameSync(tmp, file);
}
/** @param {Record<string, any>} [options] */
async function invalidate({
  dir = directory(),
  inspect = processInfo,
  parent = process.ppid,
} = {}) {
  const p = await ancestor(parent, inspect);
  privateDirectory(dir, true);
  markInvalid(p, dir);
}
/** @param {any} data
 * @param {Record<string, any>} [options] */
async function record(
  data,
  {
    dir = directory(),
    inspect = processInfo,
    parent = process.ppid,
    now = Date.now(),
    statusline = false,
    lockTimeoutMs = 1000,
  } = {},
) {
  const p = await ancestor(parent, inspect);
  privateDirectory(dir, true);
  const lock = path.join(dir, String(p.pid) + '.lock'),
    invalid = path.join(dir, String(p.pid) + '.invalid');
  let fd,
    initialInvalid = null;
  try {
    initialInvalid = fs.readFileSync(invalid, 'utf8');
  } catch (error) {
    if (/** @type {Error & {code?: string}} */ (error).code !== 'ENOENT')
      throw error;
  }
  const deadline = Date.now() + lockTimeoutMs;
  for (;;) {
    try {
      fd = fs.openSync(lock, 'wx', 0o600);
      break;
    } catch (error) {
      if (/** @type {Error & {code?: string}} */ (error).code !== 'EEXIST')
        throw error;
      if (statusline || Date.now() >= deadline) {
        if (!statusline) markInvalid(p, dir);
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
  } // Serialize lifecycle hooks; metadata refreshes can skip contention.
  try {
    let prior;
    try {
      prior = readRecord(p.pid, dir, { allowInvalid: true });
    } catch (error) {
      if (/** @type {Error & {code?: string}} */ (error).code !== 'ENOENT')
        throw error;
    }
    if (
      statusline &&
      prior &&
      data &&
      !data.agent_id &&
      !data.agent &&
      session(data.session_id) &&
      prior.sessionId !== data.session_id
    ) {
      markInvalid(p, dir);
      return null;
    }
    const next = reduce(prior, data, p, now, undefined, statusline);
    if (!next) return null;
    next.configDirectory = path.resolve(
      process.env.CLAUDE_CONFIG_DIR ||
        path.join(require('node:os').homedir(), '.claude'),
    );
    const current = await inspect(p.pid);
    if (current.startedAt !== p.startedAt || current.version !== p.version)
      throw Error('Claude process replaced');
    const file = path.join(dir, String(p.pid) + '.json'),
      tmp = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(next) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
      fs.renameSync(tmp, file);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
    if (
      !statusline &&
      ['SessionStart', 'UserPromptSubmit', 'SessionEnd'].includes(
        data.hook_event_name,
      ) &&
      initialInvalid !== null
    ) {
      try {
        if (fs.readFileSync(invalid, 'utf8') === initialInvalid)
          fs.unlinkSync(invalid);
      } catch (error) {
        if (/** @type {Error & {code?: string}} */ (error).code !== 'ENOENT')
          throw error;
      }
    }
    return next;
  } finally {
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
