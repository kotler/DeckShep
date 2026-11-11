import { exec } from '../../platform/exec';
const { socketFromListing, safeSocket } = require('./daemon');

export interface HookPeer {
  pid: number;
  socket: string;
  clients: number[];
}
/** Require the only external Unix client of this daemon to be the captured CLI.
 * The plugin's own metadata connections are readers, never another agent. */
export function peerFromListing(
  listing: string,
  cliPid: number,
  readerPid: number,
): HookPeer {
  const endpoint: { pid: number; socket: string } = socketFromListing(
    listing,
    cliPid,
  );
  const rows = listing.split('\n').flatMap((line) => {
    const match =
      /^\S+\s+(\d+)\s+\S+\s+\S+\s+unix\s+(0x[0-9a-f]+)\s+\S+\s+(.+)$/.exec(
        line,
      );
    return match
      ? [{ pid: Number(match[1]), address: match[2], name: match[3].trim() }]
      : [];
  });
  const accepted = new Set(
    rows
      .filter((row) => row.pid === endpoint.pid && row.name === endpoint.socket)
      .map((row) => row.address),
  );
  const clients = [
    ...new Set(
      rows
        .filter(
          (row) => row.name.startsWith('->') && accepted.has(row.name.slice(2)),
        )
        .map((row) => row.pid),
    ),
  ].sort((a, b) => a - b);
  if (
    !clients.includes(cliPid) ||
    clients.some((pid) => pid !== cliPid && pid !== readerPid)
  )
    throw Error('Codex hook client ambiguous');
  return { ...endpoint, clients: clients.filter((pid) => pid !== readerPid) };
}

export async function readHookPeer(
  cliPid: number,
  execute: typeof exec = exec,
): Promise<HookPeer> {
  const listing = await execute(
    '/usr/sbin/lsof',
    ['-n', '-a', '-U', '-u', String(process.getuid?.())],
    {
      timeout: 1500,
      maxBuffer: 4e6,
      message: 'Codex hook peer unavailable',
    },
  );
  const peer = peerFromListing(listing, cliPid, process.pid);
  safeSocket(peer.socket);
  return peer;
}
