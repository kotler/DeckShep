import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { bundle } from './bundle.mjs';
const directory = path.resolve('dist/test-bundle'); fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'controller.cjs');
try {
  await bundle(path.resolve('src/app/controller.ts'), file);
  const child = spawn(process.execPath, ['--require', 'tsx/cjs', '--test', 'tests/integration/golden.test.js'], { stdio: 'inherit', env: { ...process.env, ASW_CONTROLLER_BUNDLE: file } });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code ?? 1)); });
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
