/** Enumerated read-only Rex wire calls. Unknown block methods never inherit
 * read authority merely because they share a command prefix. */
const reads = new Set(['process', 'program_status', 'modes', 'size', 'format']);
export function isRexRead(args: readonly string[]): boolean {
  return (
    (args[0] === 'client' &&
      args[1] === 'ls' &&
      args[2] === '--json' &&
      args.length === 3) ||
    (args[0] === 'ls' && args[1] === '--json' && args.length === 2) ||
    (args[0] === 'session' &&
      args[1] === 'inspect' &&
      args[3] === '--json' &&
      args.length === 4) ||
    (args[0] === 'block' && args[1] === 'call' && reads.has(args[6] ?? ''))
  );
}
