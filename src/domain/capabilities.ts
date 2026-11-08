import type { BackendCapability, BackendId, ControlId, ControlSpec } from './types';
export const backendCapabilities: Record<BackendId, readonly BackendCapability[]> = {
  rex: ['discover', 'focus', 'verifiedFocus', 'zoom', 'sendKeys', 'readPane', 'composerCursor', 'paneIdentity'],
  'herdr-tui': ['discover', 'focus', 'verifiedFocus', 'zoom', 'sendKeys', 'readPane', 'paneIdentity'],
  'herdr-app': [],
};
const composer = new Set(['steer', 'queue', 'review', 'tests', 'continue', 'send']);
export function controlSpec(id: ControlId): ControlSpec {
  if (id === 'zoom') return { id, requires: ['verifiedFocus', 'zoom'] };
  return { id, requires: ['verifiedFocus', 'paneIdentity', 'sendKeys', ...(composer.has(id) ? ['readPane', 'composerCursor'] as const : [])] };
}
export function supported(control: ControlSpec, capabilities: ReadonlySet<BackendCapability>): boolean {
  return control.requires.every(capability => capabilities.has(capability));
}
