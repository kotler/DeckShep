const net = require('node:net');
const { z } = require('zod');
const { parse, validate } = require('../../../src/schemas');
const localId = z.string().regex(/^[A-Za-z0-9._:-]{1,1024}$/);
const spaceCreated = z
  .object({
    space: localId,
    tab: localId,
    terminal: z.string().regex(/^t[1-9][0-9]*$/),
  })
  .strict();

/** Test setup has one fixed mutation: two local /bin/cat spaces. There is no
 * generic action, input, terminal read/attach, CLI or production endpoint path. */
class CalibrationChannel {
  constructor(gate, { timeoutMs = 3000 } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
      throw Error('Invalid calibration timeout');
    this.gate = gate;
    this.timeoutMs = timeoutMs;
    this.setupCount = 0;
  }
  async exchange(kind, payloads, schemas) {
    this.validateRequests(kind, payloads);
    const endpoint = this.gate.check(kind);
    this.gate.checkBoth();
    this.gate.progress = kind + '.connect';
    const started = performance.now();
    const metrics = (this.gate.exchangeMetrics = {
      receivedBytes: 0,
      writtenBytes: 0,
      writeDrained: false,
    });
    const signal = AbortSignal.any([
        AbortSignal.timeout(this.timeoutMs),
        ...(this.gate.signal ? [this.gate.signal] : []),
      ]),
      socket = net.createConnection({
        path: endpoint.file,
        allowHalfOpen: true,
      });
    let pending = null,
      buffer = Buffer.alloc(0),
      failed = false;
    function fail() {
      failed = true;
      pending?.reject(Error('Calibration channel failed'));
      pending = null;
      socket.destroy();
    }
    const abort = () => fail();
    signal.addEventListener('abort', abort, { once: true });
    socket.on('error', fail);
    socket.on('end', () => {
      if (pending) fail();
    });
    socket.on('data', (bytes) => {
      metrics.receivedBytes += bytes.length;
      if (!pending || buffer.length + bytes.length > 1000000) return fail();
      buffer = Buffer.concat([buffer, bytes]);
      const end = buffer.indexOf(10);
      if (end < 0) return;
      if (end !== buffer.length - 1) return fail();
      try {
        const line = new TextDecoder('utf-8', { fatal: true }).decode(
            buffer.subarray(0, end),
          ),
          current = pending;
        buffer = Buffer.alloc(0);
        pending = null;
        current.resolve(line);
      } catch {
        fail();
      }
    });
    try {
      await new Promise((resolve, reject) => {
        pending = { reject };
        socket.once('connect', () => {
          pending = null;
          resolve();
        });
      });
      this.gate.progress = kind + '.peer-before';
      metrics.connectedMs = Math.round(performance.now() - started);
      const before = await this.gate.peer(kind, socket, signal),
        results = [];
      metrics.peerVerifiedMs = Math.round(performance.now() - started);
      for (let index = 0; index < payloads.length; index++) {
        if (failed || signal.aborted) throw Error();
        this.gate.progress = kind + '.reply.' + index;
        const response = new Promise((resolve, reject) => {
          pending = { resolve, reject };
        });
        // No await between the last ownership/path checks and this write.
        try {
          this.gate.checkBoth();
          metrics.writeQueuedMs = Math.round(performance.now() - started);
          socket.write(JSON.stringify(payloads[index]) + '\n', (error) => {
            if (error) fail();
            else metrics.writeDrained = true;
          });
          metrics.writtenBytes = socket.bytesWritten;
        } catch {
          fail();
        }
        const line = await response,
          message =
            schemas[index] === 'spaceCreated'
              ? spaceCreated.parse(JSON.parse(line))
              : parse(schemas[index], line);
        this.gate.progress = kind + '.peer-after.' + index;
        const after = await this.gate.peer(kind, socket, signal);
        if (signal.aborted || JSON.stringify(before) !== JSON.stringify(after))
          throw Error();
        results.push(message);
      }
      return results;
    } catch {
      throw Error('Calibration exchange refused');
    } finally {
      signal.removeEventListener('abort', abort);
      socket.destroy();
    }
  }
  validateRequests(kind, payloads) {
    if (kind === 'app' && payloads.length === 1) {
      const request = payloads[0];
      if (request?.do === 'space.new') {
        z.object({
          do: z.literal('space.new'),
          args: z
            .object({
              name: z.enum(['Calibration 1', 'Calibration 2']),
              folder: z.literal(this.gate.root),
              machine: z.literal(''),
              argv: z.tuple([z.literal('/bin/cat')]),
            })
            .strict(),
        })
          .strict()
          .parse(request);
      } else validate('herdrAppRequest', request);
    } else if (
      kind === 'core' &&
      payloads.length === 2 &&
      payloads[0]?.method === 'hello' &&
      payloads[1]?.method === 'server.status'
    ) {
      for (const request of payloads) validate('herdrCoreRequest', request);
    } else throw Error('Unsupported calibration request');
  }
  async appRead(request, schema) {
    validate('herdrAppRequest', request);
    return (await this.exchange('app', [request], [schema]))[0];
  }
  async coreStatus() {
    const requests = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'hello',
        params: { generation: 1, framed: false },
      },
      { jsonrpc: '2.0', id: 2, method: 'server.status', params: {} },
    ];
    for (const request of requests) validate('herdrCoreRequest', request);
    const replies = await this.exchange('core', requests, [
      'herdrCoreMessage',
      'herdrCoreMessage',
    ]);
    if (
      replies.some(
        (reply, index) =>
          reply.id !== requests[index].id || !Object.hasOwn(reply, 'result'),
      )
    )
      throw Error('Calibration core mismatch');
    const hello = validate('herdrCoreHello', replies[0].result),
      status = validate('herdrCoreStatus', replies[1].result);
    if (
      status.pid !== this.gate.children.core.pid ||
      status.version !== hello.version ||
      status.core.id !== hello.core.id ||
      hello.version !== this.gate.artifacts.manifest.core.version
    )
      throw Error('Calibration core mismatch');
    return hello;
  }
  async newSpace() {
    if (++this.setupCount > 2) throw Error('Calibration setup exhausted');
    const reply = (
      await this.exchange(
        'app',
        [
          {
            do: 'space.new',
            args: {
              name: 'Calibration ' + this.setupCount,
              folder: this.gate.root,
              machine: '',
              argv: ['/bin/cat'],
            },
          },
        ],
        ['spaceCreated'],
      )
    )[0];
    return reply;
  }
}
module.exports = { CalibrationChannel };
