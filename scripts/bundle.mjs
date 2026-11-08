import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

export async function bundle(input, file, options = {}) {
  const builtins = new Set(builtinModules.flatMap(name => [name, 'node:' + name]));
  const build = await rollup({
    input,
    external: name => builtins.has(name) || name.startsWith('node:'),
    plugins: [
      { name: 'composition-and-privacy',
        resolveId(source, importer) {
          if (options.fixture && /(?:^|\/)dependencies(?:\.ts)?$/.test(source) && importer?.endsWith('/src/plugin/entry.mts')) return path.resolve(options.fixture);
          if (source.endsWith('logging/index.js') && importer?.includes('@elgato/streamdeck/')) return path.resolve('src/plugin/private-logger.ts');
          return null;
        },
      },
      {
        name: 'typed-source',
        transform(code, id) {
          if (id.includes('node_modules') || id.startsWith('\0') || !/\.[cm]?ts$/.test(id)) return null;
          const result = ts.transpileModule(code, { fileName: id, compilerOptions: {
            module: /(?:entry\.mts|dependencies\.ts|private-logger\.ts)$/.test(id) && id.includes('/src/plugin/') ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
            sourceMap: false, removeComments: true, esModuleInterop: true,
          } });
          return { code: result.outputText, map: null };
        },
      },
      commonjs({ extensions: ['.js', '.ts', '.cjs'] }),
      nodeResolve({ preferBuiltins: true, extensions: ['.mjs', '.js', '.json', '.node', '.ts'] }),
      json(),
    ],
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      warn(warning);
    },
  });
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await build.write({ file, format: options.browser ? 'iife' : 'cjs', name: options.name, sourcemap: false, exports: 'auto', inlineDynamicImports: true });
  } finally { await build.close(); }
}
