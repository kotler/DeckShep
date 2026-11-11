import type { AgentSnapshot, AgentState } from './types';

/** One status record as written by a provider hook. */
export interface StatusRecord {
  app?: string;
  effective_app?: string;
  owner?: { pid?: number; name?: string };
  updated_at: string;
  state?: string;
  kind?: AgentSnapshot['kind'];
}
export interface StatusResult {
  state: AgentState;
  kind?: AgentSnapshot['kind'];
  statusAt?: string;
}
export function state(
  records: StatusRecord[],
  agent: Pick<AgentSnapshot, 'app' | 'pid' | 'name'>,
  now: number | undefined = Date.now(),
  maxAge: number | undefined = 86400000,
): StatusResult {
  const valid: StatusRecord[] = records.filter(
    (r: StatusRecord) =>
      (r.effective_app || r.app) === agent.app &&
      r.owner?.pid === agent.pid &&
      r.owner?.name === agent.name &&
      Number.isFinite(Date.parse(r.updated_at)) &&
      now - Date.parse(r.updated_at) <= maxAge &&
      Date.parse(r.updated_at) <= now + 60000,
  );
  const priority: AgentState[] = [
    'blocked',
    'error',
    'working',
    'done',
    'idle',
  ];
  for (const s of priority) {
    const r: StatusRecord | undefined = valid.find(
      (r: StatusRecord) => r.state === s,
    );
    if (r) return { state: s, kind: r.kind, statusAt: r.updated_at };
  }
  return { state: 'unknown' };
}
type TokenSource = Pick<
  AgentSnapshot,
  'session' | 'block' | 'app' | 'pid' | 'name'
>;
export const token: (t: TokenSource) => string = (t: TokenSource) =>
  [t.session, t.block, t.app, t.pid, t.name].join('|');
