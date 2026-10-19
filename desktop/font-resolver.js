// SPDX-License-Identifier: AGPL-3.0-only
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EOFontResolver=factory();})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 // SDK FontStyle bits: bold=1, italic=2. AllFonts positional slots are converted by the index.
 const order={0:[0,2,1,3],1:[1,0,3,2],2:[2,0,3,1],3:[3,1,2,0]};
 const fallbackFamilies=Object.freeze(['Elixir Fallback Arabic','Elixir Fallback Sinhala']);
 const normalize=name=>String(name||'').normalize('NFC').toLocaleLowerCase('en-US');
 function classify(style){
  let bits=0,other=0,alt=0;
  for(const word of String(style||'').toLowerCase().split(/[\s_\-]+/).filter(Boolean)){
   if(['italic','oblique','slanted','inclined'].includes(word))bits|=2;
   else if(word==='bold')bits|=1;
   else if(['book','medium'].includes(word))alt++;
   else if(!['regular','normal','roman','standard','text','plain'].includes(word))other++;
  }
  return {bits,other,alt};
 }
 function styleOf(style){return classify(style).bits;}
 // Match the existing local-font family's slot selection; variants cannot impersonate bold/italic.
 function slots(faces){
  const result=faces.filter(face=>face.styleCode!==undefined),raw=faces.filter(face=>face.styleCode===undefined);
  for(let slot=0;slot<4;slot++){
   let best=null,score=Infinity;
   for(const face of raw){const c=classify(face.style),value=c.bits!==slot?Infinity:c.other?10+c.other:c.alt?1:0;if(value<score){best=face;score=value;}}
   if(best&&(score<=1||slot===0))result.push({...best,styleCode:slot});
   else if(slot===0&&raw.length){const fallback=raw.find(face=>classify(face.style).bits===0)||raw[0];result.push({...fallback,styleCode:0});}
  }
  return result;
 }
 function covers(face,codepoints){return !codepoints?.length||codepoints.every(cp=>{let lo=0,hi=face.coverage.length-1;while(lo<=hi){const m=(lo+hi)>>1,r=face.coverage[m];if(cp<r[0])hi=m-1;else if(cp>r[1])lo=m+1;else return true;}return false;});}
 function scriptCandidates(cp,name=''){
  if(cp>=0x600&&cp<=0x8ff||cp>=0xfb50&&cp<=0xfdff||cp>=0xfe70&&cp<=0xfeff||cp>=0x1ee00&&cp<=0x1eeff)return ['Noto Sans Arabic','Noto Naskh Arabic','Arabic Typesetting','Geeza Pro','Simplified Arabic',fallbackFamilies[0]];
  if(cp>=0xd80&&cp<=0xdff)return ['Noto Sans Sinhala','Iskoola Pota','Sinhala MN','Sinhala Sangam MN',fallbackFamilies[1]];
  if(cp>=0x590&&cp<=0x5ff||cp>=0xfb1d&&cp<=0xfb4f)return ['Noto Sans Hebrew','Arial Hebrew','David'];
  if(cp>=0xe00&&cp<=0xe7f)return ['Noto Sans Thai','Leelawadee UI','Thonburi'];
  if(cp>=0x900&&cp<=0x97f)return ['Noto Sans Devanagari','Nirmala UI','Devanagari Sangam MN'];
  if(cp>=0xe80&&cp<=0xeff)return ['Noto Sans Lao','Lao Sangam MN','Leelawadee UI'];
  const cjk=cp>=0x1100&&cp<=0x11ff||cp>=0xa960&&cp<=0xa97f||cp>=0xd7b0&&cp<=0xd7ff||cp>=0x2e80&&cp<=0x9fff||cp>=0xac00&&cp<=0xd7af||cp>=0xf900&&cp<=0xfaff||cp>=0x20000&&cp<=0x323af;
  if(!cjk)return [];
  let region=/CJK JP|Hiragino|Yu |MS (Gothic|Mincho)|Meiryo/i.test(name)?'JP':/CJK TC|PingFang TC|MingLiU|JhengHei/i.test(name)?'TC':/CJK KR|Malgun|Batang|Gulim|Apple SD Gothic/i.test(name)?'KR':'SC';
  if(cp>=0x3040&&cp<=0x30ff)region='JP';
  if(cp>=0xac00&&cp<=0xd7ff||cp>=0x1100&&cp<=0x11ff||cp>=0xa960&&cp<=0xa97f||cp>=0x3130&&cp<=0x318f)region='KR';
  if(cp>=0x3100&&cp<=0x312f)region='TC';
  const os={JP:['Yu Gothic','MS Gothic','Hiragino Sans','Meiryo'],TC:['Microsoft JhengHei','MingLiU','PingFang TC'],KR:['Malgun Gothic','Batang','Apple SD Gothic Neo'],SC:['Microsoft YaHei','SimSun','PingFang SC']};
  return ['Noto Sans CJK '+region,'Noto Serif CJK '+region,...os[region]];
 }
 function namedCandidates(name){
  const key=normalize(name);
  for(const [cp,context] of [[0x633,''],[0xd85,''],[0x4e00,'Noto Sans CJK JP'],[0x4e00,'Noto Sans CJK SC'],[0x4e00,'Noto Sans CJK TC'],[0x4e00,'Noto Sans CJK KR']]){
   const names=scriptCandidates(cp,context);
   if(names.some(candidate=>normalize(candidate)===key))return names;
  }
  return [];
 }
 function eligible(face){return face.source!=='system'||!fallbackFamilies.some(name=>normalize(name)===normalize(face.family))&&(!face.variable||!(face.faceIndex>>>16)||face.instanceDefault===true);}
 function prepare(faces){return faces.filter(eligible).map(face=>face.source==='system'&&face.variable&&face.instanceDefault?{...face,faceIndex:face.faceIndex&65535}:face).sort((a,b)=>Number(!!a.variable)-Number(!!b.variable));}
 function create(faces,{substitutes={}}={}){
  const safeAliases=new Map();
  for(const face of faces)if(!eligible(face)&&face.fullName)safeAliases.set(normalize(face.fullName),face.family);
  faces=prepare(faces);
  const families=new Map();
  for(const face of faces){const key=normalize(face.family);if(!families.has(key))families.set(key,[]);families.get(key).push({...face});}
  for(const face of faces){
   const full=face.fullName,c=classify(face.style);
   if(face.source==='bundled'||!full||full===face.family||c.bits||!c.other&&!c.alt||families.has(normalize(full)))continue;
   const aliases=[];
   for(const [suffix,styleCode] of [['',0],[' Bold',1],[' Italic',2],[' Bold Italic',3]]){
    const chosen=faces.find(other=>other.source===face.source&&other.family===face.family&&normalize(other.fullName)===normalize(full+suffix));
    if(chosen)aliases.push({...chosen,family:full,styleCode});
   }
   families.set(normalize(full),aliases);
  }
  for(const [key,values] of families){const selected=[];for(const source of ['bundled','system','fallback'])selected.push(...slots(values.filter(face=>face.source===source)));families.set(key,selected);}
  function choose(name,source,style,codepoints){
   const candidates=(families.get(normalize(name))||[]).filter(f=>f.source===source);
   for(const slot of order[style]){const found=candidates.find(f=>f.styleCode===slot);if(found){if(!covers(found,codepoints))return null;return {...found,requestedStyle:style,syntheticBold:!!(style&1)&&!(slot&1),syntheticItalic:!!(style&2)&&!(slot&2)};}}
   return null;
  }
  function resolve({name,style=0,codepoints=[],locale='',candidates=namedCandidates(name),aliases:requestedAliases}){
   if(!order[style])throw Error('Invalid font style');
   const aliases=requestedAliases||substitutes[name]||Object.entries(substitutes).find(([key])=>normalize(key)===normalize(name))?.[1]||[];
   const safeName=safeAliases.get(normalize(name));
   for(const n of [name,...aliases,...(safeName?[safeName,...(substitutes[safeName]||[])]:[])]){const found=choose(n,'bundled',style,codepoints);if(found)return found;}
   const regional=String(locale).toLowerCase();
   const suffix=regional.startsWith('ja')?'JP':regional.startsWith('ko')?'KR':/zh-(tw|hant)/.test(regional)?'TC':regional.startsWith('zh')?'SC':null;
   const names=[name,...(safeName?[safeName]:[]),...candidates,...(suffix?['Noto Sans CJK '+suffix,'Noto Serif CJK '+suffix]:[])];
   let synthesized=null;
   for(const n of names){
    const found=choose(n,'system',style,codepoints);
    if(!found)continue;
    if(!found.syntheticBold&&!found.syntheticItalic)return found;
    if(!synthesized)synthesized=found;
   }
   if(synthesized)return synthesized;
   // The caller supplies script candidates. Never choose an arbitrary font merely because it has Latin.
   for(const n of [name,...candidates]){const found=choose(n,'fallback',style,codepoints);if(found)return found;}
   return null;
  }
  return Object.freeze({resolve,covers,families,protectedName:name=>!!resolve({name})&&resolve({name}).source==='bundled'});
 }
 return Object.freeze({create,styleOf,covers,normalize,slots,scriptCandidates,eligible,prepare,fallbackFamilies,namedCandidates});
});
