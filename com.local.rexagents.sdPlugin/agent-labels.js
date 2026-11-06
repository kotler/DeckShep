'use strict';
const clean=text=>String(text??'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'');
const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'});
function ellipsize(text,width=126,fontSize=18){
 const glyphs=Array.from(segments.segment(clean(text)),part=>part.segment);
 const measure=g=>fontSize*(/^[ilI.,'`!:;| ]$/.test(g)?.28:/^[MW@#%]$/.test(g)?.9:/^[A-Z]$/.test(g)?.66:/^[\u0000-\u024f]$/.test(g)?.54:1);
 if(glyphs.reduce((sum,g)=>sum+measure(g),0)<=width)return glyphs.join('');
 let result='',used=0;for(const glyph of glyphs){const size=measure(glyph);if(used+size+fontSize>width)break;result+=glyph;used+=size;}return result+'…';
}
function agentLines(agent,aliases={}){
 const status=require('./context-controls').isBackground(agent)?'BACKGROUND':({idle:'READY',done:'COMPLETE',working:'WORKING',blocked:agent.kind==='permission'?'APPROVAL':'WAIT INPUT',error:'ERROR',unknown:'UNKNOWN'})[agent.state]||'UNKNOWN';
 return[ellipsize(aliases[agent.block]||agent.chatName||(agent.app==='codex'?'Name unavailable':'Untitled agent'),120,26),ellipsize(agent.project||'Unknown folder',120,22),status];
}
function shortModel(model){return clean(model).replace(/^gpt[- ]?/i,'').replace(/[-_]+/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());}
function sameTarget(a,b){return a&&b&&a.session===b.session&&a.block===b.block&&a.pid===b.pid&&(a.terminalId||null)===(b.terminalId||null);}
function modeLines(bridge){
 const agent=bridge.agents?.find(a=>sameTarget(bridge.lastTarget,a));
 if(!agent)return['Mode'];
 if(sameTarget(bridge.lastModeRequest,agent)&&(!bridge.lastModeRequest.chatId||bridge.lastModeRequest.chatId===agent.chatId)&&bridge.lastModeRequest.at>=(agent.metadataAt||0))return['Updating…'];
 return[({plan:'Plan',default:'Default'})[agent.collaborationMode]||'Mode'];
}
function modelLines(bridge){
 const target=bridge.lastTarget;if(!target)return['Model','Select agent'];
 const agent=bridge.agents?.find(a=>sameTarget(a,target));if(!agent)return['Model','Agent closed'];
 const verified=sameTarget(bridge.lastModel,target)&&(!bridge.lastModel.chatId||bridge.lastModel.chatId===agent.chatId)&&bridge.lastModel.at>(agent.metadataAt||0)?bridge.lastModel.model:agent.model;
 return['Model',ellipsize(verified?shortModel(verified):'Unknown',126,16)];
}
function effortLines(bridge){
 const agent=bridge.agents?.find(a=>sameTarget(bridge.lastTarget,a));
 if(!agent)return['Effort','Unknown'];
 const recent=bridge.lastEffort;
 const value=sameTarget(recent,agent)&&recent.chatId===agent.chatId&&recent.at>(agent.metadataAt||0)?recent.effort:agent.effort;
 return['Effort',value?clean(value).replace(/^./,c=>c.toUpperCase()):'Unknown'];
}
function reviewerLines(bridge){
 const agent=bridge.agents?.find(a=>sameTarget(bridge.lastTarget,a));
 if(!agent)return['Reviewer'];
 const recent=bridge.lastReviewer;
 const value=sameTarget(recent,agent)&&recent.chatId===agent.chatId&&recent.at>(agent.metadataAt||0)?recent.reviewer:agent.reviewer;
 const label=({user:'Ask me',auto_review:'Approve for me'})[value];
 return label?['Reviewer',label]:['Reviewer'];
}
module.exports={clean,ellipsize,agentLines,modelLines,modeLines,effortLines,reviewerLines,shortModel,sameTarget};
