import { createRequire } from 'node:module';

const require = createRequire(new URL('./tools/package.json', import.meta.url));
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

export default [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'backups/**',
      'coverage/**',
      'vendor/**',
      'com.kotl3r.deckshep.sdPlugin/bin/**',
      'com.kotl3r.deckshep.sdPlugin/*js',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.mts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.json' },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      'no-control-regex': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // Legacy family types are explicit during migration; boundary schemas and
      // new contracts are typed. Tighten per family without deleting guards.
    },
  },
  {
    files: ['tests/e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './tsconfig.e2e.json' },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: { 'no-control-regex': 'off' },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['tests/e2e/virtual-deck/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['com.kotl3r.deckshep.sdPlugin/inspector.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, RexPreferences: 'readonly' },
    },
  },
  {
    files: ['com.kotl3r.deckshep.sdPlugin/*.js', 'tests/**/*.js'],
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
