import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from './exec.ts';

export const pluginName = 'com.kotl3r.deckshep.sdPlugin';

/** Works in source tests, compiled modules and the installed bundle. */
export function findPluginDirectory(
  start: string = typeof __dirname === 'string'
    ? __dirname
    : path.dirname(process.argv[1] ?? path.join(process.cwd(), 'entry')),
): string {
  let directory = path.resolve(start);
  for (let depth = 0; depth < 7; depth++) {
    if (
      path.basename(directory) === pluginName &&
      fs.existsSync(path.join(directory, 'manifest.json'))
    )
      return directory;
    const child = path.join(directory, pluginName);
    if (fs.existsSync(path.join(child, 'manifest.json'))) return child;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw Error('Plugin files unavailable');
}

export const pluginDirectory = findPluginDirectory();
export interface RexInstallation {
  binary: string;
  application: string;
}
export interface PathProbe {
  home: string;
  exists(file: string): boolean;
  spotlight(): Promise<string[]>;
}
const helper = 'Contents/Helpers/Rex Server.rex/Contents/MacOS/rex';
const defaults: PathProbe = {
  home: os.homedir(),
  exists: (file) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  },
  spotlight: async () =>
    (
      await exec(
        '/usr/bin/mdfind',
        ['kMDItemCFBundleIdentifier == "com.superlogical.rex"'],
        { message: 'Rex discovery unavailable' },
      )
    )
      .trim()
      .split('\n')
      .filter(Boolean),
};

/** Explicit override, unique Spotlight match, then known Beta/release locations. */
export async function discoverRex(
  override?: string,
  probe: PathProbe = defaults,
): Promise<RexInstallation> {
  const valid = (file: string) =>
    path.isAbsolute(file) &&
    !/[\x00-\x1f\x7f]/.test(file) &&
    probe.exists(file);
  const installation = (binary: string): RexInstallation => {
    const marker = binary.indexOf('.app/');
    if (marker < 0) throw Error('Rex application unavailable');
    return { binary, application: binary.slice(0, marker + 4) };
  };
  if (override !== undefined && override !== '') {
    if (!valid(override)) throw Error('Configured Rex binary unavailable');
    return installation(override);
  }
  let matches: string[] = [];
  try {
    matches = [
      ...new Set(
        (await probe.spotlight())
          .map((app) => path.join(app, helper))
          .filter(valid),
      ),
    ];
  } catch {}
  if (matches.length > 1) throw Error('Rex installation ambiguous');
  if (matches.length === 1) return installation(matches[0]!);
  for (const base of ['/Applications', path.join(probe.home, 'Applications')]) {
    for (const name of ['Rex Beta.app', 'Rex.app']) {
      const binary = path.join(base, name, helper);
      if (valid(binary)) return installation(binary);
    }
  }
  throw Error('Rex not found; set its binary path');
}
