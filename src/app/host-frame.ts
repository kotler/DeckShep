/** A frame the application sends to the Stream Deck host. */
export type HostFrame =
  | {
      event: 'setImage';
      context: string;
      payload: { image: string; target: number };
    }
  | {
      event: 'setTitle';
      context: string;
      payload: { title: string; target: number };
    }
  | { event: 'showAlert'; context: string; payload: Record<string, never> }
  | {
      event: 'setGlobalSettings';
      context?: string;
      payload: Record<string, unknown>;
    }
  | {
      event: 'sendToPropertyInspector';
      context: string;
      payload: Record<string, unknown>;
    };

/** A socket that accepts typed frames; the application falls back to JSON text. */
export interface TypedHostPort {
  deliver(frame: HostFrame): void;
}
