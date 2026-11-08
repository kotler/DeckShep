const WebSocket = require('ws');
const { createApplication } = require('../app/controller');
const args = process.argv.slice(2), arg = (k:string) => args[args.indexOf(k)+1];
createApplication({ socket:new WebSocket('ws://127.0.0.1:'+arg('-port')),args:{'-pluginUUID':arg('-pluginUUID'),'-registerEvent':arg('-registerEvent')},onClose:()=>process.exit(0),onError:()=>process.exit(1) });
export {};
