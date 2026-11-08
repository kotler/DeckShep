import { SessionProvider } from '../shared/provider';
export class CodexProvider extends SessionProvider {
  constructor() {
    super('codex');
  }
}
