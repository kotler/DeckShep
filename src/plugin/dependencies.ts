/** Production composition. Tests replace this module at bundle time; shipped
 * code has no environment variable or message that enables fixture delivery. */
export function applicationDependencies(): Record<string, unknown> {
  // Retain the internal codec switch and persisted v3 shape used by previews.
  // The released App profile needs no experimental config or fixture factory.
  return { experimentalHerdrApp: true };
}
