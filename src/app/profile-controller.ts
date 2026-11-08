type AgentSnapshot = import("../domain/types").AgentSnapshot;
type Config = import("../domain/types").Config;
type PressContext = import("../domain/types").PressContext;
'use strict';
class Controller {
    declare scope: any;
    declare runtime: Record<string, any>;
    constructor(scope: string, runtime: Record<string, any>) { this.scope = scope; this.runtime = runtime; this.mapping = this.mapping.bind(this); this.render = this.render.bind(this); this.refresh = this.refresh.bind(this); this.refreshMetadata = this.refreshMetadata.bind(this); this.press = this.press.bind(this); this.selected = this.selected.bind(this); this.inspectorRequest = this.inspectorRequest.bind(this); this.initialize = this.initialize.bind(this); this.applySettings = this.applySettings.bind(this); this.attach = this.attach.bind(this); this.detach = this.detach.bind(this); this.settled = this.settled.bind(this); this.ready = this.ready.bind(this); this.getPage = this.getPage.bind(this); this.getBank = this.getBank.bind(this); this.setBank = this.setBank.bind(this); }
    get setupBusy() { return this.runtime.setupBusy; }
    get bridge() { return this.runtime.bridge; }
    get metadata() { return this.runtime.metadata; }
    get keys() { return this.runtime.keys; }
    mapping(...args: any[]) { return this.runtime.mapping(...args); }
    render(...args: any[]) { return this.runtime.render(...args); }
    refresh(...args: any[]) { return this.runtime.refresh(...args); }
    refreshMetadata(...args: any[]) { return this.runtime.refreshMetadata(...args); }
    press(...args: any[]) { return this.runtime.press(...args); }
    selected(...args: any[]) { return this.runtime.selected(...args); }
    inspectorRequest(...args: any[]) { return this.runtime.inspectorRequest(...args); }
    initialize(...args: any[]) { return this.runtime.initialize(...args); }
    applySettings(...args: any[]) { return this.runtime.applySettings(...args); }
    attach(...args: any[]) { return this.runtime.attach(...args); }
    detach(...args: any[]) { return this.runtime.detach(...args); }
    settled(...args: any[]) { return this.runtime.settled(...args); }
    ready(...args: any[]) { return this.runtime.ready(...args); }
    getPage(...args: any[]) { return this.runtime.getPage(...args); }
    getBank(...args: any[]) { return this.runtime.getBank(...args); }
    setBank(...args: any[]) { return this.runtime.setBank(...args); }
}
module.exports = { Controller };

export {Controller};
