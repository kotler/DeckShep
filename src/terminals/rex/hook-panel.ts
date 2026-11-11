import { exec, type ExecFailureKind } from '../../platform/exec';
import { discoverRex } from '../../platform/paths';
import { panelAddress, rexPanelProcess } from '../../schemas/panel-observation';
import type {
  PanelAddress,
  PanelProcessSnapshot,
  PanelReadPhase,
} from '../../domain/panel-observation';

interface HookPanelPorts {
  discover: typeof discoverRex;
  execute: typeof exec;
}
const failurePhase: Record<ExecFailureKind, PanelReadPhase> = {
  timeout: 'rex-timeout',
  permission: 'rex-permission',
  'missing-executable': 'rex-executable',
  'output-limit': 'rex-output-limit',
  'connection-refused': 'rex-refused',
  'invalid-option': 'rex-option',
  'not-found': 'rex-target',
  exit: 'rex-exit',
  other: 'rex-other',
};
/** One bounded, explicitly addressed process read. No screen, focus or input API. */
export async function readHookPanel(
  address: PanelAddress,
  rexPath?: string,
  ports: HookPanelPorts = { discover: discoverRex, execute: exec },
  progress?: (phase: PanelReadPhase) => void,
): Promise<PanelProcessSnapshot> {
  try {
    const target = panelAddress.parse(address);
    progress?.('rex-discovery');
    const { binary } = await ports.discover(rexPath);
    progress?.('rex-query');
    const output = await ports.execute(
      binary,
      [
        '--autostart=false',
        '--timeout',
        '1s',
        '--server',
        target.server,
        'block',
        'call',
        '-s',
        target.session,
        '-b',
        target.block,
        'process',
      ],
      {
        timeout: 1200,
        maxBuffer: 32768,
        env: { REX_SERVER: '' },
        message: 'Rex hook panel unavailable',
        onFailure: (failure) => progress?.(failurePhase[failure.kind]),
      },
    );
    progress?.('rex-reply');
    if (Buffer.byteLength(output) > 32768)
      throw Error('Oversized process reply');
    const result = rexPanelProcess.parse(JSON.parse(output));
    return {
      pid: result.foreground.pid,
      userId: result.foreground.user_id,
      name: result.foreground.name,
      cwd: result.foreground.cwd,
      ...(result.generation === undefined
        ? {}
        : { generation: result.generation }),
    };
  } catch {
    throw Error('Rex hook panel unavailable');
  }
}
