// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Independent final-state criteria over public snapshots of authored fixtures.
// This does not import or call the production policy or adapter.
function paragraphs(shape){
 return (shape.raw?.content?.content?.content||[]).map(p=>(p.content||[]).flatMap(run=>Array.isArray(run.content)?run.content.filter(v=>typeof v==='string'):[]).join(''));
}
function notes(slide){
 const body=(slide.raw?.notes?.cSld?.spTree||[]).find(s=>s.nvSpPr?.nvPr?.ph?.type==='body');
 return body?paragraphs({raw:body}).join('\n'):'';
}
function canonical(raw){
 // Only redundant computed extents are excluded, never canonical transforms.
 return JSON.stringify(raw,function(k,v){if((k==='extX'||k==='extY')&&this?.type==='shape'&&this.spPr)return undefined;
  if(k==='rgba'&&['uniColor','scheme','sys'].includes(this?.type))return undefined;
  return v;});
}
function slideText(slide){return slide.shapes.flatMap(paragraphs);}
function snapshotEqual(a,b){return a.width===b.width&&a.height===b.height&&a.count===b.count&&a.masters===b.masters&&a.slides.length===b.slides.length&&a.slides.every((s,i)=>canonical(s.raw)===canonical(b.slides[i].raw));}
function evaluate(task,before,after,result){
 const errors=[],c=task.criteria,target=c.slide?c.slide-1:null;
 if(!result.ok)errors.push('orchestrator failure');
 if(result.verification?.goal_met===false)errors.push('goal not met');
 if(c.readOnly&&!snapshotEqual(before,after))errors.push('read-only task changed deck');
 if(c.type==='generate'){
  if(after.count!==before.count+c.added)errors.push('new slide count');
  const added=after.slides.slice(before.count),all=added.flatMap(slideText);
  for(const title of c.titles)if(!all.includes(title))errors.push('missing generated title: '+title);
  for(const slide of added)for(const [index,shape]of slide.shapes.entries()){
   const box=shape.position;
   if(!box||![box.x,box.y,box.w,box.h].every(Number.isFinite)||box.w<=0||box.h<=0||box.x<0||box.y<0||box.x+box.w>after.width+1||box.y+box.h>after.height+1)errors.push('generated shape has invalid or off-slide geometry');
   for(const p of shape.raw?.content?.content?.content||[])for(const run of p.content||[]){
    if(!(run.content||[]).some(v=>typeof v==='string'&&v.length))continue;
    const pr=run.rPr,foreground=pr?.uniFill?.fill?.color?.color;
    if(foreground?.type!=='scheme'||foreground.id!==15)errors.push('generated text lacks explicit theme foreground');
    if(pr?.sz!==(index===0?3200:2000))errors.push('generated title/body font size');
   }
  }
  for(const text of c.requiredBody||[])if(!all.includes(text))errors.push('missing generated body: '+text);
  for(const term of c.requiredBodyTerms||[])if(!all.join(' ').includes(term))errors.push('missing generated fact: '+term);
  if(c.exactBodyParagraphs&&added.some(s=>s.shapes.slice(1).flatMap(paragraphs).filter(Boolean).length!==c.exactBodyParagraphs))errors.push('body paragraph count differs from explicit request');
  if(c.minimumBodyParagraphs&&added.some(s=>s.shapes.slice(1).flatMap(paragraphs).filter(Boolean).length<c.minimumBodyParagraphs))errors.push('too few body paragraphs');
 }else if(c.type==='rewrite'){
  const original=before.slides[target].shapes[1],changed=after.slides[target].shapes.find(s=>s.id===original.id);
  const old=paragraphs(original),values=changed?paragraphs(changed):[],text=values[c.paragraph-1]||'';
  if(text===old[c.paragraph-1])errors.push('paragraph not rewritten');
  if(!text||text.length>c.maxLength)errors.push('rewrite length');
  for(const term of c.terms||[])if(!text.toLowerCase().includes(term.toLowerCase()))errors.push('rewrite missing fact: '+term);
  for(const term of c.forbidden||[])if(text.toLowerCase().includes(term.toLowerCase()))errors.push('rewrite retained forbidden wording');
  if(values.length!==old.length||values.some((v,i)=>i!==c.paragraph-1&&v!==old[i]))errors.push('unrequested paragraph changed');
  if(JSON.stringify(paragraphs(before.slides[target].shapes[0]))!==JSON.stringify(paragraphs(after.slides[target].shapes.find(s=>s.id===before.slides[target].shapes[0].id)||{})))errors.push('title changed');
 }else if(c.type==='notes'){
  if(notes(after.slides[target])!==c.expected)errors.push('notes text');
  if(JSON.stringify(slideText(before.slides[target]))!==JSON.stringify(slideText(after.slides[target])))errors.push('slide text changed while editing notes');
 }else if(c.type==='layout'){
  if(after.slides[target].layoutName!==c.layoutName)errors.push('requested layout not applied');
  if(JSON.stringify(slideText(before.slides[target]).sort())!==JSON.stringify(slideText(after.slides[target]).sort()))errors.push('layout lost text');
 }else if(c.type==='align'){
  const shapes=after.slides[target].shapes,positions=shapes.map(s=>s.position[c.alignment==='left'?'x':'y']);
  if(positions.some(v=>Math.abs(v-positions[0])>1))errors.push('edges not aligned');
  for(const shape of shapes){
   const old=before.slides[target].shapes.find(s=>s.id===shape.id);
   if(!old||Math.abs(shape.position.w-old.position.w)>1||Math.abs(shape.position.h-old.position.h)>1)errors.push('alignment resized drawing');
   if(old&&JSON.stringify(paragraphs(old))!==JSON.stringify(paragraphs(shape)))errors.push('alignment changed text');
  }
 }else if(c.type==='theme'){
  const color=after.slides[target].colors?.accent1?.color?.rgba;
  const hex=color?[color.red,color.green,color.blue].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase():'';
  if(hex!==c.accent1)errors.push('theme accent color');
  if(JSON.stringify(slideText(before.slides[target]).sort())!==JSON.stringify(slideText(after.slides[target]).sort()))errors.push('theme lost text');
 }else if(c.type==='answer'){
  const answer=String(result.answer||result.summary||'').toLowerCase().replace(/(?<=\d)[,.\u00a0\u202f ](?=\d)/g,'');
  for(const term of c.answerTerms||[])if(!answer.includes(term.toLowerCase()))errors.push('answer missing fact: '+term);
  for(const group of c.answerGroups||[])if(!group.some(term=>answer.includes(term.toLowerCase())))errors.push('answer missing topic: '+group.join('/'));
 }
 if(c.type!=='answer'){
  if(c.type!=='generate'&&after.count!==before.count)errors.push('unrequested slide count change');
  for(let i=0;i<before.slides.length;i++)if(c.type==='generate'||i!==target){
   if(canonical(before.slides[i].raw)!==canonical(after.slides[i]?.raw))errors.push('unrelated slide changed: '+(i+1));
   if(canonical(before.slides[i].colors)!==canonical(after.slides[i]?.colors))errors.push('unrelated slide theme changed: '+(i+1));
  }
 }
 return errors;
}
module.exports={paragraphs,notes,canonical,slideText,snapshotEqual,evaluate};
