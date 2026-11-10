const { diagnostics, sessionChoices, sessionChecks } = require('../app/setup');
const { herdrAppChecks } = require('../app/herdr-app-diagnostics');
const { appFocusBackend } = require('../app/herdr-app-backend');
const result = process.argv.includes('--herdr-app')
  ? Promise.resolve([
      herdrAppChecks({
        helperAvailable: appFocusBackend.helperAvailable(),
        recordCount: appFocusBackend.recordCount,
      }),
      [],
    ])
  : process.argv.includes('--herdr')
    ? Promise.all([diagnostics({ herdr: true }), sessionChoices()])
    : Promise.all([diagnostics(), Promise.resolve([])]);
void result
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
