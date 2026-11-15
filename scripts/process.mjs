import { spawnSync } from 'node:child_process';

/** Contains only the caller's fixed stage label, never child output. */
export class CommandFailure extends Error {}

/** A failed prerequisite stops the caller. Child output and arguments never
 * become an exception message (they can contain credentials or local paths). */
export function checked(file, args, options = {}, invoke = spawnSync) {
  const { capture = false, message = 'Command failed', ...rest } = options;
  const result = invoke(file, args, {
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 2 * 1024 * 1024,
    stdio: capture ? 'pipe' : ['ignore', 'inherit', 'inherit'],
    ...rest,
    shell: false,
  });
  if (result.error || result.status !== 0) throw new CommandFailure(message);
  return capture ? result.stdout : '';
}
