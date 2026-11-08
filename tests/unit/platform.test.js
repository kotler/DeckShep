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
