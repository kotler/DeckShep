// @ts-check
/** @typedef {import("./types").AgentSnapshot} AgentSnapshot */

/** @param {any[]} records
 * @param {Pick<AgentSnapshot, "app" | "pid" | "name">} agent
 * @param {number} [now]
 * @param {number} [maxAge] */
function state(records, agent, now = Date.now(), maxAge = 86400000) {
  const valid = records.filter(
    (r) =>
      (r.effective_app || r.app) === agent.app &&
      r.owner?.pid === agent.pid &&
      r.owner?.name === agent.name &&
      Number.isFinite(Date.parse(r.updated_at)) &&
      now - Date.parse(r.updated_at) <= maxAge &&
      Date.parse(r.updated_at) <= now + 60000,
  );
  const priority = ['blocked', 'error', 'working', 'done', 'idle'];
  for (const s of priority) {
    const r = valid.find((r) => r.state === s);
    if (r) return { state: s, kind: r.kind, statusAt: r.updated_at };
  }
  return { state: 'unknown' };
}

const token =
  /** @param {any} t */
  (t) => [t.session, t.block, t.app, t.pid, t.name].join('|');
module.exports = { state, token };
