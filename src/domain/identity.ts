type AgentSnapshot = import('./types').AgentSnapshot;
type Config = import('./types').Config;
type PressContext = import('./types').PressContext;
function state(
  records: any[],
  agent: Pick<import('./types').AgentSnapshot, 'app' | 'pid' | 'name'>,
  now: number | undefined = Date.now(),
  maxAge: number | undefined = 86400000,
) {
  const valid: any[] = records.filter(
    (r: any) =>
      (r.effective_app || r.app) === agent.app &&
      r.owner?.pid === agent.pid &&
      r.owner?.name === agent.name &&
      Number.isFinite(Date.parse(r.updated_at)) &&
      now - Date.parse(r.updated_at) <= maxAge &&
      Date.parse(r.updated_at) <= now + 60000,
  );
  const priority: string[] = ['blocked', 'error', 'working', 'done', 'idle'];
  for (const s of priority) {
    const r: any = valid.find((r: any) => r.state === s);
    if (r) return { state: s, kind: r.kind, statusAt: r.updated_at };
  }
  return { state: 'unknown' };
}
const token: (t: any) => string = (t: any) =>
  [t.session, t.block, t.app, t.pid, t.name].join('|');
module.exports = { state, token };

export {};
