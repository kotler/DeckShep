import { createRequire } from 'node:module';

const tools = createRequire(new URL('../tools/package.json', import.meta.url));
const prettier = tools('prettier');
export async function formatJson(value, file) {
  const config = await prettier.resolveConfig(file);
  return prettier.format(JSON.stringify(value, null, 2) + '\n', {
    ...config,
    filepath: file,
  });
}
