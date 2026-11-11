import fs from 'node:fs';
import path from 'node:path';
import { main, runtimePorts } from '../agents/codex/hook';
import { readHookPanel } from '../terminals/rex/hook-panel';
import { pluginDirectory } from '../platform/paths';
import { parse } from '../schemas';
import type { PanelAddress, PanelReadPhase } from '../domain/panel-observation';

async function readConfiguredPanel(
  target: PanelAddress,
  progress?: (phase: PanelReadPhase) => void,
) {
  progress?.('rex-config');
  const config = parse(
    'config',
    fs.readFileSync(path.join(pluginDirectory, 'config.json')),
  );
  return readHookPanel(target, config.rexPath, undefined, progress);
}
void main({ ...runtimePorts(), readPanel: readConfiguredPanel });
