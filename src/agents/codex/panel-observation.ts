import { panelAddress, panelSnapshot } from '../../schemas/panel-observation';
import {
  digest,
  panelObservation,
  type CodexHookRecord,
  type CodexPanelObservation,
} from './hook-contract';
import { sameProcess, type inspectProcess } from './hook-process';
import type {
  PanelProcessReader,
  PanelObservationPhase,
} from '../../domain/panel-observation';

interface ObservationPorts {
  readPanel: PanelProcessReader;
  inspect: typeof inspectProcess;
  now(): number;
  progress?(phase: PanelObservationPhase): void;
}
/** Corroborates the supplied panel's process, never the origin of a daemon event. */
export async function observeHookPanel(
  record: CodexHookRecord,
  cwd: string,
  server: string | undefined,
  ports: ObservationPorts,
): Promise<CodexPanelObservation> {
  const address = panelAddress.parse({
    session: record.session,
    block: record.block,
    server,
  });
  ports.progress?.('first-panel');
  const first = await ports.readPanel(address, ports.progress);
  ports.progress?.('parse-first');
  const before = panelSnapshot.parse(first);
  ports.progress?.('panel-owner');
  if (before.userId !== process.getuid?.())
    throw Error('Codex panel observation unavailable');
  ports.progress?.('panel-provider');
  if (before.name !== 'codex')
    throw Error('Codex panel observation unavailable');
  ports.progress?.('panel-directory');
  if (before.cwd !== cwd) throw Error('Codex panel observation unavailable');
  ports.progress?.('foreground');
  const foreground = await ports.inspect(before.pid);
  ports.progress?.('foreground-kind');
  if (!foreground.codex || foreground.pid !== before.pid)
    throw Error('Codex panel observation unavailable');
  ports.progress?.('second-panel');
  const second = await ports.readPanel(address, ports.progress);
  ports.progress?.('parse-second');
  const after = panelSnapshot.parse(second);
  ports.progress?.('foreground-again');
  const finalForeground = await ports.inspect(foreground.pid);
  ports.progress?.('compare');
  if (
    !finalForeground.codex ||
    JSON.stringify(before) !== JSON.stringify(after) ||
    !sameProcess(foreground, finalForeground)
  )
    throw Error('Codex panel observation changed');
  ports.progress?.('result');
  return panelObservation.parse({
    schema: 1,
    controlAuthority: false,
    process: {
      pid: foreground.pid,
      startedAt: foreground.startedAt,
      image: foreground.image,
    },
    serverHash: digest(address.server),
    originEvidence: sameProcess(record.owner, foreground)
      ? 'reporter-is-foreground'
      : 'unverified',
    ...(before.generation === undefined
      ? {}
      : { generation: before.generation }),
    at: ports.now(),
  });
}
