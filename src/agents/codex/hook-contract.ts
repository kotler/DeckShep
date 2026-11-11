import { z } from 'zod';
import { createHash } from 'node:crypto';
import { PANEL_OBSERVATION_PHASES } from '../../domain/panel-observation';

const clean = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[^\x00-\x1f\x7f]+$/);
export const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const digest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export const hookEvents = [
  'SessionStart',
  'UserPromptSubmit',
  'SessionEnd',
] as const;
// Strip all prompt, transcript and tool fields immediately at the boundary.
export const hookInput = z.object({
  session_id: uuid,
  cwd: clean.refine((value) => value.startsWith('/')),
  hook_event_name: z.enum(hookEvents),
  agent_id: z.never().optional(),
  agent_type: z.never().optional(),
  subagent: z.never().optional(),
});
export const processIdentity = z.object({
  pid: z.number().int().positive().safe(),
  startedAt: clean,
  image: z.string().regex(/^[a-f0-9]{64}$/),
});
export const setupRecord = z.object({
  schema: z.literal(1),
  active: z.boolean(),
  epoch: uuid,
  command: clean,
  hooksFile: clean,
});
export const panelObservation = z.object({
  schema: z.literal(1),
  controlAuthority: z.literal(false),
  process: processIdentity,
  serverHash: z.string().regex(/^[a-f0-9]{64}$/),
  originEvidence: z.enum(['reporter-is-foreground', 'unverified']),
  generation: z.number().int().nonnegative().safe().optional(),
  at: z.number().int().nonnegative().safe(),
});
export const hookPanelRecord = panelObservation.extend({
  hookEpoch: uuid,
  setupEpoch: uuid,
  threadId: uuid,
  session: clean.regex(/^session:[a-f0-9-]{36}$/i),
  block: clean.regex(/^block:[a-f0-9-]{36}$/i),
  reporter: processIdentity,
});
export const hookPanelStatus = hookPanelRecord
  .omit({
    process: true,
    serverHash: true,
    originEvidence: true,
    generation: true,
  })
  .extend({
    outcome: z.enum(['pending', 'unavailable', 'observed']),
    phase: z.enum(PANEL_OBSERVATION_PHASES),
    hasServerEnvironment: z.boolean(),
    validLocalContext: z.boolean(),
  });
export const hookRecord = z.object({
  schema: z.literal(1),
  setupEpoch: uuid,
  epoch: uuid,
  threadId: uuid,
  owner: processIdentity,
  session: clean.regex(/^session:[a-f0-9-]{36}$/i),
  block: clean.regex(/^block:[a-f0-9-]{36}$/i),
  cwdHash: z.string().regex(/^[a-f0-9]{64}$/),
  ended: z.boolean(),
  at: z.number().int().nonnegative().safe(),
});
export type CodexPanelObservation = z.infer<typeof panelObservation>;
export type ProcessIdentity = z.infer<typeof processIdentity>;
export type CodexHookRecord = z.infer<typeof hookRecord>;
export type CodexHookSetup = z.infer<typeof setupRecord>;
