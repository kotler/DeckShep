import path from 'node:path';
import { z } from 'zod';
import { exec } from '../../platform/exec';
import { pluginDirectory } from '../../platform/paths';
import { processIdentity, type ProcessIdentity } from './hook-contract';

type ProcessFact = ProcessIdentity & { parent: number; codex: boolean };
export async function inspectProcess(
  pid: number,
  execute: typeof exec = exec,
): Promise<ProcessFact> {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    throw Error('Codex process unavailable');
  const output = await execute(
    path.join(pluginDirectory, 'bin', 'codex-hook-process'),
    [String(pid)],
    {
      timeout: 1500,
      maxBuffer: 4096,
      message: 'Codex process unavailable',
    },
  );
  const fact = processIdentity
    .extend({
      parent: z.number().int().nonnegative().safe(),
      codex: z.boolean(),
      startedAt: z.string().regex(/^\d+\.\d{6}$/),
    })
    .strict()
    .parse(JSON.parse(output));
  if (fact.pid !== pid) throw Error('Codex process replaced');
  return fact;
}

export async function hookOwner(
  parent: number,
  inspect = inspectProcess,
): Promise<ProcessFact> {
  const seen = new Set<number>();
  for (let depth = 0; depth < 8 && parent > 1; depth++) {
    if (seen.has(parent)) break;
    seen.add(parent);
    const fact = await inspect(parent);
    if (fact.codex) return fact;
    parent = fact.parent;
  }
  throw Error('No Codex hook ancestor');
}

export function sameProcess(
  left: ProcessIdentity,
  right: ProcessIdentity,
): boolean {
  return (
    left.pid === right.pid &&
    left.startedAt === right.startedAt &&
    left.image === right.image
  );
}
