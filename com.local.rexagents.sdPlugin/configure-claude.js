#!/usr/bin/env node
'use strict';
// Explicit setup only. Preview by default; never invoked by discovery or a key press.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  os = require('node:os');
const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'Stop',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
];
const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
function commands(dir, node = process.execPath) {
  const hook = quote(node) + ' ' + quote(path.join(dir, 'claude-hook.js'));
  return { hook, status: hook + ' --statusline' };
}
function plan(
  settings,
  saved,
  { dir, node = process.execPath, remove = false, statusline = false } = {},
) {
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    (settings.hooks &&
      (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)))
  )
    throw Error('Invalid Claude settings');
  const result = structuredClone(settings),
    c = commands(dir, node),
    owned = saved?.commands || c;
  if (
    !remove &&
    saved?.active !== false &&
    (owned.hook !== c.hook || owned.status !== c.status)
  )
    throw Error(
      'Integration location/runtime changed; remove the previous setup using its original path first',
    );
  result.hooks ??= {};
  for (const event of EVENTS) {
    const list = result.hooks[event] || [];
    if (!Array.isArray(list)) throw Error('Invalid Claude hooks');
    // Remove only our own command; preserve other hooks in the same matcher entry.
    if (
      list.some(
        (entry) =>
          !entry || typeof entry !== 'object' || !Array.isArray(entry.hooks),
      )
    )
      throw Error('Invalid existing hook entry; no changes made');
    const clean = list.flatMap((entry) => {
      const hooks = entry.hooks.filter(
        (h) => !(h.type === 'command' && h.command === owned.hook),
      );
      return hooks.length === entry.hooks.length
        ? [entry]
        : hooks.length
          ? [{ ...entry, hooks }]
          : [];
    });
    if (!remove)
      clean.push({ hooks: [{ type: 'command', command: c.hook, timeout: 5 }] });
    if (clean.length) result.hooks[event] = clean;
    else delete result.hooks[event];
  }
  const ours =
    settings.statusLine?.type === 'command' &&
    settings.statusLine.command === owned.status;
  if (remove) {
    if (ours) {
      if (saved?.originalStatusLine)
        result.statusLine = structuredClone(saved.originalStatusLine);
      else delete result.statusLine;
    }
  } else if (statusline) {
    if (
      settings.statusLine &&
      (settings.statusLine.type !== 'command' ||
        typeof settings.statusLine.command !== 'string')
    )
      throw Error('Unsupported existing status line');
    if (saved?.active !== false && !ours && saved?.statusline)
      throw Error(
        'Status line changed since setup; preserve and reconcile it manually',
      );
    result.statusLine = {
      ...(settings.statusLine || {}),
      type: 'command',
      command: c.status,
      refreshInterval: 2,
    };
  }
  if (
    remove &&
    !Object.keys(result.hooks).length &&
    saved?.originalHadHooks === false
  )
    delete result.hooks;
  const registry =
    saved && saved.active !== false
      ? saved
      : {
          schema: 1,
          commands: c,
          originalHadHooks: Object.hasOwn(settings, 'hooks'),
          originalStatusLine: settings.statusLine
            ? structuredClone(settings.statusLine)
            : null,
        };
  return {
    settings: result,
    registry: {
      ...registry,
      active: !remove,
      statusline: !remove && (statusline || registry.statusline === true),
    },
  };
}
function secure(file, optional = false) {
  try {
    const s = fs.lstatSync(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.uid !== process.getuid() ||
      s.mode & 0o022
    )
      throw Error('Unsafe settings or setup record');
  } catch (error) {
    if (!optional || error.code !== 'ENOENT') throw error;
  }
}
function main(args = process.argv.slice(2)) {
  const flags = new Set(['--apply', '--remove', '--statusline']),
    values = new Set(['--settings', '--plugin-dir']);
  for (let i = 0; i < args.length; i++) {
    if (values.has(args[i])) {
      if (!args[++i] || args[i].startsWith('--'))
        throw Error('Missing option value');
    } else if (!flags.has(args[i])) throw Error('Unknown option');
  }
  const option = (name, fallback) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const dir = path.resolve(option('--plugin-dir', __dirname)),
    file = path.resolve(
      option(
        '--settings',
        path.join(
          process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
          'settings.json',
        ),
      ),
    ),
    registry = path.join(dir, 'state', 'claude-setup.json');
  if (!fs.existsSync(path.join(dir, 'claude-hook.js')))
    throw Error('Choose the installed plugin directory');
  secure(file, true);
  secure(registry, true);
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  let settings, saved;
  try {
    settings = original === null ? {} : JSON.parse(original);
    saved = fs.existsSync(registry)
      ? JSON.parse(fs.readFileSync(registry, 'utf8'))
      : null;
  } catch {
    throw Error('Invalid Claude settings/setup record JSON');
  }
  if (args.includes('--remove') && !saved)
    throw Error(
      'Setup record unavailable; remove only the exact Agent Switchboard hook commands manually',
    );
  const result = plan(settings, saved, {
    dir,
    remove: args.includes('--remove'),
    statusline: args.includes('--statusline'),
  });
  // Do not print settings, custom commands, tool input, credentials or hook payloads.
  console.log(
    (args.includes('--remove') ? 'Remove' : 'Install') +
      ' Agent Switchboard Claude hooks' +
      (args.includes('--statusline')
        ? ' and chain the existing status line'
        : '') +
      '.',
  );
  if (!args.includes('--apply')) {
    console.log('Preview only. Add --apply to write with a backup.');
    return;
  }
  const parent = path.dirname(file);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const ps = fs.lstatSync(parent);
  if (ps.isSymbolicLink() || ps.uid !== process.getuid() || ps.mode & 0o022)
    throw Error('Unsafe Claude settings directory');
  fs.mkdirSync(path.dirname(registry), { recursive: true, mode: 0o700 });
  const rs = fs.lstatSync(path.dirname(registry));
  if (rs.isSymbolicLink() || rs.uid !== process.getuid() || rs.mode & 0o022)
    throw Error('Unsafe integration state directory');
  const lock = file + '.switchboard-lock',
    lockFd = fs.openSync(lock, 'wx', 0o600);
  try {
    const unchanged = () => {
      secure(file, true);
      if (
        (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null) !==
        original
      )
        throw Error(
          'Claude settings changed during setup; no settings overwritten',
        );
    };
    unchanged();
    const backup = file + '.switchboard-backup-' + crypto.randomUUID();
    if (fs.existsSync(file))
      fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    if (fs.existsSync(backup)) fs.chmodSync(backup, 0o600);
    // Save recovery/ownership before touching settings. Existing records remain for rollback.
    const registryTmp = registry + '.' + crypto.randomUUID();
    fs.writeFileSync(
      registryTmp,
      JSON.stringify(result.registry, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    fs.renameSync(registryTmp, registry);
    unchanged();
    const tmp = file + '.' + crypto.randomUUID();
    fs.writeFileSync(tmp, JSON.stringify(result.settings, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    try {
      unchanged();
      fs.renameSync(tmp, file);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
    console.log(
      'Applied. Existing unrelated hooks, settings and permission rules preserved. No agents restarted.',
    );
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}
if (require.main === module)
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
module.exports = { EVENTS, commands, plan, main };
