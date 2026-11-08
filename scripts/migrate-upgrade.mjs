import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requireStopped, mergedConfig } from './install.mjs';

const plugin = 'com.kotl3r.deckshep.sdPlugin';
const lifecycle = (name) => /^state\/claude\/\d+\.(?:json|invalid)$/.test(name);
const ephemeralLock = (name) =>
  name.startsWith('state/claude/') && /(?:\.lock|\.tmp)$/.test(name);
const digest = (bytes) =>
  crypto.createHash('sha256').update(bytes).digest('hex');
function directory(dir, create = false) {
  if (create && !fs.existsSync(dir)) {
    directory(path.dirname(dir), true);
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  const stat = fs.lstatSync(dir);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o022
  )
    throw Error('Unsafe upgrade directory');
}
function paths(home) {
  directory(home);
  const base = path.join(
    home,
    'Library/Application Support/com.elgato.StreamDeck',
  );
  // Check every component, including intermediate symlinks, before reading it.
  for (const relative of [
    'Library',
    'Library/Application Support',
    'Library/Application Support/com.elgato.StreamDeck',
    'Library/Application Support/com.elgato.StreamDeck/Plugins',
  ])
    directory(path.join(home, relative));
  return {
    installed: path.join(base, 'Plugins', plugin),
    profiles: path.join(base, 'ProfilesV3'),
    backups: path.join(home, 'Library/Application Support/DeckShep/backups'),
  };
}
function snapshot(dir) {
  directory(dir);
  const files = new Map();
  function visit(current, prefix = '') {
    for (const name of fs.readdirSync(current).sort()) {
      const relative = prefix + name,
        file = path.join(current, name),
        stat = fs.lstatSync(file);
      if (
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid() ||
        stat.mode & 0o022
      )
        throw Error('Unsafe upgrade entry');
      if (stat.isDirectory()) {
        directory(file);
        visit(file, relative + '/');
      } else if (stat.isFile() && stat.nlink === 1) {
        const fd = fs.openSync(
          file,
          fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
        );
        try {
          const before = fs.fstatSync(fd),
            bytes = fs.readFileSync(fd),
            after = fs.fstatSync(fd);
          if (
            before.ino !== stat.ino ||
            before.size !== after.size ||
            before.mtimeMs !== after.mtimeMs
          )
            throw Error('Upgrade data changed during read');
          files.set(relative, bytes);
        } finally {
          fs.closeSync(fd);
        }
      } else throw Error('Unsupported upgrade entry');
    }
  }
  visit(dir);
  return files;
}
const hashes = (files) =>
  Object.fromEntries([...files].map(([name, bytes]) => [name, digest(bytes)]));
