'use strict';
function isBackground(agent){return agent?.app==='codex'&&agent.state==='working'&&agent.backgroundOnly===true&&typeof agent.statusAt==='string'&&agent.activityStatusAt===agent.statusAt&&Array.isArray(agent.backgroundIds)&&agent.backgroundIds.length>0&&!!agent.backgroundTurnId;}
function modeOf(agent){
 if(!agent||agent.app!=='codex')return'unknown';
 if(isBackground(agent))return'background';
 if(['idle','done','error'].includes(agent.state))return'ready';
 if(agent.state==='working')return'working';
 if(agent.state==='blocked'&&agent.kind==='question')return'question';
 if(agent.state==='blocked'&&agent.kind==='permission')return'approval';
 return'unknown';
}
const actor=a=>a&&[a.session,a.block,a.app,a.pid,a.name,a.terminalId||''].join('|');
function stamp(agent,page=0){return JSON.stringify([actor(agent),modeOf(agent),agent?.state==='blocked'?agent.statusAt:null,agent?.chatId||null,agent?.runId||null,page,...isBackground(agent)?[agent.backgroundTurnId,agent.backgroundIds]:[]]);}
function snapshot(agent){if(!agent)return null;return Object.fromEntries(['session','window','block','terminalId','backend','composerSupported','pid','name','app','cwd','state','kind','statusAt','chatId','runId','backgroundOnly','backgroundIds','backgroundTurnId','activityStatusAt'].filter(k=>agent[k]!==undefined).map(k=>[k,Array.isArray(agent[k])?[...agent[k]]:agent[k]]));}
function assertContext(context,current){
 const target=context?.target;
 if(!target||actor(target)!==actor(current)){const error=Error('Reselect agent on deck');error.code='SELECTION_CHANGED';throw error;}
 // Fresh Rex records do not contain daemon metadata. Background actions separately
 // revalidate the ended turn and the complete terminal-ID set before any mutation.
 const background=isBackground(target)&&current.state==='working'&&target.statusAt===current.statusAt;
 if(!background&&modeOf(target)!==modeOf(current))throw Error('Agent state changed; press again');
 if(target.state==='blocked'&&(!target.statusAt||target.statusAt!==current.statusAt||target.kind!==current.kind))throw Error('Waiting request changed; press again');
}
function homeRow(agent){
 switch(modeOf(agent)){
  case'ready':return['model','effort','zoom','plan','interrupt'];
  case'working':return agent.composerSupported===false?['none','none','zoom','none','interrupt']:['steer','queue','zoom','none','interrupt'];
  case'background':return['none','none','zoom','none','stopTerminals'];
  case'question':return['up','down','answer','escape','interrupt'];
  case'approval':return['approvalUp','approvalDown','approvalConfirm','approvalEscape','interrupt'];
  default:return['status','none','zoom','none','interrupt'];
 }
}
function layout(page,agent){
 const stop=isBackground(agent)?'stopTerminals':'interrupt';
 if(page===1)return['questionPrev','up','questionNext','answer','more','left','down','right','escape',stop];
 if(page===2&&agent?.composerSupported===false)return['inputInfo','none','none','none','more','none','none','zoom','none',stop];
 if(page===2)return['review','tests','continue','send','more','none','none','zoom','none',stop];
 return['collapse','banknext','next','permissions','more',...homeRow(agent)];
}
const localActions=new Set(['none','status','inputInfo','more','questions','prompts','back','collapse','banknext','next']);
function needsContext(action){return!localActions.has(action)&&!action.startsWith('agent:');}
function needsChat(action,target){return target?.state!=='blocked'&&action!=='zoom';}
module.exports={isBackground,modeOf,actor,stamp,snapshot,assertContext,homeRow,layout,needsContext,needsChat};
