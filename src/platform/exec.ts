import { execFile } from 'node:child_process';

export interface ExecOptions {
  timeout?: number;
  maxBuffer?: number;
  input?: string | Buffer;
  env?: NodeJS.ProcessEnv;
  message?: string;
}

/** Bounded, non-shell execution. Error text never includes arguments or output. */
export function exec(
  file: string,
  args: readonly string[],
  options: ExecOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      [...args],
      {
        timeout: options.timeout ?? 1800,
        maxBuffer: options.maxBuffer ?? 32768,
        env: {
          ...process.env,
          ...options.env,
          REX_SESSION: '',
          REX_BLOCK: '',
          REX_CLIENT: '',
        },
        encoding: 'utf8',
      },
      (error, stdout) =>
        error
          ? reject(Error(options.message ?? 'Local command failed'))
          : resolve(stdout),
    );
    child.stdin?.on('error', () => {});
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}
