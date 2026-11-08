#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pluginDirectory } from '../../platform/paths';
import { parse } from '../../schemas';
const state = require('./state');
interface SetupRecord {
  active?: boolean;
  commands: { hook: string; status: string };
  originalStatusLine?: { command?: string };
}
interface HookPorts {
  input: AsyncIterable<Uint8Array>;
  statusline: boolean;
  readSetup(): SetupRecord;
  record(
    data: unknown,
    options: { statusline: boolean; beforeCommit: () => void },
  ): Promise<unknown>;
  invalidate(): Promise<unknown>;
  chain(command: string, input: Buffer): Promise<void>;
  write(value: string): void;
}
/** CLI hooks are authorized by their private setup record, never by a payload.
 * Recheck immediately before metadata commit so removal wins over in-flight
 * hooks. Errors never propagate received data into Claude or plugin logs. */
export async function runHook(ports: HookPorts): Promise<void> {
  let saved: SetupRecord;
  try {
    saved = ports.readSetup();
    if (saved.active !== true) return;
  } catch {
    return;
  }
  const authorize = () => {
    const current = ports.readSetup();
    if (
      current.active !== true ||
      current.commands.hook !== saved.commands.hook ||
      current.commands.status !== saved.commands.status
    )
      throw Error('Integration changed');
  };
  const lost = async () => {
    if (!ports.statusline)
      try {
        authorize();
        await ports.invalidate();
      } catch {}
  };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of ports.input) {
    size += chunk.length;
    if (size > 1048576) {
      await lost();
      return;
    }
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  let data: ReturnType<typeof parse<'claudePayload'>>;
  try {
    data = parse('claudePayload', input);
  } catch {
    await lost();
    return;
  }
  try {
    await ports.record(data, {
      statusline: ports.statusline,
      beforeCommit: authorize,
    });
  } catch {}
  if (!ports.statusline) return;
  try {
    authorize();
    if (saved.originalStatusLine?.command)
      await ports.chain(saved.originalStatusLine.command, input);
    else
      ports.write(
        'Claude ' +
          (state.text((data.model as { display_name?: unknown })?.display_name)
            ? (data.model as { display_name: string }).display_name
            : '') +
          (state.text((data.effort as { level?: unknown })?.level)
            ? ' · ' + (data.effort as { level: string }).level
            : ''),
      );
  } catch {}
}
async function chain(command: string, input: Buffer): Promise<void> {
  const child = spawn('/bin/sh', ['-c', command], {
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  child.stdout.pipe(process.stdout);
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const timer = setTimeout(() => child.kill(), 2500);
  try {
    await new Promise((resolve) => {
      child.on('error', resolve);
      child.on('close', resolve);
    });
  } finally {
    clearTimeout(timer);
  }
}
async function main(): Promise<void> {
  await runHook({
    input: process.stdin,
    statusline: process.argv.includes('--statusline'),
    readSetup: () =>
      parse(
        'setupRecord',
        fs.readFileSync(path.join(pluginDirectory, 'state/claude-setup.json')),
      ) as SetupRecord,
    record: state.record,
    invalidate: state.invalidate,
    chain,
    write: (value) => {
      process.stdout.write(value);
    },
  });
}
if (require.main === module) void main().catch(() => {});
module.exports = { main, runHook };
