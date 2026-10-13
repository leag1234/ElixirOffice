// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
(async()=>{
 const env=await launch({file:await fixture('sample.pptx'),profile:'slide-chart-'+Date.now()});
 try{
  await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/presentationeditor/main/'));
  await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded());
  await frame.evaluate(()=>new Promise(resolve=>Asc.editor.callCommand("var chart=Api.CreateChart('bar',[[11,22]],['Public series'],['A','B'],4000000,2500000,2);Api.GetPresentation().GetSlideByIndex(0).AddObject(chart);chart.Select(true);",true,resolve)));
  await frame.evaluate(()=>PE.getController('DocumentHolder').editChartClick());
  let child;for(let i=0;i<100;i++){child=env.page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/')&&f.parentFrame()===frame);if(child)break;await env.page.waitForTimeout(100)}
  assert(child);await child.waitForFunction(()=>window.SSE?.getController('Main')?.api?.wb,null,{timeout:30000});
  await child.evaluate(()=>new Promise(resolve=>Asc.editor.callCommand("Api.GetActiveSheet().GetRange('B2').SetValue(88);",true,resolve)));
  await frame.locator('#id-external-diagram-editor .tool.close').click();await frame.locator('#id-external-diagram-editor').waitFor({state:'hidden'});
  const bytes=await env.page.evaluate(async()=>{const {win,controller}=EOLocalSession,snap=await controller.snapshot();return Array.from(await win.EOWasmConvert.convert(snap.bytes,snap.format,'pptx',{resources:snap.resources}))});
  const output=path.join(root,'tmp/slide-chart-edit-data.pptx');await fs.writeFile(output,Buffer.from(bytes));
  const xml=cp.execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(' '.join(z.read(n).decode() for n in z.namelist() if '/charts/chart' in n and n.endswith('.xml')))",output],{encoding:'utf8'});
  assert(xml.includes('>88<'));assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
  console.log('PASS real PowerPoint chart Edit Data / nested editor / exported value88 / no network');
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
