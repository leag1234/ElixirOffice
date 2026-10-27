// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),tasks=require('./tasks.json'),criteria=require('./criteria.cjs');
test('evaluation has thirty independent bilingual tasks, required categories and authored state criteria',()=>{
 assert.equal(tasks.length,30);assert.equal(tasks.filter(t=>t.lang==='en').length,15);assert.equal(tasks.filter(t=>t.lang==='fr').length,15);assert.equal(new Set(tasks.map(t=>t.id)).size,30);
 for(const category of ['generate','rewrite','notes','layout','align','theme','summary','outline'])assert(tasks.some(t=>t.category===category));
 for(const t of tasks){assert(t.instruction&&t.slides.length===3&&t.criteria.type);assert(t.slides.every(s=>typeof s.title==='string'&&Array.isArray(s.bullets)&&typeof s.notes==='string'));}
});
test('OOXML authoring preserves independent text/positions and valid two-master relationships',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eo-slide-fixtures-'));
 try{
  const output=execFileSync(process.env.EO_PYTHON||'python3',[path.join(__dirname,'fixtures.test.py'),repo,directory],{encoding:'utf8'});assert.match(output,/PASS independent OOXML/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
function shape(id,text){return {id,raw:{id,type:'shape',spPr:{xfrm:{off:{x:1,y:1},ext:{cx:10,cy:10}}},content:{content:{content:[{type:'paragraph',content:[{type:'run',content:[text]}]}]}}},position:{x:1,y:1,w:10,h:10}};}
function snapshot(){return {count:2,masters:1,slides:[1,2].map(n=>({raw:{id:n,text:'unchanged'},shapes:[shape('title'+n,'Title '+n),shape('body'+n,'Long body '+n)],colors:{name:'Public',accent1:{type:'uniColor',color:{type:'srgb',rgba:{red:1,green:2,blue:3}}}}}))};}
test('independent final-state checker rejects false success, wrong lengths, unrelated changes and read-only mutation',()=>{
 const before=snapshot(),after=structuredClone(before),result={ok:true,answer:'Public project business'};
 assert.deepEqual(criteria.evaluate({criteria:{type:'answer',readOnly:true,answerTerms:['project']}},before,after,result),[]);
 after.slides[1].raw.text='changed';assert(criteria.evaluate({criteria:{type:'answer',readOnly:true}},before,after,result).includes('read-only task changed deck'));
 assert(criteria.evaluate({criteria:{type:'rewrite',slide:1,paragraph:1,maxLength:3,terms:[]}},before,after,result).includes('rewrite length'));
 assert(criteria.evaluate({criteria:{type:'rewrite',slide:1,paragraph:1,maxLength:100,terms:[]}},before,after,result).includes('unrelated slide changed: 2'));
 assert(criteria.evaluate({criteria:{type:'answer'}},before,before,{ok:false}).includes('orchestrator failure'));
 assert(criteria.evaluate({criteria:{type:'answer'}},before,before,{ok:true,verification:{goal_met:false}}).includes('goal not met'));
});
test('generated-slide acceptance rejects the old invisible text even when all textual facts are present',()=>{
 const before=snapshot();before.width=100;before.height=100;
 const after=structuredClone(before),created={raw:{id:3},shapes:[shape('new-title','Public title'),shape('new-body','Public body')],colors:{}};
 created.shapes.forEach((s,i)=>{for(const p of s.raw.content.content.content)for(const run of p.content)run.rPr={sz:i===0?3200:2000,uniFill:{fill:{color:{color:{type:'scheme',id:15}}}}};});
 after.count=3;after.slides.push(created);const task={criteria:{type:'generate',added:1,titles:['Public title']}};
 assert.deepEqual(criteria.evaluate(task,before,after,{ok:true}),[]);
 delete created.shapes[0].raw.content.content.content[0].content[0].rPr.uniFill;
 assert(criteria.evaluate(task,before,after,{ok:true}).includes('generated text lacks explicit theme foreground'));
 created.shapes[0].position.w=0;assert(criteria.evaluate(task,before,after,{ok:true}).includes('generated shape has invalid or off-slide geometry'));
});
