const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
function authorization(backend, env = process.env) {
  if (env.CI) return 'Live tests never run in CI';
  if (env.ASW_LIVE !== '1') return 'Set ASW_LIVE=1 only after current explicit authorization';
  if (env.ASW_LIVE_AUTHORIZATION !== 'test-owned-only') return 'Current authorization must be acknowledged with ASW_LIVE_AUTHORIZATION=test-owned-only';
  if (backend === 'rex' && env.ASW_LIVE_REX !== '1') return 'Rex also requires ASW_LIVE_REX=1';
  return null;
}
function settingsHashes(home) {
  return Object.fromEntries(['.codex/config.toml', '.claude/settings.json', '.claude.json'].map(name => {
    const file = path.join(home, name);
    if (!fs.existsSync(file)) return [name, 'absent'];
    const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw Error('Unsafe settings snapshot');
    return [name, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
  }));
}
function processIdentity(pid) {
  const text = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'uid=,ppid=,lstart='], { encoding: 'utf8', timeout: 1800 });
  const match = /^\s*(\d+)\s+(\d+)\s+(.+)\s*$/.exec(text);
  if (!match || Number(match[1]) !== process.getuid()) throw Error('Process ownership unverified');
  return { pid, ppid: Number(match[2]), started: match[3].trim() };
}
class OwnedProcesses {
  constructor(inspect = processIdentity, launch = spawn) { this.inspect = inspect; this.launch = launch; this.owned = new Map(); }
  spawn(file, args, options) {
    const child = this.launch(file, args, { ...options, shell: false, stdio: 'ignore' });
    if (!child.pid) throw Error('Test process did not start');
    this.owned.set(child.pid, { child, identity: this.inspect(child.pid) }); return child;
  }
  assert(pid) {
    let current = pid;
    for (let depth = 0; depth < 32; depth++) {
      const found = this.owned.get(current), identity = this.inspect(current);
      if (found) { if (identity.started !== found.identity.started || found.child.exitCode !== null) throw Error('Test process replaced'); return; }
      if (identity.ppid <= 1 || identity.ppid === current) break;
      current = identity.ppid;
    }
    throw Error('PID was not spawned by this test');
  }
  close() {
    for (const [pid, entry] of this.owned) { if (entry.child.exitCode !== null) continue; this.assert(pid); entry.child.kill('SIGTERM'); }
  }
}
module.exports = { authorization, settingsHashes, OwnedProcesses };
