// SPDX-License-Identifier: AGPL-3.0-only
// release review: actual compiled Linux UI and native consent, authored public fixtures.
// The in-memory deterministic connector is installed only after native consent.
// No provider endpoint is contacted and no API key is supplied.
'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),{launch,editable,stop,root}=require('../desktop/harness.cjs'),{modal,keys}=require('../desktop/lifecycle.cjs');
assert.equal(process.platform,'linux');assert(process.env.EO_XVFB_PID,'Private Xvfb required');assert.equal(process.env.EO_AI_FEATURE_CAPTURES,'release review');
const sharp=require(path.join(process.env.EO_WEB_APPS,'build/node_modules/sharp')),out=path.join(root,'results/ai-features'),rows=[],actions=[];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function helper(){
 const p='/opt/elixiroffice-qa/chrome-sandbox-44.9.1',s=sync.lstatSync(p);
 assert(s.isFile()&&s.uid===0&&s.gid===0&&(s.mode&0o7777)===0o4755&&s.size===15232);
 assert.equal(sha(sync.readFileSync(p)),'a4f6dfd7325ddd55f94ddc0c487d22726d40ef099ded6475d5dffe236e277896');
 assert.equal(sync.readlinkSync(repo+'/desktop/node_modules/electron/dist/chrome-sandbox'),p);
}
async function shot(env,name,{native=false,nativeWindow,checks={}}={}){
 let image;
 if(native){
  // XWD is read only from this process's private authenticated display.
  assert(/^0x[0-9a-f]+$/.test(nativeWindow),'Verified owned dialog required');
  const b=cp.execFileSync('xwd',['-id',nativeWindow,'-silent'],{env:process.env,maxBuffer:20*1024*1024,timeout:5000}),h=Array.from({length:25},(_,i)=>b.readUInt32BE(i*4));
  const [size,version,format,depth,width,height,offset,order]=h;
  assert(version===7&&format===2&&depth===24&&offset===0&&h[11]===32&&order===0);
  assert(width>100&&width<=1440&&height>80&&height<=1000&&h[14]===0xff0000&&h[15]===0xff00&&h[16]===0xff);
  const start=size+h[19]*12,rgb=Buffer.alloc(width*height*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=start+y*h[12]+x*4,d=(y*width+x)*3;rgb[d]=b[a+2];rgb[d+1]=b[a+1];rgb[d+2]=b[a];}
  image=sharp(rgb,{raw:{width,height,channels:3}});
 }else image=sharp(await env.page.screenshot());
 const png=await image.png({compressionLevel:9,adaptiveFiltering:true}).toBuffer(),metadata=await sharp(png).metadata();
 await fs.writeFile(path.join(out,name+'.png'),png);rows.push({name,sha256:sha(png),bytes:png.length,width:metadata.width,height:metadata.height,native,checks});console.log('CAPTURE '+name+' '+png.length);
 await fs.writeFile(path.join(out,'capture-receipt.json'),JSON.stringify({platform:process.platform,fixtureProvider:'deterministic in-memory responses after real native consent; no API key',rows,actions},null,2)+'\n');
}
async function command(env,body){return env.page.evaluate(body=>new Promise((resolve,reject)=>{
 const t=setTimeout(()=>reject(Error('Public command deadline')),15000);
 EOLocalSession.api.callCommand('(function(){'+body+'})()',true,r=>{clearTimeout(t);try{resolve(JSON.parse(r))}catch(e){reject(e)}});
}),body);}
async function consent(env,frame,capture=false){
 assert.equal(await frame.evaluate(()=>Common.ElixirAI.Settings.isConfigured()),false);
 await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();
 await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'visible'});
 for(const id of ['endpoint','model','key'])assert.equal(await frame.locator('#elixir-ai-setup-'+id).inputValue(),'');
 if(capture)await shot(env,'setup-assistant',{checks:{fieldsEmpty:true,configured:false}});
 await frame.locator('#elixir-ai-setup-endpoint').fill('https://ai.example.invalid/v1');await frame.locator('#elixir-ai-setup-model').fill('documentation-fixture');
 await frame.locator('#elixir-ai-setup-continue').click();const dialog=await modal(env);
 if(capture)await shot(env,'native-consent',{native:true,nativeWindow:dialog,checks:{realNativeDialog:true,keySupplied:false}});
 keys(env,'allow');await frame.waitForFunction(()=>Common.ElixirAI.Settings.isConfigured());
 await frame.locator('#elixir-ai-setup-dialog').waitFor({state:'detached'});await frame.locator('#home[role=tab]').click();
 assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));
}
async function runAction(env,frame,instruction,steps){
 await frame.evaluate(({steps,instruction})=>{
  let n=0;const calls=[{name:'submit_plan',arguments:JSON.stringify({goal:instruction,read_only:false,steps:steps.map(s=>({tool:s.name,purpose:s.purpose}))})},
   ...steps.map(s=>({name:s.name,arguments:JSON.stringify(s.args)})),{name:'verify_result',arguments:JSON.stringify({goal_met:true})}];
  window.__documentationOriginalConnector=Common.ElixirAI.Connector.chat;
  Common.ElixirAI.Connector.chat=async()=>{if(n>=calls.length)throw Error('Unexpected documentation model round');return {ms:1,usage:{},message:{role:'assistant',content:'',tool_calls:[{id:'docs-'+n,function:calls[n++]}]}};};
 },{steps,instruction});
 try{
  await frame.locator('#elixir[role=tab]').click();await frame.locator('#slot-btn-elixir-ask button').click();
  await frame.locator('.elixir-ai-input').fill(instruction);await frame.locator('#elixir-ai-bar [data-act=send]').click();
  await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').getAttribute('data-state')==='review',null,{timeout:15000});
  assert(!/failed|could not|unsupported/i.test(await frame.locator('.elixir-ai-status').innerText()));
  await frame.waitForTimeout(400);actions.push({instruction,tools:steps.map(s=>s.name),deterministic:true});
 }finally{await frame.evaluate(()=>{Common.ElixirAI.Connector.chat=window.__documentationOriginalConnector;delete window.__documentationOriginalConnector;});}
}
async function closeReview(frame){await frame.locator('#elixir-ai-bar [data-act=accept]').click();await frame.waitForFunction(()=>document.getElementById('elixir-ai-bar').style.display==='none');}
async function app(kind,fn){
 const extension={word:'docx',cell:'xlsx',slide:'pptx'}[kind],editor={word:'documenteditor',cell:'spreadsheeteditor',slide:'presentationeditor'}[kind],profile='docs-'+kind+'-'+Date.now(),file=root+'/fixtures/ai-public.'+extension,before=await fs.readFile(file);
 await fs.mkdir(root+'/profiles/'+profile,{recursive:true});await fs.writeFile(root+'/profiles/'+profile+'/desktop-settings.json',JSON.stringify({recents:[],fontConsent:false,fontChoice:'declined',releaseNotice:{enabled:false},ai:null}));
 let env;
 try{
  env=await launch({file,profile,args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
  const frame=env.page.frames().find(f=>f.url().includes('/'+editor+'/main/'));assert(frame);await frame.waitForFunction(()=>!!Common.ElixirAI.Settings);
  await fn(env,frame);
  assert.deepEqual(env.errors,[]);assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));
  assert.deepEqual(await fs.readFile(file),before,'A documentation capture modified its source fixture');
 }catch(e){if(env)await env.page.screenshot({path:root+'/results/ai-features-failure.png'}).catch(()=>{});throw e;}
 finally{if(env)await stop(env);}
}
async function word(){
 await app('word',async(env,frame)=>{
  await consent(env,frame,true);
  const points=async(index,left,right)=>{
   const p=await frame.evaluate(([index,left,right])=>{const api=Asc.editor,ld=api.WordControl.m_oLogicDocument,dd=api.WordControl.m_oDrawingDocument,p=ld.Content[index],b=p.GetPageBounds(0),sdk=document.getElementById('editor_sdk').getBoundingClientRect();return [left,right].map(x=>{const c=dd.ConvertCoordsToCursorWR(b.Left+x,b.Top+2.5,p.GetAbsolutePage(0));return{x:c.X+sdk.left,y:c.Y+sdk.top}});},[index,left,right]);
   const box=await frame.frameElement().then(el=>el.boundingBox());assert(box);return p.map(q=>({x:q.x+box.x,y:q.y+box.y}));
  };
  const select=async()=>{const p=await points(1,1,100);await env.page.mouse.move(p[0].x,p[0].y);await env.page.mouse.down();await env.page.mouse.move(p[1].x,p[1].y,{steps:10});await env.page.mouse.up();return p;};
  await select();await frame.locator('#mini-toolbar.visible .mini-elixir').waitFor({state:'visible'});await frame.locator('#mini-toolbar .mini-elixir').click();await frame.locator('#elixir-ask-menu').waitFor({state:'visible'});
  await shot(env,'word-sparkle',{checks:{realSelectionAndSparkle:true}});await env.page.keyboard.press('Escape');
  const p=await select();await env.page.mouse.click((p[0].x+p[1].x)/2,p[0].y,{button:'right'});
  await frame.locator('.dropdown-menu a:visible').filter({hasText:'Ask Elixir'}).first().waitFor({state:'visible'});await shot(env,'word-context',{checks:{realRightClick:true}});await env.page.keyboard.press('Escape');
  const search=frame.locator('.elx-search-input');await search.click();await search.fill('Rewrite the introduction more clearly');await frame.locator('.elx-sr-ask').waitFor({state:'visible'});
  await shot(env,'word-title-search',{checks:{askRow:true}});await search.press('Escape');
  const empty=await points(3,1,2);await env.page.mouse.click(empty[0].x,empty[0].y);await env.page.keyboard.type('/');
  await frame.locator('#elixir-slash-menu').waitFor({state:'visible'});await shot(env,'word-slash',{checks:{realSlashKey:true}});await env.page.keyboard.press('Escape');await env.page.keyboard.press('Backspace');
  await runAction(env,frame,'Rewrite the introduction more clearly.',[{name:'replace_text',purpose:'Clarify the public introduction',args:{block:1,text:'Our community library invites everyone to a reading afternoon. Bring a favorite book and share one idea with the group.'}}]);
  const text=await command(env,'return JSON.stringify(Api.GetDocument().GetText());');assert.match(text,/reading afternoon/);
  await shot(env,'word-result',{checks:{actualPublicTextReadback:true}});await closeReview(frame);
 });
}
const sales=[['Item','Units','Price','Region'],['Notebook',4,2,'North'],['Marker',10,3,'South'],['Folder',5,3,'North']];
async function resetCell(env,data=sales,selection='A1:D4'){
 return command(env,'var s=Api.GetActiveSheet();s.GetRange("A1:H20").ClearContents();s.GetRange("A1:H20").SetNumberFormat("General");s.GetRange("A1:'+String.fromCharCode(64+data[0].length)+data.length+'").SetValue('+JSON.stringify(data)+');s.GetRange("A1:H20").SetColumnWidth(18);s.GetRange("A1:'+String.fromCharCode(64+data[0].length)+'1").SetBold(true);s.GetRange('+JSON.stringify(selection)+').Select();return JSON.stringify(true);');
}
async function cells(){
 for(const mode of ['formula','clean','chart','pivot'])await app('cell',async(env,frame)=>{
  await consent(env,frame);
  await resetCell(env);
  let instruction,steps;
  if(mode==='formula'){await command(env,'Api.GetActiveSheet().GetRange("E1").SetValue("Total");return JSON.stringify(true);');instruction='Calculate Units times Price in E2:E4.';steps=[{name:'write_formula',purpose:'Calculate each line total',args:{range:'E2:E4',formula:'=B2*C2'}}];}
  if(mode==='clean'){await resetCell(env,[['Item','Region'],[' Notebook ',' North '],['Marker  ',' South'],[' Folder','North ']],'A1:B4');instruction='Trim extra spaces from A2:B4 without changing the headers.';steps=[{name:'clean_range',purpose:'Trim literal text',args:{range:'A2:B4',operation:'trim'}}];}
  if(mode==='chart'){await resetCell(env,[['Item','Units'],['Notebook',4],['Marker',10],['Folder',5]],'A1:B4');instruction='Create a column chart of units by item, titled Units by item.';steps=[{name:'create_chart',purpose:'Chart the selected public data',args:{range:'A1:B4',type:'bar',title:'Units by item',anchor:'D6'}}];}
  if(mode==='pivot'){instruction='Create a pivot table on a new sheet, summing Units by Region.';steps=[{name:'create_pivot',purpose:'Summarize units by region',args:{range:'A1:D4',rows:[4],values:[{column:2,aggregation:'Sum'}],name:'Units summary'}}];}
  await runAction(env,frame,instruction,steps);
  let check;
  if(mode==='formula'){check=await command(env,'return JSON.stringify(Api.GetActiveSheet().GetRange("E2:E4").GetValue2());');assert.deepEqual(check,[['8'],['30'],['15']]);}
  if(mode==='clean'){check=await command(env,'return JSON.stringify(Api.GetActiveSheet().GetRange("A2:B4").GetValue2());');assert.deepEqual(check,[['Notebook','North'],['Marker','South'],['Folder','North']]);}
  if(mode==='chart'){check=await command(env,'return JSON.stringify({charts:Api.GetActiveSheet().GetAllCharts().length,values:Api.GetActiveSheet().GetRange("A1:B4").GetValue2()});');assert.equal(check.charts,1);}
  if(mode==='pivot'){
   await frame.locator('#statusbar_bottom [tabtitle="Units summary"]').click();
   check=await command(env,'var s=Api.GetActiveSheet();return JSON.stringify({name:s.GetName(),values:s.GetUsedRange().GetValue2()});');
   assert.equal(check.name,'Units summary');assert(check.values.flat().includes('9')&&check.values.flat().includes('10'));
   await frame.locator('#editor_sdk').click({position:{x:500,y:250}});
  }
  await frame.waitForTimeout(500);await shot(env,'spreadsheet-'+mode,{checks:{actualPublicReadback:check}});await closeReview(frame);
 });
}
async function slides(){
 await app('slide',async(env,frame)=>{
  await consent(env,frame);
  await runAction(env,frame,'Create two slides from this outline: Reading afternoon — bring a book and share one idea; Next steps — choose a date and invite the group.',[{name:'create_slides',purpose:'Turn the supplied outline into two slides',args:{slides:[{title:'Reading afternoon',bullets:['Bring a favorite book','Share one idea with the group']},{title:'Next steps',bullets:['Choose a date','Invite the group']}]}}]);
  const check=await command(env,'var p=Api.GetPresentation();return JSON.stringify({count:p.GetSlidesCount(),text:p.GetAllSlides().map(function(s){return s.GetAllShapes().map(function(q){return q.GetContent().GetText();});})});');assert.equal(check.count,3);assert(check.text.flat().some(t=>t.includes('Reading afternoon')));
  await frame.locator('#id_thumbnails').click({position:{x:100,y:200}});
  await frame.waitForFunction(()=>Asc.editor.getCurrentPage()===1);await frame.waitForTimeout(600);
  await shot(env,'presentation-slides',{checks:{actualPublicReadback:check}});await closeReview(frame);
  await runAction(env,frame,'Add speaker notes to the Reading afternoon slide: Ask each participant to introduce their book in one minute.',[{name:'set_notes',purpose:'Add the requested speaker notes',args:{slide:2,expected:'',text:'Ask each participant to introduce their book in one minute.',mode:'replace'}}]);
  const notes=await command(env,'return JSON.stringify(Api.GetPresentation().GetSlideByIndex(1).GetNotesPage().GetBodyShape().GetContent().GetText());');assert.match(notes,/one minute/);
  await closeReview(frame);
  const panel=await frame.locator('#id_panel_notes').boundingBox();assert(panel);
  await env.page.mouse.move(panel.x+panel.width/2,panel.y-2);await env.page.mouse.down();await env.page.mouse.move(panel.x+panel.width/2,panel.y-190,{steps:12});await env.page.mouse.up();
  await frame.waitForTimeout(500);const expanded=await frame.locator('#id_panel_notes').boundingBox();assert(expanded.height>120);
  assert.equal(await frame.evaluate(()=>Asc.editor.getCurrentPage()),1);await shot(env,'presentation-notes',{checks:{actualPublicNotes:notes,notesPaneHeight:expanded.height,accepted:true}});
 });
}
(async()=>{await fs.mkdir(out,{recursive:true});await word();await cells();await slides();assert.equal(rows.length,13);console.log('PASS 13 actual compiled documentation captures; zero provider HTTP/keys and source fixture changes');})().catch(async error=>{console.error(error.stack);await fs.writeFile(root+'/results/ai-features-failure.json',JSON.stringify({error:error.stack,rows,actions},null,2)+'\n');process.exitCode=1;});
