/** Releases exercised in native calibration. This advisory never gates input. */
export const CLAUDE_TESTED = ['2.1.319', '2.1.322'] as const;

export function claudeVersionStatus(version: unknown) {
  if (
    typeof version !== 'string' ||
    !/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(version)
  )
    return 'unknown';
  return CLAUDE_TESTED.some((tested) => tested === version)
    ? 'tested'
    : 'unverified';
}

export function claudeVersionNote(version: unknown): string {
  const status = claudeVersionStatus(version);
  if (status === 'unknown') return 'Claude Code version could not be read';
  if (status === 'tested')
    return `Claude Code ${version} has been tested with DeckShep`;
  return `Claude Code ${version} has not been verified. Tested releases: ${CLAUDE_TESTED.join(', ')}`;
}
