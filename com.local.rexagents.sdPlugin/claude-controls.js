'use strict';
const crypto=require('node:crypto'),S=require('./claude-state');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const actor=a=>[a.session,a.block,a.app,a.pid,a.name,a.terminalId||''].join('|');
const changed=()=>Object.assign(Error('Reselect Claude agent'),{code:'SELECTION_CHANGED'});
function dialog(view,type){
 const lines=view.split('\n'),hint=lines.findLastIndex(s=>type==='picker'?/Enter to set as default.*\bs to use this session only\b.*\bEsc to (?:cancel|exit)\b/.test(s):type==='permission'?/\b[Ee]sc to cancel\b/.test(s):/\b[Ee]nter to (?:select|confirm)\b/.test(s)&&/\b[Ee]sc\b/.test(s));
 if(hint<0||lines.slice(hint+1).some(s=>s.trim()&&!/^[─━\s]+$/.test(s)))throw Error('Claude native dialog unavailable');
 const body=lines.slice(0,hint+1).join('\n');
 if(!/^\s*[❯›>]\s+\d+[.)]\s+\S/m.test(body)||!/^\s*(?:[❯›>]\s+)?\d+[.)]\s+\S/m.test(body))throw Error('Claude option list unavailable');
 if(type==='picker'&&!/^\s*(?:Select|Choose) model\s*$/m.test(body))throw Error('Claude model picker unavailable');
 if(type==='permission'&&!/\b(?:Do you want to|Would you like to|Allow|permission|approve)\b/i.test(body))throw Error('Claude approval view unavailable');
 return{multiSelect:type==='question'&&/\bspace\b.*\b(?:select|toggle)\b/i.test(body),semantic:hash(body.replace(/^\s*(?:[❯›>]\s*)?(\d+[.)]\s+)/gm,'$1')),hash:hash(view)};
}
function composer(view,cursor,agent,{allowEmpty=false,allowCommand=false}={}){
 const lines=view.split('\n'),row=cursor?.row-1,col=cursor?.column-1;
 if(!Number.isInteger(row)||!Number.isInteger(col)||row<0||row>=lines.length||col<0||/--\s*NORMAL\s*--/.test(view))throw Error('Claude composer cursor unavailable');
 const borders=lines.map((s,i)=>/^[─━]{12,}\s*$/.test(s.trim())?i:-1).filter(i=>i>=0),lower=borders.find(i=>i>row),upper=borders.filter(i=>i<row).at(-1);
 if(upper===undefined||lower===undefined||lower-upper>18||lines.slice(lower+1).some(s=>s.trim()&&!/^(?:\s*(?:\?|!|⏵|⏸|◯|○|●|✳|✻|\d|Claude|Opus|Sonnet|Haiku|Fable|Model|Effort|--\s*INSERT|esc to interrupt|Esc to interrupt))/.test(s)))throw Error('Claude composer is not visible');
 const region=lines.slice(upper+1,lower);if(row===upper+1&&col<region[0].indexOf('❯ ')+2)throw Error('Claude cursor is before the composer');
 const prompts=region.map((s,i)=>/^❯ (.*)$/.test(s.trimStart())?i:-1).filter(i=>i>=0);
 if(prompts.length!==1||prompts[0]!==0||row<=upper||row>=lower)throw Error('Claude composer is ambiguous');
 if(agent.vimMode&&(!/--\s*INSERT\s*--/.test(view)||agent.vimMode!=='INSERT'))throw Error('Claude vim composer must show INSERT');
 let input=region.slice(0,row-upper);input[input.length-1]=input.at(-1).slice(0,col);input[0]=input[0].replace(/^\s*❯ /,'');const typed=input.join('\n').trim();
 if(!typed&&!allowEmpty)throw Error('Type a message first');
 if((!allowCommand&&/^[!\/]/.test(region[0].replace(/^\s*❯ /,'').trimStart()))||/[\x00-\x08\x0b-\x1f\x7f]/.test(typed))throw Error('Claude submission requires plain text');
 return{chatId:agent.chatId,identity:agent.nativeIdentity,turnStamp:agent.runId||agent.claudeTurnId,hash:hash(region.join('\n')),cursor:{row:cursor.row,column:cursor.column},empty:!typed};
}
const same=(a,b)=>!!a&&!!b&&a.chatId===b.chatId&&a.identity===b.identity&&a.turnStamp===b.turnStamp&&a.hash===b.hash&&a.cursor.row===b.cursor.row&&a.cursor.column===b.cursor.column;
class ClaudeControls{
 constructor(bridge,deps={}){this.b=bridge;this.read=deps.read||S.readRecord;this.inspect=deps.inspect||S.processInfo;this.now=deps.now||Date.now;this.bindings=new Map();this.sequence=0;this.picker=null;this.submissions=new Map();this.viewReader=deps.view;this.bindingsDefault=deps.bindingsDefault||S.defaultBindings;}
 prune(agents){const live=new Set(agents.filter(a=>a.app==='claude-code').map(actor));for(const key of this.bindings.keys())if(!live.has(key))this.bindings.delete(key);if(this.picker&&!live.has(this.picker.actor))this.picker=null;while(this.submissions.size>256)this.submissions.delete(this.submissions.keys().next().value);}
 async view(a){
  if(this.viewReader)return this.viewReader(a);
  if(a.backend==='herdr')return this.b.use(async rpc=>({text:await this.b.readView(rpc,a,'text'),hash:hash(await this.b.readView(rpc,a,'ansi')),cursor:null}));
  const args=['block','call','-s',a.session,'-b',a.block,'format',JSON.stringify({format:'vt',extra_cursor:true,max_bytes:960000})];
  const before=await this.b.run(args),cursor=/\x1b\[(\d+);(\d+)H$/.exec(before?.content||'');
  if(before?.id||!cursor)throw Error('Claude viewport/cursor unavailable');
  const text=await new(require('./setup-presets').Setup)(this.b).screen(a),after=await this.b.run(args);
  if(after?.id||hash(before.content)!==hash(after?.content||''))throw Error('Claude view changed');
  return{text,cursor:{row:Number(cursor[1]),column:Number(cursor[2])},hash:hash(before.content)};
 }
 async enrich(agent){
  if(agent.app!=='claude-code')return agent;
  const a={...agent,chatName:agent.chatName||'Claude Code',claudeControlsEnabled:this.b.config.claude?.enabled===true,composerSupported:agent.backend!=='herdr',nativeVerified:false};
  const key=actor(a),previous=this.bindings.get(key);
  try{
   const p=await this.inspect(a.pid),r=S.validate(await this.read(a.pid),a,p,this.now());
   if(!await this.bindingsDefault(r.configDirectory)){a.claudeControlsEnabled=false;a.claudeError='Claude default keybindings required';}
   const base=[p.startedAt,r.sessionId,r.generation].join('|');let binding=previous;if(!binding||binding.base!==base){binding={base,id:'claude:'+ ++this.sequence+':'+hash(base)};this.bindings.set(key,binding);}
   Object.assign(a,{nativeVerified:true,nativeIdentity:binding.id,chatId:r.sessionId,claudeTurnId:r.turnId,runId:r.state==='working'?r.turnId:null,chatName:r.title||'Claude '+r.sessionId.slice(0,8),permissionMode:r.permissionMode||null,vimMode:r.vimMode||null,metadataAt:r.metadataAt||0,model:this.now()-(r.metadataAt||0)<15000?r.model:null,modelName:this.now()-(r.metadataAt||0)<15000?r.modelName:null,effort:this.now()-(r.metadataAt||0)<15000?r.effort:null,state:r.state,kind:r.kind||null,claudeRequestId:r.requestId||null,statusAt:[r.generation,r.turnId,r.state,r.requestId||''].join(':')});
   // Conflicting native working/idle state cannot grant the opposite controls.
   if(agent.state==='working'&&r.state!=='working'&&r.state!=='blocked'){a.state='unknown';a.runId=null;}
   // Native terminal idle overrides a stale working hook after an interrupt.
   if(r.state==='working'&&['idle','done','error'].includes(agent.state)){a.state=agent.state;a.runId=null;}
   if(r.state==='blocked'&&['idle','done','error'].includes(agent.state)){a.state='unknown';a.kind=null;}
   if(a.claudeControlsEnabled&&(a.state==='blocked'||this.picker?.actor===key&&!this.picker.pending)){
    const view=await this.view(a),picker=this.picker?.actor===key&&this.picker.identity===a.nativeIdentity;
    if(picker){const d=dialog(view.text,'picker');a.state='blocked';a.kind='question';a.claudePicker=true;a.statusAt='picker:'+this.picker.id+':'+d.semantic;}
    else{const d=dialog(view.text,a.kind);a.claudeMultiSelect=d.multiSelect;a.statusAt+=':'+d.semantic;}
   }
  }catch{
   this.bindings.delete(key);a.nativeVerified=false;a.nativeIdentity=null;a.chatId=null;a.model=null;a.effort=null;a.runId=null;a.claudeError='Set up Claude hooks / check version';
  }
  if(previous&&previous.id!==a.nativeIdentity&&this.b.lastTarget&&actor(this.b.lastTarget)===key){this.b.lastTarget=null;this.b.draft=null;this.b.picker=null;this.b.selectionNotice=true;}
  if(!this.b.lastTarget||actor(this.b.lastTarget)!==key){if(this.picker?.actor===key&&previous&&previous.id!==a.nativeIdentity)this.picker=null;}
  return a;
 }
 assert(expected,current){if(!current?.nativeVerified||!current.claudeControlsEnabled||!expected?.chatId||expected.chatId!==current.chatId||!expected.nativeIdentity||expected.nativeIdentity!==current.nativeIdentity)throw changed();if(expected.runId&&current.runId!==expected.runId)throw Error('Claude turn changed');}
 async selected(ready=false){const a=await this.b.focused();if(a.app!=='claude-code')throw changed();this.assert(this.b.actionContext?.target||a,a);if(ready&&!['idle','done','error'].includes(a.state))throw Error('Claude is not ready');return a;}
 async readComposer(a,options={}){if(a.backend==='herdr')throw Error('Use the Herdr keyboard');const view=await this.view(a);return composer(view.text,view.cursor,a,options);}
 async key(a,...keys){const fresh=await this.b.checked(a);this.assert(a,fresh);await this.b.run(['send-key','-s',a.session,'-b',a.block,...keys]);}
 async openPicker(){
  const a=await this.selected(true);if(this.picker)throw Error('Close Claude model picker first');
  // Native model shortcut preserves the composer. Validate an idle composer before using it.
  if(a.backend==='herdr')throw Error('Open Claude model picker with the Herdr keyboard');
  await this.readComposer(a,{allowEmpty:true});const fresh=await this.b.checked(a,true);this.assert(a,fresh);
  this.picker={actor:actor(a),identity:a.nativeIdentity,id:crypto.randomUUID(),pending:true};
  try{await this.b.run(['send-key','-s',a.session,'-b',a.block,'alt+p']);this.picker.pending=false;}catch(error){this.picker=null;throw error;}
  this.b.draft=null;return{kind:'model',label:'Use arrows / Confirm'};
 }
 async waiting(key,kind){
  const a=await this.selected(),waiting=x=>x.state==='blocked'&&(kind==='permission'?x.kind==='permission':x.kind==='question');
  if(!waiting(a))throw Error('No Claude '+kind+' waiting');
  if(!['up','down','left','right','enter','escape','tab','shift+tab','space'].includes(key)||kind==='permission'&&!['up','down','enter','escape'].includes(key))throw Error('Unsupported Claude waiting key');
  if(a.claudePicker&&!['up','down','left','right','enter','escape'].includes(key))throw Error('Use arrows, Confirm or Esc in Claude picker');
  if(a.backend==='herdr'&&!a.atBottom)throw Error('Scroll the Herdr pane to bottom');
  const before=await this.view(a),visible=dialog(before.text,a.claudePicker?'picker':kind);if(key==='space'&&!visible.multiSelect)throw Error('No Claude multi-select toggle visible');
  const current=await this.b.checked(a);this.assert(a,current);if(!waiting(current)||current.statusAt!==a.statusAt)throw Error('Claude waiting request changed');
  const after=await this.view(current);if(before.hash!==after.hash||before.text!==after.text)throw Error('Claude waiting view changed');
  try{await this.key(current,a.claudePicker&&key==='enter'?'s':key);}finally{if(a.claudePicker&&['enter','escape'].includes(key))this.picker=null;}this.b.draft=null;
 }
 async interrupt(){
  const a=await this.selected();if(a.state!=='working'||!a.runId)throw Error('Claude is not running');
  const view=await this.view(a);
  if(!/\besc to interrupt\b/i.test(view.text))throw Error('Claude interrupt hint unavailable');
  const identity=a.nativeIdentity+'|'+a.runId;
  if(this.submissions.has('interrupt:'+identity))throw Error('Interrupt already requested');
  const fresh=await this.b.checked(a);this.assert(a,fresh);if(fresh.state!=='working'||fresh.runId!==a.runId)throw Error('Claude turn ended');
  if(!/\besc to interrupt\b/i.test((await this.view(fresh)).text))throw Error('Claude interrupt context changed');
  this.submissions.set('interrupt:'+identity,this.now());this.b.draft=null;
  await this.key(fresh,'escape');return{kind:'interrupt',label:'Interrupt requested'};
 }
 async stage(action){
  const a=await this.selected(true),text=this.b.config.prompts[action];
  if(this.b.draft||this.picker)throw Error('Review or cancel the current draft first');
  if(!['review','tests','continue'].includes(action)||!S.text(text,4000)||/^\s*[!\/]/.test(text))throw Error('Invalid plain-text shortcut');
  const before=await this.readComposer(a,{allowEmpty:true}),modes=await this.b.method(a,'modes');if(!modes.modes?.some(m=>m.number===2004&&m.set))throw Error('Bracketed paste unavailable');
  await this.b.checked(a,true);await this.b.run(['send','-s',a.session,'-b',a.block],`\x1b[200~${text}\x1b[201~`);
  const snapshot=await this.readComposer(a,{allowEmpty:true});
  if(snapshot.identity!==before.identity||snapshot.turnStamp!==before.turnStamp||snapshot.empty||snapshot.hash===before.hash)throw Error('Paste not confirmed; use Claude keyboard');
  await this.b.checked(a,true);this.b.draft={target:a,at:this.now(),action,snapshot};
 }
 async send(){
  const draft=this.b.draft;if(!draft||draft.target.app!=='claude-code'||this.now()-draft.at>this.b.config.draftMaxAgeMs)throw Error('No recent Claude draft');
  try{const a=await this.selected(true);this.assert(draft.target,a);const before=await this.readComposer(a),current=await this.b.checked(a,true),after=await this.readComposer(current);if(!same(draft.snapshot,before)||!same(before,after))throw Error('Claude draft changed; use keyboard');this.b.draft=null;await this.key(current,'enter');}catch(error){this.b.draft=null;throw error;}
 }
 async running(kind){
  if(!['steer','queue'].includes(kind))throw Error('Unsupported Claude input action');
  const a=await this.selected();if(a.state!=='working'||!a.runId)throw Error('Claude is not running');
  const before=await this.readComposer(a),current=await this.b.checked(a),after=await this.readComposer(current);this.assert(a,current);
  if(current.state!=='working'||current.runId!==a.runId||!same(before,after))throw Error('Claude turn or input changed');
  const identity=a.nativeIdentity+'|'+a.runId+'|'+before.hash;if(this.submissions.has(identity))throw Error('Already submitted; check Claude');
  this.submissions.set(identity,this.now());this.b.draft=null;
  // Claude Enter queues. Ctrl+X Ctrl+S sends now; Codex's Enter/Tab mapping never reaches here.
  await this.key(current,...kind==='queue'?['enter']:['ctrl+x','ctrl+s']);return{kind,label:kind==='queue'?'Queued':'Sent now'};
 }
}
module.exports={ClaudeControls,composer,dialog,same,actor};
