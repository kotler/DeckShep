import fs from 'node:fs';
import path from 'node:path';
import { build, root, run } from './build.mjs';
// Explicit developer command only. It restarts this plugin UUID, never Stream
// Deck itself or any Rex/Herdr/agent process. Build/package never call this file.
let active = false,
  again = false;
async function rebuild() {
  if (active) {
    again = true;
    return;
  }
  active = true;
  try {
    const directory = await build();
    run(process.execPath, [
      'scripts/tool.mjs',
      '@elgato/cli',
      'link',
      directory,
      '--no-update-check',
    ]);
    run(process.execPath, [
      'scripts/tool.mjs',
      '@elgato/cli',
      'restart',
      'com.kotl3r.deckshep',
      '--no-update-check',
    ]);
  } catch {
    console.error('Development build/link failed');
  } finally {
    active = false;
    if (again) {
      again = false;
      void rebuild();
    }
  }
}
await rebuild();
let timer;
for (const name of ['src', 'native', 'com.kotl3r.deckshep.sdPlugin'])
  fs.watch(path.join(root, name), { recursive: true }, (_event, filename) => {
    if (
      !filename ||
      /(?:^|\/)(?:bin|node_modules|state)(?:\/|$)/.test(filename) ||
      /(?:claude-hook|configure-claude|codex-hook|configure-codex|inspector|preferences)\.js$/.test(
        filename,
      )
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild();
    }, 250);
  });