function equal(left, right) {
  return JSON.stringify(hashes(left)) === JSON.stringify(hashes(right));
}
function writeTree(dir, files) {
  directory(dir, true);
  for (const [name, bytes] of files) {
    const file = path.join(dir, name);
    directory(path.dirname(file), true);
    fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
  }
}
function identity(files) {
  const manifest = JSON.parse(files.get('manifest.json'));
  if (
    manifest.UUID !== 'com.kotl3r.deckshep' ||
    typeof manifest.Version !== 'string'
  )
    throw Error('Wrong installed plugin identity');
  return manifest.Version;
}
function stopped(processStatus) {
  requireStopped(
    processStatus !== undefined
      ? processStatus
      : spawnSync('pgrep', ['-f', 'Stream Deck.app/Contents/MacOS'], {
          stdio: 'ignore',
        }).status,
  );
}
export function backupUpgrade({ home = os.homedir(), processStatus } = {}) {
  stopped(processStatus);
  const locations = paths(home),
    installed = snapshot(locations.installed),
    profiles = snapshot(locations.profiles);
  const version = identity(installed);
  mergedConfig({}, JSON.parse(installed.get('config.json')));
  directory(locations.backups, true);
  const backup = path.join(locations.backups, crypto.randomUUID());
  fs.mkdirSync(backup, { mode: 0o700 });
  writeTree(path.join(backup, 'plugin'), installed);
  writeTree(path.join(backup, 'ProfilesV3'), profiles);
  // A running hook can update state while Stream Deck is stopped. Never accept
  // a torn backup or ask the user to stop their existing agents.
  if (
    !equal(installed, snapshot(locations.installed)) ||
    !equal(profiles, snapshot(locations.profiles))
  )
    throw Error('Upgrade data changed; backup incomplete, try again');
  fs.writeFileSync(
    path.join(backup, 'backup.json'),
    JSON.stringify({
      schema: 1,
      plugin: 'com.kotl3r.deckshep',
      version,
      destination: digest(Buffer.from(fs.realpathSync(locations.installed))),
      installed: hashes(installed),
      profiles: hashes(profiles),
    }) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  return { backup };
}
export function restoreUpgrade({
  home = os.homedir(),
  backup,
  apply = false,
  processStatus,
} = {}) {
  stopped(processStatus);
  const locations = paths(home);
  // A backup is accepted only from this account's external backup directory.
  directory(locations.backups);
  if (
    !backup ||
    fs.realpathSync(path.dirname(path.resolve(backup))) !==
      fs.realpathSync(locations.backups)
  )
    throw Error('Choose an external upgrade backup');
  directory(backup);
  if (fs.lstatSync(backup).mode & 0o077)
    throw Error('Unsafe private backup permissions');
  const saved = snapshot(backup),
    record = JSON.parse(saved.get('backup.json'));
  const old = snapshot(path.join(backup, 'plugin')),
    oldProfiles = snapshot(path.join(backup, 'ProfilesV3'));
  if (
    record.schema !== 1 ||
    record.plugin !== 'com.kotl3r.deckshep' ||
    record.destination !==
      digest(Buffer.from(fs.realpathSync(locations.installed))) ||
    JSON.stringify(record.installed) !== JSON.stringify(hashes(old)) ||
    JSON.stringify(record.profiles) !== JSON.stringify(hashes(oldProfiles))
  )
    throw Error('Upgrade backup failed integrity or destination check');
  identity(old);
  const current = snapshot(locations.installed),
    currentProfiles = snapshot(locations.profiles);
  identity(current);
  for (const name of ['bin/plugin.js', 'claude-hook.js', 'configure-claude.js'])
    if (!current.has(name))
      throw Error('Install the new plugin before restoring');
  const config = Buffer.from(
    JSON.stringify(
      mergedConfig(
        JSON.parse(current.get('config.json')),
        JSON.parse(old.get('config.json')),
      ),
      null,
      2,
    ) + '\n',
  );
  const state = new Map(
    [...old].filter(
      ([name]) => name.startsWith('state/') && !ephemeralLock(name),
    ),
  );
  for (const [name, bytes] of state)
    if (
      !lifecycle(name) &&
      current.has(name) &&
      !current.get(name).equals(bytes)
    )
      throw Error(
        'Installed integration state changed; reconcile before restoring',
      );
  if (!apply)
    return {
      preview: true,
      stateFiles: state.size,
      profileFiles: oldProfiles.size,
    };
  const lock = path.join(locations.backups, 'restore.lock');
  const lockFd = fs.openSync(lock, 'wx', 0o600);
  try {
    const recovery = backupUpgrade({ home, processStatus });
    if (
      !equal(current, snapshot(locations.installed)) ||
      !equal(currentProfiles, snapshot(locations.profiles))
    )
      throw Error('Installed data changed; no restore performed');
    // All data and destinations are validated before mutation. Keep the complete
    // pre-restore recovery backup if an I/O error interrupts the writes.
    function replace(base, name, bytes) {
      const target = path.join(base, name);
      directory(path.dirname(target), true);
      const prior =
        base === locations.installed
          ? current.get(name)
          : currentProfiles.get(name);
      if (
        prior ? !fs.readFileSync(target).equals(prior) : fs.existsSync(target)
      )
        throw Error('Upgrade target changed; keep the recovery backup');
      const temporary = target + '.' + crypto.randomUUID() + '.tmp';
      fs.writeFileSync(temporary, bytes, { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, target);
    }
    replace(locations.installed, 'config.json', config);
    for (const [name, bytes] of state) {
      if (current.has(name)) continue;
      const file = path.join(locations.installed, name);
      directory(path.dirname(file), true);
      try {
        fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        // A running hook may publish fresh lifecycle data after preflight.
        // Preserve it; setup records and other durable state still refuse races.
        if (error.code !== 'EEXIST' || !lifecycle(name)) throw error;
        const stat = fs.lstatSync(file);
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.nlink !== 1 ||
          stat.uid !== process.getuid() ||
          stat.mode & 0o077
        )
          throw Error('Unsafe fresh lifecycle record', { cause: error });
      }
    }
    for (const [name, bytes] of oldProfiles)
      replace(locations.profiles, name, bytes);
    return { ...recovery, restored: true };
  } finally {
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, backup, flag, ...extra] = process.argv.slice(2);
    if (
      process.platform !== 'darwin' ||
      extra.length ||
      (command === 'backup'
        ? backup
        : command !== 'restore' || !backup || (flag && flag !== '--apply'))
    )
      throw Error(
        'Usage: node scripts/migrate-upgrade.mjs backup | restore <backup-directory> [--apply]',
      );
    const result =
      command === 'backup'
        ? backupUpgrade()
        : restoreUpgrade({ backup, apply: flag === '--apply' });
    if (result.backup)
      console.log('Backup: ~/' + path.relative(os.homedir(), result.backup));
    console.log(
      result.preview
        ? `Preview: merge config, restore ${result.stateFiles} state files and ${result.profileFiles} profile files. Add --apply to restore.`
        : result.restored
          ? 'Upgrade customization restore complete.'
          : 'Backup complete. Keep this directory until the upgrade is verified.',
    );
  } catch (error) {
    console.error(
      error.code || error instanceof SyntaxError
        ? 'Upgrade failed; keep external backups and inspect the installation privately.'
        : error.message,
    );
    process.exitCode = 1;
  }
}
