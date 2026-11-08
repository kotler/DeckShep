// SDK trace/error entries can contain entire host frames. The bundled SDK uses
// this sink so malformed frames, settings and prompt text never reach disk.
const sink = {
  createScope: () => sink,
  setLevel: () => sink,
  write: () => sink,
  debug: () => sink,
  error: () => sink,
  info: () => sink,
  trace: () => sink,
  warn: () => sink,
};
export const logger = sink;
