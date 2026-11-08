const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
function authorization(backend, env = process.env) {
  if (env.CI) return 'Live tests never run in CI';
  if (env.ASW_LIVE !== '1')
    return 'Set ASW_LIVE=1 only after current explicit authorization';
  if (env.ASW_LIVE_AUTHORIZATION !== 'test-owned-only')
    return 'Current authorization must be acknowledged with ASW_LIVE_AUTHORIZATION=test-owned-only';
  if (backend === 'rex' && env.ASW_LIVE_REX !== '1')
    return 'Rex also requires ASW_LIVE_REX=1';
  return null;
}
function settingsHashes(home) {
  return Object.fromEntries(
    [
      '.codex/config.toml',
      '.codex/auth.json',
      '.claude/settings.json',
      '.claude/.credentials.json',
      '.claude.json',
    ].map((name) => {
      const file = path.join(home, name);
      if (!fs.existsSync(file)) return [name, 'absent'];
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw Error('Unsafe settings snapshot');
      return [
        name,
        crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      ];
    }),
  );
}
function processIdentity(pid) {
  const text = execFileSync(
    '/bin/ps',
    ['-p', String(pid), '-o', 'uid=,ppid=,lstart='],
    { encoding: 'utf8', timeout: 1800 },
  );
  const match = /^\s*(\d+)\s+(\d+)\s+(.+)\s*$/.exec(text);
  if (!match || Number(match[1]) !== process.getuid())
    throw Error('Process ownership unverified');
  return { pid, ppid: Number(match[2]), started: match[3].trim() };
}
class OwnedProcesses {
  constructor(
    inspect = processIdentity,
    launch = spawn,
    terminate = process.kill,
  ) {
    this.inspect = inspect;
    this.launch = launch;
    this.terminate = terminate;
    this.owned = new Map();
    this.observed = new Map();
  }
  spawn(file, args, options) {
    const child = this.launch(file, args, {
      ...options,
      shell: false,
      stdio: 'ignore',
    });
    if (!child.pid) throw Error('Test process did not start');
    this.owned.set(child.pid, { child, identity: this.inspect(child.pid) });
    return child;
  }
  assert(pid) {
    let current = pid;
    for (let depth = 0; depth < 32; depth++) {
      const found = this.owned.get(current),
        identity = this.inspect(current);
      if (found) {
        if (
          identity.started !== found.identity.started ||
          found.child.exitCode !== null ||
          found.child.signalCode != null
        )
          throw Error('Test process replaced');
        return;
      }
      if (identity.ppid <= 1 || identity.ppid === current) break;
      current = identity.ppid;
    }
    throw Error('PID was not spawned by this test');
  }
  observe(pid) {
    this.assert(pid);
    this.observed.set(pid, this.inspect(pid));
  }
  captureDescendants(rows) {
    rows ??= execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], {
      encoding: 'utf8',
      timeout: 1800,
    })
      .trim()
      .split('\n')
      .map((row) => row.trim().split(/\s+/).map(Number));
    const descendants = new Set(this.owned.keys());
    for (let depth = 0; depth < 32; depth++)
      for (const [pid, parent] of rows)
        if (descendants.has(parent)) descendants.add(pid);
    for (const pid of descendants) {
      try {
        this.observe(pid);
      } catch {
        /* Exited or replaced: never signal by table alone. */
      }
    }
  }
  close(signal = 'SIGTERM') {
    // The recorded start identity retains proof for a child reparented during
    // shutdown. Never claim a PID merely because it appeared in a process list.
    for (const [pid, identity] of [...this.observed].reverse()) {
      if (this.owned.has(pid)) continue;
      let current;
      try {
        current = this.inspect(pid);
      } catch {
        continue;
      }
      if (current.started !== identity.started) continue;
      this.terminate(pid, signal);
    }
    for (const [pid, entry] of [...this.owned].reverse()) {
      if (entry.child.exitCode !== null || entry.child.signalCode != null)
        continue;
      this.assert(pid);
      entry.child.kill(signal);
    }
  }
  async shutdown({ rows, graceMs = 8000 } = {}) {
    this.captureDescendants(rows);
    this.close();
    try {
      await this.waitForExit(graceMs);
      await this.assertObservedExited();
    } catch {
      this.captureDescendants(rows);
      this.close('SIGKILL');
      await this.waitForExit();
    }
    await this.assertObservedExited();
  }
  async assertObservedExited() {
    const deadline = Date.now() + 8000;
    for (;;) {
      const alive = [...this.observed].some(([pid, identity]) => {
        try {
          return this.inspect(pid).started === identity.started;
        } catch {
          return false;
        }
      });
      if (!alive) return;
      if (Date.now() > deadline) throw Error('Disposable agent did not exit');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  async waitForExit(timeout = 8000) {
    const deadline = Date.now() + timeout;
    while (
      [...this.owned.values()].some(
        ({ child }) => child.exitCode === null && child.signalCode == null,
      )
    ) {
      if (Date.now() > deadline) throw Error('Owned process did not exit');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
module.exports = { authorization, settingsHashes, OwnedProcesses };
