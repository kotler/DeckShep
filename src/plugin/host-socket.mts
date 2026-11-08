import WebSocket, { type ClientOptions } from 'ws';
/** SDK 2 has no public disconnect callback. Observe transport lifecycle only;
 * registration, protocol and action I/O remain entirely owned by the SDK. */
export default class HostSocket extends WebSocket {
  constructor(address: string, options?: ClientOptions) {
    super(address, options);
    this.once('close', () => process.emit('asw:host:close'));
    this.once('error', () => process.emit('asw:host:error'));
  }
}
