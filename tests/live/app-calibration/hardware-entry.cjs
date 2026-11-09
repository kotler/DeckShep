const path = require('node:path');
const { runHardware } = require('./hardware-runner.cjs');
runHardware(path.dirname(process.argv[1]));
