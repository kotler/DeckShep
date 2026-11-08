import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tree } from './archive.mjs';
import { bundle } from './bundle.mjs';
import { profileArchive, PROFILE_NAMES } from './profiles.mjs';
export const root = fileURLToPath(new URL('..', import.meta.url));
export const pluginName = 'com.local.rexagents.sdPlugin';
export function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { stdio: 'inherit', cwd: root, ...options });
  if (result.error || result.status !== 0) throw Error('Build command failed: ' + path.basename(binary));
}
export async function build({ universal = false } = {}) {
  if (process.platform !== 'darwin') throw Error('The clipboard helper must be built on macOS');
  const out = path.join(root, 'dist'), source = path.join(root, pluginName), destination = path.join(out, pluginName);
  fs.mkdirSync(out, { recursive: true }); fs.rmSync(destination, { recursive: true, force: true }); fs.mkdirSync(path.join(destination, 'bin'), { recursive: true });
  // Whitelist resources; never copy an installed state directory or dependencies.
  for (const name of ['manifest.json', 'config.json', 'inspector.html', 'icons', 'assets', 'icon.png', 'icon@2x.png', 'action-icon.svg', 'loading.svg']) {
    const resource = path.join(source, name), stat = fs.lstatSync(resource);
    if (stat.isSymbolicLink()) throw Error('Unsafe build resource');
    if (stat.isDirectory()) tree(resource);
    fs.cpSync(resource, path.join(destination, name), { recursive: true, dereference: false });
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
  const metadata = { name: 'rex-agent-switchboard', version, private: true, description: 'Local Stream Deck agent controller' };
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(path.join(destination, 'package-lock.json'), JSON.stringify({ name: metadata.name, version, lockfileVersion: 3, requires: true, packages: { '': metadata } }, null, 2) + '\n');
  const temporary = fs.mkdtempSync(path.join(out, 'helper-build-'));
  try {
    const architectures = universal ? ['arm64', 'x86_64'] : [os.arch() === 'arm64' ? 'arm64' : 'x86_64'];
    for (const architecture of architectures) run('swiftc', ['-O', '-target', architecture + '-apple-macosx13.0', '-module-cache-path', path.join(out, 'swift-cache'), path.join(root, 'native/visible-pane.swift'), '-o', path.join(temporary, architecture)]);
    const helper = path.join(destination, 'bin/visible-pane');
    if (universal) run('lipo', ['-create', ...architectures.map(a => path.join(temporary, a)), '-output', helper]);
    else fs.copyFileSync(path.join(temporary, architectures[0]), helper);
    const identity = process.env.ASW_SIGN_IDENTITY || '-';
    run('codesign', ['--force', '--sign', identity, ...(identity === '-' ? [] : ['--options', 'runtime', '--timestamp']), helper]);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  const entries = [ ['src/plugin/entry.mts', 'bin/plugin.js'], ['src/agents/claude/hook.ts', 'claude-hook.js'], ['src/plugin/configure-entry.ts', 'configure-claude.js'], ['src/inspector/index.ts', 'inspector.js', { browser: true }], ['src/app/preferences.ts', 'preferences.js', { browser: true, name: 'RexPreferences' }], ['src/plugin/doctor-entry.ts', 'bin/doctor.js'] ];
  for (const [entry, output, options] of entries) {
    if (!fs.existsSync(path.join(root, entry))) continue;
    await bundle(path.join(root, entry), path.join(destination, output), options);
    // Stable standalone source-install paths are also generated, never tracked.
    fs.mkdirSync(path.dirname(path.join(source, output)), { recursive: true }); fs.copyFileSync(path.join(destination, output), path.join(source, output));
  }
  fs.copyFileSync(path.join(root, 'vendor/sdpi/sdpi-components.js'), path.join(destination, 'sdpi-components.js'));
  const licenseDirectory = path.join(destination, 'assets/licenses'); fs.mkdirSync(licenseDirectory, { recursive: true });
  fs.copyFileSync(path.join(root, 'vendor/sdpi/LICENSE'), path.join(licenseDirectory, 'sdpi-components.txt'));
  fs.copyFileSync(path.join(root, 'THIRD-PARTY-NOTICES.md'), path.join(destination, 'THIRD-PARTY-NOTICES.md'));
  const require = createRequire(import.meta.url), sdkRequire = createRequire(require.resolve('@elgato/streamdeck'));
  for (const name of ['@elgato/streamdeck', '@elgato/schemas', '@elgato/utils', 'ws', '@iarna/toml', 'zod']) {
    const metadata = [...(require.resolve.paths(name) || []), ...(sdkRequire.resolve.paths(name) || [])].map(base => path.join(base, name, 'package.json')).find(file => fs.existsSync(file));
    if (!metadata) throw Error('Dependency license metadata missing');
    const directory = path.dirname(metadata), license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map(file => path.join(directory, file)).find(file => fs.existsSync(file));
    if (!license) throw Error('Dependency license missing');
    fs.copyFileSync(license, path.join(licenseDirectory, name.replaceAll('/', '-').replace('@', '') + '.txt'));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'manifest.json')));
  manifest.Profiles = [];
  const experimental = JSON.parse(fs.readFileSync(path.join(destination, 'config.json'))).experimental?.herdrApp === true;
  for (const backend of ['rex', 'herdr', ...(experimental ? ['herdr-app'] : [])]) {
    const data = profileArchive(out, backend, manifest.Version), name = PROFILE_NAMES[backend];
    fs.writeFileSync(path.join(out, name + '.streamDeckProfile'), data);
    fs.mkdirSync(path.join(destination, 'profiles'), { recursive: true }); fs.writeFileSync(path.join(destination, 'profiles', name + '.streamDeckProfile'), data);
    manifest.Profiles.push({ Name: 'profiles/' + name, DeviceType: 0, Readonly: false, DontAutoSwitchWhenInstalled: true, AutoInstall: true });
  }
  fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return destination;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await build({ universal: process.argv.includes('--universal') }); console.log('Built plugin, universal option and bundled profiles. Nothing installed.');
}
