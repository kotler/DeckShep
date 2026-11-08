'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {exec}=require('../../src/platform/exec.ts');
const {discoverRex}=require('../../src/platform/paths.ts');
test('bounded execution scrubs inherited Rex routing and never exposes failed arguments/output',async()=>{
 const value=await exec(process.execPath,['-e','process.stdout.write(JSON.stringify([process.env.REX_SESSION,process.env.REX_BLOCK,process.env.REX_CLIENT]))'],{env:{REX_SESSION:'inherited',REX_BLOCK:'inherited',REX_CLIENT:'inherited'}});
 assert.deepEqual(JSON.parse(value),['','','']);
 assert.equal(await exec(process.execPath,['-e','process.stdin.pipe(process.stdout)'],{input:'fixture'}),'fixture');
 for(const args of [['-e','process.stderr.write("PRIVATE");process.exit(1)'],['-e','setTimeout(()=>{},1000)']]){
  await assert.rejects(()=>exec(process.execPath,args,{timeout:30}),error=>error.message==='Local command failed');
 }
});
test('Rex discovery prioritizes explicit overrides, refuses ambiguity and supports known release locations',async()=>{
 const suffix='/Contents/Helpers/Rex Server.rex/Contents/MacOS/rex';
 const available=new Set(['/Applications/Rex Beta.app'+suffix,'/Applications/Rex.app'+suffix]);
 let found=['/Applications/Rex.app'];
 const probe={home:'/fixture',exists:file=>available.has(file),spotlight:async()=>found};
 assert.equal((await discoverRex('/Applications/Rex Beta.app'+suffix,probe)).application,'/Applications/Rex Beta.app');
 assert.equal((await discoverRex(undefined,probe)).application,'/Applications/Rex.app');
 found=['/Applications/Rex.app','/Applications/Rex Beta.app'];
 await assert.rejects(()=>discoverRex(undefined,probe),/ambiguous/);
 await assert.rejects(()=>discoverRex('/missing/Rex.app'+suffix,probe),/Configured/);
 found=[];available.delete('/Applications/Rex Beta.app'+suffix);
 assert.equal((await discoverRex(undefined,probe)).application,'/Applications/Rex.app');
 available.clear();await assert.rejects(()=>discoverRex(undefined,probe),/not found/);
});
test('Rex transport bounds JSON, scrubs invocation options, gates clipboard consent and invalidates cached installations', async () => {
  const { RexTransport } = require('../../src/terminals/rex/transport');
  let now = 0, discoveries = 0, output = '{"clients":[]}', fail = false;
  const calls = [], config = { rexPath: '', allowClipboardFocus: false };
  const ports = { directory: '/fixture/plugin', now: () => now, discover: async () => { discoveries++; if (fail) throw Error('unavailable'); return { binary: '/fixture/Rex.app/rex', application: '/fixture/Rex.app' }; }, execute: async (...args) => { calls.push(args); return output; } };
  const transport = new RexTransport(() => config, ports);
  assert.deepEqual(await transport.command(['client', 'ls', '--json']), { clients: [] });
  assert.deepEqual(calls[0][1], ['--autostart=false', '--timeout', '2s', 'client', 'ls', '--json']); assert.equal(calls[0][2].timeout, 3500);
  output = 'ack'; assert.equal(await transport.command(['fixture']), 'ack'); assert.equal(discoveries, 1);
  output = ''; assert.equal(await transport.command([]), null);
  output = '{invalid'; await assert.rejects(transport.command([]), /JSON/);
  await assert.rejects(transport.visible('fixture'), /Enable/); assert.equal(calls.length, 4);
  config.allowClipboardFocus = true;
  for (const value of ['{}', '{"block_id":"block:11111111-1111-1111-1111-111111111111","clipboard_restored":false}', 'invalid']) { output = value; await assert.rejects(transport.visible('fixture'), /Invalid visible/); }
  output = '{"block_id":"block:11111111-1111-1111-1111-111111111111","clipboard_restored":true}'; assert.equal(await transport.visible('fixture'), 'block:11111111-1111-1111-1111-111111111111');
  await transport.activate(); assert.equal(calls.at(-1)[0], '/usr/bin/open'); assert.deepEqual(calls.at(-1)[1], ['-a', '/fixture/Rex.app']);
  now = 3000; await transport.command([]); assert.equal(discoveries, 2);
  config.rexPath = '/fixture/other.app/rex'; await transport.command([]); assert.equal(discoveries, 3);
  fail = true; config.rexPath = '/fixture/missing.app/rex'; await assert.rejects(transport.command([])); fail = false; await transport.command([]); assert.equal(discoveries, 5);
});
test('late Rex discovery never bypasses the transport preflight or withdrawn clipboard consent', async () => {
  const { RexTransport } = require('../../src/terminals/rex/transport');
  let complete, writes = 0, visible = true;
  const config = { allowClipboardFocus: true };
  const ports = { directory: '/fixture', now: () => 0, discover: () => new Promise(resolve => { complete = resolve; }), execute: async () => { writes++; return ''; } };
  const transport = new RexTransport(() => config, ports);
  const pending = transport.command(['send-key'], undefined, () => { if (!visible) throw Error('Profile changed'); });
  visible = false; complete({ binary: '/fixture/Rex.app/rex', application: '/fixture/Rex.app' }); await assert.rejects(pending, /Profile changed/); assert.equal(writes, 0);
  await assert.rejects(transport.activate(() => { throw Error('Profile changed'); }), /Profile changed/); assert.equal(writes, 0);
  const next = new RexTransport(() => config, ports), clipboard = next.visible('fixture'); config.allowClipboardFocus = false; complete({ binary: '/fixture/Rex.app/rex', application: '/fixture/Rex.app' }); await assert.rejects(clipboard, /Enable/); assert.equal(writes, 0);
});
