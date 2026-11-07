'use strict';
const fs=require('node:fs'),path=require('node:path');
const icons={steer:'corner-up-right',queue:'list-plus',reviewer:'user-cog',permissions:'corner-down-left',model:'cpu',effort:'brain',collapse:'fold-horizontal',next:'arrow-right',previous:'arrow-left',interrupt:'square',stopTerminals:'square',zoom:'maximize',more:'ellipsis',review:'scan-search',tests:'check-check',continue:'play',send:'send',up:'arrow-up',down:'arrow-down',left:'arrow-left',right:'arrow-right',escape:'undo-2',bankprev:'chevrons-left',banknext:'panels-top-left'};
const glyphs=Object.fromEntries(Object.entries(icons).map(([name,file])=>[name,fs.readFileSync(path.join(__dirname,'assets','lucide',file+'.svg'),'utf8').match(/<svg[^>]*>([\s\S]*?)<\/svg>/)[1]]));
const esc=s=>String(s??'').replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function blend(color,other,t){const rgb=c=>/^#[a-f0-9]{6}$/i.test(c)?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)):[37,42,57];return'#'+rgb(color).map((v,i)=>Math.round(v*(1-t)+rgb(other)[i]*t).toString(16).padStart(2,'0')).join('');}
function controlAccent(action,color){
 if(color==='#38414b'||action==='none')return'#485066';
 if(color==='#893748')return'#d34263';if(color==='#2b654c')return'#28ad82';
 if(['interrupt','stopTerminals'].includes(action))return'#d34263';
 if(action.startsWith('approval')||['up','down','left','right','questionPrev','questionNext','answer','escape'].includes(action))return'#d19c30';
 if(['model','effort','effortIncrease','effortDecrease','plan'].includes(action))return'#b16bf2';
 return'#389ed7';
}
function signalSvg({icon,lines,color,pulse,badge,agent,textOnly,accent='#389ed7',codexIcon,codexMark,claudeMark,legacyPaths}){
 const empty=agent&&icon==='empty',fill=agent&&!empty?color:'#252a39';
 const bottom=agent&&!empty?blend(color,'#151923',.35):fill;
 const tinted=!agent&&['#d19c30','#d34263'].includes(accent),top=tinted?blend(fill,accent,.25):fill;
 const claudeBackground=`<g id="claude-watermark" transform="translate(20 20) scale(4.333333)" fill="white" opacity=".28">${claudeMark}</g>`;
 const watermark=agent&&icon==='claude-code'?claudeBackground:agent&&icon==='codex'?`<image id="agent-watermark" x="-18" y="-18" width="180" height="180" opacity=".26" xlink:href="data:image/png;base64,${codexMark}"/>`:'';
 const visible=lines.slice(0,3),scale=visible.length===3?1.4:1.7;
 const glyph=agent&&['codex','claude-code'].includes(icon)?'':glyphs[icon]?`<g transform="translate(14 10) scale(${scale})" fill="none" stroke="${blend(accent,'#ffffff',.32)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyphs[icon]}</g>`:icon==='blank'||empty?'':`<g transform="translate(12 0) scale(.65)" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${legacyPaths[icon]||''}</g>`;
 const centered=textOnly||empty,ys=agent&&!empty?[48,86,124]:textOnly||empty?[84]:visible.length===3?[69,92,114]:visible.length===2?[84,111]:[100];
 const text=visible.map((s,i)=>{
  const size=textOnly?28:empty?24:agent?(i===0?26:22):(i===0?24:22);
  const width=String(s).split('').reduce((n,c)=>n+size*(/[ilI.,'!:;| ]/.test(c)?.28:/[MW@#%]/.test(c)?.9:/[A-Z]/.test(c)?.66:.54),0);
  const fit=width>120?' textLength="120" lengthAdjust="spacingAndGlyphs"':'';
  return`<text x="${centered?72:12}" y="${ys[i]}" fill="${empty?'#a7aec0':'#f9fbff'}" text-anchor="${centered?'middle':'start'}" font-family="Arial" font-size="${size}" font-weight="${i===0||agent&&i===2?'bold':'normal'}"${fit}>${esc(s).slice(0,140)}</text>`;
 }).join('');
 return`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144"><defs><linearGradient id="surface" x2="1" y2="1"><stop stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><clipPath id="key"><rect x="2" y="2" width="140" height="140" rx="14"/></clipPath></defs><g clip-path="url(#key)"><rect x="2" y="2" width="140" height="140" fill="url(#surface)"/>${agent&&!empty?`<rect x="2" y="2" width="140" height="140" fill="white" opacity="${Math.max(0,Math.min(.22,pulse))}"/>`:''}${watermark}${!textOnly&&!empty?glyph:''}${!agent?`<rect id="control-rail" x="14" y="120" width="116" height="12" rx="6" fill="${accent}"/>`:''}</g>${text}${badge==='selected'?'<g id="selected-agent"><circle cx="123" cy="19" r="6" fill="white"/></g>':''}</svg>`;
}
module.exports={signalSvg,controlAccent};
