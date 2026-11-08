import { GuardedBackend, type BackendDriver, type DeliveryAuthority } from '../contract/backend';
import { backendCapabilities } from '../../domain/capabilities';
export class HerdrTuiBackend extends GuardedBackend {
  constructor(driver: BackendDriver, authority: DeliveryAuthority) {
    super('herdr-tui', new Set(backendCapabilities['herdr-tui']), driver, authority, '0.9.5/protocol-22');
  }
}
