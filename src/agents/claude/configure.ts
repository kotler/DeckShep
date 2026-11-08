#!/usr/bin/env node
const boundary = require('../../schemas');
type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const { pluginDirectory } = require('../../platform/paths.ts');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  os = require('node:os');
const EVENTS: string[] = [
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
const quote: (s: any) => string = (s: any) =>
  "'" + s.replace(/'/g, "'\\''") + "'";
function commands(dir: string, node: any = process.execPath) {
  const hook: string =
    quote(node) + ' ' + quote(path.join(dir, 'claude-hook.js'));
  return { hook, status: hook + ' --statusline' };
}
function plan(
  settings: any,
  saved: any,
  {
    dir,
    node = process.execPath,
    remove = false,
    statusline = false,
  }: Record<string, any> | undefined = {},
) {
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    (settings.hooks &&
      (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)))
  )
    throw Error('Invalid Claude settings');
  const result: any = structuredClone(settings),
    c: {
      hook: string;
      status: string;
    } = commands(dir, node),
    owned: any = saved?.commands || c;
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
    const list: any = result.hooks[event] || [];
    if (!Array.isArray(list)) throw Error('Invalid Claude hooks');
    if (
      list.some(
        (entry: any) =>
          !entry || typeof entry !== 'object' || !Array.isArray(entry.hooks),
      )
    )
      throw Error('Invalid existing hook entry; no changes made');
    const clean: any[] = list.flatMap((entry: any) => {
      const hooks: any = entry.hooks.filter(
        (h: any) => !(h.type === 'command' && h.command === owned.hook),
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
  const ours: boolean =
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
  const registry: any =
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
function secure(file: string, optional: any = false) {
  try {
    const s: import('node:fs').Stats = fs.lstatSync(file);
    if (
      !s.isFile() ||
      s.isSymbolicLink() ||
      s.uid !== (process.getuid as () => number)() ||
      s.mode & 0o022
    )
      throw Error('Unsafe settings or setup record');
  } catch (error: unknown) {
    if (
      !optional ||
      (
        error as Error & {
          code?: string;
        }
      ).code !== 'ENOENT'
    )
      throw error;
  }
}
function main(args: string[] | undefined = process.argv.slice(2)) {
  const flags: Set<string> = new Set(['--apply', '--remove', '--statusline']),
    values: Set<string> = new Set(['--settings', '--plugin-dir']);
  for (let i: number = 0; i < args.length; i++) {
    if (values.has(args[i])) {
      if (!args[++i] || args[i].startsWith('--'))
        throw Error('Missing option value');
    } else if (!flags.has(args[i])) throw Error('Unknown option');
  }
  const option: (name: any, fallback: any) => any = (
    name: any,
    fallback: any,
  ) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const dir: string = path.resolve(option('--plugin-dir', pluginDirectory)),
    file: string = path.resolve(
      option(
        '--settings',
        path.join(
          process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
          'settings.json',
        ),
      ),
    ),
    registry: string = path.join(dir, 'state', 'claude-setup.json');
  if (!fs.existsSync(path.join(dir, 'claude-hook.js')))
    throw Error('Choose the installed plugin directory');
  secure(file, true);
  secure(registry, true);
  const original: string | null = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : null;
  let settings: any, saved: any;
  try {
    settings =
      original === null ? {} : boundary.parse('claudeSettings', original);
    saved = fs.existsSync(registry)
      ? boundary.parse('setupRecord', fs.readFileSync(registry, 'utf8'))
      : null;
  } catch {
    throw Error('Invalid Claude settings/setup record JSON');
  }
  if (args.includes('--remove') && !saved)
    throw Error(
      'Setup record unavailable; remove only the exact Agent Switchboard hook commands manually',
    );
  const result: {
    settings: any;
    registry: any;
  } = plan(settings, saved, {
    dir,
    remove: args.includes('--remove'),
    statusline: args.includes('--statusline'),
  });
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
  const parent: string = path.dirname(file);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const ps: import('node:fs').Stats = fs.lstatSync(parent);
  if (
    ps.isSymbolicLink() ||
    ps.uid !== (process.getuid as () => number)() ||
    ps.mode & 0o022
  )
    throw Error('Unsafe Claude settings directory');
  fs.mkdirSync(path.dirname(registry), { recursive: true, mode: 0o700 });
  const rs: import('node:fs').Stats = fs.lstatSync(path.dirname(registry));
  if (
    rs.isSymbolicLink() ||
    rs.uid !== (process.getuid as () => number)() ||
    rs.mode & 0o022
  )
    throw Error('Unsafe integration state directory');
  const lock: string = file + '.switchboard-lock',
    lockFd: number = fs.openSync(lock, 'wx', 0o600);
  try {
    const unchanged: () => void = () => {
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
    const backup: string = file + '.switchboard-backup-' + crypto.randomUUID();
    if (fs.existsSync(file))
      fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    if (fs.existsSync(backup)) fs.chmodSync(backup, 0o600);
    const registryTmp: string = registry + '.' + crypto.randomUUID();
    fs.writeFileSync(
      registryTmp,
      JSON.stringify(result.registry, null, 2) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    fs.renameSync(registryTmp, registry);
    unchanged();
    const tmp: string = file + '.' + crypto.randomUUID();
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
  } catch (error: unknown) {
    console.error(
      (
        error as Error & {
          code?: string;
        }
      ).message,
    );
    process.exitCode = 1;
  }
module.exports = { EVENTS, commands, plan, main };

export {};
