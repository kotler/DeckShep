import streamDeck, {
  SingletonAction,
  type KeyAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  type DidReceiveSettingsEvent,
  type SendToPluginEvent,
} from '@elgato/streamdeck';
import { EventEmitter } from 'node:events';
import { applicationDependencies } from './dependencies.ts';
import { parse, validate } from '../schemas/index.ts';
import { createApplication } from '../app/controller.ts';
import type { HostFrame } from '../app/host-frame.ts';

// The adapter owns all host I/O. The application sees a local event port and
// never registers a socket or reads Stream Deck launch arguments itself.
class HostPort extends EventEmitter {
  readyState = 1;
  readonly keys = new Map<
    string,
    KeyAction<WillAppearEvent['payload']['settings']>
  >();
  /** Typed frames from the application: no JSON hop, same host calls. */
  deliver(frame: HostFrame): void {
    const payload: Record<string, unknown> = frame.payload ?? {};
    const key = frame.context ? this.keys.get(frame.context) : undefined;
    let operation: Promise<unknown> | undefined;
    if (frame.event === 'setGlobalSettings')
      operation = streamDeck.settings.setGlobalSettings(payload as never);
    else if (frame.event === 'setImage' && key)
      operation = key.setImage(String(payload.image), { target: 0 });
    else if (frame.event === 'setTitle' && key)
      operation = key.setTitle(String(payload.title ?? ''), { target: 0 });
    else if (frame.event === 'showAlert' && key) operation = key.showAlert();
    else if (frame.event === 'sendToPropertyInspector')
      operation = streamDeck.ui.sendToPropertyInspector(payload as never);
    void operation?.catch(() => {}); // Host disconnects must not replay controls.
  }
  /** Text frames (registration, settings requests) are validated, then delivered. */
  send(raw: string): void {
    this.deliver(parse('hostEvent', raw) as HostFrame);
  }
}
const host = new HostPort();
const app = createApplication({ ...applicationDependencies(), socket: host });
class AgentKey extends SingletonAction {
  override readonly manifestId = 'com.kotl3r.deckshep.key';
  override onWillAppear(event: WillAppearEvent): void {
    if (!event.action.isKey()) return;
    host.keys.set(event.action.id, event.action);
    app.receive({
      event: 'willAppear',
      context: event.action.id,
      payload: { ...event.payload, coordinates: event.action.coordinates },
    });
  }
  override onWillDisappear(event: WillDisappearEvent): void {
    app.receive({ event: 'willDisappear', context: event.action.id });
    host.keys.delete(event.action.id);
  }
  override onKeyDown(event: KeyDownEvent): void {
    app.receive({
      event: 'keyDown',
      context: event.action.id,
      payload: event.payload,
    });
  }
  override onKeyUp(event: KeyUpEvent): void {
    app.receive({
      event: 'keyUp',
      context: event.action.id,
      payload: event.payload,
    });
  }
  override onDidReceiveSettings(event: DidReceiveSettingsEvent): void {
    app.receive({
      event: 'didReceiveSettings',
      context: event.action.id,
      payload: event.payload,
    });
  }
  override onSendToPlugin(event: SendToPluginEvent<never, never>): void {
    app.receive({
      event: 'sendToPlugin',
      context: event.action.id,
      payload: event.payload,
    });
  }
}
function disconnected(code: number): void {
  host.readyState = 0;
  for (const context of host.keys.keys())
    app.receive({ event: 'willDisappear', context });
  host.keys.clear();
  if (code) process.stderr.write('Stream Deck connection unavailable\n');
  process.exit(code);
}
process.once('asw:host:close', () => disconnected(0));
process.once('asw:host:error', () => disconnected(1));
// Preserve settings round-trips on the existing Stream Deck 6.6+ host protocol.
streamDeck.settings.useLegacySettingsBehavior = true;
streamDeck.actions.registerAction(new AgentKey());
streamDeck.settings.onDidReceiveGlobalSettings((event) => {
  try {
    app.receive({
      event: 'didReceiveGlobalSettings',
      payload: { settings: validate('globalSettings', event.settings) },
    });
  } catch {
    app.receive({
      event: 'didReceiveGlobalSettings',
      payload: { settings: { version: -1 } },
    });
  }
});
void streamDeck
  .connect()
  .then(() => streamDeck.settings.getGlobalSettings())
  .catch(() => {
    process.stderr.write('Stream Deck connection unavailable\n');
    process.exitCode = 1;
  });
