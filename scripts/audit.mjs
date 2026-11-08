import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { unzip, safeName } from './archive.mjs';
import { PROFILE_IDS, PAGE_IDS, PROFILE_NAMES, deviceTemplate, actionId } from './profiles.mjs';
export const root = fileURLToPath(new URL('..', import.meta.url));
export const PLUGIN = 'com.local.rexagents.sdPlugin', INSTALLER = 'com.local.rexagents.streamDeckPlugin';
export const PROFILES = ['Rex Agents.streamDeckProfile', 'Herdr Agents.streamDeckProfile'];
export const DOCS = ['README.md', 'docs/INSTALL.md', 'docs/RELEASING.md', 'docs/UNINSTALL.md', 'docs/CLAUDE.md', 'docs/PROFILES.md', 'docs/BETA-CHECKLIST.md', 'docs/COMPATIBILITY.md', 'docs/RELEASE-NOTES.md', 'docs/HERDR.md', 'THIRD-PARTY-NOTICES.md', 'docs/validation/2026-11-07-beta-checkpoint.md', 'docs/validation/2026-11-06-herdr.md', 'docs/validation/2026-11-07-claude.md'];
export const PAYLOAD = [INSTALLER, ...PROFILES, 'BUILD-INFO.json', ...DOCS];
export const digest = data => createHash('sha256').update(data).digest('hex');
export function auditArchive(data, { home = os.homedir(), workspace = root } = {}) {
  const files = unzip(data);
  for (const [name, bytes] of files) {
    safeName(name);
    if (name.split('/').some(p => ['state', 'backups', '.git', 'config.local.json', '.env', '.DS_Store', 'node_modules'].includes(p) || p.startsWith('.env.') || p.endsWith('.log'))) throw Error('Private/development file in archive');
    if ([home, workspace].some(p => p && bytes.includes(Buffer.from(p)))) throw Error('Local home/workspace path in archive');
  }
  return files;
}
function read(files, name) { if (!files.has(name)) throw Error('Missing distribution file'); return JSON.parse(files.get(name)); }
export function auditInstaller(data) {
  const files = auditArchive(data), prefix = PLUGIN + '/';
  const manifest = read(files, prefix + 'manifest.json'), pkg = read(files, prefix + 'package.json'), lock = read(files, prefix + 'package-lock.json'), config = read(files, prefix + 'config.json');
  if (manifest.UUID !== 'com.local.rexagents' || manifest.Version !== pkg.version + '.0' || lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version || manifest.CodePath !== 'bin/plugin.js') throw Error('Plugin identity/version mismatch');
  if (config.backend !== 'rex' || config.allowClipboardFocus !== false || JSON.stringify(config.herdr) !== JSON.stringify({ socketPath: '', titleIdentity: false }) || config.clientLabel || Object.keys(config.aliases || {}).length || config.focusRoutingVerified || config.claude?.enabled || config.experimental?.herdrApp) throw Error('Package must use fresh Rex defaults with consent and title matching off');
  for (const required of ['bin/visible-pane', 'bin/plugin.js', 'claude-hook.js', 'configure-claude.js', 'bin/doctor.js', 'inspector.html', 'inspector.js', 'sdpi-components.js']) if (!files.has(prefix + required)) throw Error('Missing plugin entry point');
  if (manifest.Profiles?.length !== 2) throw Error('Fresh package must contain only the existing profiles');
  if (manifest.Actions?.length !== 1 || manifest.Actions[0].UUID !== 'com.local.rexagents.key') throw Error('Action identity mismatch');
  for (const [index, backend] of ['rex', 'herdr'].entries()) {
    const profile = manifest.Profiles?.[index];
    if (!profile || profile.Name !== 'profiles/' + PROFILE_NAMES[backend] || profile.DeviceType !== 0 || profile.Readonly !== false || profile.DontAutoSwitchWhenInstalled !== true || profile.AutoInstall !== true) throw Error('Profile registration mismatch');
    auditProfile(files.get(prefix + profile.Name + '.streamDeckProfile'), manifest.Version, backend);
  }
  return manifest;
}
export function auditProfile(data, version, backend = 'rex') {
  const files = auditArchive(data), prefix = PROFILE_IDS[backend] + '.sdProfile/';
  const profile = read(files, prefix + 'manifest.json'), page = read(files, prefix + 'Profiles/' + PAGE_IDS[backend] + '/manifest.json');
  if (profile.Name !== PROFILE_NAMES[backend] || JSON.stringify(profile.Device) !== JSON.stringify(deviceTemplate)) throw Error('Release profile must be an unbound MK.2 template');
  const actions = page.Controllers?.[0]?.Actions;
  if (!actions || Object.keys(actions).length !== 15) throw Error('Release profile must contain all 15 keys');
  for (let i = 0; i < 15; i++) {
    const action = actions[`${i % 5},${Math.floor(i / 5)}`];
    if (!action || action.Plugin.UUID !== 'com.local.rexagents' || action.Plugin.Version !== version || action.UUID !== 'com.local.rexagents.key' || JSON.stringify(action.Settings) !== JSON.stringify({ profileScope: backend }) || action.ActionID !== actionId(i, backend)) throw Error('Profile action/version/default settings mismatch');
  }
}
export function verifyBundle(data) {
  const files = auditArchive(data);
  if (files.size !== PAYLOAD.length + 1 || [...PAYLOAD, 'SHA256SUMS'].some(name => !files.has(name))) throw Error('Unexpected or missing bundle files');
  const checksums = new Map();
  for (const line of files.get('SHA256SUMS').toString().trimEnd().split('\n')) {
    const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
    if (!match || checksums.has(match[2])) throw Error('Invalid or duplicate checksum entry');
    checksums.set(match[2], match[1]);
  }
  if (checksums.size !== PAYLOAD.length || PAYLOAD.some(name => !checksums.has(name))) throw Error('Checksum list does not cover the complete bundle');
  for (const [name, checksum] of checksums) if (digest(files.get(name)) !== checksum) throw Error('Checksum mismatch');
  const manifest = auditInstaller(files.get(INSTALLER));
  for (const [i, backend] of ['rex', 'herdr'].entries()) auditProfile(files.get(PROFILES[i]), manifest.Version, backend);
  const info = read(files, 'BUILD-INFO.json');
  if (info.pluginVersion !== manifest.Version || info.packageVersion + '.0' !== manifest.Version || !/^[a-f0-9]{40}$/.test(info.gitCommit) || typeof info.workingTreeDirty !== 'boolean' || !new RegExp('^v' + info.packageVersion.replaceAll('.', '\\.') + '-beta\\.[1-9][0-9]*$').test(info.tag)) throw Error('Build provenance/version mismatch');
  return info;
}
