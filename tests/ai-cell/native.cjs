// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fss=require('node:fs'),crypto=require('node:crypto');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const path=require('node:path'),repo=path.resolve(__dirname,'../..'),web=process.env.EO_WEB_APPS;
assert(web&&path.isAbsolute(web),'Explicit candidate EO_WEB_APPS required');
assert.equal(process.platform,'linux');
const {launch,editable,stop,root}=require(repo+'/tests/desktop/harness.cjs');
function helper(){const p='/opt/elixiroffice-qa/chrome-sandbox-44.9.1',st=fss.lstatSync(p);assert(st.uid===0&&st.gid===0&&(st.mode&0o7777)===0o4755&&st.size===15232);assert.equal(crypto.createHash('sha256').update(fss.readFileSync(p)).digest('hex'),'a4f6dfd7325ddd55f94ddc0c487d22726d40ef099ded6475d5dffe236e277896');assert.equal(fss.readlinkSync(repo+'/desktop/node_modules/electron/dist/chrome-sandbox'),p);}
(async()=>{
 let env;const rows=[];
 try{
  env=await launch({file:root+'/fixtures/ai-public.xlsx',profile:'cell-tools',args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
  const policy=await fs.readFile(web+'/apps/spreadsheeteditor/main/app/elixir-ai/CellPolicy.js','utf8'),tools=await fs.readFile(web+'/apps/spreadsheeteditor/main/app/elixir-ai/CellTools.js','utf8');
  await env.page.evaluate(({policy,tools})=>{
   const w=EOLocalSession.win;let factory,ts;
   new Function('define',policy)((d,f)=>factory=f());
   new Function('define','window',tools)((d,f)=>ts=f(factory),w);
   w.__cellTest=ts.create(EOLocalSession.api);
  },{policy,tools});
  async function cmd(body){return env.page.evaluate(body=>new Promise((resolve,reject)=>{
   const t=setTimeout(()=>reject(Error('Builder deadline')),10000);
   EOLocalSession.api.callCommand('(function(){try{'+body+'}catch(e){return JSON.stringify({error:String(e.message||e)});}})()',true,v=>{clearTimeout(t);try{resolve(JSON.parse(v))}catch(e){reject(e)}});
  }),body);}
  const fixture=[['Name','Amount','Region'],[' B ',20,'North'],['A',10,'South'],[' B ',30,'North']];
  async function reset(data=fixture,selection='A1:C4'){
   return cmd('var s=Api.GetSheet("Sheet1");s.SetActive();s.GetRange("A1:AH30").ClearContents();s.GetRange("A1:AH30").SetNumberFormat("General");var d='+JSON.stringify(data)+';for(var y=0;y<d.length;y++)for(var x=0;x<d[y].length;x++)s.GetCells(y+1,x+1).SetValue(d[y][x]);s.GetRange('+JSON.stringify(selection)+').Select();return JSON.stringify({ok:true});');
  }
  async function action(name,args,{cancel=false}={}){
   return env.page.evaluate(async({name,args,cancel})=>{
    const ts=EOLocalSession.win.__cellTest,c=await ts.init();
    try{await ts.execute('submit_plan',{goal:'Authored public tool qualification',read_only:!ts.isMutating(name),steps:[{tool:name,purpose:'Qualification'}]},c);const invalid=ts.validate(name,args,c),r=invalid||await ts.execute(name,args,c);await ts.end(c,!cancel&&!r.fatal);return r;}
    catch(e){await ts.end(c,false);throw e;}
   },{name,args,cancel});
  }
  async function run(name,fn){try{await reset();const detail=await fn();rows.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){rows.push({name,pass:false,error:e.stack});console.error('FAIL '+name+': '+e.message);}}
  await run('formula fill and one Undo',async()=>{
   const r=await action('write_formula',{range:'D2:D4',formula:'=B2*2'});assert.equal(r.ok,true,JSON.stringify(r));
   const state=await cmd('var s=Api.GetActiveSheet();return JSON.stringify({values:s.GetRange("D2:D4").GetValue2(),formula:s.GetRange("D4").GetFormula()});');assert.deepEqual(state.values,[['40'],['20'],['60']]);assert.match(state.formula,/B4/);
   await env.page.evaluate(()=>EOLocalSession.win.__cellTest.undo());
   assert.deepEqual(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("D2:D4").GetValue2());'),[[''],[''],['']]);return state;
  });
  await run('trim literals, preserve formulas and zeros',async()=>{
   await reset([["' =1+2 ","' 0012 "],['plain','=1+2']],'A1:B2');
   const r=await action('clean_range',{range:'A1:B2',operation:'trim'});assert.equal(r.ok,true,JSON.stringify(r));
   const state=await cmd('var s=Api.GetActiveSheet(),f=Api.GetWorksheetFunction();return JSON.stringify({values:s.GetRange("A1:B2").GetValue2(),formulas:[f.ISFORMULA(s.GetRange("A1")),f.ISFORMULA(s.GetRange("B2"))]});');assert.equal(state.values[0][0],'=1+2');assert.equal(state.values[0][1],'0012');assert.deepEqual(state.formulas,[false,true]);return state;
  });
  await run('split exact empty expansion',async()=>{
   await reset([['Ada;Lovelace'],['Grace;Hopper']],'A1:A2');
   const r=await action('clean_range',{range:'A1:A2',operation:'split',delimiter:';',target:'A1:B2'});assert.equal(r.ok,true,JSON.stringify(r));
   assert.deepEqual(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("A1:B2").GetValue2());'),[['Ada','Lovelace'],['Grace','Hopper']]);
  });
  await run('dedupe keeps typed values and complete rows',async()=>{
   await reset([['Name','Amount'],['A',20],['B',30],['A',20]],'A1:B4');
   const r=await action('clean_range',{range:'A1:B4',operation:'dedupe',header:true});assert.equal(r.ok,true,JSON.stringify(r));
   const v=await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("A1:B4").GetValue2());');assert.deepEqual(v,[['Name','Amount'],['A','20'],['B','30'],['','']]);return r;
  });
  await run('numbers use explicit separators and numeric type',async()=>{
   await reset([['1 234,50'],['2 000,25']],'A1:A2');
   const r=await action('clean_range',{range:'A1:A2',operation:'numbers',decimal:',',group:' '});assert.equal(r.ok,true,JSON.stringify(r));
   const v=await cmd('var s=Api.GetActiveSheet(),f=Api.GetWorksheetFunction();return JSON.stringify({values:s.GetRange("A1:A2").GetValue2(),types:[f.ISNUMBER(s.GetRange("A1")),f.ISNUMBER(s.GetRange("A2"))]});');assert.deepEqual(v.values,[['1234.5'],['2000.25']]);assert.deepEqual(v.types,[true,true]);return v;
  });
  await run('explicit dates become actual date numbers',async()=>{
   await reset([['26/10/2026'],['29/02/2024']],'A1:A2');
   const r=await action('clean_range',{range:'A1:A2',operation:'dates',format:'DD/MM/YYYY'});assert.equal(r.ok,true,JSON.stringify(r));
   const v=await cmd('var s=Api.GetActiveSheet();return JSON.stringify({values:s.GetRange("A1:A2").GetValue2(),format:s.GetRange("A1").GetNumberFormat()});');assert.equal(v.values[0][0],'46321');assert.equal(v.format,'yyyy-mm-dd');return v;
  });
  await run('sort complete rows',async()=>{
   const r=await action('sort_range',{range:'A1:C4',header:true,keys:[{column:2,order:'desc'}]});assert.equal(r.ok,true,JSON.stringify(r));
   const v=await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("A1:C4").GetValue2());');assert.deepEqual(v.slice(1).map(x=>x[1]),['30','20','10']);return v;
  });
  await run('filter actual row visibility',async()=>{
   const r=await action('filter_range',{range:'A1:C4',column:3,operator:'equals',value:'North'});assert.equal(r.ok,true,JSON.stringify(r));
   const v=await cmd('var s=Api.GetActiveSheet();return JSON.stringify([2,3,4].map(function(r){return s.GetRows(r+":"+r).GetHidden();}));');assert.deepEqual(v,[false,true,false]);return v;
  });
  await run('chart object and one Undo',async()=>{
   const r=await action('create_chart',{range:'A1:B4',type:'bar',title:'Authored sales'});assert.equal(r.ok,true,JSON.stringify(r));
   assert.equal(await cmd('return JSON.stringify(Api.GetActiveSheet().GetAllCharts().length);'),1);
   await env.page.evaluate(()=>EOLocalSession.win.__cellTest.undo());
   assert.equal(await cmd('return JSON.stringify(Api.GetActiveSheet().GetAllCharts().length);'),0);
  });
  await run('pivot values, origin restored and one Undo removes new sheet',async()=>{
   const r=await action('create_pivot',{range:'A1:C4',rows:[3],values:[{column:2,aggregation:'Sum'}],name:'AI Summary'});assert.equal(r.ok,true,JSON.stringify(r));assert(r.pivot.values.some(x=>x.includes('50')));assert(r.pivot.values.some(x=>x.includes('60')));
   assert.equal(await cmd('return JSON.stringify(Api.GetActiveSheet().GetName());'),'Sheet1');
   await env.page.evaluate(()=>EOLocalSession.win.__cellTest.undo());
   assert.deepEqual(await cmd('return JSON.stringify(Api.GetSheets().map(function(s){return s.GetName();}));'),['Sheet1']);return r.pivot;
  });
  await run('public numeric and formula type facts',async()=>cmd('var s=Api.GetActiveSheet(),f=Api.GetWorksheetFunction();return JSON.stringify(["A1","B2","B3","B4"].map(function(a){var q=s.GetRange(a);return {a:a,value:q.GetValue2(),isNumber:f.ISNUMBER(q),count:f.COUNT(q),isText:f.ISTEXT(q),formula:f.ISFORMULA(q)};}));'));
  await run('average pivot label agrees with actual aggregation and one Undo',async()=>{
   await reset([['Class','Pupil','Score'],['A','Ada',12],['B','Grace',18],['A','Linus',16]],'A1:C4');
   const r=await action('create_pivot',{range:'A1:C4',rows:[1],values:[{column:3,aggregation:'Average'}],name:'Average Check'});
   assert.equal(r.ok,true,JSON.stringify(r));assert.match(r.pivot.values[0][1],/AVERAGE/i);assert(r.pivot.values.some(x=>x.includes('14')));
   await env.page.evaluate(()=>EOLocalSession.win.__cellTest.undo());
   assert.deepEqual(await cmd('return JSON.stringify(Api.GetSheets().map(function(s){return s.GetName();}));'),['Sheet1']);
  });
  await run('summary reads numeric facts with no mutation',async()=>{
   const r=await action('summarize_range',{range:'A1:C4'});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.summary.columns[1].sum,60);return r.summary;
  });
  await run('cancel rolls back formula output',async()=>{
   const r=await action('write_formula',{range:'D2:D4',formula:'=B2*2'},{cancel:true});assert.equal(r.ok,true,JSON.stringify(r));
   assert.deepEqual(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("D2:D4").GetValue2());'),[[''],[''],['']]);
  });
  await run('existing out-of-scope data is refused unchanged',async()=>{
   await cmd('Api.GetActiveSheet().GetRange("D2").SetValue("keep");return JSON.stringify({ok:true});');
   const r=await action('write_formula',{range:'D2:D4',formula:'=B2*2'});assert.equal(r.ok,false);assert.equal(r.fatal,false);
   assert.equal(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("D2").GetValue2());'),'keep');
  });
  await run('direct circular formula is refused before writing',async()=>{
   const before=await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("B2").GetValue2());');
   const r=await action('write_formula',{range:'B2',formula:'=B2+1'});assert.equal(r.ok,false);assert.equal(r.fatal,false);
   assert.equal(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("B2").GetValue2());'),before);
  });
  await run('read-only action creates no native Undo point',async()=>{
   const before=await env.page.evaluate(()=>EOLocalSession.win.AscCommon.History.Index);
   const r=await action('summarize_range',{range:'A1:C4'});assert.equal(r.ok,true);
   assert.equal(await env.page.evaluate(()=>EOLocalSession.win.AscCommon.History.Index),before);
  });
  await run('written formulas persist through actual Save and reopen',async()=>{
   const r=await action('write_formula',{range:'D2:D4',formula:'=B2*2'});assert.equal(r.ok,true,JSON.stringify(r));
   await require(repo+'/tests/desktop/file-action.cjs')(env.page,'save');
   await env.page.waitForFunction(()=>!EOLocalSession.controller.isModified(),null,{timeout:30000});
   const file=root+'/fixtures/ai-public.xlsx';assert((await fs.stat(file)).size>0);
   await stop(env);env=null;helper();
   env=await launch({file,profile:'cell-tools-reopen',args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
   await env.page.evaluate(()=>{EOLocalSession.win.__cellTest=EOLocalSession.win.Common.ElixirAI.toolsets.cell.create(EOLocalSession.api);});
   const v=await cmd('var s=Api.GetActiveSheet();return JSON.stringify({values:s.GetRange("D2:D4").GetValue2(),formula:s.GetRange("D4").GetFormula()});');
   assert.deepEqual(v.values,[['40'],['20'],['60']]);assert.match(v.formula,/B4/);return v;
  });
  await run('merged target is refused before any AI write',async()=>{
   await cmd('Api.GetActiveSheet().GetRange("B2:C2").Merge(false);return JSON.stringify({ok:true});');
   const before=await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("B2:C2").GetValue2());');
   const r=await action('write_formula',{range:'B2',formula:'=B3*2'});assert.equal(r.ok,false);assert.equal(r.fatal,false);
   assert.deepEqual(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("B2:C2").GetValue2());'),before);
   const unmerge=await cmd('var s=Api.GetActiveSheet();s.GetRange("B2:C2").UnMerge();return JSON.stringify({address:s.GetRange("B2").MergeArea.GetAddress(false,false)});');assert.equal(unmerge.address,'B2');
  });
  await run('actual user-protected range is refused before any AI write',async()=>{
   const setup=await cmd('var s=Api.GetActiveSheet();var p=s.AddProtectedRange("Owned QA","B2");return JSON.stringify({created:!!p,count:s.GetAllProtectedRanges().length});');assert.equal(setup.created,true);assert.equal(setup.count,1);
   const before=await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("B2").GetValue2());');
    const r=await action('write_formula',{range:'B2',formula:'=B3*2'});assert.equal(r.ok,false);assert.equal(r.fatal,false);assert.match(r.error.message,/protected/i);
    assert.equal(await cmd('return JSON.stringify(Api.GetActiveSheet().GetRange("B2").GetValue2());'),before);
  });
  await fs.writeFile(root+'/results/cell-tools.json',JSON.stringify({rows,errors:env.errors,requests:env.requests.filter(r=>/^https?:|^wss?:/.test(r.url))},null,2));assert(rows.every(r=>r.pass));assert.deepEqual(env.errors,[]);assert(!env.requests.some(r=>/^https?:|^wss?:/.test(r.url)));
 }finally{if(env)await stop(env)}
})().catch(e=>{console.error(e);process.exitCode=1;});
