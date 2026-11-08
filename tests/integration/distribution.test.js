'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
let modules;
async function api() { return modules ??= Promise.all([import('../../scripts/archive.mjs'), import('../../scripts/audit.mjs'), import('../../scripts/profiles.mjs'), import('../../scripts/install.mjs')]); }
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asw-distribution-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
function json(data) { return Buffer.from(JSON.stringify(data)); }
async function installerFiles(t) {
  const [Z, A, P] = await api(), directory = temporary(t), version = '1.3.4', prefix = A.PLUGIN + '/';
  const manifest = { ...require('../../com.local.rexagents.sdPlugin/manifest.json'), Version: version + '.0', CodePath: 'bin/plugin.js', Profiles: ['rex', 'herdr'].map(backend => ({ Name: 'profiles/' + P.PROFILE_NAMES[backend], DeviceType: 0, Readonly: false, DontAutoSwitchWhenInstalled: true, AutoInstall: true })) };
  const files = new Map(Object.entries({ 'manifest.json': json(manifest), 'package.json': json({ version }), 'package-lock.json': json({ version, packages: { '': { version } } }), 'config.json': json({ backend: 'rex', allowClipboardFocus: false, herdr: { socketPath: '', titleIdentity: false } }), 'bin/visible-pane': Buffer.from('fixture'), 'bin/plugin.js': Buffer.from('fixture'), 'bin/doctor.js': Buffer.from('fixture'), 'claude-hook.js': Buffer.from('fixture'), 'configure-claude.js': Buffer.from('fixture'), 'inspector.html': Buffer.from('fixture'), 'inspector.js': Buffer.from('fixture'), 'sdpi-components.js': Buffer.from('fixture') }).map(([name, data]) => [prefix + name, data]));
  for (const backend of ['rex', 'herdr']) files.set(prefix + 'profiles/' + P.PROFILE_NAMES[backend] + '.streamDeckProfile', P.profileArchive(directory, backend, manifest.Version));
  return { files, Z, A, P, prefix, version };
}
test('archive rejects private paths, home data, traversal, symlinks, duplicates, corruption and malformed headers', async () => {
  const [Z, A] = await api();
  for (const [name, data] of [['x/state/cache.json', '{}'], ['x/.env.local', 'secret'], ['x/debug.log', ''], ['README.md', os.homedir()], ['x/node_modules/a', 'fixture']]) assert.throws(() => A.auditArchive(Z.zip(new Map([[name, data]]))));
  for (const name of ['../outside', '/absolute', 'C:/absolute', 'x\\file', 'x//file', 'x/./file', 'x/\0file']) assert.throws(() => Z.zip(new Map([[name, '']])));
  const valid = Z.zip(new Map([['one', 'fixture'], ['two', 'fixture']]));
  const duplicate = Buffer.from(valid); for (let offset = 0; (offset = duplicate.indexOf('two', offset)) >= 0; offset += 3) duplicate.write('one', offset); assert.throws(() => Z.unzip(duplicate), /duplicate/);
  const symlink = Buffer.from(valid), central = symlink.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); symlink.writeUInt32LE((0o120777 << 16) >>> 0, central + 38); assert.throws(() => Z.unzip(symlink), /Unsafe/);
  const corrupt = Buffer.from(valid); corrupt[33] ^= 1; assert.throws(() => Z.unzip(corrupt)); assert.throws(() => Z.unzip(Buffer.from('not zip')));
});
test('installer requires safe defaults, exact entry points, profiles and consistent versions', async t => {
  const { files, Z, A, prefix } = await installerFiles(t);
  assert.equal(A.auditInstaller(Z.zip(files)).Version, '1.3.4.0');
  for (const replacement of [{ allowClipboardFocus: true }, { backend: 'herdr' }, { claude: { enabled: true } }, { herdr: { socketPath: '/tmp/private.sock', titleIdentity: true } }, { experimental: { herdrApp: true } }]) {
    const changed = new Map(files), config = { backend: 'rex', allowClipboardFocus: false, herdr: { socketPath: '', titleIdentity: false }, ...replacement }; changed.set(prefix + 'config.json', json(config)); assert.throws(() => A.auditInstaller(Z.zip(changed)));
  }
  const changed = new Map(files); changed.set(prefix + 'package.json', json({ version: '1.3.3' })); assert.throws(() => A.auditInstaller(Z.zip(changed)));
  changed.delete(prefix + 'claude-hook.js'); assert.throws(() => A.auditInstaller(Z.zip(changed)));
});
test('generic profiles preserve legacy IDs, all UUID5 ActionIDs, version, scope and device binding', async t => {
  const [Z, A, P] = await api(), root = temporary(t), ids = [];
  // Values captured from Python uuid.uuid5(NAMESPACE_URL, ...) at the baseline.
  assert.equal(P.actionId(0, 'rex'), 'cf7a6a4f-daeb-5c7f-bd30-2113bb13ffaf');
  for (const backend of ['rex', 'herdr']) {
    const directory = P.profile(root, P.deviceTemplate, backend, '1.3.4.0'), data = () => Z.zip(Z.tree(directory, path.basename(directory) + '/'));
    A.auditProfile(data(), '1.3.4.0', backend); assert.throws(() => A.auditProfile(data(), '0.0.0.0', backend)); assert.throws(() => A.auditProfile(data(), '1.3.4.0', backend === 'rex' ? 'herdr' : 'rex'));
    const file = path.join(directory, 'Profiles', P.PAGE_IDS[backend], 'manifest.json'), page = JSON.parse(fs.readFileSync(file)); ids.push(...Object.values(page.Controllers[0].Actions).map(a => a.ActionID));
    page.Controllers[0].Actions['0,0'].Settings.profileScope = 'wrong'; fs.writeFileSync(file, JSON.stringify(page)); assert.throws(() => A.auditProfile(data(), '1.3.4.0', backend));
    P.profile(root, { Model: '20GBL9901', UUID: 'PRIVATE_DEVICE' }, backend, '1.3.4.0'); assert.throws(() => A.auditProfile(data(), '1.3.4.0', backend));
  }
  assert.equal(new Set(ids).size, 30);
});
test('upgrade in temporary HOME adds Herdr and bundled entries without changing customized Rex keys, config or Claude hook records', async t => {
  const [Z, A, P, I] = await api(), root = temporary(t), home = path.join(root, 'home'), base = path.join(home, 'Library/Application Support/com.elgato.StreamDeck'), profiles = path.join(base, 'ProfilesV3'), existing = P.profile(profiles, { Model: '20GBL9901', UUID: 'device' }, 'rex', '1.3.4.0'), page = path.join(existing, 'Profiles', P.PAGE_IDS.rex, 'manifest.json');
  fs.writeFileSync(page, '{"customized":"preserve exactly"}'); const before = Z.tree(existing);
  const dest = path.join(base, 'Plugins', A.PLUGIN); fs.mkdirSync(path.join(dest, 'state'), { recursive: true }); fs.writeFileSync(path.join(dest, 'config.json'), JSON.stringify({ allowClipboardFocus: true, prompts: { review: 'custom' } })); fs.writeFileSync(path.join(dest, 'state/claude-setup.json'), '{"owned":"preserve"}');
  const source = path.join(root, 'checkout/dist', A.PLUGIN); fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
  for (const name of ['manifest.json', 'bin/visible-pane', 'bin/plugin.js', 'claude-hook.js', 'configure-claude.js']) fs.writeFileSync(path.join(source, name), name === 'manifest.json' ? '{"Version":"1.3.4.0"}' : 'fixture');
  fs.writeFileSync(path.join(source, 'config.json'), JSON.stringify({ allowClipboardFocus: false, prompts: { review: 'default', tests: 'test' } }));
  const result = I.installLocal({ root: path.join(root, 'checkout'), home, processStatus: 1 });
  assert.deepEqual(Z.tree(existing), before); const config = JSON.parse(fs.readFileSync(path.join(dest, 'config.json'))); assert.equal(config.allowClipboardFocus, true); assert.deepEqual(config.prompts, { review: 'custom', tests: 'test' });
  assert.equal(fs.readFileSync(path.join(dest, 'state/claude-setup.json'), 'utf8'), '{"owned":"preserve"}'); assert(fs.existsSync(path.join(dest, 'claude-hook.js'))); assert(fs.existsSync(path.join(profiles, P.PROFILE_IDS.herdr + '.sdProfile'))); assert(fs.existsSync(result.backup)); assert(!fs.existsSync(path.join(root, 'checkout/backups')));
});
test('bundle rejects missing files and modified checksums', async () => {
  const [Z, A] = await api(); assert.throws(() => A.verifyBundle(Z.zip(new Map([['SHA256SUMS', '']]))));
  const files = new Map(A.PAYLOAD.map(name => [name, Buffer.from('fixture')])); const sums = [...files].map(([name, data]) => A.digest(data) + '  ' + name + '\n').join(''); files.set('README.md', Buffer.from('changed')); files.set('SHA256SUMS', Buffer.from(sums)); assert.throws(() => A.verifyBundle(Z.zip(files)), /Checksum mismatch/);
});
test('unknown Stream Deck process state blocks installation', async () => {
  const [, , , I] = await api(); I.requireStopped(1); for (const status of [0, 2, 3, -1, null]) assert.throws(() => I.requireStopped(status));
});
test('upgrade merges customization and adds defaults while dropping obsolete focus authority', async () => {
  const [, , , I] = await api(), defaults = { allowClipboardFocus: false, herdr: { socketPath: '', titleIdentity: false }, prompts: { review: 'default', tests: 'test' } }, old = { allowClipboardFocus: true, herdr: { socketPath: '/tmp/local.sock' }, prompts: { review: 'custom' }, focusRoutingVerified: true }, result = I.mergedConfig(defaults, old);
  assert.equal(result.allowClipboardFocus, true); assert.deepEqual(result.herdr, { socketPath: '/tmp/local.sock', titleIdentity: false }); assert.deepEqual(result.prompts, { review: 'custom', tests: 'test' }); assert(!('focusRoutingVerified' in result)); assert.equal(defaults.allowClipboardFocus, false); assert.equal(I.mergedConfig(defaults, {}).allowClipboardFocus, false);
});
test('device choice refuses missing or ambiguous targets', async () => {
  const [, , , I] = await api(), devices = { A: { UUID: 'A' }, B: { UUID: 'B' } }; assert.deepEqual(I.selectDevice({ A: devices.A }), devices.A); assert.deepEqual(I.selectDevice(devices, 'B'), devices.B);
  for (const [candidates, choice] of [[{}, undefined], [devices, undefined], [devices, 'C']]) assert.throws(() => I.selectDevice(candidates, choice));
});
test('streaming ZIP64 entry sizes are bounded and verified before decompression', async () => {
  const [Z] = await api(), original = Z.zip(new Map([['fixture', 'payload']]));
  const end = original.length - 22, central = original.readUInt32LE(end + 16), header = Buffer.from(original.subarray(central, end)), extra = Buffer.alloc(20);
  extra.writeUInt16LE(1); extra.writeUInt16LE(16, 2); extra.writeBigUInt64LE(BigInt(header.readUInt32LE(24)), 4); extra.writeBigUInt64LE(BigInt(header.readUInt32LE(20)), 12);
  header.writeUInt32LE(0xffffffff, 20); header.writeUInt32LE(0xffffffff, 24); header.writeUInt16LE(20, 30);
  const footer = Buffer.from(original.subarray(end)); footer.writeUInt32LE(header.length + extra.length, 12);
  const archive = Buffer.concat([original.subarray(0, central), header, extra, footer]);
  assert.equal(Z.unzip(archive).get('fixture').toString(), 'payload');
  const tooLarge = Buffer.from(archive); tooLarge.writeBigUInt64LE(129000000n, central + header.length + 4); assert.throws(() => Z.unzip(tooLarge), /Unsafe/);
  const truncated = Buffer.from(archive); truncated.writeUInt16LE(8, central + header.length + 2); assert.throws(() => Z.unzip(truncated), /Truncated/);
});
