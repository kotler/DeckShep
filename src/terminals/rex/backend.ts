import {
  GuardedBackend,
  type BackendDriver,
  type DeliveryAuthority,
} from '../contract/backend';
import { backendCapabilities } from '../../domain/capabilities';
export class RexBackend extends GuardedBackend {
  constructor(driver: BackendDriver, authority: DeliveryAuthority) {
    super(
      'rex',
      new Set(backendCapabilities.rex),
      driver,
      authority,
      'native-cli',
    );
  }
}
