const { Bridge } = require('../src/app/session');
const { pluginDirectory } = require('../src/platform/paths.ts');
const path = require('node:path'),
  fs = require('node:fs');
const { Setup } = require('../src/agents/codex/setup-presets');
{
  (async () => {
    const dir = process.argv[2] || pluginDirectory,
      config = JSON.parse(
        /** @type {any} */ (fs.readFileSync(path.join(dir, 'config.json'))),
      );
    const file = path.join(dir, 'state', 'native-presets.json');
    const b = new Bridge({ ...config, allowClipboardFocus: true }),
      original = await b.focused();
    try {
      const agents = (await b.discover()).filter(
        (a) => a.app === 'codex' && ['idle', 'done'].includes(a.state),
      );
      for (const a of agents) {
        console.log('Configuring native presets for one idle Codex pane');
        await new Setup(b).configure(a, config.cycles, file);
        console.log('Configured; running process preserved');
      }
    } finally {
      await b.focus(original);
    }
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
