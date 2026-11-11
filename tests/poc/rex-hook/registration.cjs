'use strict';
// Observation-only experiment. Production must never consume these records.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const {
  hookInput,
  setupRecord,
  processIdentity,
  uuid,
  digest,
} = require('../../../src/agents/codex/hook-contract');
const {
  readPrivate,
  writePrivate,
  privateDirectory,
} = require('../../../src/agents/codex/hook-files');
const { sameProcess } = require('../../../src/agents/codex/hook-process');

const clean = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[^\x00-\x1f\x7f]+$/);
const targetSchema = z.object({
  session: clean.regex(/^session:[a-f0-9-]{36}$/i),
  block: clean.regex(/^block:[a-f0-9-]{36}$/i),
  server: clean.regex(/^unix:\/\/\//),
});
const nativeSchema = processIdentity.extend({
  startedAt: z.string().regex(/^\d+\.\d{6}$/),
  codex: z.literal(true),
});
const panelSchema = z.object({
  generation: z.number().int().nonnegative().safe().optional(),
  foreground: z.object({
    pid: z.number().int().min(2).safe(),
    user_id: z.number().int().nonnegative().safe(),
    name: z.literal('codex'),
    cwd: clean.refine((value) => path.isAbsolute(value)),
  }),
});
const candidateSchema = z.object({
  schema: z.literal(1),
  purpose: z.literal('rex-hook-poc'),
  controlAuthority: z.literal(false),
  setupEpoch: uuid,
  registrationEpoch: uuid,
  threadId: uuid,
  session: targetSchema.shape.session,
  block: targetSchema.shape.block,
  serverHash: z.string().regex(/^[a-f0-9]{64}$/),
  cwdHash: z.string().regex(/^[a-f0-9]{64}$/),
  process: processIdentity,
  reporter: processIdentity,
  originEvidence: z.enum(['reporter-is-foreground', 'unverified']),
  sourceEvent: z.enum(['SessionStart', 'UserPromptSubmit', 'SessionEnd']),
  ended: z.boolean(),
  at: z.number().int().nonnegative().safe(),
});
class PocError extends Error {}
function refuse(message) {
  throw new PocError(message);
}
function identity(fact) {
  return { pid: fact.pid, startedAt: fact.startedAt, image: fact.image };
}
function previousRecord(file) {
  try {
    return candidateSchema.parse(readPrivate(file));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function rexProcessArgs(target) {
  return [
    '--autostart=false',
    '--timeout',
    '2s',
    '--server',
    target.server,
    'block',
    'call',
    '-s',
    target.session,
    '-b',
    target.block,
    'process',
  ];
}
async function readPanel(ports, target, cwd) {
  const raw = await ports.executeRex(rexProcessArgs(target));
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 32768)
    refuse('POC process reply unavailable');
  const panel = panelSchema.parse(JSON.parse(raw));
  if (
    panel.foreground.user_id !== process.getuid() ||
    panel.foreground.cwd !== cwd
  )
    refuse('POC panel owner or folder changed');
  return panel;
}
function commit(ports, file, saved, previous, record) {
  const current = setupRecord.parse(readPrivate(ports.setup));
  if (!current.active || JSON.stringify(current) !== JSON.stringify(saved))
    refuse('POC setup changed');
  const lock = file + '.lock';
  const descriptor = fs.openSync(lock, 'wx', 0o600);
  try {
    if (JSON.stringify(previousRecord(file)) !== JSON.stringify(previous))
      refuse('POC record changed');
    writePrivate(file, candidateSchema.parse(record));
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lock);
  }
  return record;
}
async function endRegistration(ports, file, saved, previous, reporter) {
  if (
    !previous ||
    previous.setupEpoch !== saved.epoch ||
    !sameProcess(previous.reporter, reporter)
  )
    refuse('POC end has no matching record');
  const finalReporter = nativeSchema.parse(await ports.inspectReporter());
  if (!sameProcess(reporter, finalReporter)) refuse('POC reporter changed');
  return commit(ports, file, saved, previous, {
    ...previous,
    sourceEvent: 'SessionEnd',
    ended: true,
    registrationEpoch: randomUUID(),
    at: ports.now(),
  });
}
async function observePanel(ports, input, reporter) {
  const target = targetSchema.parse({
    session: ports.environment.REX_SESSION,
    block: ports.environment.REX_BLOCK,
    server: ports.environment.REX_SERVER,
  });
  const before = await readPanel(ports, target, input.cwd);
  const foreground = nativeSchema.parse(
    await ports.inspect(before.foreground.pid),
  );
  if (foreground.pid !== before.foreground.pid)
    refuse('POC foreground changed');
  const after = await readPanel(ports, target, input.cwd);
  const finalForeground = nativeSchema.parse(
    await ports.inspect(foreground.pid),
  );
  const finalReporter = nativeSchema.parse(await ports.inspectReporter());
  if (
    JSON.stringify(before) !== JSON.stringify(after) ||
    !sameProcess(foreground, finalForeground)
  )
    refuse('POC foreground changed');
  if (!sameProcess(reporter, finalReporter)) refuse('POC reporter changed');
  return { target, foreground };
}
async function collect(ports) {
  const saved = setupRecord.parse(readPrivate(ports.setup));
  if (!saved.active) refuse('POC setup disabled');
  privateDirectory(ports.directory);
  const input = hookInput.parse(ports.payload);
  const reporter = nativeSchema.parse(await ports.inspectReporter());
  const file = path.join(ports.directory, `candidate-${input.session_id}.json`);
  const previous = previousRecord(file);
  if (input.hook_event_name === 'SessionEnd')
    return endRegistration(ports, file, saved, previous, reporter);
  if (previous?.ended) refuse('POC existing association ended');
  const { target, foreground } = await observePanel(ports, input, reporter);
  if (
    previous &&
    (previous.setupEpoch !== saved.epoch ||
      previous.session !== target.session ||
      previous.block !== target.block ||
      previous.serverHash !== digest(target.server) ||
      !sameProcess(previous.process, foreground) ||
      !sameProcess(previous.reporter, reporter))
  )
    refuse('POC existing association differs');
  return commit(ports, file, saved, previous, {
    schema: 1,
    purpose: 'rex-hook-poc',
    controlAuthority: false,
    setupEpoch: saved.epoch,
    registrationEpoch: randomUUID(),
    threadId: input.session_id,
    session: target.session,
    block: target.block,
    serverHash: digest(target.server),
    cwdHash: digest(input.cwd),
    process: identity(foreground),
    reporter: identity(reporter),
    originEvidence: sameProcess(foreground, reporter)
      ? 'reporter-is-foreground'
      : 'unverified',
    sourceEvent: input.hook_event_name,
    ended: false,
    at: ports.now(),
  });
}
async function collectRegistration(ports) {
  // No default executor or process probe: importing the POC cannot reach Rex.
  try {
    return await collect(ports);
  } catch (error) {
    if (error instanceof PocError) throw error;
    throw new PocError('POC registration unavailable');
  }
}
module.exports = { collectRegistration, candidateSchema };
