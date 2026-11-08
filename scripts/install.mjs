import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tree } from './archive.mjs';
import { profile, PROFILE_IDS } from './profiles.mjs';
export function requireStopped(status) {
  if (status === 0)
    throw Error(
      'Quit Stream Deck first. Leave Rex, Herdr and your agents running.',
    );
  if (status !== 1)
    throw Error(
      'Could not verify that Stream Deck is stopped; no installation performed.',
    );
}
export function selectDevice(devices, uuid) {
  if (uuid && devices[uuid]) return devices[uuid];
  if (!uuid && Object.keys(devices).length === 1)
    return Object.values(devices)[0];
  throw Error('Choose one existing MK.2 device with --device-uuid');
}
export function mergedConfig(defaults, old) {
  if (
    !defaults ||
    typeof defaults !== 'object' ||
    Array.isArray(defaults) ||
    !old ||
    typeof old !== 'object' ||
    Array.isArray(old)
  )
    throw Error('Invalid upgrade config');
  const config = structuredClone(defaults);
  for (const [key, value] of Object.entries(old)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw Error('Unsafe upgrade config key');
    if (
      ['allowClipboardFocus', 'bringToFront'].includes(key) &&
      typeof value !== 'boolean'
    )
      throw Error('Invalid upgrade consent');
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      config[key] &&
      typeof config[key] === 'object'
    )
      Object.assign(config[key], value);
    else config[key] = value;
  }
  delete config.focusRoutingVerified;
  return config;
}
// Retained as a deliberate upgrade/recovery fallback. It is never called by
// build, package, tests against real HOME, or the normal fresh-install path.
export function installLocal({
  root,
  home = os.homedir(),
  deviceUuid,
  processStatus,
} = {}) {
  requireStopped(
    processStatus ??
      spawnSync('pgrep', ['-f', 'Stream Deck.app/Contents/MacOS'], {
        stdio: 'ignore',
      }).status,
  );
  const base = path.join(
      home,
      'Library/Application Support/com.elgato.StreamDeck',
    ),
    profiles = path.join(base, 'ProfilesV3'),
    devices = {};
  for (const dir of fs.readdirSync(profiles)) {
    const file = path.join(profiles, dir, 'manifest.json');
    if (fs.existsSync(file)) {
      const device = JSON.parse(fs.readFileSync(file)).Device;
      if (device?.Model === '20GBL9901' && device.UUID)
        devices[device.UUID] = device;
    }
  }
  const profileStat = fs.lstatSync(profiles);
  if (
    !profileStat.isDirectory() ||
    profileStat.isSymbolicLink() ||
    profileStat.uid !== process.getuid() ||
    profileStat.mode & 0o022
  )
    throw Error('Unsafe Stream Deck profiles directory');
  const device = selectDevice(devices, deviceUuid),
    source = path.join(root, 'dist/com.local.rexagents.sdPlugin'),
    dest = path.join(base, 'Plugins/com.local.rexagents.sdPlugin');
  tree(source);
  if (
    fs.existsSync(dest) &&
    (!fs.lstatSync(dest).isDirectory() || fs.lstatSync(dest).isSymbolicLink())
  )
    throw Error('Unsafe installed plugin directory');
  for (const name of [
    'manifest.json',
    'bin/visible-pane',
    'bin/plugin.js',
    'claude-hook.js',
    'configure-claude.js',
  ])
    if (!fs.statSync(path.join(source, name)).isFile())
      throw Error('Build plugin first');
  const config = mergedConfig(
    JSON.parse(fs.readFileSync(path.join(source, 'config.json'))),
    fs.existsSync(path.join(dest, 'config.json'))
      ? JSON.parse(fs.readFileSync(path.join(dest, 'config.json')))
      : {},
  );
  const backup = path.join(
    home,
    'Library/Application Support/AgentSwitchboard/backups',
    String(Date.now()) + '-' + process.pid,
  );
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  fs.cpSync(profiles, path.join(backup, 'ProfilesV3'), { recursive: true });
  if (fs.existsSync(dest))
    fs.cpSync(dest, path.join(backup, 'previous-plugin'), { recursive: true });
  console.log('Backup created before installation');
  fs.cpSync(source, dest, { recursive: true });
  fs.writeFileSync(
    path.join(dest, 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
    { mode: 0o600 },
  );
  for (const backend of ['rex', 'herdr'])
    if (
      !fs.existsSync(path.join(profiles, PROFILE_IDS[backend] + '.sdProfile'))
    )
      profile(
        profiles,
        device,
        backend,
        JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'))).Version,
      );
  return { backup, dest };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin')
    throw Error('This installer supports macOS only');
  const index = process.argv.indexOf('--device-uuid');
  installLocal({
    root: fileURLToPath(new URL('..', import.meta.url)),
    deviceUuid: index < 0 ? undefined : process.argv[index + 1],
  });
}
