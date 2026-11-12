// Compare the app-server methods DeckShep sends with a Codex protocol schema.
//
//   npm run compat:codex            check the installed `codex` CLI
//   npm run compat:codex -- --record   also rewrite the recorded fixture
//
// Schema generation is offline: it starts no daemon and opens no socket.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const methodOf = (entry) => entry?.properties?.method?.enum?.[0];

/** Reduce a generated schema bundle to method names and parameter names. */
export function readProtocol(directory) {
  const load = (name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  const client = load('ClientRequest.json'),
    server = load('ServerNotification.json');
  const requests = {};
  for (const entry of client.oneOf ?? []) {
    const method = methodOf(entry);
    if (!method) continue;
    const reference = entry.properties.params?.$ref?.split('/').pop();
    requests[method] = Object.keys(
      client.definitions?.[reference]?.properties ?? {},
    ).sort();
  }
  return {
    requests: Object.fromEntries(
      Object.entries(requests).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    notifications: (server.oneOf ?? []).map(methodOf).filter(Boolean).sort(),
  };
}

/** Everything the client uses that the protocol no longer offers. */
export function protocolGaps(protocol, contract, notifications) {
  const gaps = [];
  for (const [method, fields] of Object.entries(contract)) {
    const known = protocol.requests[method];
    if (!known) {
      gaps.push(`method ${method}`);
      continue;
    }
    for (const field of fields)
      if (!known.includes(field)) gaps.push(`parameter ${method}.${field}`);
  }
  for (const method of notifications)
    if (!protocol.notifications.includes(method))
      gaps.push(`notification ${method}`);
  return gaps;
}

async function main() {
  const { DAEMON_CONTRACT, DAEMON_NOTIFICATIONS } =
    await import('../src/agents/codex/daemon.ts');
  const binary = process.env.CODEX_BIN || 'codex';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-protocol-'));
  try {
    const version = execFileSync(binary, ['--version'], { encoding: 'utf8' })
      .trim()
      .replace(/^codex-cli\s+/, '');
    execFileSync(
      binary,
      [
        'app-server',
        'generate-json-schema',
        '--experimental',
        '--out',
        directory,
      ],
      { stdio: 'ignore', timeout: 60000 },
    );
    const protocol = readProtocol(directory);
    if (process.argv.includes('--record')) {
      // Keep the recorded copy to the namespaces DeckShep talks to.
      const kept = /^(initialize$|thread\/|turn\/|model\/)/;
      fs.writeFileSync(
        'tests/fixtures/codex/app-server-protocol.json',
        JSON.stringify(
          {
            version,
            requests: Object.fromEntries(
              Object.entries(protocol.requests).filter(([m]) => kept.test(m)),
            ),
            notifications: protocol.notifications.filter((m) => kept.test(m)),
          },
          null,
          2,
        ) + '\n',
      );
    }
    const gaps = protocolGaps(protocol, DAEMON_CONTRACT, DAEMON_NOTIFICATIONS);
    if (gaps.length) {
      console.error(`Codex ${version} no longer offers:`);
      for (const gap of gaps) console.error(`  ${gap}`);
      process.exitCode = 1;
    } else
      console.log(
        `Codex ${version}: all ${Object.keys(DAEMON_CONTRACT).length} methods and their parameters are present.`,
      );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
