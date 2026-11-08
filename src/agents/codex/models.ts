const boundary = require('../../schemas');
type Setup = import('./setup-presets').Setup;
type AgentSnapshot = import('../../domain/types').AgentSnapshot;
type Config = import('../../domain/types').Config;
type PressContext = import('../../domain/types').PressContext;
('use strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const P = require('./presets');
const { Setup } = require('./setup-presets');
const ID: RegExp = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;
function catalog(raw: any, include: string[] | undefined = []) {
  if (!Array.isArray(raw?.models))
    throw Error('Codex model catalog unavailable');
  const models: any = raw.models
    .filter(
      (m: any) =>
        m.visibility === 'list' &&
        ID.test(m.slug) &&
        Array.isArray(m.supported_reasoning_levels),
    )
    .map((m: any) => ({
      id: m.slug,
      label: m.display_name || m.slug,
      efforts: m.supported_reasoning_levels
        .map((e: any) => e.effort)
        .filter((e: any) => ID.test(e)),
    }));
  const selected: any = include.length
    ? include
        .map((id: string) => models.find((m: any) => m.id === id))
        .filter(Boolean)
    : models;
  if (
    !selected.length ||
    new Set(selected.map((m: any) => m.id)).size !== selected.length
  )
    throw Error('No unique available Codex models');
  return selected;
}
function snapshot(input: any) {
  const match: RegExpExecArray | null =
    /^\/model ([a-zA-Z0-9][a-zA-Z0-9._:/-]*)(?: --reasoning=([a-zA-Z0-9_-]+))?(?: --speed=([a-zA-Z0-9_-]+))?$/.exec(
      input,
    );
  if (!match) throw Error('Unrecognized native model settings');
  return { model: match[1], effort: match[2] || null, speed: match[3] || null };
}
function next(
  kind: string,
  current: any,
  models: any,
  effortLevels: string[] | undefined = [],
) {
  const model: any = models.find((m: any) => m.id === current.model);
  if (kind === 'model') {
    const i: any = models.indexOf(model);
    const chosen: any = models[(i + 1) % models.length];
    return { input: '/model ' + chosen.id, label: chosen.label };
  }
  if (kind !== 'effort' || !model)
    throw Error('Current model not in discovered catalog');
  const levels: any = model.efforts.filter(
    (e: any) => !effortLevels.length || effortLevels.includes(e),
  );
  if (!levels.length || !current.effort)
    throw Error('Current reasoning effort unavailable');
  const chosen: any =
    levels[(levels.indexOf(current.effort) + 1) % levels.length];
  return { input: '/model --reasoning=' + chosen, label: chosen };
}
function loadCatalog(binary: string, cwd: any, include: string[]) {
  return new Promise(
    (resolve: (value: any) => void, reject: (reason?: any) => void) => {
      execFile(
        binary,
        ['debug', 'models'],
        { cwd, timeout: 15000, maxBuffer: 4e6 },
        (e: import('child_process').ExecFileException | null, out: string) => {
          if (e)
            return reject(
              Error('Codex model discovery failed; no setting sent'),
            );
          try {
            resolve(catalog(boundary.parse('modelCatalog', out), include));
          } catch {
            reject(Error('Invalid Codex model catalog'));
          }
        },
      );
    },
  );
}
class ModelControls {
  declare b: Record<string, any>;
  declare setup: any;
  declare load: any;
  constructor(
    bridge: Record<string, any>,
    setup: any = new Setup(bridge),
    load: any = loadCatalog,
  ) {
    this.b = bridge;
    this.setup = setup;
    this.load = load;
  }
  async cycle(kind: string, a: any, file: string) {
    const options: any = this.b.config.modelDiscovery || {};
    const process: any = await this.b.method(a, 'process');
    const f: any = process.foreground;
    if (!f || f.pid !== a.pid || path.basename(f.path || '') !== 'codex')
      throw Error('Native Codex binary required for discovery');
    const models: any = await this.load(f.path, f.cwd, options.include || []);
    await this.b.checked(a, true);
    const registry: any = P.readRegistry(file);
    const onDisk: any = P.readPresets()['0']?.input;
    if (onDisk && onDisk !== registry.scratch?.input)
      throw Error('Preset 0 belongs to you or changed; no setting sent');
    const remember: (input: any) => void = (input: any) => {
      registry.scratch = { slot: '0', input };
      P.saveRegistry(file, registry);
    };
    const exported: any = await this.setup.currentModel(a);
    const current: {
      model: string;
      effort: string | null;
      speed: string | null;
    } = snapshot(exported);
    const chosen: {
      input: string;
      label: any;
    } = next(kind, current, models, options.effortLevels || []);
    await this.setup.store(a, '0', chosen.input);
    remember(chosen.input);
    P.validateOnDisk([registry.scratch]);
    await this.b.checked(a, true);
    await this.b.run([
      'send-key',
      '-s',
      a.session,
      '-b',
      a.block,
      'ctrl+x',
      'p',
      '0',
    ]);
    return { kind, label: chosen.label };
  }
}
module.exports = { ModelControls, catalog, snapshot, next, loadCatalog };

export { ModelControls };
