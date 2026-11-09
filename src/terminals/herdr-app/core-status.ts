import type { AppCoreFacts, AppCoreSnapshot } from '../../domain/app-selection';
import { HerdrCoreClient } from './transport';

export interface AppCoreProcess {
  address: string;
  pid: number;
  cwd: string;
  title: string;
}
export interface AppCoreStatusPort {
  read(): Promise<AppCoreSnapshot>;
  /** Fresh bracketed `terminal.get`; core facts only, never OS-verified. */
  terminal?(address: string): Promise<AppCoreProcess>;
  close(): void;
}
type CoreReads = Pick<
  HerdrCoreClient,
  'connect' | 'status' | 'list' | 'get' | 'close'
> & {
  readonly info: { core: { id: string } } | null;
  readonly generation: number;
};
const LOCAL = /^t[1-9][0-9]*$/;
function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
/** Read-only herdr-core status for key labels. It brackets one `terminal.list`
 * with `server.status` reads on one connection inside a fixed budget, keeps
 * only live local addresses and refuses duplicates instead of guessing. */
export class AppCoreStatusReader implements AppCoreStatusPort {
  #pending = false;
  constructor(
    private readonly client: CoreReads,
    private readonly timeoutMs = 1000,
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000)
      throw Error('Invalid core read limit');
  }
  static forSocket(socketPath: string): AppCoreStatusReader {
    return new AppCoreStatusReader(
      new HerdrCoreClient(socketPath, { timeoutMs: 1000 }),
    );
  }
  read(): Promise<AppCoreSnapshot> {
    return this.#bounded((signal) => this.#read(signal));
  }
  terminal(address: string): Promise<AppCoreProcess> {
    if (!LOCAL.test(address)) throw Error('Core terminal unavailable');
    return this.#bounded(async (signal) => {
      const t = await this.#bracket(signal, () => this.client.get(address));
      if (
        t.address !== address ||
        t.state !== 'live' ||
        !t.foreground ||
        !t.title
      )
        throw Error('Core terminal unavailable');
      return {
        address,
        pid: t.foreground.pid,
        cwd: t.foreground.cwd,
        title: t.title,
      };
    });
  }
  async #bounded<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#pending) throw Error('Core read pending');
    this.#pending = true;
    const budget = AbortSignal.timeout(this.timeoutMs);
    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(Error('Core read expired')),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([work(budget), expired]);
    } catch (error) {
      this.client.close();
      throw error;
    } finally {
      clearTimeout(timer);
      this.#pending = false;
    }
  }
  /** One connection, `server.status` on both sides of the read, same core. */
  async #bracket<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
    if (!this.client.info) await this.client.connect(signal);
    const generation = this.client.generation;
    const before = await this.client.status(),
      result = await read(),
      after = await this.client.status();
    if (
      signal.aborted ||
      !this.client.info?.core.id ||
      generation !== this.client.generation ||
      before.pid !== after.pid ||
      after.uptime_ms < before.uptime_ms
    )
      throw Error('Core changed during read');
    return result;
  }
  async #read(signal: AbortSignal): Promise<AppCoreSnapshot> {
    const list = await this.#bracket(signal, () => this.client.list()),
      coreId = this.client.info?.core.id ?? '';
    const seen = new Set<string>(),
      terminals: AppCoreFacts[] = [];
    for (const terminal of list.terminals) {
      if (!LOCAL.test(terminal.address) || terminal.state !== 'live') continue;
      if (seen.has(terminal.address)) throw Error('Core listing ambiguous');
      seen.add(terminal.address);
      terminals.push({
        address: terminal.address,
        name: clean(terminal.name),
        title: clean(terminal.title),
        state: clean(terminal.status?.state),
        app: clean(terminal.status?.app),
        statusTitle: clean(terminal.status?.title),
        kind: clean(terminal.status?.kind),
      });
    }
    return { provenance: 'core-listing', coreId, terminals };
  }
  close(): void {
    this.client.close();
  }
}
