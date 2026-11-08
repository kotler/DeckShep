#!/usr/bin/env node
// @ts-check
'use strict';
const { pluginDirectory } = require("../../platform/paths.ts");

const S = require('./state');
async function main() {
  const statusline = process.argv.includes('--statusline'),
    lost = async () => {
      if (!statusline)
        try {
          await S.invalidate();
        } catch {}
    };
  let size = 0,
    chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1048576) {
      await lost();
      return;
    }
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  let data;
  try {
    data = JSON.parse(input.toString('utf8'));
  } catch {
    await lost();
    return;
  }
  try {
    await S.record(data, { statusline });
  } catch {} // Metadata failure never approves, blocks or modifies a Claude request.
  if (statusline) {
    const fs = require('node:fs'),
      path = require('node:path'),
      { spawn } = require('node:child_process');
    const saved = JSON.parse(
      fs.readFileSync(
        path.join(pluginDirectory, 'state', 'claude-setup.json'),
        'utf8',
      ),
    );
    const command = saved.originalStatusLine?.command;
    if (command) {
      const child = spawn('/bin/sh', ['-c', command], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      child.stdout.pipe(process.stdout);
      child.stdin.on('error', () => {});
      child.stdin.end(input);
      const timer = setTimeout(() => child.kill(), 2500);
      await new Promise((resolve) => {
        child.on('error', resolve);
        child.on('close', resolve);
      });
      clearTimeout(timer);
    } else
      process.stdout.write(
        'Claude ' +
          (S.text(data.model?.display_name) ? data.model.display_name : '') +
          (S.text(data.effort?.level) ? ' · ' + data.effort.level : ''),
      );
  }
}
if (require.main === module) main().catch(() => {}); // Exit zero; emit no hook decisions or diagnostics containing input.
module.exports = { main };
