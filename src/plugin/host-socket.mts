import { EventEmitter } from 'node:events';
import WebSocket, { type ClientOptions } from 'ws';
/** SDK 2 has no public disconnect callback. Observe transport lifecycle only;
 * registration, protocol and action I/O remain entirely owned by the SDK. */
export default class HostSocket extends WebSocket {
  constructor(address: string, options?: ClientOptions) {
    super(address, options);
    this.once('close', () =>
      EventEmitter.prototype.emit.call(process, 'asw:host:close'),
    );
    this.once('error', () =>
      EventEmitter.prototype.emit.call(process, 'asw:host:error'),
    );
  }
}
