'use strict';
class Controller {
/** @param {string} scope @param {Record<string, any>} runtime */
constructor(scope,runtime){this.scope=scope;this.runtime=runtime;this.mapping=this.mapping.bind(this);this.render=this.render.bind(this);this.refresh=this.refresh.bind(this);this.refreshMetadata=this.refreshMetadata.bind(this);this.press=this.press.bind(this);this.selected=this.selected.bind(this);this.inspectorRequest=this.inspectorRequest.bind(this);this.initialize=this.initialize.bind(this);this.applySettings=this.applySettings.bind(this);this.attach=this.attach.bind(this);this.detach=this.detach.bind(this);this.settled=this.settled.bind(this);this.ready=this.ready.bind(this);this.getPage=this.getPage.bind(this);this.getBank=this.getBank.bind(this);this.setBank=this.setBank.bind(this);}
get setupBusy(){return this.runtime.setupBusy;}
get bridge(){return this.runtime.bridge;}
get metadata(){return this.runtime.metadata;}
get keys(){return this.runtime.keys;}
/** @param {...any} args */
mapping(...args){return this.runtime.mapping(...args);}
/** @param {...any} args */
render(...args){return this.runtime.render(...args);}
/** @param {...any} args */
refresh(...args){return this.runtime.refresh(...args);}
/** @param {...any} args */
refreshMetadata(...args){return this.runtime.refreshMetadata(...args);}
/** @param {...any} args */
press(...args){return this.runtime.press(...args);}
/** @param {...any} args */
selected(...args){return this.runtime.selected(...args);}
/** @param {...any} args */
inspectorRequest(...args){return this.runtime.inspectorRequest(...args);}
/** @param {...any} args */
initialize(...args){return this.runtime.initialize(...args);}
/** @param {...any} args */
applySettings(...args){return this.runtime.applySettings(...args);}
/** @param {...any} args */
attach(...args){return this.runtime.attach(...args);}
/** @param {...any} args */
detach(...args){return this.runtime.detach(...args);}
/** @param {...any} args */
settled(...args){return this.runtime.settled(...args);}
/** @param {...any} args */
ready(...args){return this.runtime.ready(...args);}
/** @param {...any} args */
getPage(...args){return this.runtime.getPage(...args);}
/** @param {...any} args */
getBank(...args){return this.runtime.getBank(...args);}
/** @param {...any} args */
setBank(...args){return this.runtime.setBank(...args);}
}
module.exports={Controller};
