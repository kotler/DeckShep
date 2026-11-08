import { validate } from '../schemas';
import type { Preferences } from '../domain/types';
const legacy = require('./preferences');
export interface PreferencesV3 extends Omit<Preferences, 'version' | 'profiles'> {
  version: 3;
  profiles: Preferences['profiles'] & { 'herdr-app': Record<string, never> };
  experimental: { herdrApp: boolean };
}
export function migrateV3(input: unknown): PreferencesV3 {
  if ((input as { version?: unknown })?.version !== 3) {
    const value = legacy.store(input) as Preferences;
    return { ...value, version: 3, profiles: { ...value.profiles, 'herdr-app': {} }, experimental: { herdrApp: false } };
  }
  const record = validate('registry', input);
  if (!record.profiles || typeof record.profiles !== 'object' || Array.isArray(record.profiles) || !record.experimental || typeof record.experimental !== 'object') throw Error('Invalid experimental preferences');
  const profiles = record.profiles as Record<string, unknown>, experimental = record.experimental as Record<string, unknown>;
  if (Object.keys(profiles).some(key => !['rex', 'herdr', 'herdr-app'].includes(key)) || !profiles['herdr-app'] || typeof profiles['herdr-app'] !== 'object' || Array.isArray(profiles['herdr-app']) || Object.keys(profiles['herdr-app']).length || typeof experimental.herdrApp !== 'boolean' || Object.keys(experimental).some(key => key !== 'herdrApp')) throw Error('Invalid experimental preferences');
  const v2 = legacy.store({ ...record, version: 2, profiles: { rex: profiles.rex, herdr: profiles.herdr } }) as Preferences;
  return { ...v2, version: 3, profiles: { ...v2.profiles, 'herdr-app': {} }, experimental: { herdrApp: experimental.herdrApp } };
}
/** Explicit rollback projection; v2's serialized wire shape is unchanged. */
export function rollbackV2(input: unknown): Preferences {
  const value = migrateV3(input);
  return { version: 2, revision: value.revision, shared: structuredClone(value.shared), profiles: { rex: structuredClone(value.profiles.rex), herdr: structuredClone(value.profiles.herdr) } };
}
export function experimentalScope(settings: unknown, enabled: boolean): 'herdr-app' | null {
  return enabled && (settings as { profileScope?: unknown })?.profileScope === 'herdr-app' ? 'herdr-app' : null;
}
export function preferenceCodec(enabled: boolean): typeof legacy {
  if (!enabled) return legacy;
  return { ...legacy,
    store: migrateV3,
    serialize: migrateV3,
    profileConfig: (base: unknown, saved: unknown, scope: string) => legacy.profileConfig(base, rollbackV2(saved), scope),
    update: (saved: unknown, scope: string, patch: unknown) => {
      const previous = migrateV3(saved), result = migrateV3(legacy.update(rollbackV2(previous), scope, patch));
      result.experimental = previous.experimental; return result;
    },
  };
}
