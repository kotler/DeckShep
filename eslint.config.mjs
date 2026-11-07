import { createRequire } from 'node:module';

const require = createRequire(new URL('./tools/package.json', import.meta.url));
const js = require('@eslint/js');
const globals = require('globals');

export default [
  { ignores: ['**/node_modules/**', 'dist/**', 'backups/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['com.local.rexagents.sdPlugin/inspector.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, RexPreferences: 'readonly' },
    },
  },
  {
    files: ['com.local.rexagents.sdPlugin/*.js', 'tests/**/*.js'],
    rules: {
      // These patterns deliberately reject controls or parse native ANSI views.
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // TODO Phase 3: remove unused legacy imports/locals one module family at a
      // time. Do not rewrite guard regexes or exception privacy in hygiene work.
      'no-unused-vars': 'off',
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
];
