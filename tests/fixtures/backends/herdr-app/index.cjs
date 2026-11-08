const world = require('./app-world.json');
const hello = require('./core-hello.json');
const list = require('./core-list.json');
const remoteWorld = structuredClone(world);
remoteWorld.spaces[0].machine = 'cloud';
remoteWorld.spaces[0].tabs[0].terminals[0].terminal = 'cloud/t1';
const remoteList = structuredClone(list);
remoteList.terminals[0].address = 'cloud/t1';
module.exports = {
  world,
  hello,
  list,
  remoteWorld,
  remoteList,
  status: require('./app-status.json'),
  commands: require('./app-commands.json'),
  coreStatus: require('./core-status.json'),
  read: require('./core-read.json'),
  changedHello: { ...hello, version: '0.1.19' },
  changedFeatures: { ...hello, features: [...hello.features, 'new_feature'] },
  malformed: {
    ...list,
    terminals: [{ ...list.terminals[0], foreground: { pid: -1 } }],
  },
};
