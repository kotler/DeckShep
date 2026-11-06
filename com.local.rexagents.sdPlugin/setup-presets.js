'use strict';
const path=require('node:path'),fs=require('node:fs');const {Bridge,cli,token}=require('./core');const P=require('./presets');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
class Setup{
 constructor(bridge){this.b=bridge;}
 async screen(a){
  const size=await this.b.method(a,'size');
  const result=await this.b.run(['block','call','-s',a.session,'-b',a.block,'format',JSON.stringify({format:'text',trim:false,unwrap:false,max_bytes:960000})]);
  if(result.id||typeof result.content!=='string'||!Number.isInteger(size.rows))throw Error('Cannot safely read configuration viewport');
  const lines=result.content.replace(/\r/g,'').split('\n');if(lines.at(-1)==='')lines.pop();
  return lines.slice(-size.rows).join('\n'); // Configuration viewport only; never match stale scrollback dialogs.
 }
 async wait(a,test,message){for(let i=0;i<35;i++){const s=await this.screen(a);if(test(s))return;await pause(80);}throw Error(message);}
 async key(a,...keys){await this.b.checked(a,true);await this.b.run(['send-key','-s',a.session,'-b',a.block,...keys]);}
 async menu(a){await this.key(a,'ctrl+x','p');await this.wait(a,s=>/^\s*Presets\s*$/m.test(s),'Presets dialog not open');}
 async currentModel(a){
  await this.menu(a);await this.key(a,'s');await this.wait(a,s=>s.includes('Start preset from current settings'),'Settings preset dialog missing');
  await this.key(a,'enter');await this.wait(a,s=>/^\s*New preset\s*$/m.test(s),'New preset dialog missing');
  const view=await this.screen(a),field=view.split(/^\s*New preset\s*$/m).at(-1);
  const matches=[...field.matchAll(/^\s*› (\/model [a-zA-Z0-9][a-zA-Z0-9._:/-]*(?: --reasoning=[a-zA-Z0-9_-]+)?(?: --speed=[a-zA-Z0-9_-]+)?)\s*$/gm)];
  // Read only the known native settings field; never a transcript or the user's composer.
  for(let i=0;i<4;i++){const s=await this.screen(a);if(!/^\s*(New preset|Start preset from current settings|Presets)\s*$/m.test(s))break;await this.key(a,'escape');}
  await this.wait(a,s=>!/^\s*(New preset|Start preset from current settings|Presets)\s*$/m.test(s),'Settings dialog did not close');
  if(matches.length!==1)throw Error('Native model settings field unavailable');return matches[0][1];
 }
 async store(a,slot,input,snapshot=false){
  await this.menu(a);
  // Start from a settings-generated single line, never from the user's composer draft.
  await this.key(a,'s');await this.wait(a,s=>s.includes('Start preset from current settings'),'Settings preset dialog missing');
  if(snapshot===true||snapshot==='permissions')await this.key(a,'down','enter');else await this.key(a,'enter');
  await this.wait(a,s=>/^\s*New preset\s*$/m.test(s),'New preset dialog missing');
  if(!snapshot){await this.key(a,'ctrl+u');await this.b.checked(a,true);await this.b.run(['send','-s',a.session,'-b',a.block],'\x1b[200~'+input+'\x1b[201~');}
  await this.key(a,'enter');await this.wait(a,s=>s.includes('Save preset to slot'),'Slot picker missing');
  const before=fs.statSync(P.codexFile()).mtimeMs;await this.key(a,slot);
  await this.wait(a,s=>s.includes('Replace preset '+slot+'?')||(!s.includes('Save preset to slot')&&!/^\s*New preset\s*$/m.test(s)),'Slot selection incomplete');
  const s=await this.screen(a);if(s.includes('Replace preset '+slot+'?'))await this.key(a,'enter');
  for(let i=0;i<35;i++){const v=P.readPresets()[slot]?.input;if(v&&(snapshot?(snapshot==='model'?/^\/model [a-zA-Z0-9][a-zA-Z0-9._:/-]*.* --speed=\S+$/.test(v):v.startsWith('/permissions ')):v===input)&&fs.statSync(P.codexFile()).mtimeMs!==before)return v;await pause(80);}
  throw Error('Preset save not confirmed');
 }
 async configure(a,config,file){
  await this.b.focus(a);await this.b.checked(a,true);
  const registry=P.readRegistry(file);const key=token(a);
  if(registry.agents[key]?.signature===P.signature(config)){P.validateOnDisk(registry.agents[key].entries);return;}
  // Existing slots are never replaced unless they are managed settings, not user prompts.
  const known=[...Object.values(registry.agents).flatMap(x=>x.entries||[]),...(registry.scratch?[registry.scratch]:[])];
  for(const [slot,v]of Object.entries(P.readPresets()))if(v.input&&!known.some(e=>e.slot===slot&&e.input===v.input))throw Error('Existing user preset slots need manual allocation');
  const baseline=await this.store(a,'9',null,true);const entries=P.choices(config,baseline);
  // Slot 9 is already the exact baseline snapshot. Other commands are saved, not executed.
  for(const e of entries)if(e.slot!=='9')await this.store(a,e.slot,e.input);
  // Normalize the regular slot to user review even if baseline was automatic review.
  const regular=entries.find(e=>e.slot==='9');if(P.readPresets()['9'].input!==regular.input)await this.store(a,'9',regular.input);
  P.validateOnDisk(entries);registry.agents[key]={signature:P.signature(config),entries,indices:{model:0,effort:0,permissions:0},configuredAt:new Date().toISOString()};P.saveRegistry(file,registry);
 }
}
module.exports={Setup};
if(require.main===module){(async()=>{const dir=process.argv[2]||__dirname,config=JSON.parse(fs.readFileSync(path.join(dir,'config.json')));const file=path.join(dir,'state','native-presets.json');const b=new Bridge({...config,allowClipboardFocus:true}),original=await b.focused();try{const agents=(await b.discover()).filter(a=>a.app==='codex'&&['idle','done'].includes(a.state));for(const a of agents){console.log('Configuring native presets for one idle Codex pane');await new Setup(b).configure(a,config.cycles,file);console.log('Configured; running process preserved');}}finally{await b.focus(original);}})().catch(e=>{console.error(e.message);process.exitCode=1;});}
