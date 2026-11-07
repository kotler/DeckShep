(function(root){
 'use strict';
 const bools=['allowClipboardFocus','bringToFront','animationEnabled','herdrTitleIdentity','claudeEnabled'],prompts=['review','tests','continue'];
 function normalize(input){
  if(input===undefined||input===null)return{};
  if(typeof input!=='object'||Array.isArray(input))throw Error('Invalid preferences');
  const out={};
  for(const key of Object.keys(input)){
   if(bools.includes(key)){if(typeof input[key]!=='boolean')throw Error('Invalid '+key);out[key]=input[key];}
   else if(key==='backend'){if(!['rex','herdr'].includes(input[key]))throw Error('Choose Rex or Herdr');out.backend=input[key];}
   else if(key==='herdrSocketPath'){const value=input[key];if(typeof value!=='string'||value.length>1024||/[\x00-\x1f\x7f]/.test(value)||value&&!(value.startsWith('/')||value.startsWith('~/')))throw Error('Use an absolute Herdr session socket path');out.herdrSocketPath=value;}
   else if(key==='prompts'){
    if(!input.prompts||typeof input.prompts!=='object'||Array.isArray(input.prompts))throw Error('Invalid prompts');out.prompts={};
    for(const name of Object.keys(input.prompts)){const text=input.prompts[name];if(!prompts.includes(name)||typeof text!=='string'||!text.trim()||/^\s*[!\/]/.test(text)||text.length>4000||/[\x00-\x1f\x7f]/.test(text))throw Error('Use plain, single-line text (up to 4000 characters)');out.prompts[name]=text;}
   }else throw Error('Unsupported preference');
  }
  return out;
 }
 function apply(base,input){const p=normalize(input),result={...base,animation:{...base.animation},herdr:{...base.herdr},claude:{...base.claude},prompts:{...base.prompts}};for(const key of bools)if(Object.hasOwn(p,key)){if(key==='animationEnabled')result.animation.enabled=p[key];else if(key==='claudeEnabled')result.claude.enabled=p[key];else if(key==='herdrTitleIdentity')result.herdr.titleIdentity=p[key];else result[key]=p[key];}if(p.backend)result.backend=p.backend;if(Object.hasOwn(p,'herdrSocketPath'))result.herdr.socketPath=p.herdrSocketPath;Object.assign(result.prompts,p.prompts||{});return result;}
 function view(config){return{claudeEnabled:config.claude?.enabled===true,backend:config.backend||'rex',herdrSocketPath:config.herdr?.socketPath||'',herdrTitleIdentity:config.herdr?.titleIdentity===true,allowClipboardFocus:config.allowClipboardFocus===true,bringToFront:config.bringToFront!==false,animationEnabled:config.animation?.enabled!==false,prompts:Object.fromEntries(prompts.map(name=>[name,config.prompts?.[name]||'']))};}
 const scopes=['rex','herdr'],sharedFields=['animationEnabled','prompts'],profileFields={rex:['allowClipboardFocus','bringToFront','claudeEnabled'],herdr:['herdrSocketPath','herdrTitleIdentity','claudeEnabled']};
 function subset(input,allowed){const p=normalize(input);if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error('Preference belongs to a different profile');return p;}
 function store(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid saved preferences');
  if(input.version===2){
   if(!Number.isSafeInteger(input.revision)||input.revision<0||!input.profiles||typeof input.profiles!=='object'||Array.isArray(input.profiles)||Object.keys(input.profiles).some(k=>!scopes.includes(k)))throw Error('Invalid profile preferences');
   return{version:2,revision:input.revision,shared:subset(input.shared||{},sharedFields),profiles:Object.fromEntries(scopes.map(scope=>[scope,subset(input.profiles[scope]||{},profileFields[scope])]))};
  }
  if(input.version!==undefined&&input.version!==1)throw Error('Saved preferences version unsupported');
  const legacy=normalize(input.preferences),result={version:2,revision:0,shared:{},profiles:{rex:{},herdr:{}}};
  for(const [key,value]of Object.entries(legacy)){if(sharedFields.includes(key))result.shared[key]=value;for(const scope of scopes)if(profileFields[scope].includes(key))result.profiles[scope][key]=value;}
  return result;
 }
 function profileConfig(base,saved,scope){if(!scopes.includes(scope))throw Error('Unknown controller profile');const value=store(saved);return apply(base,{...value.shared,...value.profiles[scope],backend:scope});}
 function update(saved,scope,input){if(!scopes.includes(scope))throw Error('Unknown controller profile');const value=store(saved),p=normalize(input);if(p.backend&&p.backend!==scope)throw Error('Switch controllers using the Stream Deck profile selector');
  for(const[key,item]of Object.entries(p)){if(sharedFields.includes(key)){value.shared[key]=key==='prompts'?{...value.shared.prompts,...item}:item;}else if(profileFields[scope].includes(key))value.profiles[scope][key]=item;else if(key!=='backend')throw Error('Preference belongs to a different profile');}
  value.revision++;return value;
 }
 function serialize(saved){const value=store(saved);return{...value,preferences:{...value.shared,...value.profiles.rex,...Object.fromEntries(Object.entries(value.profiles.herdr).filter(([key])=>key!=='claudeEnabled')),backend:'rex'}};}
 function scopeOf(settings){return settings?.profileScope===undefined?'rex':scopes.includes(settings.profileScope)?settings.profileScope:null;}
 const api={normalize,apply,view,store,profileConfig,update,serialize,scopeOf};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RexPreferences=api;
})(typeof globalThis==='object'?globalThis:this);
