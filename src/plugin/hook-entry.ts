// Explicit CLI bootstrap: Rollup's CommonJS wrapper is not Node's main module.
void require('../agents/claude/hook').main().catch(() => {});
export {};
