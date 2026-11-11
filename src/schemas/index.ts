import { z } from 'zod';
import { herdrAppSchemas } from './herdr-app';

// Identity fields never accept terminal escape sequences. Pane text and hook
// prompt payloads deliberately do: their existing digest/UI parsers own them.
export const identifier = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[^\x00-\x1f\x7f]+$/);
export const sessionId = identifier.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const blockId = identifier.regex(
  /^block:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,
);
export const version = identifier.regex(
  /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/,
);
const object = z.record(z.string(), z.unknown());
const bool = z.boolean().optional();
const prompt = z
  .string()
  .min(1)
  .max(4000)
  .regex(/^[^\x00-\x1f\x7f]+$/)
  .refine((s) => !/^\s*[!/]/.test(s));
export const preferencePatch = z
  .object({
    backend: z.enum(['rex', 'herdr']).optional(),
    allowClipboardFocus: bool,
    bringToFront: bool,
    animationEnabled: bool,
    herdrTitleIdentity: bool,
    claudeEnabled: bool,
    herdrSocketPath: z
      .string()
      .max(1024)
      .regex(/^[^\x00-\x1f\x7f]*$/)
      .optional(),
    prompts: z
      .object({
        review: prompt.optional(),
        tests: prompt.optional(),
        continue: prompt.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const settingsV1 = z
  .object({
    version: z.literal(1).optional(),
    preferences: preferencePatch.optional(),
  })
  .passthrough();
export const settingsV2 = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative().safe(),
    shared: preferencePatch.optional(),
    profiles: z
      .object({
        rex: preferencePatch.optional(),
        herdr: preferencePatch.optional(),
      })
      .strict(),
  })
  .passthrough();
export const settingsV3 = settingsV2.extend({
  version: z.literal(3),
  profiles: settingsV2.shape.profiles.extend({
    'herdr-app': z
      .object({
        herdrAppHome: z
          .string()
          .max(1024)
          .regex(/^(?:\/[^\x00-\x1f\x7f]*)?$/)
          .optional(),
        herdrAppCoreSocketPath: z
          .string()
          .max(1024)
          .regex(/^(?:\/[^\x00-\x1f\x7f]*)?$/)
          .optional(),
        herdrAppReadbackEnabled: bool,
        herdrAppFocusRequestEnabled: bool,
        herdrAppInputEnabled: bool,
        claudeEnabled: bool,
      })
      .strict(),
  }),
  experimental: z.object({ herdrApp: z.boolean() }).strict(),
});
export const globalSettings = z.union([settingsV3, settingsV2, settingsV1]);
const herdrAppProfile = settingsV3.shape.profiles.shape['herdr-app'];
const herdrAppPreferencePatch = herdrAppProfile
  .extend({
    backend: z.literal('herdr-app').optional(),
    animationEnabled: bool,
    prompts: preferencePatch.shape.prompts,
  })
  .strict();
export const config = z
  .object({
    backend: z.enum(['rex', 'herdr', 'herdr-app']).optional(),
    herdrApp: z
      .object({
        home: herdrAppProfile.shape.herdrAppHome,
        coreSocketPath: herdrAppProfile.shape.herdrAppCoreSocketPath,
        readbackEnabled: bool,
        focusRequestEnabled: bool,
        inputEnabled: bool,
      })
      .strict()
      .optional(),
    allowClipboardFocus: bool,
    bringToFront: bool,
    herdr: z
      .object({
        socketPath: z
          .string()
          .max(1024)
          .regex(/^[^\x00-\x1f\x7f]*$/)
          .optional(),
        titleIdentity: bool,
      })
      .passthrough()
      .optional(),
    claude: z.object({ enabled: bool }).passthrough().optional(),
    rexPath: z
      .string()
      .max(4096)
      .regex(/^[^\x00-\x1f\x7f]*$/)
      .optional(),
    clientLabel: z
      .string()
      .max(1024)
      .regex(/^[^\x00-\x1f\x7f]*$/)
      .optional(),
    statusMaxAgeMs: z.number().finite().nonnegative().optional(),
    draftMaxAgeMs: z.number().finite().nonnegative().optional(),
    metadataRefreshMs: z.number().finite().nonnegative().optional(),
    daemonControls: z
      .object({ enabled: bool, permissionsEnabled: bool })
      .passthrough()
      .optional(),
    effortKeys: z
      .object({
        increase: identifier.optional(),
        decrease: identifier.optional(),
      })
      .passthrough()
      .optional(),
    sendKeys: z.record(z.string(), identifier).optional(),
    controlVerified: z.record(z.string(), z.boolean()).optional(),
    animation: z
      .object({
        enabled: bool,
        frameMs: z.number().finite().nonnegative().optional(),
        workingPeriodMs: z.number().finite().nonnegative().optional(),
        completePulseMs: z.number().finite().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    palette: z.record(z.string(), identifier).optional(),
    cycles: z
      .object({
        models: z
          .array(z.object({ id: identifier, label: identifier }).passthrough())
          .max(1000)
          .optional(),
        efforts: z.array(identifier).max(1000).optional(),
        autoSetupNewSessions: bool,
      })
      .passthrough()
      .optional(),
    modelDiscovery: z
      .object({
        enabled: bool,
        include: z.array(identifier).max(1000).optional(),
        effortLevels: z.array(identifier).max(1000).optional(),
      })
      .passthrough()
      .optional(),
    appearance: z
      .object({ style: identifier.optional() })
      .passthrough()
      .optional(),
    experimental: z.object({ herdr: bool, herdrApp: bool }).strict().optional(),
    prompts: z.record(z.string(), prompt).optional(),
    aliases: z
      .record(
        z.string(),
        z
          .string()
          .max(1024)
          .regex(/^[^\x00-\x1f\x7f]*$/),
      )
      .optional(),
  })
  .passthrough();
export const rexResponse = z.union([
  object,
  z.array(object),
  z.null(),
  z.boolean(),
  z.string(),
]);
export const visiblePane = z
  .object({ block_id: blockId, clipboard_restored: z.literal(true) })
  .passthrough();
export const herdrFrame = z
  .object({
    id: z.union([z.string().max(128), z.number().int()]),
    result: object.optional(),
    error: z.unknown().optional(),
  })
  .passthrough();
export const daemonFrame = z
  .object({
    id: z.union([z.number().int(), z.string().max(128)]).optional(),
    method: identifier.optional(),
    result: z.unknown().optional(),
    error: z.unknown().optional(),
    params: object.optional(),
  })
  .passthrough();
export const claudePayload = z
  .object({
    session_id: sessionId.optional(),
    cwd: identifier.optional(),
    hook_event_name: identifier.optional(),
    agent_id: identifier.optional(),
  })
  .passthrough();
export const claudeRecord = z
  .object({
    schema: z.literal(1),
    pid: z.number().int().positive(),
    startedAt: identifier,
    version,
    cwd: identifier,
    sessionId,
    generation: identifier,
    turnId: identifier,
    state: z.enum(['idle', 'working', 'done', 'error', 'blocked', 'unknown']),
    updatedAt: z.number().finite(),
    requestId: identifier.nullish(),
  })
  .passthrough();
export const claudeSettings = z
  .object({ hooks: object.optional(), statusLine: object.optional() })
  .passthrough();
export const setupRecord = z
  .object({
    schema: z.literal(1),
    commands: z.object({ hook: identifier, status: identifier }),
    active: bool,
  })
  .passthrough();
export const modelCatalog = z
  .object({ models: z.array(object).max(10000) })
  .passthrough();
export const hostEvent = z
  .object({
    event: identifier,
    context: identifier.optional(),
    payload: object.optional(),
  })
  .passthrough();
export const schemas = {
  ...herdrAppSchemas,
  herdrAppProfile,
  herdrAppPreferencePatch,
  config,
  globalSettings,
  rexResponse,
  visiblePane,
  herdrFrame,
  daemonFrame,
  claudePayload,
  claudeRecord,
  claudeSettings,
  setupRecord,
  modelCatalog,
  hostEvent,
  registry: object,
};
export type Boundary = keyof typeof schemas;

// Bound the tree before invoking recursive validators. Reject pollution keys
// even in passthrough records; never include received data in an error.
function bounded(value: unknown): void {
  const pending: [unknown, number][] = [[value, 0]];
  let count = 0;
  while (pending.length) {
    const [item, depth] = pending.pop()!;
    if (++count > 100000 || depth > 40)
      throw Error('External data exceeds limits');
    if (typeof item === 'string' && item.length > 4e6)
      throw Error('External data exceeds limits');
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (
          ['__proto__', 'prototype', 'constructor'].includes(key) ||
          /[\x00-\x1f\x7f]/.test(key)
        )
          throw Error('Invalid external data');
        pending.push([child, depth + 1]);
      }
    }
  }
}
export function validate<K extends Boundary>(
  name: K,
  value: unknown,
): z.infer<(typeof schemas)[K]> {
  try {
    bounded(value);
    return schemas[name].parse(value) as z.infer<(typeof schemas)[K]>;
  } catch {
    throw Error('Invalid ' + name + ' data');
  }
}
export function parse<K extends Boundary>(
  name: K,
  input: string | Buffer,
): z.infer<(typeof schemas)[K]> {
  if (input.length > 4e6) throw Error('External data exceeds limits');
  let value: unknown;
  try {
    value = JSON.parse(input.toString());
  } catch {
    throw Error('Invalid ' + name + ' JSON');
  }
  return validate(name, value);
}
