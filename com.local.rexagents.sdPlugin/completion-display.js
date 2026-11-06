'use strict';
const {sameTarget}=require('./agent-labels');
// Acknowledge a result locally. Native agent state and execution policy are untouched.
class CompletionDisplay{
 constructor(dwellMs=2000){this.dwellMs=dwellMs;this.entries=new Map();}
 key(agent){return JSON.stringify([agent.session,agent.block,agent.pid]);}
 update(agents,selected,now){
  const live=new Set();
  for(const agent of agents){
   const key=this.key(agent);live.add(key);
   if(agent.state!=='done'){this.entries.delete(key);continue;}
   let entry=this.entries.get(key);
   if(!entry||entry.statusAt!==agent.statusAt){entry={statusAt:agent.statusAt,since:null,acknowledged:false};this.entries.set(key,entry);}
   if(!entry.acknowledged){
    if(sameTarget(agent,selected)){entry.since??=now;if(now-entry.since>=this.dwellMs)entry.acknowledged=true;}
    else entry.since=null;
   }
  }
  for(const key of this.entries.keys())if(!live.has(key))this.entries.delete(key);
 }
 agent(agent){return agent.state==='done'&&this.entries.get(this.key(agent))?.acknowledged?{...agent,state:'idle'}:agent;}
}
module.exports={CompletionDisplay};
