// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),web=process.env.EO_WEB_APPS;
assert(web&&path.isAbsolute(web));assert.equal(process.platform,'linux');
const {launch,editable,stop,root}=require(repo+'/tests/desktop/harness.cjs');
const work=path.join(root,'results');
function helper(){const p='/opt/elixiroffice-qa/chrome-sandbox-44.9.1',s=sync.lstatSync(p);assert(s.uid===0&&s.gid===0&&(s.mode&0o7777)===0o4755&&s.size===15232);assert.equal(crypto.createHash('sha256').update(sync.readFileSync(p)).digest('hex'),'a4f6dfd7325ddd55f94ddc0c487d22726d40ef099ded6475d5dffe236e277896');assert.equal(sync.readlinkSync(repo+'/desktop/node_modules/electron/dist/chrome-sandbox'),p);}
(async()=>{
 let env;const rows=[];
 try{
  env=await launch({file:root+'/fixtures/ai-public.pptx',profile:'slide-tools',args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
  const policy=await fs.readFile(web+'/apps/presentationeditor/main/app/elixir-ai/SlidePolicy.js','utf8'),tools=await fs.readFile(web+'/apps/presentationeditor/main/app/elixir-ai/SlideTools.js','utf8');
  await env.page.evaluate(({policy,tools})=>{const w=EOLocalSession.win;let factory,ts;new Function('define',policy)((d,f)=>factory=f());new Function('define','window',tools)((d,f)=>ts=f(factory),w);w.__slideTest=ts.create(EOLocalSession.api);},{policy,tools});
  async function cmd(body){return env.page.evaluate(body=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Builder deadline')),10000);EOLocalSession.api.callCommand('(function(){try{'+body+'}catch(e){return JSON.stringify({error:String(e.message||e)});}})()',true,v=>{clearTimeout(t);try{resolve(JSON.parse(v))}catch(e){reject(e)}});}),body);}
  const snapshot=()=>cmd('var p=Api.GetPresentation();return JSON.stringify({count:p.GetSlidesCount(),masters:p.GetAllSlideMasters().length,slides:p.GetAllSlides().map(function(s){return s.ToJSON(false,false,false,false);})});');
  async function action(name,args,{cancel=false}={}){return env.page.evaluate(async({name,args,cancel})=>{const ts=EOLocalSession.win.__slideTest,c=await ts.init();try{const plan=await ts.execute('submit_plan',{goal:'Public deterministic qualification',read_only:!ts.isMutating(name),steps:[{tool:name,purpose:'Qualification'}]},c);if(!plan.ok)throw Error(JSON.stringify(plan));const result=await ts.execute(name,args,c);await ts.end(c,!cancel&&!result.fatal);return result;}catch(e){
    const actual=await new Promise(resolve=>EOLocalSession.api.callCommand('(function(){return JSON.stringify(Api.GetPresentation().GetAllSlides().map(function(s){return s.ToJSON(false,false,false,false);}));})()',true,v=>resolve(JSON.parse(v))));
    EOLocalSession.win.__slideFailure={expected:c.signatures,actual};
    await ts.end(c,false);throw e;}},{name,args,cancel});}
  const undo=()=>env.page.evaluate(()=>EOLocalSession.win.__slideTest.undo());
  async function run(name,fn){try{await fn();rows.push({name,pass:true});console.log('PASS '+name);}catch(e){rows.push({name,pass:false,error:e.stack});console.error('FAIL '+name+': '+e.message);throw e;}}
  await run('readonly capture leaves slide serialization and modified state unchanged',async()=>{
   const before=await snapshot(),dirty=await env.page.evaluate(()=>EOLocalSession.api.isDocumentModified());
   const r=await action('summarize_deck',{});assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(await snapshot(),before);assert.equal(await env.page.evaluate(()=>EOLocalSession.api.isDocumentModified()),dirty);
  });
  await run('append title/body/notes slides and one Undo restores the original deck',async()=>{
   const before=await snapshot(),r=await action('create_slides',{slides:[{title:'Public lesson',bullets:['Read the prompt','Discuss in pairs'],notes:'Ask learners for examples.'},{title:'Review',bullets:['Explain the result']}]});
   assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.count,before.count+2);assert.equal(r.state.slides[0].notes,'Ask learners for examples.');assert(r.state.slides[0].shapes.some(s=>s.paragraphs.some(p=>p.text==='Public lesson')));
   await undo();assert.deepEqual(await snapshot(),before);
  });
  await cmd('var s=Api.GetPresentation().GetSlideByIndex(0),q=s.GetAllShapes()[0];q.GetContent().GetElement(0).AddText("A long public example for rewrite.");return JSON.stringify({ok:true});');
  let state=await action('read_slides',{slides:[1]});assert.equal(state.ok,true);const shape=state.slides[0].shapes.find(s=>s.paragraphs.some(p=>p.text==='A long public example for rewrite.'));assert(shape);
  await run('rewrite actual text with exact public readback and one Undo',async()=>{
   const before=await snapshot(),r=await action('rewrite_text',{slide:1,shape_id:shape.id,paragraphs:[{index:1,expected:'A long public example for rewrite.',text:'A short example.'}]});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.state.slides[0].shapes.find(s=>s.id===shape.id).paragraphs[0].text,'A short example.');
   await undo();assert.deepEqual(await snapshot(),before);
  });
  await run('stale expected paragraph is refused without changing the deck',async()=>{
   const before=await snapshot(),r=await action('rewrite_text',{slide:1,shape_id:shape.id,paragraphs:[{index:1,expected:'Wrong source',text:'Replacement'}]});assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.deepEqual(await snapshot(),before);
  });
  await run('replace and append actual notes, each with one Undo',async()=>{
   for(const mode of ['replace','append']){const before=await snapshot(),initial=(await action('read_slides',{slides:[1]})).slides[0].notes,r=await action('set_notes',{slide:1,expected:initial,text:'Public speaker notes.',mode});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.state.slides[0].notes,(mode==='append'&&initial?initial+'\n':'')+'Public speaker notes.');await undo();assert.deepEqual(await snapshot(),before);}
  });
  await run('appending notes preserves the original emphasized paragraph and one Undo',async()=>{
   const seeded=await cmd('var q=Api.GetPresentation().GetSlideByIndex(0).GetNotesPage().GetBodyShape(),p=q.GetContent().GetElement(0);p.AddText("Original emphasized note");var styled=0;for(var i=0;i<p.GetElementsCount();i++){var r=p.GetElement(i);if(r.GetText&&r.GetText().indexOf("Original emphasized note")>=0){r.SetBold(true);styled++;}}return JSON.stringify({styled:styled});');assert(seeded.styled>0);
   const before=await snapshot(),original=JSON.parse(before.slides[0]).notes.cSld.spTree.find(q=>q.nvSpPr?.nvPr?.ph?.type==='body').content.content.content[0];
   const r=await action('set_notes',{slide:1,expected:'Original emphasized note',text:'New speaker paragraph',mode:'append'});assert.equal(r.ok,true,JSON.stringify(r));
   const after=await snapshot(),retained=JSON.parse(after.slides[0]).notes.cSld.spTree.find(q=>q.nvSpPr?.nvPr?.ph?.type==='body').content.content.content[0];
   assert.deepEqual(retained,original);await undo();assert.deepEqual(await snapshot(),before);
  });
  await run('align selected ordinary shapes and restore both positions with one Undo',async()=>{
   const before=await snapshot(),r=await action('align_shapes',{slide:1,shape_ids:state.slides[0].shapes.map(s=>s.id),alignment:'top'});assert.equal(r.ok,true,JSON.stringify(r));const ys=r.state.slides[0].shapes.map(s=>s.position.y);assert.equal(ys[0],ys[1]);await undo();assert.deepEqual(await snapshot(),before);
  });
  await run('apply embedded layout without losing text and one Undo restores structure',async()=>{
   const before=await snapshot(),r=await action('set_layout',{slides:[1],master:1,layout:2});assert.equal(r.ok,true,JSON.stringify(r));assert(r.state.slides[0].shapes.some(s=>s.paragraphs.some(p=>p.text==='A long public example for rewrite.')));await undo();assert.deepEqual(await snapshot(),before);
  });
  await run('embedded theme applies from an isolated copy and one Undo restores the master count',async()=>{
   const before=await snapshot(),r=await action('apply_theme',{slides:[1],master:1});assert.equal(r.ok,true,JSON.stringify(r));assert.equal((await snapshot()).masters,before.masters+1);assert(r.state.slides[0].shapes.some(s=>s.paragraphs.some(p=>p.text==='A long public example for rewrite.')));await undo();assert.deepEqual(await snapshot(),before);
  });
  await run('invalid embedded master is refused before writes',async()=>{
   const before=await snapshot(),r=await action('apply_theme',{slides:[1],master:32});assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.deepEqual(await snapshot(),before);
  });
  await run('read-only action adds no native Undo history point',async()=>{
   const before=await env.page.evaluate(()=>EOLocalSession.win.AscCommon.History.Index);
   const r=await action('summarize_deck',{});assert.equal(r.ok,true);assert.equal(await env.page.evaluate(()=>EOLocalSession.win.AscCommon.History.Index),before);
  });
  await run('native cancellation restores an appended slide and its notes exactly',async()=>{
   const before=await snapshot(),r=await action('create_slides',{slides:[{title:'Cancelled public slide',bullets:['No retained change'],notes:'Cancelled notes'}]},{cancel:true});assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(await snapshot(),before);
  });
  await run('actual text lock refuses rewriting before writes',async()=>{
   await cmd('var q=Api.GetPresentation().GetSlideByIndex(0).GetAllShapes()[0];q.SetLockValue("noTextEdit",true);return JSON.stringify({locked:q.GetLockValue("noTextEdit")});');
   const before=await snapshot(),r=await action('rewrite_text',{slide:1,shape_id:shape.id,paragraphs:[{index:1,expected:'A long public example for rewrite.',text:'Forbidden replacement'}]});assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.match(r.error.message,/locked/);assert.deepEqual(await snapshot(),before);
   await cmd('Api.GetPresentation().GetSlideByIndex(0).GetAllShapes()[0].SetLockValue("noTextEdit",false);return JSON.stringify({ok:true});');
  });
  await run('trusted editing-scope guard refuses another slide (controlled capture fixture)',async()=>{
   await action('create_slides',{slides:[{title:'Outside scoped edit',bullets:['Keep this text']}]});
   const before=await snapshot(),r=await env.page.evaluate(async()=>{
    const ts=EOLocalSession.win.__slideTest,c=await ts.init();c.scopeSlides=[1];
    try{await ts.execute('submit_plan',{goal:'Scope negative',read_only:false,steps:[{tool:'set_layout',purpose:'Must refuse'}]},c);return await ts.execute('set_layout',{slides:[2],master:1,layout:2},c);}
    finally{await ts.end(c,false);}
   });assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.match(r.error.message,/scope/);assert.deepEqual(await snapshot(),before);
   await undo();
  });
  await run('generated slides and speaker notes persist through actual File Save and reopen',async()=>{
   const before=await snapshot(),r=await action('create_slides',{slides:[{title:'Saved public lesson',bullets:['One preserved point','Another preserved point'],notes:'Saved public notes.'}]});assert.equal(r.ok,true,JSON.stringify(r));
   await require(repo+'/tests/desktop/file-action.cjs')(env.page,'save');await env.page.waitForFunction(()=>!EOLocalSession.controller.isModified(),null,{timeout:30000});
   const file=root+'/fixtures/ai-public.pptx';assert((await fs.stat(file)).size>0);await stop(env);env=null;helper();
   env=await launch({file,profile:'slide-tools-reopen',args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
   await env.page.evaluate(()=>{EOLocalSession.win.__slideTest=EOLocalSession.win.Common.ElixirAI.toolsets.slide.create(EOLocalSession.api);});
   const read=await action('read_slides',{slides:[before.count+1]});assert.equal(read.ok,true,JSON.stringify(read));assert.equal(read.slides[0].notes,'Saved public notes.');assert(read.slides[0].shapes.some(s=>s.paragraphs.some(p=>p.text==='Saved public lesson')));
  });
  await run('actual mixed inline formatting is refused without flattening content',async()=>{
   const prepared=await cmd('var q=Api.GetPresentation().GetSlideByIndex(0).GetAllShapes()[0],paragraph=q.GetContent().GetElement(0),run=Api.CreateRun();run.AddText("Styled sentinel");run.SetBold(true);paragraph.AddElement(run);return JSON.stringify({id:q.GetInternalId()});');
   const before=await snapshot(),read=await action('read_slides',{slides:[1]}),target=read.slides[0].shapes.find(s=>s.id===prepared.id),r=await action('rewrite_text',{slide:1,shape_id:prepared.id,paragraphs:[{index:1,expected:target.paragraphs[0].text,text:'Must not flatten'}]});
   assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.match(r.error.message,/rich text/);assert.deepEqual(await snapshot(),before);
  });
  assert.deepEqual(env.errors,[]);assert.equal(env.requests.filter(r=>/elixir-ai\/proxy/.test(r.url)).length,0);
 }finally{
  if(env)await fs.writeFile(work+'/slide-native-signature-diagnostic.json',JSON.stringify(await env.page.evaluate(()=>EOLocalSession.win.__slideFailure||null),null,2)+'\n');
  await fs.writeFile(work+'/slide-native.json',JSON.stringify({rows,rendererErrors:env?.errors||[],scope:'Source public API only; no provider/compiled UI or package claim'},null,2)+'\n');
  if(env)await stop(env);
 }
 if(rows.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e.stack);process.exitCode=1});
