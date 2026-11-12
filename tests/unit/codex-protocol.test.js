'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const {
  DAEMON_CONTRACT,
  DAEMON_METHODS,
  DAEMON_NOTIFICATIONS,
} = require('../../src/agents/codex/daemon');
const recorded = require('../fixtures/codex/app-server-protocol.json');

test('every app-server method and parameter in use exists in the recorded protocol', async () => {
  const { protocolGaps } = await import('../../scripts/codex-protocol.mjs');
  assert.match(recorded.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(
    protocolGaps(recorded, DAEMON_CONTRACT, DAEMON_NOTIFICATIONS),
    [],
  );
  assert.deepEqual(DAEMON_METHODS, Object.keys(DAEMON_CONTRACT));
});

test('a removed method, parameter or notification is reported by name', async () => {
  const { protocolGaps } = await import('../../scripts/codex-protocol.mjs');
  const drifted = structuredClone(recorded);
  delete drifted.requests['thread/backgroundTerminals/terminate'];
  drifted.requests['thread/settings/update'] = drifted.requests[
    'thread/settings/update'
  ].filter((field) => field !== 'effort');
  drifted.notifications = drifted.notifications.filter(
    (method) => method !== 'thread/settings/updated',
  );
  assert.deepEqual(
    protocolGaps(drifted, DAEMON_CONTRACT, DAEMON_NOTIFICATIONS),
    [
      'parameter thread/settings/update.effort',
      'method thread/backgroundTerminals/terminate',
      'notification thread/settings/updated',
    ],
  );
});

test('a generated schema bundle reduces to method and parameter names', async (t) => {
  const { readProtocol } = await import('../../scripts/codex-protocol.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'protocol-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const method = (name, reference) => ({
    properties: {
      method: { enum: [name] },
      ...(reference ? { params: { $ref: `#/definitions/${reference}` } } : {}),
    },
  });
  fs.writeFileSync(
    path.join(directory, 'ClientRequest.json'),
    JSON.stringify({
      oneOf: [method('turn/interrupt', 'Stop'), method('ping'), {}],
      definitions: { Stop: { properties: { turnId: {}, threadId: {} } } },
    }),
  );
  fs.writeFileSync(
    path.join(directory, 'ServerNotification.json'),
    JSON.stringify({ oneOf: [method('turn/started'), method('error')] }),
  );
  assert.deepEqual(readProtocol(directory), {
    requests: { ping: [], 'turn/interrupt': ['threadId', 'turnId'] },
    notifications: ['error', 'turn/started'],
  });
});
