import { parse } from '../../schemas';
import path from 'node:path';
import { exec } from '../../platform/exec.ts';
import {
  discoverRex,
  pluginDirectory,
  type RexInstallation,
} from '../../platform/paths.ts';
export interface TransportPorts {
  discover: typeof discoverRex;
  execute: typeof exec;
  now: () => number;
  directory: string;
}
const defaultPorts: TransportPorts = {
  discover: discoverRex,
  execute: exec,
  now: Date.now,
  directory: pluginDirectory,
};
export class RexTransport {
  #cached?: { key: string; until: number; value: Promise<RexInstallation> };
  constructor(
    private readonly config: () => {
      rexPath?: string;
      allowClipboardFocus?: boolean;
      bringToFront?: boolean;
    },
    private readonly ports: TransportPorts = defaultPorts,
  ) {}
  private installation(): Promise<RexInstallation> {
    const key = this.config().rexPath ?? '';
    if (
      !this.#cached ||
      this.#cached.key !== key ||
      this.#cached.until < this.ports.now()
    ) {
      const value = this.ports.discover(key);
      this.#cached = { key, until: this.ports.now() + 2000, value };
      void value.catch(() => {
        this.#cached = undefined;
      });
    }
    return this.#cached.value;
  }
  async command(
    args: string[],
    input?: string,
    beforeIO: () => void = () => {},
  ): Promise<unknown> {
    const { binary } = await this.installation();
    beforeIO();
    const output = (
      await this.ports.execute(
        binary,
        ['--autostart=false', '--timeout', '2s', ...args],
        {
          timeout: 3500,
          maxBuffer: 2e6,
          input,
          message: 'Rex command failed',
        },
      )
    ).trim();
    if (!output) return null;
    // Non-JSON CLI acknowledgements are plain text; malformed JSON is refused.
    if (/^[{\[]/.test(output)) return parse('rexResponse', output);
    return output;
  }
  async activate(beforeIO: () => void = () => {}): Promise<void> {
    const { application } = await this.installation();
    beforeIO();
    if (this.config().bringToFront === false)
      throw Error('Rex activation disabled');
    await this.ports.execute('/usr/bin/open', ['-a', application], {
      timeout: 5000,
      message: 'Could not bring Rex to front',
    });
  }
  async visible(clientId: string): Promise<string> {
    if (this.config().allowClipboardFocus !== true)
      throw Error('Enable visible-pane checks first');
    const { binary } = await this.installation();
    if (this.config().allowClipboardFocus !== true)
      throw Error('Enable visible-pane checks first');
    const output = await this.ports.execute(
      path.join(this.ports.directory, 'bin', 'visible-pane'),
      [binary, clientId],
      {
        timeout: 4500,
        maxBuffer: 2048,
        message: 'Visible pane query failed; no input sent',
      },
    );
    try {
      const result = parse('visiblePane', output);
      if (
        !/^block:[0-9a-f-]{36}$/i.test(result.block_id) ||
        result.clipboard_restored !== true
      )
        throw Error();
      return result.block_id;
    } catch {
      throw Error('Invalid visible pane result');
    }
  }
}
