import type { TerminalBackend, InputAction } from '../domain/backend';
import type { PressContext } from '../domain/types';
import {
  controlIdForAction,
  controlSpec,
  isLocalControl,
  supported,
} from '../domain/capabilities';

/** Compatibility engines keep their exact native refusals. Herdr App must also
 * name the control and exact verification record at every final delivery edge. */
export function assertVerifiedControl(
  backend: TerminalBackend,
  context: Pick<PressContext, 'action' | 'controlId' | 'verificationKey'>,
): void {
  if (backend.id !== 'herdr-app') return;
  const control = controlIdForAction(context.action);
  if (
    !control ||
    isLocalControl(control) ||
    context.controlId !== control ||
    typeof context.verificationKey !== 'string' ||
    !context.verificationKey ||
    context.verificationKey !== backend.verificationKey ||
    backend.verifiedControls?.has(control) !== true ||
    !supported(
      controlSpec(control),
      backend.capabilities,
      backend.verifiedControls,
    )
  )
    throw Error('Control unverified');
}
export function assertVerifiedInput(
  backend: TerminalBackend,
  input: InputAction,
): void {
  if (backend.id !== 'herdr-app') return;
  const control = input.controlId;
  if (!control) throw Error('Control unverified');
  assertVerifiedControl(backend, {
    action: control,
    controlId: control,
    verificationKey: input.verificationKey,
  });
  const allowed =
    control === 'focus'
      ? ['focus', 'selectWindow']
      : control === 'zoom'
        ? ['zoom']
        : ['keys', 'paste', 'providerMutation'];
  if (!allowed.includes(input.kind)) throw Error('Control input changed');
  if (
    input.kind === 'paste' &&
    !['send', 'steer', 'queue', 'review', 'tests', 'continue'].includes(control)
  )
    throw Error('Control input changed');
}
