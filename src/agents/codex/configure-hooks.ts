import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { hookEvents, setupRecord, type CodexHookSetup } from './hook-contract';
import { readPrivate, writePrivate, privateDirectory } from './hook-files';
import { pluginDirectory } from '../../platform/paths';

const quote = (value: string): string =>
  "'" + value.replace(/'/g, "'\\''") + "'";
type Settings = Record<string, any>;
export function hookPlan(
  settings: Settings,
  saved: CodexHookSetup | null,
  command: string,
  hooksFile: string,
  remove = false,
) {
  if (
    !settings ||
    typeof settings !== 'object' ||
    Array.isArray(settings) ||
    (settings.hooks &&
      (typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)))
  )
    throw Error('Invalid Codex hooks');
  if (
    saved?.active &&
    (saved.command !== command || saved.hooksFile !== hooksFile)
  )
    throw Error('Remove the previous Codex hook setup first');
  const result = structuredClone(settings);
  result.hooks ??= {};
  for (const event of hookEvents) {
    const entries = result.hooks[event] ?? [];
    if (
      !Array.isArray(entries) ||
      entries.some((entry) => !entry || !Array.isArray(entry.hooks))
    )
      throw Error('Invalid Codex hook entry');
    const owned = saved?.command || command;
    // Keep foreign entries and their relative order; never rewrite another hook.
    const existing = entries.some((entry) =>
      entry.hooks.some(
        (hook: any) => hook.type === 'command' && hook.command === owned,
      ),
    );
    if (remove) {
      result.hooks[event] = entries.flatMap((entry) => {
        const hooks = entry.hooks.filter(
          (hook: any) => !(hook.type === 'command' && hook.command === owned),
        );
        return hooks.length === entry.hooks.length
          ? [entry]
          : hooks.length
            ? [{ ...entry, hooks }]
            : [];
      });
      if (!result.hooks[event].length) delete result.hooks[event];
    } else if (!existing)
      entries.push({
        hooks: [{ type: 'command', command, timeout: 5, async: false }],
      });
    if (!remove) result.hooks[event] = entries;
  }
  if (!Object.keys(result.hooks).length) delete result.hooks;
  return {
    settings: result,
    setup: setupRecord.parse({
      schema: 1,
      active: !remove,
      epoch: saved?.active && !remove ? saved.epoch : randomUUID(),
      command,
      hooksFile,
    }),
  };
}

function readHooks(file: string): {
  settings: Settings;
  original: Buffer | null;
} {
  try {
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 0o022 ||
      stat.size > 1048576
    )
      throw Error('Unsafe Codex hooks file');
    const descriptor = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const opened = fs.fstatSync(descriptor);
      if (
        opened.ino !== stat.ino ||
        opened.mtimeMs !== stat.mtimeMs ||
        opened.size !== stat.size
      )
        throw Error('Codex hooks changed');
      const original = fs.readFileSync(descriptor);
      const after = fs.fstatSync(descriptor);
      if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs)
        throw Error('Codex hooks changed');
      return { settings: JSON.parse(original.toString('utf8')), original };
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { settings: {}, original: null };
  }
}

export function configureHooks(
  options: {
    directory?: string;
    home?: string;
    node?: string;
    apply?: boolean;
    remove?: boolean;
  } = {},
) {
  const directory = options.directory || pluginDirectory;
  const home =
    options.home || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  if (!path.isAbsolute(home) || !path.isAbsolute(directory))
    throw Error('Absolute Codex integration paths required');
  const hooksFile = path.join(home, 'hooks.json');
  const state = path.join(directory, 'state');
  const recordFile = path.join(state, 'codex-setup.json');
  let saved: CodexHookSetup | null = null;
  try {
    saved = setupRecord.parse(readPrivate(recordFile));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const hook = path.join(directory, 'codex-hook.js');
  if (!options.remove && !fs.statSync(hook).isFile())
    throw Error('Build the Codex hook helper first');
  const command = quote(options.node || process.execPath) + ' ' + quote(hook);
  const current = readHooks(hooksFile);
  const plan = hookPlan(
    current.settings,
    saved,
    command,
    hooksFile,
    options.remove,
  );
  if (!options.apply) return plan;
  const homeStat = fs.lstatSync(home);
  if (
    !homeStat.isDirectory() ||
    homeStat.isSymbolicLink() ||
    homeStat.uid !== process.getuid?.() ||
    homeStat.mode & 0o022
  )
    throw Error('Unsafe Codex configuration directory');
  privateDirectory(state, true);
  privateDirectory(path.join(state, 'codex'), true);
  const backup = path.join(state, 'codex-backups');
  privateDirectory(backup, true);
  if (current.original)
    fs.writeFileSync(
      path.join(backup, randomUUID() + '.json'),
      current.original,
      { flag: 'wx', mode: 0o600 },
    );
  const latest = readHooks(hooksFile);
  if (!(
    (current.original === null && latest.original === null) ||
    (current.original !== null &&
      latest.original !== null &&
      current.original.equals(latest.original))
  ))
    throw Error('Codex hooks changed; no setup applied');
  // Revoke before removal. A partial failure cannot leave old hook authority.
  if (options.remove) writePrivate(recordFile, plan.setup);
  const temporary = hooksFile + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(plan.settings, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporary, hooksFile);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
  if (!options.remove) writePrivate(recordFile, plan.setup);
  return plan;
}

export function main(
  args = process.argv.slice(2),
  configure = configureHooks,
  output = {
    write: (value: string) => process.stdout.write(value),
    error: () => {
      process.stderr.write(
        'Codex hook setup failed; no status-line change was made.\n',
      );
      process.exitCode = 1;
    },
  },
): void {
  try {
    if (args.some((arg) => !['--apply', '--remove'].includes(arg)))
      throw Error('Use --apply or --remove --apply');
    const result = configure({
      apply: args.includes('--apply'),
      remove: args.includes('--remove'),
    });
    if (args.includes('--apply'))
      output.write(
        args.includes('--remove')
          ? 'Codex hooks removed. Other hooks were preserved.\n'
          : 'Codex hooks installed. Review and trust DeckShep with /hooks in Codex.\n',
      );
    else
      output.write(
        JSON.stringify({
          events: hookEvents,
          active: result.setup.active,
          applyRequired: true,
        }) + '\n',
      );
  } catch {
    output.error();
  }
}
