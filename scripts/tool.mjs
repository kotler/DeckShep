import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(new URL('../tools/package.json', import.meta.url));
const [name, ...args] = process.argv.slice(2);
if (!name) throw Error('Tool name required');
let file;
try { file = require.resolve(name + '/package.json'); } catch {
  file = (require.resolve.paths(name) || []).map(directory => path.join(directory, name, 'package.json')).find(file => fs.existsSync(file));
  if (!file) throw Error('Tool metadata unavailable');
}
const metadata = require(file);
const bin = typeof metadata.bin === 'string' ? metadata.bin : Object.values(metadata.bin)[0];
const result = spawnSync(process.execPath, [path.resolve(path.dirname(file), bin), ...args], { stdio: 'inherit' });
if (result.error) throw Error('Development tool unavailable');
process.exitCode = result.status ?? 1;
