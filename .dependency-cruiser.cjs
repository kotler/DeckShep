module.exports = {
  forbidden: [
    {
      name: 'domain-is-pure',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'guards-only-domain',
      severity: 'error',
      from: { path: '^src/guards/' },
      to: { pathNot: '^src/(domain|guards)/' },
    },
    {
      name: 'providers-never-concrete-terminals',
      severity: 'error',
      from: { path: '^src/agents/' },
      to: { path: '^src/(terminals|app|plugin)/' },
    },
    {
      name: 'terminals-never-concrete-providers',
      severity: 'error',
      from: { path: '^src/terminals/' },
      to: { path: '^src/(agents|app|plugin)/' },
    },
    {
      name: 'sdk-only-in-plugin',
      severity: 'error',
      from: { path: '^src/(?!plugin/)' },
      to: { path: 'node_modules/@elgato/streamdeck/' },
    },
    {
      name: 'no-unresolved-source',
      severity: 'error',
      from: { path: '^src/' },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.mts', '.js', '.json'],
      conditionNames: ['require', 'import', 'node', 'default'],
    },
    exclude: { path: 'node_modules' },
  },
};
