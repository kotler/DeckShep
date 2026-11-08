# Phase 2: typed migration checkpoint

Behavior change: none. All 26 JavaScript runtime syntax trees match the Phase 1
checkpoint after removing comments and redundant assertion parentheses. The
full 42-test Node suite (including eight Python distribution checks) passes and
golden snapshots are unchanged. Strict `allowJs`/`checkJs` typechecking passes
with no `@ts-ignore`, `@ts-nocheck` or `@ts-expect-error` suppressions.

`src/domain/types.ts` defines agent identity/state, press captures, controls,
backend capabilities, configuration and v2 preferences. Legacy injected ports
and wire objects retain explicit dynamic types during this migration; these are
not proof of validated external input. Phase 3 must replace delivery ports with
the guarded backend contract, and Phase 4 must validate wire data at boundaries.
Existing native checks remain in place throughout.

TypeScript 6 is pinned for its compiler API and build-tool compatibility. The
CI gate now runs lint, strict typecheck and the complete isolated test suite on
macOS/Node 22; Phase 7 extends it with the build and distribution release gates.
