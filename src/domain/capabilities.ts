import type {
  BackendCapability,
  BackendId,
  ControlId,
  ControlSpec,
} from './types';
export const knownControls: readonly ControlId[] = [
  'focus',
  'collapse',
  'banknext',
  'next',
  'permissions',
  'more',
  'model',
  'effort',
  'effortIncrease',
  'effortDecrease',
  'plan',
  'interrupt',
  'steer',
  'queue',
  'zoom',
  'stopTerminals',
  'up',
  'down',
  'left',
  'right',
  'answer',
  'escape',
  'questionPrev',
  'questionNext',
  'approvalUp',
  'approvalDown',
  'approvalConfirm',
  'approvalEscape',
  'review',
  'tests',
  'continue',
  'send',
  'none',
  'status',
  'inputInfo',
  'claudeInfo',
  'claudeModeInfo',
  'claudeToggle',
  'questions',
  'prompts',
  'back',
];
const localControls = new Set<ControlId>([
  'collapse',
  'banknext',
  'more',
  'questions',
  'prompts',
  'back',
  'none',
  'status',
  'inputInfo',
  'claudeInfo',
  'claudeModeInfo',
]);
/** Selection and Next use the same verified native focus operation. */
export function controlIdForAction(action: string): ControlId | null {
  if (/^agent:[0-9]+$/.test(action) || action === 'next') return 'focus';
  return knownControls.includes(action as ControlId)
    ? (action as ControlId)
    : null;
}
export function isLocalControl(control: ControlId): boolean {
  return localControls.has(control);
}
export const backendCapabilities: Record<
  BackendId,
  readonly BackendCapability[]
> = {
  rex: [
    'discover',
    'focus',
    'verifiedFocus',
    'zoom',
    'sendKeys',
    'readPane',
    'composerCursor',
    'paneIdentity',
  ],
  'herdr-tui': [
    'discover',
    'focus',
    'verifiedFocus',
    'zoom',
    'sendKeys',
    'readPane',
    'paneIdentity',
  ],
  'herdr-app': [],
};
const composer = new Set([
  'steer',
  'queue',
  'review',
  'tests',
  'continue',
  'send',
]);
export function controlSpec(id: ControlId): ControlSpec {
  if (isLocalControl(id)) return { id, requires: [] };
  if (id === 'focus' || id === 'next' || id.startsWith('agent:'))
    return { id, requires: ['focus', 'verifiedFocus'] };
  if (id === 'zoom') return { id, requires: ['verifiedFocus', 'zoom'] };
  return {
    id,
    requires: [
      'verifiedFocus',
      'paneIdentity',
      'sendKeys',
      ...(composer.has(id) ? (['readPane', 'composerCursor'] as const) : []),
    ],
  };
}
export function supported(
  control: ControlSpec,
  capabilities: ReadonlySet<BackendCapability>,
  verifiedControls?: ReadonlySet<ControlId>,
): boolean {
  return (
    control.requires.every((capability) => capabilities.has(capability)) &&
    (!verifiedControls ||
      isLocalControl(control.id) ||
      verifiedControls.has(control.id))
  );
}
export function verifiedAction(
  action: string,
  capabilities: ReadonlySet<BackendCapability>,
  controls: ReadonlySet<ControlId>,
): boolean {
  const control = controlIdForAction(action);
  return (
    !!control &&
    (isLocalControl(control) || controls?.has(control) === true) &&
    supported(controlSpec(control), capabilities, controls)
  );
}
