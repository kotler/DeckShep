const { CalibrationChannel } = require('../app-calibration/channel.cjs');
const { isDeepStrictEqual } = require('node:util');

// The contained login-shell shim accepts these two exact argv forms and emits
// one fixed OSC report. There is no terminal input or arbitrary command path.
class NavigationChannel extends CalibrationChannel {
  request(role) {
    return {
      do: 'space.new',
      args: {
        folder: this.gate.root,
        machine: '',
        name: role === 'pw-codex' ? 'Codex fixture' : 'Claude fixture',
        argv: ['/bin/cat', role],
      },
    };
  }
  validateRequests(kind, payloads) {
    if (
      kind === 'app' &&
      ['pw-codex', 'pw-claude'].some((role) =>
        isDeepStrictEqual(payloads, [this.request(role)]),
      )
    )
      return;
    super.validateRequests(kind, payloads);
  }
  async createPanes() {
    for (const role of ['pw-codex', 'pw-claude']) {
      await this.exchange('app', [this.request(role)], ['spaceCreated']);
      this.gate.captureDescendants();
    }
  }
}
module.exports = { NavigationChannel };
