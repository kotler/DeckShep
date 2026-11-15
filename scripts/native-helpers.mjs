import path from 'node:path';
import { checked } from './process.mjs';

export const helperNames = [
  'visible-pane',
  'herdr-app-peer',
  'codex-hook-process',
];

/** Verify each slice separately: lipo accepts only one -verify_arch per call. */
export function verifyNativeHelpers(directory, run = checked) {
  for (const name of helperNames) {
    const file = path.join(directory, name);
    for (const architecture of ['arm64', 'x86_64'])
      run('lipo', [file, '-verify_arch', architecture], {
        capture: true,
        message: 'Universal helper verification failed',
      });
    run('codesign', ['--verify', '--strict', file], {
      capture: true,
      message: 'Helper signature verification failed',
    });
  }
}
