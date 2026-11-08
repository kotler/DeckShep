const { validate } = require('../../src/schemas');

/** Executable design contract only. No native helper, socket I/O, process
 * inspection or production capability can be reached from this module. */
async function fixturePeerLease({ socket, current, now, capture, signal }) {
  const marker = 'fixture-post-close-peer-lease';
  const initial = binding(current()),
    started = now();
  let phase = 'capturing',
    last = started,
    session,
    image,
    busy = false,
    disposed = false,
    cleanupFailed = false,
    hasWritten = false;
  const stopped = new AbortController();
  function close() {
    if (disposed) return;
    disposed = true;
    stopped.abort();
    signal?.removeEventListener('abort', close);
    try {
      if (typeof session?.close === 'function') session.close();
    } catch {
      cleanupFailed = true;
    }
  }
  signal?.addEventListener('abort', close, { once: true });
  function refuse() {
    phase = 'closed';
    close();
    throw Error(
      hasWritten ? 'Fixture peer uncertain' : 'Fixture lease refused',
    );
  }
  function check() {
    const time = now(),
      value = current();
    if (
      disposed ||
      signal?.aborted ||
      !Number.isFinite(time) ||
      time < last ||
      time - started >= 1000 ||
      value.socket !== socket ||
      socket.destroyed ||
      binding(value) !== initial
    )
      refuse();
    last = time;
  }
  async function bounded(action) {
    check();
    const abort = AbortSignal.any([
      stopped.signal,
      AbortSignal.timeout(Math.min(500, 1000 - (last - started))),
      ...(signal ? [signal] : []),
    ]);
    let onAbort;
    try {
      const failed = new Promise((_, reject) => {
        onAbort = () => reject(Error(marker));
        abort.addEventListener('abort', onAbort, { once: true });
        if (abort.aborted) onAbort();
      });
      const result = await Promise.race([
        Promise.resolve().then(action),
        failed,
      ]);
      check();
      return result;
    } catch {
      refuse();
    } finally {
      abort.removeEventListener('abort', onAbort);
    }
  }
  function evidence(value, requireKernel) {
    if (
      !value ||
      Object.keys(value).sort().join(',') !== 'image,kernel' ||
      !['matched', 'unavailable'].includes(value.kernel) ||
      (requireKernel && value.kernel !== 'matched')
    )
      refuse();
    const identity = validate('herdrAppPeer', value.image);
    if (identity.uid !== process.getuid()) refuse();
    if (image && JSON.stringify(identity) !== JSON.stringify(image)) refuse();
    return identity;
  }
  async function operation(expected, next, action) {
    try {
      if (busy || phase !== expected) refuse();
      busy = true;
      check();
      const result = await action();
      check();
      phase = next;
      return result;
    } catch {
      refuse();
    } finally {
      busy = false;
    }
  }
  try {
    if (!socket || !Number.isFinite(started) || initial === null) refuse();
    check();
    const pending = Promise.resolve().then(capture);
    // A late capture after cancellation must dispose its private session too.
    pending.then(
      (value) => {
        session = value;
        if (disposed && typeof value?.close === 'function') {
          try {
            value.close();
          } catch {
            cleanupFailed = true;
          }
        }
      },
      () => {},
    );
    session = await bounded(() => pending);
    if (
      !session ||
      typeof session.check !== 'function' ||
      typeof session.close !== 'function'
    )
      refuse();
    image = evidence(session.captured, true);
    phase = 'captured';
    return Object.freeze({
      async beforeWrite() {
        return operation('captured', 'ready', async () => {
          evidence(await bounded(() => session.check('connected')), true);
        });
      },
      markWritten() {
        if (phase !== 'ready') refuse();
        check();
        phase = 'written';
        hasWritten = true;
      },
      acceptReply(bytes) {
        try {
          if (
            phase !== 'written' ||
            !Buffer.isBuffer(bytes) ||
            bytes.length > 1000000 ||
            bytes.indexOf(10) !== bytes.length - 1
          )
            refuse();
          check();
          const text = new TextDecoder('utf-8', { fatal: true }).decode(
            bytes.subarray(0, -1),
          );
          const reply = validate('herdrAppFocusReply', JSON.parse(text));
          if (reply.ok !== true) refuse();
          phase = 'reply';
        } catch {
          refuse();
        }
      },
      async finish() {
        const result = await operation('reply', 'finished', async () => {
          // Burn finalization before awaiting: overlaps/replays cannot recapture.
          phase = 'finishing';
          evidence(await bounded(() => session.check('retained')), false);
          return Object.freeze({
            proof: 'same-peer-image',
            verifiedFocus: false,
            grantsInput: false,
          });
        });
        close();
        if (cleanupFailed) throw Error('Fixture peer uncertain');
        return result;
      },
      dispose: close,
    });
  } catch {
    refuse();
  }
}
function binding(value) {
  if (
    !value ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1 ||
    !['endpoint', 'record', 'peer', 'request'].every(
      (key) =>
        typeof value[key] === 'string' &&
        /^[^\x00-\x1f\x7f]{1,1024}$/.test(value[key]),
    )
  )
    return null;
  return JSON.stringify([
    value.endpoint,
    value.generation,
    value.record,
    value.peer,
    value.request,
  ]);
}
module.exports = { fixturePeerLease };
