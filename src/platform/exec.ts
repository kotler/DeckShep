import { execFile } from 'node:child_process';

export type ExecFailureKind =
  | 'timeout'
  | 'permission'
  | 'missing-executable'
  | 'output-limit'
  | 'connection-refused'
  | 'invalid-option'
  | 'not-found'
  | 'exit'
  | 'other';
export interface ExecFailure {
  kind: ExecFailureKind;
  exitCode: number | null;
}
export interface ExecOptions {
  timeout?: number;
  maxBuffer?: number;
  input?: string | Buffer;
  env?: NodeJS.ProcessEnv;
  message?: string;
  onFailure?: (failure: ExecFailure) => void;
}
function failureKind(
  error: { code?: string | number; killed?: boolean },
  stderr: string,
): ExecFailureKind {
  if (error.code === 'ENOENT') return 'missing-executable';
  if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output-limit';
  if (error.killed) return 'timeout';
  if (
    ['EACCES', 'EPERM'].includes(String(error.code)) ||
    /permission denied|operation not permitted|access is denied/i.test(stderr)
  )
    return 'permission';
  if (/connection refused|actively refused/i.test(stderr))
    return 'connection-refused';
  if (
    /unknown (?:flag|option)|unrecognized (?:flag|option)|flag provided but not defined/i.test(
      stderr,
    )
  )
    return 'invalid-option';
  if (/deadline exceeded|timed? out|request timeout/i.test(stderr))
    return 'timeout';
  if (/not found|no such (?:file|session|block)|does not exist/i.test(stderr))
    return 'not-found';
  return typeof error.code === 'number' ? 'exit' : 'other';
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
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        if (options.onFailure) {
          try {
            options.onFailure({
              kind: failureKind(error, stderr),
              exitCode: typeof error.code === 'number' ? error.code : null,
            });
          } catch {
            /* Optional diagnostics cannot replace the command failure. */
          }
        }
        reject(Error(options.message ?? 'Local command failed'));
      },
    );
    child.stdin?.on('error', () => {});
    if (options.input !== undefined) child.stdin?.end(options.input);
  });
}
