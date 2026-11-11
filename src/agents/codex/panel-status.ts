import {
  hookPanelStatus,
  hookRecord,
  setupRecord,
  type CodexHookRecord,
} from './hook-contract';
import { readPrivate, writePrivate } from './hook-files';
import { panelAddress } from '../../schemas/panel-observation';
import type { PanelObservationPhase } from '../../domain/panel-observation';

interface StatusPorts {
  setup: string;
  environment: NodeJS.ProcessEnv;
  now(): number;
}
/** Fixed diagnostic codes only; never persist an exception or CLI output. */
export function panelStatusWriter(
  ports: StatusPorts,
  record: CodexHookRecord,
  file: string,
) {
  let phase: PanelObservationPhase = 'context';
  const context = {
    session: record.session,
    block: record.block,
    server: ports.environment.REX_SERVER,
  };
  function write(outcome: 'pending' | 'unavailable' | 'observed') {
    try {
      const setup = setupRecord.parse(readPrivate(ports.setup));
      const current = hookRecord.parse(readPrivate(file));
      if (
        !setup.active ||
        setup.epoch !== record.setupEpoch ||
        current.ended ||
        JSON.stringify(current) !== JSON.stringify(record)
      )
        return;
      writePrivate(
        file.replace(/\.json$/, '.panel-status.json'),
        hookPanelStatus.parse({
          schema: 1,
          controlAuthority: false,
          hookEpoch: record.epoch,
          setupEpoch: record.setupEpoch,
          threadId: record.threadId,
          session: record.session,
          block: record.block,
          reporter: record.owner,
          outcome,
          phase,
          at: ports.now(),
          hasServerEnvironment:
            typeof context.server === 'string' && context.server.length > 0,
          validLocalContext: panelAddress.safeParse(context).success,
        }),
      );
    } catch {
      /* Diagnostics cannot break or change lifecycle publication. */
    }
  }
  return {
    progress(next: PanelObservationPhase) {
      phase = next;
      write('pending');
    },
    failed() {
      write('unavailable');
    },
    observed() {
      phase = 'complete';
      write('observed');
    },
  };
}
