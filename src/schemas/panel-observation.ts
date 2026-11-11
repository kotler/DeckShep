import { z } from 'zod';

const clean = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[^\x00-\x1f\x7f]+$/);
const pid = z.number().int().min(2).safe();
const generation = z.number().int().nonnegative().safe().optional();
export const panelAddress = z.object({
  session: clean.regex(/^session:[a-f0-9-]{36}$/i),
  block: clean.regex(/^block:[a-f0-9-]{36}$/i),
  // A hook must explicitly name its local endpoint; never discover a default
  // server or use GUI focus when the inherited context is incomplete.
  server: clean.regex(/^unix:\/\/\//).refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'unix:' &&
        !url.host &&
        !url.search &&
        !url.hash &&
        !decodeURIComponent(url.pathname).match(/[\x00-\x1f\x7f]/)
      );
    } catch {
      return false;
    }
  }),
});
export const panelSnapshot = z.object({
  pid,
  userId: z.number().int().nonnegative().safe(),
  name: clean,
  cwd: clean.refine((value) => value.startsWith('/')),
  generation,
});
export const rexPanelProcess = z.object({
  generation,
  foreground: z.object({
    pid,
    user_id: panelSnapshot.shape.userId,
    name: clean,
    cwd: panelSnapshot.shape.cwd,
  }),
});
