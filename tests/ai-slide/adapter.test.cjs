// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web));
let policy,tools;vm.runInNewContext(fs.readFileSync(path.join(web,'apps/presentationeditor/main/app/elixir-ai/SlidePolicy.js'),'utf8'),{define:(_d,f)=>policy=f()});
const window={Common:{ElixirAI:{}}};
const sandbox={define:(_d,f)=>tools=f(policy),window,setTimeout,clearTimeout,Date,Promise};
vm.runInNewContext(fs.readFileSync(path.join(web,'apps/presentationeditor/main/app/elixir-ai/SlideTools.js'),'utf8'),sandbox);
const emptyNotes={notes:{cSld:{spTree:[]}}},body={type:'shape',content:{content:{type:'drawingDocContent',content:[{type:'paragraph',content:[{type:'run',content:['Original'],rPr:{}}]}]}}};
function apiFixture(){
 let text='Original',dirty=0,mutations=0,undos=0;const calls=[];
 const shape={GetInternalId:()=> '10',GetClassType:()=> 'shape',ToJSON:()=>JSON.stringify({...body,content:{content:{type:'drawingDocContent',content:[{type:'paragraph',content:[{type:'run',content:[text],rPr:{}}]}]}}}),
 GetLockValue:()=>false,GetPosX:()=>10,GetPosY:()=>10,GetWidth:()=>10,GetHeight:()=>10,
 GetContent(){calls.push('GetContent');return {GetElement(){return {GetText:()=>text,GetElementsCount:()=>1,GetElement:()=>({GetClassType:()=> 'run',GetTextPr:()=>({})}),RemoveAllElements(){text='';mutations++;dirty++;return true;},AddElement(run){text=run.text;return true;}};}};}};
 const layout={GetName:()=> 'Title',GetLayoutType:()=> 'title'},master={GetAllLayouts:()=>[layout],GetTheme:()=>({})};
 const slide={GetSlideIndex:()=>0,GetAllDrawings:()=>[shape],GetAllShapes:()=>[shape],GetAllTables:()=>[],GetAllCharts:()=>[],GetAllImages:()=>[],GetAllOleObjects:()=>[],
 ToJSON:()=>JSON.stringify({...emptyNotes,cSld:{spTree:[JSON.parse(shape.ToJSON())]},layout:'1',master:'1'}),GetNotesPage:()=>null,GetVisible:()=>true};
 const p={GetSlidesCount:()=>1,GetCurSlideIndex:()=>0,GetCurrentSlide:()=>slide,GetCurrentVisibleSlide:()=>slide,GetSlideByIndex:n=>n===0?slide:null,GetAllSlides:()=>[slide],GetWidth:()=>100,GetHeight:()=>100,GetAllSlideMasters:()=>[master]};
 const Api={GetPresentation:()=>p,GetSelection:()=>({GetType:()=> 'none',GetSlides:()=>[slide],GetShapes:()=>[]}),CreateRun:()=>({text:'',AddText(v){this.text+=v;},SetTextPr(){}})};
 const api={callMethod(n,a,cb){calls.push([n,Array.from(a)]);cb(undefined);},isLongAction:()=>false,callCommand(source,_close,cb){calls.push('command');cb(vm.runInNewContext(source,{Api}));},Undo(){undos++;text='Original';dirty=0;},get dirty(){return dirty;}};
 return {api,Api,p,shape,slide,master,layout,calls,get text(){return text;},get mutations(){return mutations;},get undos(){return undos;}};
}
test('presentation exposes bounded strict schemas and a static escaped public command',()=>{
 assert.equal(tools.tools.length,12);
 for(const t of tools.tools){assert.equal(t.type,'function');assert.equal(t.function.parameters.additionalProperties,false);}
 const source=tools._source('rewrite_text',{slide:1,shape_id:'10',paragraphs:[{index:1,expected:'Original',text:'import <b>literal</b>'}]},{});
 assert(!source.includes('import'));assert.match(source,/Api\.GetPresentation/);assert.doesNotMatch(source,/getLogicDocument|\.WordControl|eval\(|new Function/);
 assert.throws(()=>tools._source('arbitrary',{}));
});
test('public init/read/state use serialization without creating missing shape or notes bodies',async()=>{
 const f=apiFixture(),ts=tools.create(f.api),c=await ts.init();
 const r=await ts.execute('read_slides',{slides:[1]},c);assert.equal(r.ok,true);assert.equal(r.slides[0].shapes[0].paragraphs[0].text,'Original');
 assert.equal(f.calls.includes('GetContent'),false);assert.equal(f.mutations,0);
 await ts.end(c,true);assert.deepEqual(f.calls.findLast(x=>Array.isArray(x)),['EndAction',['GroupActions','','cancel']]);
});
test('no edit before a valid sticky editing plan; stale data and invalid nested args cause zero writes',async()=>{
 const f=apiFixture(),ts=tools.create(f.api),c=await ts.init(),args={slide:1,shape_id:'10',paragraphs:[{index:1,expected:'Original',text:'Short'}]};
 assert.equal((await ts.execute('rewrite_text',args,c)).ok,false);
 assert.equal((await ts.execute('submit_plan',{goal:'Explain',read_only:true,steps:[{tool:'read_slides',purpose:'Read'}]},c)).ok,true);
 assert.equal((await ts.execute('submit_plan',{goal:'Edit',read_only:false,steps:[{tool:'rewrite_text',purpose:'Edit'}]},c)).ok,false);
 assert.equal((await ts.execute('rewrite_text',args,c)).ok,false);assert.equal(f.mutations,0);await ts.end(c,false);
});
test('successful public rewrite preserves grouping, exact readback and one presentation Undo',async()=>{
 const f=apiFixture(),ts=tools.create(f.api),c=await ts.init();
 await ts.execute('submit_plan',{goal:'Shorten',read_only:false,steps:[{tool:'rewrite_text',purpose:'Shorten'}]},c);
 const r=await ts.execute('rewrite_text',{slide:1,shape_id:'10',paragraphs:[{index:1,expected:'Original',text:'Short'}]},c);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.mutated,true);assert.equal(f.text,'Short');
 await ts.end(c,true);assert.deepEqual(f.calls.findLast(x=>Array.isArray(x)),['EndAction',['GroupActions','','']]);
 await ts.undo();assert.equal(f.undos,1);assert.equal(f.text,'Original');
});
test('missing callbacks reject without mutation retry and require conservative rollback reporting',async()=>{
 const f=apiFixture(),ts=tools.create(f.api);assert.equal(ts.requireConfirmedRollback,true);assert.equal(ts.canRejectAfterEdit,false);
 const c=await ts.init();f.api.callMethod=()=>{};
 // Actual GroupActions returns undefined even on success; only callback absence is a fault.
 sandbox.setTimeout=fn=>{queueMicrotask(fn);return 0;};sandbox.clearTimeout=()=>{};
 try{await assert.rejects(ts.end(c,false));assert.equal(c.rollbackUnverified,true);}
 finally{sandbox.setTimeout=setTimeout;sandbox.clearTimeout=clearTimeout;}
 assert.equal(f.mutations,0);
});

