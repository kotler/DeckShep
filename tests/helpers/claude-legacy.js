'use strict';
// Builds the settings and setup record that pre-Part-B DeckShep wrote when a
// user chose "Chain the existing Claude status line". Production code can no
// longer create this; tests use it to cover restore and removal of old installs.
const fs = require('node:fs'),
  path = require('node:path');
const { plan, commands } = require('../../src/agents/claude/configure');

/** Pure form: plan() a hooks install, then add the legacy wrapper. */
function legacyInstall(settings, saved, { dir, node }) {
  const result = plan(settings, saved, { dir, node }),
    c = commands(dir, node);
  result.settings.statusLine = {
    ...(settings.statusLine || {}),
    type: 'command',
    command: c.status,
    refreshInterval: 2,
  };
  result.registry.statusline = true;
  return result;
}

/** On-disk form for IntegrationSetup fixtures, after a hooks-only apply. */
function convertToLegacy(paths) {
  const registryFile = path.join(paths.plugin, 'state', 'claude-setup.json'),
    registry = JSON.parse(fs.readFileSync(registryFile, 'utf8')),
    settings = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
  settings.statusLine = {
    ...(settings.statusLine || {}),
    type: 'command',
    command: registry.commands.status,
    refreshInterval: 2,
  };
  registry.statusline = true;
  fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2) + '\n');
  fs.writeFileSync(paths.settings, JSON.stringify(settings, null, 2) + '\n');
  return { settings, registry };
}

module.exports = { legacyInstall, convertToLegacy };
