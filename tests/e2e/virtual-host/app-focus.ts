// Bundle-only fixture. No native helper, process discovery or socket is used.
import type { AppFocusBackendFactory } from '../../../src/app/herdr-app-backend';
import type { Scenario } from './scenarios';
import { paneKey } from '../../../src/app/herdr-app-view';
export function virtualAppFocus(
  get: () => Scenario,
  pause: () => Promise<void>,
): AppFocusBackendFactory {
  return {
    recordCount: 1,
    helperAvailable: () => true,
    create(_config, authority) {
      let disposed = false;
      const model = () => {
        const value = get();
        if (disposed || value.offline || !value.app)
          throw Error('App unavailable');
        return value.app;
      };
      return {
        get generation() {
          return get().app?.epoch ?? 1;
        },
        get peerKey() {
          return 'virtual-app-peer-' + this.generation;
        },
        recordKey: 'virtual-app-record',
        async observe() {
          const value = model();
          return {
            provenance: 'app-model',
            endpointGeneration: this.generation,
            panes: structuredClone(value.panes),
            selected: structuredClone(value.selected),
            verifiedFocus: false,
          };
        },
        async deliver(input, permit) {
          const lease = authority.begin(permit);
          if (Object.keys(input).length !== 1 || input.kind !== 'requestFocus')
            throw Error('Focus refused');
          lease.check();
          await pause();
          if (
            model().panes.filter(
              (pane) => paneKey(pane.target) === paneKey(lease.context.target),
            ).length !== 1
          )
            throw Error('Focus refused');
          lease.consume(this.peerKey, this.recordKey, this.generation);
          process.send?.({
            kind: 'fixtureInput',
            args: ['pane.focus', lease.context.target.pane],
          });
          // An acknowledgement deliberately leaves model selection unchanged.
          lease.postflight();
          return { status: 'requested', verifiedFocus: false };
        },
        dispose() {
          disposed = true;
        },
      };
    },
  };
}
