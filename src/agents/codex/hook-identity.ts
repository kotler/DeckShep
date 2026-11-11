import path from 'node:path';
import fs from 'node:fs';
import {
  hookDirectory,
  setupFile,
  readPrivate,
  privateDirectory,
} from './hook-files';
import { hookRecord, setupRecord, digest, uuid } from './hook-contract';
import { inspectProcess, sameProcess } from './hook-process';
import { readHookPeer } from './hook-peer';
import type { AgentSnapshot } from '../../domain/types';
const { DaemonRpc } = require('./daemon');

export interface IdentityPorts {
  directory: string;
  setup: string;
  inspect: typeof inspectProcess;
  peer: typeof readHookPeer;
  connect(socket: string): Promise<{
    request(method: string, params: unknown): Promise<any>;
    close(): void;
  }>;
  now(): number;
}
const defaults: IdentityPorts = {
  directory: hookDirectory(),
  setup: setupFile(),
  inspect: inspectProcess,
  peer: readHookPeer,
  async connect(socket) {
    const rpc = new DaemonRpc(socket);
    try {
      await rpc.connect();
      return rpc;
    } catch (error) {
      rpc.close();
      throw error;
    }
  },
  now: Date.now,
};

export function hookNotice(error: unknown): string | undefined {
  if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
  const message = (error as Error)?.message;
  if (message === 'Codex hooks unavailable') return;
  const notices: Record<string, string> = {
    'Codex hook client ambiguous':
      'Codex hooks: multiple daemon clients; the selected CLI cannot be bound safely.',
    'Codex hook thread ambiguous':
      'Codex hooks: multiple or no loaded threads; the selected thread cannot be bound safely.',
    'Codex hook report unavailable':
      'Codex hooks: no matching live report. Check /hooks trust and use Codex normally.',
    'Codex hook binding changed':
      'Codex hooks: report differs from this pane, process, directory or active setup.',
    'Codex hook process changed':
      'Codex hooks: the foreground process is not a verified native Codex process.',
    'Codex hook daemon changed':
      'Codex hooks: the connected daemon process could not be verified.',
    'Codex process unavailable':
      'Codex hooks: native process identity could not be read.',
    'CLI daemon connection unavailable or ambiguous':
      'Codex hooks: the CLI-to-daemon connection is unavailable or ambiguous.',
    'Unsafe CLI daemon socket':
      'Codex hooks: daemon socket permissions do not meet the existing privacy checks.',
    'Codex hook thread changed':
      'Codex hooks: the loaded thread ID or directory changed during verification.',
    'Codex hook selection changed':
      'Codex hooks: the loaded thread set changed during verification.',
    'Codex hook proof changed':
      'Codex hooks: the report, consent, connection or process changed during verification.',
  };
  return Object.hasOwn(notices, message)
    ? notices[message]
    : 'Codex hook verification is unavailable. No hook identity was granted.';
}

export async function hookIdentity(
  agent: AgentSnapshot,
  ports: IdentityPorts = defaults,
): Promise<{ id: string; epoch: string }> {
  const setup = setupRecord.parse(readPrivate(ports.setup));
  if (!setup.active || agent.app !== 'codex' || agent.backend === 'herdr')
    throw Error('Codex hooks unavailable');
  privateDirectory(ports.directory);
  // Installing an unapproved hook grants nothing and must not add daemon reads.
  if (
    !fs
      .readdirSync(ports.directory)
      .some((name) => /^\d+-[a-f0-9-]{36}\.json$/.test(name))
  )
    throw Error('Codex hook report unavailable');
  const cli = await ports.inspect(agent.pid);
  if (!cli.codex) throw Error('Codex hook process changed');
  const peer = await ports.peer(agent.pid);
  const daemon = await ports.inspect(peer.pid);
  if (!daemon.codex) throw Error('Codex hook daemon changed');
  const rpc = await ports.connect(peer.socket);
  try {
    const loaded = await rpc.request('thread/loaded/list', { limit: 2 });
    if (
      !Array.isArray(loaded?.data) ||
      loaded.data.length !== 1 ||
      loaded.nextCursor != null
    )
      throw Error('Codex hook thread ambiguous');
    const id = uuid.parse(loaded.data[0]);
    const records = [];
    for (const owner of cli.pid === daemon.pid ? [cli] : [cli, daemon]) {
      try {
        const record = hookRecord.parse(
          readPrivate(path.join(ports.directory, `${owner.pid}-${id}.json`)),
        );
        if (sameProcess(record.owner, owner)) records.push(record);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (records.length !== 1) throw Error('Codex hook report unavailable');
    const record = records[0];
    if (
      record.setupEpoch !== setup.epoch ||
      record.threadId !== id ||
      record.ended ||
      record.session !== agent.session ||
      record.block !== agent.block ||
      record.cwdHash !== digest(agent.cwd || '') ||
      record.at > ports.now() + 1000 ||
      ports.now() - record.at > 86400000
    )
      throw Error('Codex hook binding changed');
    const thread = (
      await rpc.request('thread/read', { threadId: id, includeTurns: false })
    )?.thread;
    if (thread?.id !== id || thread.cwd !== agent.cwd)
      throw Error('Codex hook thread changed');
    const finalPeer = await ports.peer(agent.pid);
    const finalCli = await ports.inspect(cli.pid);
    const finalDaemon = await ports.inspect(daemon.pid);
    const again = await rpc.request('thread/loaded/list', { limit: 2 });
    if (JSON.stringify(loaded) !== JSON.stringify(again))
      throw Error('Codex hook selection changed');
    // No awaited work after these reads: revocation/report replacement during
    // any native/RPC query must win before a proof is returned.
    const current = setupRecord.parse(readPrivate(ports.setup));
    const latest = hookRecord.parse(
      readPrivate(path.join(ports.directory, `${record.owner.pid}-${id}.json`)),
    );
    if (
      !current.active ||
      JSON.stringify(current) !== JSON.stringify(setup) ||
      JSON.stringify(latest) !== JSON.stringify(record) ||
      JSON.stringify(finalPeer) !== JSON.stringify(peer) ||
      !sameProcess(cli, finalCli) ||
      !sameProcess(daemon, finalDaemon)
    )
      throw Error('Codex hook proof changed');
    return {
      id,
      epoch: digest(JSON.stringify([record.epoch, cli, daemon, peer.socket])),
    };
  } finally {
    rpc.close();
  }
}

/** Hook failure can use the independently verified footer before dispatch.
 * A press captured from a hook may never silently change its identity source. */
export async function readIdentity(
  bridge: Record<string, any>,
  agent: AgentSnapshot,
  ports = {
    hook: hookIdentity,
    footer: (
      bridge: Record<string, any>,
      agent: AgentSnapshot,
    ): Promise<string> => require('./daemon').readFooter(bridge, agent),
  },
): Promise<string> {
  if (bridge.backend === 'herdr') return ports.footer(bridge, agent);
  const expected = bridge.actionContext?.target?.codexHookEpoch;
  let proof: { id: string; epoch: string } | undefined;
  try {
    proof = await ports.hook(agent);
  } catch (error) {
    agent.codexHookNotice = hookNotice(error);
  }
  if (proof) {
    if (expected && proof.epoch !== expected)
      throw Error('Codex hook changed; reselect');
    if (bridge.actionContext?.verifyChat && !expected)
      throw Error('Codex identity changed; reselect');
    agent.codexHookEpoch = proof.epoch;
    delete agent.codexHookNotice;
    return proof.id;
  }
  if (expected) throw Error('Codex hook proof unavailable');
  delete agent.codexHookEpoch;
  return ports.footer(bridge, agent);
}
