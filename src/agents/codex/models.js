// @ts-check
/** @typedef {import("../../domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../../domain/types").Config} Config */
/** @typedef {import("../../domain/types").PressContext} PressContext */
'use strict';
const { execFile } = require('node:child_process');
const path = require('node:path');
const P = require('./presets');
const { Setup } = require('./setup-presets');
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;
/** @param {any} raw
 * @param {string[]} [include] */
function catalog(raw, include = []) {
  if (!Array.isArray(raw?.models))
    throw Error('Codex model catalog unavailable');
  const models = raw.models
    .filter(
      /** @param {any} m */ (m) =>
        m.visibility === 'list' &&
        ID.test(m.slug) &&
        Array.isArray(m.supported_reasoning_levels),
    )
    .map(
      /** @param {any} m */ (m) => ({
        id: m.slug,
        label: m.display_name || m.slug,
        efforts: m.supported_reasoning_levels
          .map(/** @param {any} e */ (e) => e.effort)
          .filter(/** @param {any} e */ (e) => ID.test(e)),
      }),
    );
  const selected = include.length
    ? include
        .map((id) => models.find(/** @param {any} m */ (m) => m.id === id))
        .filter(Boolean)
    : models;
  if (
    !selected.length ||
    new Set(selected.map(/** @param {any} m */ (m) => m.id)).size !==
      selected.length
  )
    throw Error('No unique available Codex models');
  return selected;
}
/** @param {any} input */
function snapshot(input) {
  const match =
    /^\/model ([a-zA-Z0-9][a-zA-Z0-9._:/-]*)(?: --reasoning=([a-zA-Z0-9_-]+))?(?: --speed=([a-zA-Z0-9_-]+))?$/.exec(
      input,
    );
  if (!match) throw Error('Unrecognized native model settings');
  return { model: match[1], effort: match[2] || null, speed: match[3] || null };
}
/** @param {string} kind
 * @param {any} current
 * @param {any} models
 * @param {string[]} [effortLevels] */
function next(kind, current, models, effortLevels = []) {
  const model = models.find(
    /** @param {any} m */ (m) => m.id === current.model,
  );
  if (kind === 'model') {
    const i = models.indexOf(model);
    const chosen = models[(i + 1) % models.length];
    return { input: '/model ' + chosen.id, label: chosen.label };
  }
  if (kind !== 'effort' || !model)
    throw Error('Current model not in discovered catalog');
  const levels = model.efforts.filter(
    /** @param {any} e */ (e) =>
      !effortLevels.length || effortLevels.includes(e),
  );
  if (!levels.length || !current.effort)
    throw Error('Current reasoning effort unavailable');
  const chosen = levels[(levels.indexOf(current.effort) + 1) % levels.length];
  return { input: '/model --reasoning=' + chosen, label: chosen };
}
/** @param {string} binary
 * @param {any} cwd
 * @param {string[]} include */
function loadCatalog(binary, cwd, include) {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      ['debug', 'models'],
      { cwd, timeout: 15000, maxBuffer: 4e6 },
      (e, out) => {
        if (e)
          return reject(Error('Codex model discovery failed; no setting sent'));
        try {
          resolve(catalog(JSON.parse(out), include));
        } catch {
          reject(Error('Invalid Codex model catalog'));
        }
      },
    );
  });
}
class ModelControls {
  /** @param {Record<string, any>} bridge
   * @param {any} [setup]
   * @param {any} [load] */
  constructor(bridge, setup = new Setup(bridge), load = loadCatalog) {
    this.b = bridge;
    this.setup = setup;
    this.load = load;
  }
  /** @param {string} kind
   * @param {any} a
   * @param {string} file */
  async cycle(kind, a, file) {
    const options = this.b.config.modelDiscovery || {};
    const process = await this.b.method(a, 'process');
    const f = process.foreground;
    if (!f || f.pid !== a.pid || path.basename(f.path || '') !== 'codex')
      throw Error('Native Codex binary required for discovery');
    const models = await this.load(f.path, f.cwd, options.include || []);
    await this.b.checked(a, true);
    const registry = P.readRegistry(file);
    const onDisk = P.readPresets()['0']?.input;
    if (onDisk && onDisk !== registry.scratch?.input)
      throw Error('Preset 0 belongs to you or changed; no setting sent');
    const remember =
      /** @param {any} input */
      (input) => {
        registry.scratch = { slot: '0', input };
        P.saveRegistry(file, registry);
      };
    // The TUI exports its live settings, so manual changes and /new do not use an old cycle index.
    const exported = await this.setup.currentModel(a);
    const current = snapshot(exported);
    const chosen = next(kind, current, models, options.effortLevels || []);
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
