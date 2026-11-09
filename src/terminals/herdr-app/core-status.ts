import type { AppCoreFacts, AppCoreSnapshot } from '../../domain/app-selection';
import { HerdrCoreClient } from './transport';

export interface AppCoreStatusPort {
  read(): Promise<AppCoreSnapshot>;
  close(): void;
}
type CoreReads = Pick<
  HerdrCoreClient,
  'connect' | 'status' | 'list' | 'close'
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
  async read(): Promise<AppCoreSnapshot> {
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
      return await Promise.race([this.#read(budget), expired]);
    } catch (error) {
      this.client.close();
      throw error;
    } finally {
      clearTimeout(timer);
      this.#pending = false;
    }
  }
  async #read(signal: AbortSignal): Promise<AppCoreSnapshot> {
    if (!this.client.info) await this.client.connect(signal);
    const generation = this.client.generation,
      coreId = this.client.info?.core.id;
    const before = await this.client.status(),
      list = await this.client.list(),
      after = await this.client.status();
    if (
      signal.aborted ||
      !coreId ||
      generation !== this.client.generation ||
      before.pid !== after.pid ||
      after.uptime_ms < before.uptime_ms
    )
      throw Error('Core changed during read');
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
