import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { bundle } from './bundle.mjs';
const root = process.cwd(), plugin = path.join(root, 'com.local.rexagents.sdPlugin');
const require = createRequire(import.meta.url);
for (const name of ['ws','@iarna/toml']) {
 const source = path.dirname(require.resolve(name+'/package.json')), target = path.join(plugin,'node_modules',name);
 if(source !== target) fs.cpSync(source,target,{recursive:true});
}
const result=spawnSync('python3',['build.py',...process.argv.slice(2)],{stdio:'inherit'});
if(result.status!==0)throw Error('Helper build failed');
for(const [source,output,browser] of [['src/plugin/legacy-entry.js','bin/plugin.js'],['src/agents/claude/hook.js','claude-hook.js'],['src/plugin/configure-entry.js','configure-claude.js'],['src/inspector/index.js','inspector.js',true],['src/app/preferences.js','preferences.js',true]]) {
 const target=path.join(root,'dist',path.basename(plugin),output);await bundle(path.join(root,source),target,{browser});fs.mkdirSync(path.dirname(path.join(plugin,output)),{recursive:true});fs.copyFileSync(target,path.join(plugin,output));
}
