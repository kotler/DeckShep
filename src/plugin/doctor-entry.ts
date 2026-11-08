const { diagnostics, sessionChoices, sessionChecks } = require('../app/setup');
void Promise.all([diagnostics(), sessionChoices()])
  .then(([base, sessions]) => {
    const checks: { id: string; ok: boolean; reason: string }[] = [
      ...base,
      ...sessionChecks(sessions),
    ];
    console.log(
      process.argv.includes('--json')
        ? JSON.stringify(checks, null, 2)
        : checks
            .map(
              (check) =>
                `${check.ok ? 'OK' : 'CHECK'} ${check.id}: ${check.reason}`,
            )
            .join('\n'),
    );
  })
  .catch(() => {
    console.error('Doctor checks unavailable');
    process.exitCode = 1;
  });
export {};
