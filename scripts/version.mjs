import fs from 'node:fs';
const files = [
  'package.json',
  'com.kotl3r.deckshep.sdPlugin/package.json',
  'package-lock.json',
  'com.kotl3r.deckshep.sdPlugin/package-lock.json',
  'com.kotl3r.deckshep.sdPlugin/manifest.json',
];
const read = (file) => JSON.parse(fs.readFileSync(file));
export function checkVersions() {
  const [root, plugin, lock, pluginLock, manifest] = files.map(read),
    version = root.version;
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    plugin.version !== version ||
    lock.version !== version ||
    lock.packages[''].version !== version ||
    lock.packages['com.kotl3r.deckshep.sdPlugin'].version !== version ||
    pluginLock.version !== version ||
    pluginLock.packages[''].version !== version ||
    manifest.Version !== version + '.0'
  )
    throw Error('Version identity mismatch');
  return version;
}
if (process.argv.includes('--check'))
  console.log('Version identity: ' + checkVersions());
else {
  const value = process.argv[2] || read(files[0]).version;
  if (!/^\d+\.\d+\.\d+$/.test(value))
    throw Error('Use x.y.z; beta.N belongs to the release tag');
  for (const file of files) {
    const data = read(file);
    if (file.endsWith('manifest.json')) data.Version = value + '.0';
    else {
      data.version = value;
      if (data.packages) {
        data.packages[''].version = value;
        if (data.packages['com.kotl3r.deckshep.sdPlugin'])
          data.packages['com.kotl3r.deckshep.sdPlugin'].version = value;
      }
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
  checkVersions();
  console.log('Synchronized root, manifest, plugin and lockfile versions');
}
