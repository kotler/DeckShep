import { z } from 'zod';
import { exec } from '../../platform/exec';
import { parse } from '../../schemas';

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const reportSchema = z.object({
  api_revision: revision.optional(),
  api_min_revision: revision.optional(),
});
export interface RexApiInfo {
  revision: number;
  minimum: number;
  legacy: boolean;
}

/** Explicit diagnostics only. Identity, location and log_path from whoami are
 * discarded; these numbers never grant a terminal/provider capability. */
export async function readRexApi(
  binary: string,
  execute: typeof exec = exec,
): Promise<RexApiInfo> {
  try {
    const output = await execute(
      binary,
      ['--autostart=false', '--timeout', '2s', 'whoami', '--json'],
      {
        timeout: 2500,
        maxBuffer: 16384,
        env: { REX_SERVER: '' },
        message: 'Rex API diagnostics unavailable',
      },
    );
    if (Buffer.byteLength(output) > 16384) throw Error();
    const report = reportSchema.parse(parse('rexResponse', output));
    // Older servers omit revision fields; the documented default is zero.
    const current = report.api_revision ?? 0;
    const minimum = report.api_min_revision ?? 0;
    if (minimum > current) throw Error();
    return {
      revision: current,
      minimum,
      legacy:
        report.api_revision === undefined ||
        report.api_min_revision === undefined,
    };
  } catch {
    throw Error('Rex API diagnostics unavailable');
  }
}
