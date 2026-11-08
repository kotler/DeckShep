// @ts-check
/** @typedef {import("../src/domain/types").AgentSnapshot} AgentSnapshot */
/** @typedef {import("../src/domain/types").Config} Config */
/** @typedef {import("../src/domain/types").PressContext} PressContext */
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  TOML = require('@iarna/toml');
const codexFile = () =>
  path.join(/** @type {string} */ (process.env.HOME), '.codex', 'config.toml');
const signature =
  /** @param {any} c */
  (c) => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
function readPresets() {
  return (
    /** @type {any} */ (TOML.parse(fs.readFileSync(codexFile(), 'utf8')).tui)
      ?.presets || {}
  );
}
/** @param {string} file */
function readRegistry(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (/** @type {Error & {code?: string}} */ (e).code === 'ENOENT')
      return { agents: {} };
    throw e;
  }
}
/** @param {string} file
 * @param {any} value */
function saveRegistry(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
/** @param {Record<string, any>} config
 * @param {any} baseline */
function choices(config, baseline) {
  if (
    !/^\/permissions\s+\S+\s+--approval-policy=/.test(baseline) ||
    !/ --reviewer=(user|auto_review)$/.test(baseline)
  )
    throw Error('Unsupported permission snapshot');
  const models = config.models.map(
    /** @param {any} m
     * @param {any} i */ (m, i) => ({
      slot: String(i + 1),
      label: m.label,
      input: '/model ' + m.id,
      kind: 'model',
    }),
  );
  const efforts = config.efforts.map(
    /** @param {any} e
     * @param {any} i */ (e, i) => ({
      slot: String(models.length + i + 1),
      label: e,
      input: '/model --reasoning=' + e,
      kind: 'effort',
    }),
  );
  if (models.length + efforts.length !== 7)
    throw Error('Setup needs three models and four effort levels');
  const permissions = [
    {
      slot: '8',
      label: 'Approve for me',
      input: baseline.replace(
        / --reviewer=(user|auto_review)$/,
        ' --reviewer=auto_review',
      ),
      kind: 'permissions',
    },
    {
      slot: '9',
      label: 'Ask me',
      input: baseline.replace(
        / --reviewer=(user|auto_review)$/,
        ' --reviewer=user',
      ),
      kind: 'permissions',
    },
  ];
  for (const m of config.models)
    if (!/^[a-z0-9.-]+$/.test(m.id)) throw Error('Invalid model ID');
  for (const e of config.efforts)
    if (!['low', 'medium', 'high', 'xhigh'].includes(e))
      throw Error('Invalid effort');
  return [...models, ...efforts, ...permissions];
}
/** @param {any[]} entries */
function validateOnDisk(entries) {
  const p = readPresets();
  for (const e of entries)
    if (p[e.slot]?.input !== e.input)
      throw Error('Native presets changed; run setup again');
}
module.exports = {
  readPresets,
  readRegistry,
  saveRegistry,
  choices,
  validateOnDisk,
  signature,
  codexFile,
};
