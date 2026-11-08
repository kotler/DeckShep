import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { parse } from '../schemas';
import { discoverRex, pluginDirectory } from '../platform/paths';
const configure = require('../agents/claude/configure');
export interface Check {
  id: string;
  ok: boolean;
  reason: string;
}
export interface SetupPaths {
  plugin: string;
  settings: string;
  home: string;
}
export function setupPaths(): SetupPaths {
  return {
    plugin: pluginDirectory,
    home: os.homedir(),
    settings: path.join(
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
      'settings.json',
    ),
  };
}
function secure(file: string, optional = false): void {
  try {
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid!() ||
      stat.mode & 0o022 ||
      stat.size > 4e6
    )
      throw Error();
  } catch (error) {
    if (!optional || (error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw Error('Unsafe settings or setup record');
  }
}
function content(file: string): string | null {
  secure(file, true);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}
function digest(value: string | null): string {
  return crypto
    .createHash('sha256')
    .update(value === null ? '<absent>' : value)
    .digest('hex');
}
function readSetup(paths: SetupPaths) {
  const original = content(paths.settings),
    record = content(path.join(paths.plugin, 'state/claude-setup.json'));
  return {
    original,
    record,
    settings: original === null ? {} : parse('claudeSettings', original),
    saved: record === null ? null : parse('setupRecord', record),
  };
}
function atomic(file: string, data: string | null): void {
  const parent = path.dirname(file);
  if (fs.existsSync(parent)) {
    const stat = fs.lstatSync(parent);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid!() ||
      stat.mode & 0o022
    )
      throw Error('Unsafe integration directory');
  }
  if (data === null) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + crypto.randomUUID();
  try {
    fs.writeFileSync(temp, data, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
export class IntegrationSetup {
  #pending?: {
    original: string | null;
    record: string | null;
    remove: boolean;
    statusline: boolean;
  };
  #undo?: {
    original: string | null;
    record: string | null;
    after: string;
    afterRecord: string;
    backup: string;
  };
  constructor(private readonly paths = setupPaths()) {}
  preview(
    remove = false,
    statusline = false,
  ): { before: string; after: string } {
    const source = readSetup(this.paths);
    if (remove && !source.saved)
      throw Error(
        'Setup record unavailable; use the documented manual removal',
      );
    const result = configure.plan(source.settings, source.saved, {
      dir: this.paths.plugin,
      remove,
      statusline,
    });
    this.#pending = {
      original: source.original,
      record: source.record,
      remove,
      statusline,
    };
    // Only the interactive panel receives the exact diff. Never log it, include
    // it in doctor output, or cache it in Stream Deck global settings.
    return {
      before: JSON.stringify(source.settings, null, 2),
      after: JSON.stringify(result.settings, null, 2),
    };
  }
  apply(): void {
    const pending = this.#pending;
    if (!pending) throw Error('Preview the integration changes first');
    this.#pending = undefined;
    const source = readSetup(this.paths);
    if (
      source.original !== pending.original ||
      source.record !== pending.record
    )
      throw Error('Settings changed; preview again');
    configure.main([
      '--settings',
      this.paths.settings,
      '--plugin-dir',
      this.paths.plugin,
      '--apply',
      ...(pending.remove ? ['--remove'] : []),
      ...(pending.statusline ? ['--statusline'] : []),
    ]);
    const after = readSetup(this.paths),
      backup = path.join(this.paths.plugin, 'state', 'claude-undo.json');
    const undo = {
      schema: 1,
      original: pending.original,
      record: pending.record,
      after: digest(after.original),
      afterRecord: digest(after.record),
    };
    atomic(backup, JSON.stringify(undo));
    this.#undo = { ...undo, backup };
    if (pending.remove) this.removeMetadata();
  }
  private removeMetadata(): void {
    const directory = path.join(this.paths.plugin, 'state/claude');
    if (!fs.existsSync(directory)) return;
    const stat = fs.lstatSync(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid!() ||
      stat.mode & 0o077
    )
      throw Error('Unsafe Claude metadata directory');
    const files = fs.readdirSync(directory).map((name) => {
      if (!/^[1-9][0-9]*\.(?:json|invalid)$/.test(name))
        throw Error(
          'Metadata busy or unrecognized; remove it after hooks finish',
        );
      const file = path.join(directory, name),
        stat = fs.lstatSync(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.uid !== process.getuid!() ||
        stat.mode & 0o077
      )
        throw Error('Unsafe Claude metadata record');
      return file;
    });
    for (const file of files) fs.unlinkSync(file);
  }
  undo(): void {
    if (!this.#undo) {
      const backup = path.join(this.paths.plugin, 'state/claude-undo.json'),
        raw = content(backup);
      if (!raw) throw Error('No integration change to undo');
      const saved = parse('registry', raw);
      if (
        saved.schema !== 1 ||
        ![saved.original, saved.record].every(
          (item) => item === null || typeof item === 'string',
        ) ||
        ![saved.after, saved.afterRecord].every(
          (item) => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item),
        )
      )
        throw Error('Invalid undo record');
      this.#undo = {
        original: saved.original as string | null,
        record: saved.record as string | null,
        after: saved.after as string,
        afterRecord: saved.afterRecord as string,
        backup,
      };
    }
    const source = readSetup(this.paths),
      undo = this.#undo;
    if (
      digest(source.original) !== undo.after ||
      digest(source.record) !== undo.afterRecord
    )
      throw Error(
        'Settings changed after setup; preserve and reconcile them manually',
      );
    const lock = this.paths.settings + '.switchboard-lock',
      fd = fs.openSync(lock, 'wx', 0o600);
    try {
      const current = readSetup(this.paths);
      if (
        current.original !== source.original ||
        current.record !== source.record
      )
        throw Error('Settings changed during undo');
      // Restore the settings first; a failed record restoration cannot execute
      // an obsolete hook. The on-disk undo record remains available on failure.
      atomic(this.paths.settings, undo.original);
      atomic(
        path.join(this.paths.plugin, 'state/claude-setup.json'),
        undo.record,
      );
      fs.rmSync(undo.backup, { force: true });
      this.#undo = undefined;
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
}
export function herdrSessions(
  home = os.homedir(),
): { path: string; label: string }[] {
  const directory = path.join(home, '.config/herdr/sessions'),
    sessions: { path: string; label: string }[] = [];
  try {
    const parent = fs.lstatSync(directory);
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== process.getuid!() ||
      parent.mode & 0o022
    )
      return [];
    for (const name of fs.readdirSync(directory)) {
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(name)) continue;
      const dir = path.join(directory, name),
        file = path.join(dir, 'herdr.sock');
      try {
        const d = fs.lstatSync(dir),
          s = fs.lstatSync(file);
        if (
          d.isDirectory() &&
          !d.isSymbolicLink() &&
          d.uid === process.getuid!() &&
          !(d.mode & 0o022) &&
          s.isSocket() &&
          s.uid === process.getuid!() &&
          !(s.mode & 0o077)
        )
          sessions.push({
            path: file,
            label: 'Session ' + (sessions.length + 1),
          });
      } catch {}
    }
  } catch {}
  return sessions;
}
export async function diagnostics({
  home = os.homedir(),
  selected,
  model,
  rex = discoverRex,
  online = false,
}: {
  home?: string;
  selected?: Record<string, unknown> | null;
  model?: number;
  rex?: typeof discoverRex;
  online?: boolean;
} = {}): Promise<Check[]> {
  const checks: Check[] = [
    {
      id: 'device',
      ok: model === 0,
      reason:
        model === 0 ? '15-key Stream Deck' : 'Use a 15-key Stream Deck profile',
    },
  ];
  try {
    await rex();
    checks.push({ id: 'rex', ok: true, reason: 'Rex installation found' });
  } catch {
    checks.push({
      id: 'rex',
      ok: false,
      reason: 'Install Rex or set rexPath in config.json',
    });
  }
  checks.push({
    id: 'connection',
    ok: online,
    reason: online
      ? 'Selected backend reachable'
      : 'Open the terminal and enable its remote control',
  });
  const sessions = herdrSessions(home);
  checks.push({
    id: 'herdr',
    ok: !!sessions.length,
    reason: sessions.length
      ? `${sessions.length} private session socket(s); protocol checked on selection (22 required)`
      : 'Start Herdr TUI and choose its private session socket',
  });
  checks.push({
    id: 'codex',
    ok: !!selected?.chatId,
    reason: selected?.chatId
      ? 'Selected Codex metadata available'
      : 'Select a ready Codex agent, then set up its status line',
  });
  checks.push({
    id: 'claude',
    ok: selected?.app === 'claude-code' && selected.nativeVerified === true,
    reason:
      selected?.app === 'claude-code' && selected.nativeVerified === true
        ? 'Claude identity and native version verified'
        : 'Claude 2.1.319 required; preview the optional hooks below',
  });
  return checks;
}