test('alignment verifies fresh public positions after command recalculation, without retrying a mutation',async()=>{
 const f=apiFixture();let y=30,pending=null,writes=0;
 const second={...f.shape,GetInternalId:()=> '11',GetPosY:()=>y,SetPosition(){throw Error('Inherited placeholders need public SetPosX/SetPosY');},SetPosX(){return true;},SetPosY(nextY){pending=nextY;writes++;return true;}};
 f.slide.GetAllShapes=()=>[f.shape,second];f.slide.GetAllDrawings=()=>[f.shape,second];
 const originalSerialization=f.slide.ToJSON;f.slide.ToJSON=()=>JSON.stringify({...JSON.parse(originalSerialization()),position:pending===null?y:pending});
 f.api.callCommand=(source,_close,cb)=>{const result=vm.runInNewContext(source,{Api:f.Api});if(pending!==null){y=pending;pending=null;}cb(result);};
 const ts=tools.create(f.api),c=await ts.init();
 await ts.execute('submit_plan',{goal:'Align',read_only:false,steps:[{tool:'align_shapes',purpose:'Align'}]},c);
 const r=await ts.execute('align_shapes',{slide:1,shape_ids:['10','11'],alignment:'top'},c);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.state.slides[0].shapes[1].position.y,10);assert.equal(writes,1);await ts.end(c,true);
});

