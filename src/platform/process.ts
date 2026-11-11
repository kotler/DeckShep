export interface OwnedProcess {
  ownerText: string;
  parent?: number;
  startedAt: string;
  executable: string;
}
/** Parse only kernel-reported owner/start/executable evidence, never ancestry. */
export function parseOwnedProcess(
  output: string,
  withParent: boolean,
  message: string,
): OwnedProcess {
  const parent =
    /^\s*(\d+)\s+(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/;
  const direct =
    /^\s*(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/;
  const match = (withParent ? parent : direct).exec(output || '');
  if (!match || Number(match[1]) !== process.getuid?.()) throw Error(message);
  return {
    ownerText: match[1],
    parent: withParent ? Number(match[2]) : undefined,
    startedAt: match[withParent ? 3 : 2].replace(/\s+/g, ' '),
    executable: match[withParent ? 4 : 3],
  };
}
