(function(root){
 'use strict';
 const bools=['allowClipboardFocus','bringToFront','animationEnabled'],prompts=['review','tests','continue'];
 function normalize(input){
  if(input===undefined||input===null)return{};
  if(typeof input!=='object'||Array.isArray(input))throw Error('Invalid preferences');
  const out={};
  for(const key of Object.keys(input)){
   if(bools.includes(key)){if(typeof input[key]!=='boolean')throw Error('Invalid '+key);out[key]=input[key];}
   else if(key==='prompts'){
    if(!input.prompts||typeof input.prompts!=='object'||Array.isArray(input.prompts))throw Error('Invalid prompts');out.prompts={};
    for(const name of Object.keys(input.prompts)){const text=input.prompts[name];if(!prompts.includes(name)||typeof text!=='string'||!text.trim()||/^\s*[!\/]/.test(text)||text.length>4000||/[\x00-\x1f\x7f]/.test(text))throw Error('Use plain, single-line text (up to 4000 characters)');out.prompts[name]=text;}
   }else throw Error('Unsupported preference');
  }
  return out;
 }
 function apply(base,input){const p=normalize(input),result={...base,animation:{...base.animation},prompts:{...base.prompts}};for(const key of bools)if(Object.hasOwn(p,key)){if(key==='animationEnabled')result.animation.enabled=p[key];else result[key]=p[key];}Object.assign(result.prompts,p.prompts||{});return result;}
 function view(config){return{allowClipboardFocus:config.allowClipboardFocus===true,bringToFront:config.bringToFront!==false,animationEnabled:config.animation?.enabled!==false,prompts:Object.fromEntries(prompts.map(name=>[name,config.prompts?.[name]||'']))};}
 const api={normalize,apply,view};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RexPreferences=api;
})(typeof globalThis==='object'?globalThis:this);
