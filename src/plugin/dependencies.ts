import fs from 'node:fs';
import path from 'node:path';
import { pluginDirectory } from '../platform/paths';
import { parse } from '../schemas';
/** Production composition. Tests replace this module at bundle time; shipped
 * code has no environment variable or message that enables fixture delivery. */
export function applicationDependencies(): Record<string, unknown> {
  const config = parse('config', fs.readFileSync(path.join(pluginDirectory, 'config.json')));
  return { experimentalHerdrApp: config.experimental?.herdrApp === true };
}