test('applying a theme uses a detached public master copy and preserves unrelated slide structure',async()=>{
 const f=apiFixture();let selectedMaster='original',copyCount=0,originalReads=0;
 const copiedTheme={copied:true,GetColorScheme:()=>({ToJSON:()=>JSON.stringify({name:'Public test'})})};
 f.master.Copy=()=>{copyCount++;return {GetTheme:()=>copiedTheme};};
 f.slide.GetTheme=()=>copiedTheme;
 f.master.GetTheme=()=>{originalReads++;return {copied:false};};
 f.slide.ApplyTheme=theme=>{assert.equal(theme.copied,true);selectedMaster='copy';return true;};
 const original=f.slide.ToJSON;f.slide.ToJSON=()=>JSON.stringify({...JSON.parse(original()),master:selectedMaster});
 const ts=tools.create(f.api),c=await ts.init();await ts.execute('submit_plan',{goal:'Apply',read_only:false,steps:[{tool:'apply_theme',purpose:'Apply'}]},c);
 const r=await ts.execute('apply_theme',{slides:[1],master:1},c);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(copyCount,1);assert.equal(originalReads,1);await ts.end(c,true);
});
test('wrong expected text gives precise recoverable feedback without claiming rich text or changing the document',async()=>{
 const f=apiFixture(),ts=tools.create(f.api),c=await ts.init();
 await ts.execute('submit_plan',{goal:'Rewrite',read_only:false,steps:[{tool:'rewrite_text',purpose:'Rewrite'}]},c);
 const r=await ts.execute('rewrite_text',{slide:1,shape_id:'10',paragraphs:[{index:1,expected:'Generated replacement',text:'Generated replacement'}]},c);
 assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.match(r.error.message,/original.*read_slides/i);assert.doesNotMatch(r.error.message,/rich text/);assert.equal(f.mutations,0);await ts.end(c,false);
});
test('master/hidden editing modes are refused before context capture or writes',async()=>{
 const f=apiFixture();f.p.GetCurrentVisibleSlide=()=>null;
 await assert.rejects(tools.create(f.api).init(),/normal/i);assert.equal(f.mutations,0);
});
test('a partial text selection is captured for generation but never silently expanded by rewriting',async()=>{
 const f=apiFixture();f.Api.GetSelection=()=>({GetType:()=> 'text',GetSlides:()=>[f.slide],GetShapes:()=>[f.shape]});f.api.asc_GetSelectedText=()=> 'Orig';
 const ts=tools.create(f.api),c=await ts.init();assert.equal(c.selectedText,'Orig');assert.equal(c.currentSlide,1);
 await ts.execute('submit_plan',{goal:'Shorten selection',read_only:false,steps:[{tool:'rewrite_text',purpose:'Shorten'}]},c);
 const r=await ts.execute('rewrite_text',{slide:1,shape_id:'10',paragraphs:[{index:1,expected:'Original',text:'Short'}]},c);
 assert.equal(r.ok,false);assert.match(r.error.message,/partial text selection/i);assert.equal(f.mutations,0);await ts.end(c,false);
});
test('document context has a cumulative UTF-8 budget, including repeated reads',async()=>{
 const f=apiFixture(),ts=tools.create(f.api),c=await ts.init();assert(c.readBytes>0);
 c.readBytes=65530;
 await assert.rejects(ts.execute('read_slides',{slides:[1]},c),/context.*budget/i);assert.equal(f.mutations,0);await ts.end(c,false);
});
test('appending speaker notes leaves original paragraphs and formatting intact',async()=>{
 const f=apiFixture();let rows=[{text:'Original notes',bold:true}],cleared=0;
 const content={GetElementsCount:()=>rows.length,GetElement:i=>({AddText(t){rows[i].text+=t;}}),RemoveAllElements(){cleared++;rows=[{text:'',bold:false}];return true;},AddElement(i,p){rows.splice(i,0,{text:p.text,bold:false});return true;}};
 f.Api.CreateParagraph=()=>({text:'',AddText(t){this.text+=t;}});
 const body={GetLockValue:()=>false,GetContent:()=>content};f.slide.GetNotesPage=()=>({GetBodyShape:()=>body});
 const original=f.slide.ToJSON;f.slide.ToJSON=()=>JSON.stringify({...JSON.parse(original()),notes:{cSld:{spTree:[{nvSpPr:{nvPr:{ph:{type:'body'}}},content:{content:{type:'drawingDocContent',content:rows.map(r=>({type:'paragraph',content:[{type:'run',content:[r.text],rPr:{b:r.bold}}]}))}}}]}}});
 const ts=tools.create(f.api),c=await ts.init();await ts.execute('submit_plan',{goal:'Append',read_only:false,steps:[{tool:'set_notes',purpose:'Append'}]},c);
 const r=await ts.execute('set_notes',{slide:1,expected:'Original notes',text:'New one\nNew two',mode:'append'},c);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(cleared,0);assert.equal(rows[0].bold,true);assert.equal(rows[0].text,'Original notes');assert.equal(r.state.slides[0].notes,'Original notes\nNew one\nNew two');await ts.end(c,true);
});
