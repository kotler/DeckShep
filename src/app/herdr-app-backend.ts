import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Config } from '../domain/types';
import type { AppFocusPort } from '../domain/app-focus-request';
import type { AppFocusAuthority } from '../guards/app-focus-request';
import { pluginDirectory } from '../platform/paths';
import { nativeAppPeerProbe } from '../platform/app-peer';
import { nativeAppPeerSession } from '../platform/app-peer-session';
import { AppPeerVerifier } from '../terminals/herdr-app/peer';
import { publisherCheck } from '../terminals/herdr-app/publisher';
import { GuardedAppFocusSender } from '../terminals/herdr-app/focus-sender';

export interface AppFocusBackendFactory {
  /** Navigation trust policies, including the released publisher rule. */
  readonly recordCount: number;
  helperAvailable(): boolean;
  create(config: Config, authority: AppFocusAuthority): AppFocusPort;
}
/** Fixed plugin-owned path, never a command or path supplied by preferences. */
export function appPeerHelperAvailable(directory = pluginDirectory): boolean {
  try {
    for (const name of ['bin', 'bin/herdr-app-peer']) {
      const stat = fs.lstatSync(path.join(directory, name));
      if (
        stat.isSymbolicLink() ||
        stat.mode & 0o022 ||
        ![0, process.getuid?.()].includes(stat.uid) ||
        (name === 'bin'
          ? !stat.isDirectory()
          : !stat.isFile() || !(stat.mode & 0o111))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
export const appFocusBackend: AppFocusBackendFactory = {
  recordCount: 1,
  helperAvailable: () => appPeerHelperAvailable(),
  create(config, authority) {
    if (!config.herdrApp?.home || !appPeerHelperAvailable())
      throw Error('App unavailable');
    const helper = path.join(pluginDirectory, 'bin/herdr-app-peer');
    return new GuardedAppFocusSender(
      new AppPeerVerifier(
        nativeAppPeerProbe(helper),
        [],
        undefined,
        nativeAppPeerSession(helper),
        publisherCheck(),
      ),
      authority,
      { appHome: config.herdrApp.home },
    );
  },
};
