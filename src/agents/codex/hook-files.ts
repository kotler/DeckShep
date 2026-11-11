import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pluginDirectory } from '../../platform/paths';

export const hookDirectory = (): string =>
  path.join(pluginDirectory, 'state', 'codex');
export const setupFile = (): string =>
  path.join(pluginDirectory, 'state', 'codex-setup.json');

export function privateDirectory(directory: string, create = false): void {
  if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw Error('Unsafe Codex hook directory');
}

export function readPrivate(file: string): unknown {
  privateDirectory(path.dirname(file));
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid?.() ||
      before.mode & 0o077 ||
      before.size > 16384
    )
      throw Error('Unsafe Codex hook record');
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor);
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== after.ino
    )
      throw Error('Codex hook record changed');
    return JSON.parse(bytes.toString('utf8'));
  } finally {
    fs.closeSync(descriptor);
  }
}

export function writePrivate(file: string, data: unknown): void {
  privateDirectory(path.dirname(file), true);
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(data) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
  } finally {
    try {
      fs.unlinkSync(temporary);
    } catch {}
  }
}
