const { diagnostics } = require('../app/setup');
void diagnostics().then((checks: { id: string; ok: boolean; reason: string }[]) => {
  console.log(process.argv.includes('--json') ? JSON.stringify(checks, null, 2) : checks.map(check => `${check.ok ? 'OK' : 'CHECK'} ${check.id}: ${check.reason}`).join('\n'));
}).catch(() => { console.error('Doctor checks unavailable'); process.exitCode = 1; });
export {};
