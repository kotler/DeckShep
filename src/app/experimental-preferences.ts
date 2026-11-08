import { validate } from '../schemas';
import type { Config, HerdrAppPreferences, Preferences } from '../domain/types';
const legacy = require('./preferences');
export interface PreferencesV3 extends Omit<
  Preferences,
  'version' | 'profiles'
> {
  version: 3;
  profiles: Preferences['profiles'] & { 'herdr-app': HerdrAppPreferences };
  experimental: { herdrApp: boolean };
}
function appProfile(input: unknown): HerdrAppPreferences {
  return {
    herdrAppReadbackEnabled: false,
    herdrAppFocusRequestEnabled: false,
    herdrAppInputEnabled: false,
    claudeEnabled: false,
    ...validate('herdrAppProfile', input),
  };
}
export function migrateV3(input: unknown): PreferencesV3 {
  if ((input as { version?: unknown })?.version !== 3) {
    const value = legacy.store(input) as Preferences;
    return {
      ...value,
      version: 3,
      profiles: { ...value.profiles, 'herdr-app': appProfile({}) },
      experimental: { herdrApp: false },
    };
  }
  const record = validate('registry', input);
  if (
    !record.profiles ||
    typeof record.profiles !== 'object' ||
    Array.isArray(record.profiles) ||
    !record.experimental ||
    typeof record.experimental !== 'object'
  )
    throw Error('Invalid experimental preferences');
  const profiles = record.profiles as Record<string, unknown>,
    experimental = record.experimental as Record<string, unknown>;
  if (
    Object.keys(profiles).some(
      (key) => !['rex', 'herdr', 'herdr-app'].includes(key),
    ) ||
    !Object.hasOwn(profiles, 'herdr-app') ||
    typeof experimental.herdrApp !== 'boolean' ||
    Object.keys(experimental).some((key) => key !== 'herdrApp')
  )
    throw Error('Invalid experimental preferences');
  const v2 = legacy.store({
    ...record,
    version: 2,
    profiles: { rex: profiles.rex, herdr: profiles.herdr },
  }) as Preferences;
  return {
    ...v2,
    version: 3,
    profiles: {
      ...v2.profiles,
      'herdr-app': appProfile(profiles['herdr-app']),
    },
    experimental: { herdrApp: experimental.herdrApp },
  };
}
/** The v2 projection is explicit; App settings can never become Rex/TUI consent. */
export function rollbackV2(input: unknown): Preferences {
  const value = migrateV3(input);
  return {
    version: 2,
    revision: value.revision,
    shared: structuredClone(value.shared),
    profiles: {
      rex: structuredClone(value.profiles.rex),
      herdr: structuredClone(value.profiles.herdr),
    },
  };
}
export function experimentalScope(
  settings: unknown,
  enabled: boolean,
): 'herdr-app' | null {
  return enabled &&
    (settings as { profileScope?: unknown })?.profileScope === 'herdr-app'
    ? 'herdr-app'
    : null;
}
function profileConfig(base: Config, saved: unknown, scope: string): Config {
  if (scope !== 'herdr-app')
    return legacy.profileConfig(base, rollbackV2(saved), scope);
  const value = migrateV3(saved),
    app = value.profiles['herdr-app'];
  const config = legacy.apply(base, value.shared) as Config;
  return {
    ...config,
    backend: 'herdr-app',
    allowClipboardFocus: false,
    bringToFront: false,
    claude: { ...config.claude, enabled: app.claudeEnabled === true },
    herdrApp: {
      home: app.herdrAppHome ?? '',
      coreSocketPath: app.herdrAppCoreSocketPath ?? '',
      readbackEnabled: app.herdrAppReadbackEnabled === true,
      focusRequestEnabled: app.herdrAppFocusRequestEnabled === true,
      inputEnabled: app.herdrAppInputEnabled === true,
    },
  };
}
function update(saved: unknown, scope: string, input: unknown): PreferencesV3 {
  const previous = migrateV3(saved);
  if (scope !== 'herdr-app') {
    const result = migrateV3(legacy.update(rollbackV2(previous), scope, input));
    result.profiles['herdr-app'] = previous.profiles['herdr-app'];
    result.experimental = previous.experimental;
    return result;
  }
  const patch = validate('herdrAppPreferencePatch', input),
    { backend: _backend, animationEnabled, prompts, ...app } = patch;
  if (animationEnabled !== undefined)
    previous.shared.animationEnabled = animationEnabled;
  if (prompts)
    previous.shared.prompts = {
      ...previous.shared.prompts,
      ...legacy.normalize({ prompts }).prompts,
    };
  previous.profiles['herdr-app'] = appProfile({
    ...previous.profiles['herdr-app'],
    ...app,
  });
  previous.revision++;
  return migrateV3(previous);
}
export function preferenceCodec(enabled: boolean): typeof legacy {
  if (!enabled) return legacy;
  return {
    ...legacy,
    store: migrateV3,
    serialize: migrateV3,
    profileConfig,
    update,
    scopeOf: (settings: unknown) =>
      experimentalScope(settings, true) ?? legacy.scopeOf(settings),
    normalize: (input: Record<string, unknown>) =>
      input &&
      (input.backend === 'herdr-app' ||
        Object.keys(input).some((key) => key.startsWith('herdrApp')))
        ? validate('herdrAppPreferencePatch', input)
        : legacy.normalize(input),
    view: (config: Config) =>
      config.backend === 'herdr-app'
        ? {
            ...legacy.view(config),
            herdrAppHome: config.herdrApp?.home ?? '',
            herdrAppCoreSocketPath: config.herdrApp?.coreSocketPath ?? '',
            herdrAppReadbackEnabled: config.herdrApp?.readbackEnabled === true,
            herdrAppFocusRequestEnabled:
              config.herdrApp?.focusRequestEnabled === true,
            herdrAppInputEnabled: config.herdrApp?.inputEnabled === true,
          }
        : legacy.view(config),
  };
}
