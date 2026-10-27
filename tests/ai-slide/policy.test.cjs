// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web),'Explicit candidate EO_WEB_APPS required');
let factory;vm.runInNewContext(fs.readFileSync(path.join(web,'apps/presentationeditor/main/app/elixir-ai/SlidePolicy.js'),'utf8'),{define:(_d,f)=>factory=f()});
const P=factory(),ok=(n,a)=>assert.equal(P.validate(n,a),null),bad=(n,a)=>assert.equal(P.validate(n,a)?.ok,false);
test('presentation tool contract covers required capabilities and only strict data arguments',()=>{
 for(const n of ['read_slides','create_slides','rewrite_text','set_layout','apply_theme','align_shapes','set_notes','summarize_deck','submit_plan','verify_result','ask_user','cannot_do'])assert(P.names.includes(n));
 assert.equal(P.names.length,12);
 ok('create_slides',{slides:[{title:'Public lesson',bullets:['Read','Discuss'],notes:'Teacher notes'}]});
 ok('rewrite_text',{slide:1,shape_id:'1431',paragraphs:[{index:1,expected:'Too long',text:'Short'}]});
 ok('set_notes',{slide:1,expected:'',text:'Discuss the result.',mode:'replace'});
 ok('set_layout',{slides:[1,2],master:1,layout:2});
 ok('apply_theme',{slides:[1],master:1});ok('align_shapes',{slide:1,shape_ids:['1','2'],alignment:'left'});
 ok('read_slides',{slides:[1,2]});ok('summarize_deck',{});
});
test('unknown nested fields, inherited property names, arbitrary code and oversized budgets are refused',()=>{
 bad('eval',{code:'anything'});bad('summarize_deck',{code:'anything'});
 bad('create_slides',{slides:[{title:'A',bullets:[],script:'alert(1)'}]});
 bad('create_slides',{slides:Array.from({length:11},()=>({title:'A',bullets:[]}))});
 bad('create_slides',{slides:[{title:'A',bullets:Array(9).fill('x')}]});
 bad('create_slides',{slides:[{title:'x'.repeat(161),bullets:[]}]});
 bad('read_slides',{slides:[1,1]});bad('read_slides',{slides:[0]});bad('read_slides',{slides:[1.5]});
 bad('read_slides',{slides:Array.from({length:11},(_,i)=>i+1)});
 bad('apply_theme',{slides:[1],master:Infinity});bad('set_notes',{slide:1,expected:'',text:'\u0000',mode:'append'});
 bad('rewrite_text',{slide:1,shape_id:'x',paragraphs:[{index:1,expected:'A',text:'B',anything:true}]});
 bad('rewrite_text',{slide:1,shape_id:'x',paragraphs:[{index:1,expected:'A',text:'B\nC'}]});
 bad('rewrite_text',{slide:1,shape_id:'x',paragraphs:[{index:1,expected:'A',text:'B'},{index:1,expected:'A',text:'C'}]});
 bad('align_shapes',{slide:1,shape_ids:['1','1'],alignment:'left'});
 bad('summarize_deck',JSON.parse('{"__proto__":{}}'));bad('summarize_deck',{constructor:'x'});
});
test('read-only plans cannot contain mutations and plan tool names cannot smuggle arguments',()=>{
 ok('submit_plan',{goal:'Explain',read_only:true,steps:[{tool:'read_slides',purpose:'Read'}]});
 bad('submit_plan',{goal:'Explain',read_only:true,steps:[{tool:'create_slides',purpose:'Read'}]});
 bad('submit_plan',{goal:'Edit',read_only:false,steps:[{tool:'set_notes',purpose:'Edit',parameters:{}}]});
 bad('submit_plan',{goal:'Edit',read_only:false,steps:[{tool:'functions.set_notes',purpose:'Edit'}]});
 assert.equal(P.mutating('set_notes'),true);assert.equal(P.mutating('summarize_deck'),false);
});
const run=(text,more={})=>({type:'run',reviewType:'common',content:[text],rPr:{latin:'Arial'},...more});
const shape=paragraphs=>({content:{content:{type:'drawingDocContent',content:paragraphs}}});
const paragraph=(...content)=>({type:'paragraph',content});
test('public shape JSON text reads are pure and distinguish missing bodies and unsupported rich content',()=>{
 const raw=shape([paragraph(run('First'),run(' line'),{type:'endRun',content:[]}),paragraph(run('Second'))]),before=JSON.stringify(raw);
 const rows=P.paragraphs(raw);assert.equal(rows.length,2);assert.equal(rows[0].text,'First line');assert.equal(rows[0].plain,true);assert.equal(rows[1].text,'Second');assert.equal(JSON.stringify(raw),before);
 assert.equal(P.paragraphs({content:null}).length,0);
 assert.equal(P.paragraphs(shape([paragraph(run('Link',{type:'hyperlink'}))]))[0].plain,false);
 assert.equal(P.paragraphs(shape([paragraph(run('One'),run('Two',{rPr:{b:true}}))]))[0].plain,false);
 assert.throws(()=>P.paragraphs(shape([paragraph(run('x'.repeat(4097)))])));
});
test('notes reading selects only the public body placeholder, without creating or reading slide-number placeholders',()=>{
 const raw={notes:{cSld:{spTree:[{...shape([paragraph(run('Notes'))]),nvSpPr:{nvPr:{ph:{type:'body'}}}},{...shape([paragraph(run('1'))]),nvSpPr:{nvPr:{ph:{type:'sldNum'}}}}]}}};
 assert.equal(P.notes(raw).text,'Notes');assert.equal(P.notes(raw).exists,true);assert.equal(P.notes({notes:{cSld:{spTree:[]}}}).exists,false);
 assert.equal(P.notes({notes:null}).exists,false);
});
test('alignment preserves dimensions, rejects nonfinite/outside/locked targets and distributes only with room',()=>{
 const input=[{id:'1',x:10,y:10,w:10,h:10},{id:'2',x:50,y:30,w:20,h:10},{id:'3',x:90,y:50,w:10,h:20}];
 const left=P.align(input,'left',120,100);assert.equal(left[1].x,10);assert.equal(left[1].y,30);assert.equal(left[1].w,20);
 const horizontal=P.align(input,'horizontal',120,100);assert.equal(horizontal[1].x,45);
 assert.throws(()=>P.align([{...input[0],x:NaN},input[1]],'left',120,100));
 assert.throws(()=>P.align([{...input[0],locked:true},input[1]],'left',120,100));
 assert.throws(()=>P.align([{...input[0],x:-1},input[1]],'left',120,100));
 assert.throws(()=>P.align(input.slice(0,2),'horizontal',120,100));
 assert.throws(()=>P.align([{id:'1',x:0,y:0,w:80,h:10},{id:'2',x:1,y:20,w:80,h:10},{id:'3',x:2,y:40,w:80,h:10}],'horizontal',120,100));
});
test('closure-free policy can be serialized without capturing untrusted data or editor internals',()=>{
 const other=vm.runInNewContext('('+factory.toString()+')()');
 assert.equal(other.validate('set_layout',{slides:[1],master:1,layout:1}),null);
 assert.equal(other.validate('set_layout',{slides:[0],master:1,layout:1}).ok,false);
});
test('structure signatures ignore only derived shape extents, preserving real transforms, text and notes',()=>{
 const raw={cSld:{spTree:[{type:'shape',extX:0,extY:0,spPr:{xfrm:{ext:{cx:100,cy:50},off:{x:10,y:20}}},content:'Original'}]},notes:{text:'Notes'}};
 const recalc=JSON.parse(JSON.stringify(raw));recalc.cSld.spTree[0].extX=100;recalc.cSld.spTree[0].extY=50;
 assert.equal(P.signature(JSON.stringify(raw)),P.signature(JSON.stringify(recalc)));
 recalc.cSld.spTree[0].spPr.xfrm.off.x=11;assert.notEqual(P.signature(JSON.stringify(raw)),P.signature(JSON.stringify(recalc)));
 recalc.cSld.spTree[0].spPr.xfrm.off.x=10;recalc.notes.text='Changed';assert.notEqual(P.signature(JSON.stringify(raw)),P.signature(JSON.stringify(recalc)));
 recalc.notes.text='Notes';recalc.cSld.spTree[0].content='Changed';assert.notEqual(P.signature(JSON.stringify(raw)),P.signature(JSON.stringify(recalc)));
});
test('theme verification ignores resolved UniColor caches but retains the actual source palette',()=>{
 const input={name:'Public Citrus',accent1:{type:'uniColor',rgba:{red:0,green:0,blue:0},color:{type:'srgb',rgba:{red:255,green:136,blue:0}}}};
 const resolved=JSON.parse(JSON.stringify(input));resolved.accent1.rgba={red:255,green:136,blue:0};
 assert.equal(P.themeSignature(JSON.stringify(input)),P.themeSignature(JSON.stringify(resolved)));
 resolved.accent1.color.rgba.blue=10;assert.notEqual(P.themeSignature(JSON.stringify(input)),P.themeSignature(JSON.stringify(resolved)));
});
test('append notes accepts only the new suffix; complete desired notes require explicit replace',()=>{
 bad('set_notes',{slide:1,expected:'Original',text:'Original\nNew paragraph',mode:'append'});
 ok('set_notes',{slide:1,expected:'Original',text:'New paragraph',mode:'append'});
 ok('set_notes',{slide:1,expected:'Original',text:'Original\nNew paragraph',mode:'replace'});
});
test('explicit rewrite character limits are checked before writes and actual counts use Unicode code points',()=>{
 bad('rewrite_text',{slide:1,shape_id:'1',paragraphs:[{index:1,expected:'Long',text:'Too long',max_chars:3}]});
 ok('rewrite_text',{slide:1,shape_id:'1',paragraphs:[{index:1,expected:'Long',text:'😀é',max_chars:2}]});
 bad('rewrite_text',{slide:1,shape_id:'1',paragraphs:[{index:1,expected:'Long',text:'ok',max_chars:0}]});
 assert.equal(P.paragraphs(shape([paragraph(run('😀é'))]))[0].characters,2);
});
test('structural guards ignore only resolved theme-color caches, never real scheme IDs or literal colors',()=>{
 const shape={type:'shape',spPr:{},content:{color:{type:'uniColor',rgba:{red:0},color:{type:'scheme',id:15,rgba:{red:0}}}}};
 const rendered=JSON.parse(JSON.stringify(shape));rendered.content.color.rgba.red=255;rendered.content.color.color.rgba.red=255;
 assert.equal(P.signature(JSON.stringify(shape)),P.signature(JSON.stringify(rendered)));
 rendered.content.color.color.id=12;assert.notEqual(P.signature(JSON.stringify(shape)),P.signature(JSON.stringify(rendered)));
 const literal={type:'uniColor',color:{type:'srgb',rgba:{red:10}}},changed=JSON.parse(JSON.stringify(literal));changed.color.rgba.red=20;
 assert.notEqual(P.signature(JSON.stringify(literal)),P.signature(JSON.stringify(changed)));
});
