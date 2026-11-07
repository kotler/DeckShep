import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));

export function clean(root = repository) {
  const targets = ['dist', 'coverage'].map((name) => path.join(root, name));
  // Validate the entire set before deleting anything. Never follow a replaced
  // output directory, and never include private recovery backups in cleanup.
  for (const target of targets) {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) {
      throw Error('Refusing to clean a symlinked output directory');
    }
  }
  for (const target of targets)
    fs.rmSync(target, { recursive: true, force: true });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length > 2) {
    throw Error(
      'Usage: npm run clean (removes dist/ and coverage/; keeps backups)',
    );
  }
  clean();
}
