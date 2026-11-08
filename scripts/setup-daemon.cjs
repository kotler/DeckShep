const { Bridge } = require('../src/app/session');
const {pluginDirectory}=require('../src/platform/paths.ts');
const path=require('node:path'),fs=require('node:fs');
const P=require('../src/agents/codex/presets');
const {configure}=require('../src/agents/codex/setup-daemon');
if (true) {
  (async () => {
    const directory = process.argv[2] || pluginDirectory,
      config = JSON.parse(
        /** @type {any} */ (
          fs.readFileSync(path.join(directory, 'config.json'))
        ),
      ),
      bridge = new Bridge(config),
      original = await bridge.focused();
    try {
      for (const agent of (await bridge.discover()).filter(
        (a) => a.app === 'codex' && ['idle', 'done'].includes(a.state),
      ))
        console.log(JSON.stringify(await configure(bridge, agent, directory)));
    } finally {
      await bridge.focus(original);
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

