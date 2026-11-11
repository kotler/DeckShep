import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  hookInput,
  hookRecord,
  hookPanelRecord,
  setupRecord,
  digest,
  type CodexHookRecord,
  type CodexHookSetup,
} from './hook-contract';
import {
  hookDirectory,
  setupFile,
  readPrivate,
  writePrivate,
} from './hook-files';
import { hookOwner, inspectProcess, sameProcess } from './hook-process';
import { observeHookPanel } from './panel-observation';
import { panelStatusWriter } from './panel-status';
import type { PanelProcessReader } from '../../domain/panel-observation';

export interface HookPorts {
  input: AsyncIterable<Uint8Array>;
  environment: NodeJS.ProcessEnv;
  parent: number;
  directory: string;
  setup: string;
  inspect: typeof inspectProcess;
  now(): number;
  readPanel?: PanelProcessReader;
}
async function attachPanelObservation(
  ports: HookPorts,
  record: CodexHookRecord,
  saved: CodexHookSetup,
  cwd: string,
  file: string,
) {
  const readPanel = ports.readPanel;
  if (!readPanel || record.ended) return;
  const status = panelStatusWriter(ports, record, file);
  status.progress('context');
  try {
    const observation = await observeHookPanel(
      record,
      cwd,
      ports.environment.REX_SERVER,
      {
        readPanel,
        inspect: ports.inspect,
        now: ports.now,
        progress: status.progress,
      },
    );
    status.progress('reporter');
    const owner = await ports.inspect(record.owner.pid);
    // An optional read must not overwrite SessionEnd, a newer hook or revocation.
    // No awaited work follows these consent/record reads.
    status.progress('record');
    const current = setupRecord.parse(readPrivate(ports.setup));
    const latest = hookRecord.parse(readPrivate(file));
    if (
      !current.active ||
      JSON.stringify(current) !== JSON.stringify(saved) ||
      !sameProcess(owner, record.owner) ||
      JSON.stringify(latest) !== JSON.stringify(record)
    )
      return;
    // Sidecar only: a cross-process SessionEnd after the check above still wins
    // in the lifecycle file. Old sidecars carry the old epoch and grant nothing.
    status.progress('write');
    writePrivate(
      file.replace(/\.json$/, '.panel.json'),
      hookPanelRecord.parse({
        ...observation,
        hookEpoch: record.epoch,
        setupEpoch: record.setupEpoch,
        threadId: record.threadId,
        session: record.session,
        block: record.block,
        reporter: record.owner,
      }),
    );
    status.observed();
  } catch {
    status.failed();
    // The lifecycle report was committed first. Rex failures never remove it,
    // emit output to Codex, retry or create input authority.
  }
}
export async function runHook(ports: HookPorts): Promise<void> {
  const saved = setupRecord.parse(readPrivate(ports.setup));
  if (!saved.active) return;
  const owner = await hookOwner(ports.parent, ports.inspect);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of ports.input) {
    size += chunk.length;
    if (size > 1048576) throw Error('Codex hook payload too large');
    chunks.push(chunk);
  }
  const data = hookInput.parse(
    JSON.parse(Buffer.concat(chunks).toString('utf8')),
  );
  const record = hookRecord.parse({
    schema: 1,
    setupEpoch: saved.epoch,
    epoch: randomUUID(),
    threadId: data.session_id,
    owner: { pid: owner.pid, startedAt: owner.startedAt, image: owner.image },
    session: ports.environment.REX_SESSION,
    block: ports.environment.REX_BLOCK,
    cwdHash: digest(data.cwd),
    ended: data.hook_event_name === 'SessionEnd',
    at: ports.now(),
  });
  // Revocation and process replacement win over a hook that was already reading.
  const currentOwner = await ports.inspect(owner.pid);
  const current = setupRecord.parse(readPrivate(ports.setup));
  if (
    !current.active ||
    current.epoch !== saved.epoch ||
    current.command !== saved.command ||
    !sameProcess(owner, currentOwner)
  )
    throw Error('Codex hook integration changed');
  const file = path.join(
    ports.directory,
    `${owner.pid}-${data.session_id}.json`,
  );
  writePrivate(file, record);
  await attachPanelObservation(ports, record, saved, data.cwd, file);
}

export function runtimePorts(): HookPorts {
  return {
    input: process.stdin,
    environment: process.env,
    parent: process.ppid,
    directory: hookDirectory(),
    setup: setupFile(),
    inspect: inspectProcess,
    now: Date.now,
  };
}
export async function main(ports: HookPorts = runtimePorts()): Promise<void> {
  // A failed hook supplies no authority and no model-visible/log output.
  try {
    await runHook(ports);
  } catch {}
}
