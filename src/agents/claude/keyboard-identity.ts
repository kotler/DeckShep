import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { exec } from '../../platform/exec';
import type { AgentSnapshot } from '../../domain/types';
const {
  processInfo,
  defaultBindings,
  nativeRelease,
  session,
} = require('./state');

// Claude writes procStart using ps in UTC. Keep the hook reader's own
// timestamp convention separate from this CLI registration comparison.
export function registeredProcess(pid: number, execute = exec) {
  return processInfo(pid, (file: string, args: string[]) =>
    execute(file, args, { env: { LC_ALL: 'C', TZ: 'UTC' } }),
  );
}

/** Claude publishes its interactive CLI registration under the effective config
 * directory. Use only the record for the Rex foreground PID. No directory scan,
 * hook, environment read or transcript lookup is needed. */
export async function claudeKeyboardIdentity(
  agent: AgentSnapshot,
  inspect = registeredProcess,
  directory = process.env.CLAUDE_CONFIG_DIR ||
    path.join(os.homedir(), '.claude'),
  surface?: 'effort-slider',
): Promise<string> {
  const fail = () => Error('Check Claude CLI');
  if (
    agent.app !== 'claude-code' ||
    !Number.isSafeInteger(agent.pid) ||
    agent.pid <= 1 ||
    !agent.cwd ||
    !path.isAbsolute(agent.cwd) ||
    !path.isAbsolute(directory)
  )
    throw fail();
  try {
    const fact = await inspect(agent.pid);
    if (fact.pid !== agent.pid || !nativeRelease(fact.version)) throw fail();
    const registrations = path.join(directory, 'sessions');
    for (const folder of [directory, registrations]) {
      const s = fs.lstatSync(folder);
      if (!s.isDirectory() || s.uid !== process.getuid?.() || s.mode & 0o022)
        throw fail();
    }
    if (!defaultBindings(directory)) throw Error('Custom Claude keys');
    const fd = fs.openSync(
      path.join(registrations, agent.pid + '.json'),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
      const s = fs.fstatSync(fd);
      if (
        !s.isFile() ||
        s.nlink !== 1 ||
        s.uid !== process.getuid?.() ||
        s.mode & 0o022 ||
        s.size > 32768
      )
        throw fail();
      const record = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (
        record.pid !== agent.pid ||
        record.pidDomain !== 'darwin' ||
        record.kind !== 'interactive' ||
        record.entrypoint !== 'cli' ||
        record.version !== fact.version ||
        record.cwd !== agent.cwd ||
        !session(record.sessionId) ||
        typeof record.procStart !== 'string' ||
        record.procStart.trim().replace(/\s+/g, ' ') !== fact.startedAt
      )
        throw fail();
      // Rex refreshes its report while Claude is still on the same turn.
      // Claude's own transition to busy identifies this interruptible interval.
      if (
        (agent.state === 'unknown' || surface === 'effort-slider') &&
        record.status !== 'idle' &&
        !(surface === 'effort-slider' && record.status === 'waiting')
      )
        throw fail();
      const working = agent.state === 'working';
      if (
        working &&
        (record.status !== 'busy' ||
          !Number.isSafeInteger(record.statusUpdatedAt) ||
          record.statusUpdatedAt <= 0 ||
          record.statusUpdatedAt > Date.now())
      )
        throw fail();
      return createHash('sha256')
        .update(
          JSON.stringify([
            fact.pid,
            fact.startedAt,
            fact.executable,
            fact.version,
            directory,
            record.sessionId,
            ...(working ? [record.statusUpdatedAt] : []),
          ]),
        )
        .digest('hex');
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    if ((error as Error).message === 'Custom Claude keys') throw error;
    throw fail();
  }
}
