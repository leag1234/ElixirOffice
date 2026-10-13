// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {launch,editable,stop,root,fixture}=require('./harness.cjs'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const profile='offline-items-'+Date.now(),env=await launch({file:await fixture('sample.docx'),profile});
 try{
  await editable(env);const frame=env.page.frames().find(f=>f.url().includes('/documenteditor/main/'));
  await frame.locator('#file[role=tab]').click();await frame.locator('#fm-btn-settings').click();
  await env.page.locator('#author-name').fill('Public Local Author');
  await env.page.locator('.desktop-options button').filter({hasText:await env.page.evaluate(()=>EODesktopStrings.save)}).click();
  await env.page.locator('.desktop-options').waitFor({state:'detached'});
  assert.equal(await env.page.evaluate(()=>EOLocalSession.api.DocInfo.get_UserName()),'Public Local Author');
  assert.equal(await env.page.evaluate(()=>EOLocalSession.win.AscCommon.UserInfoParser.getCurrentName()),'Public Local Author');
  const help=env.browser.contexts()[0].waitForEvent('page');await env.page.evaluate(()=>eoDesktop.help());const page=await help;
  await page.waitForLoadState('domcontentloaded');assert(page.url().endsWith('/help/en/index.htm'));assert(await page.locator('li a').count()>20);await page.close();
  console.log('PASS visible Options author applied to SDK and offline Help index');
  const unconfigured=await frame.evaluate(()=>{const c=DE.getController('Common.Controllers.ElixirAI');c.openBar();return {active:c.isActive(),configured:Common.ElixirAI.Settings.isConfigured(),tab:!!document.querySelector('#elixir')?.getBoundingClientRect().height}});
  assert.equal(unconfigured.active,false);assert.equal(unconfigured.configured,false);assert.equal(unconfigured.tab,false);
  assert.equal(await frame.locator('.elixir-ai-bar:visible').count(),0);
  console.log('PASS unconfigured AI tab and shortcut bar hidden');
  await frame.waitForFunction(()=>Common.Controllers.LaunchController.isScriptLoaded());
  await frame.evaluate(()=>new Promise(resolve=>Asc.editor.callCommand("var chart=Api.CreateChart('bar',[[11,22]],['Public series'],['A','B'],4000000,2500000,2);var p=Api.CreateParagraph();p.AddDrawing(chart);Api.GetDocument().Push(p);chart.Select(true);",true,resolve)));
  await frame.evaluate(()=>DE.getController('DocumentHolder').editChartClick());
  let child;for(let i=0;i<100;i++){child=env.page.frames().find(f=>f.url().includes('/spreadsheeteditor/main/')&&f.parentFrame()===frame);if(child)break;await env.page.waitForTimeout(100)}
  assert(child,'Chart Edit Data did not create its spreadsheet frame');
  await child.waitForFunction(()=>window.SSE?.getController('Main')?.api?.wb,null,{timeout:30000});
  console.log('CHART CHILD',await child.evaluate(()=>({ready:!!SSE.getController('Main').api.wb,isEditDiagram:SSE.getController('Main').appOptions.isEditDiagram})));
  await child.evaluate(()=>new Promise(resolve=>Asc.editor.callCommand("Api.GetActiveSheet().GetRange('B2').SetValue(77);",true,resolve)));
  await frame.locator('#id-external-diagram-editor .tool.close').click();
  await frame.locator('#id-external-diagram-editor').waitFor({state:'hidden'});
  const has77=await env.page.evaluate(async()=>{
   const snap=await EOLocalSession.controller.snapshot(),bytes=await EOLocalSession.win.EOWasmConvert.convert(snap.bytes,snap.format,'docx',{resources:snap.resources});
   return Array.from(bytes);
  });
  await fs.mkdir(path.join(root,'tmp'),{recursive:true});const output=path.join(root,'tmp/chart-edit-data.docx');await fs.writeFile(output,Buffer.from(has77));
  const xml=require('node:child_process').execFileSync('python3',['-c',"import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(' '.join(z.read(n).decode() for n in z.namelist() if '/charts/chart' in n and n.endswith('.xml')))",output],{encoding:'utf8'});
  assert(xml.includes('>77<'),'Chart Edit Data value missing from exported chart');
  console.log('PASS real Word chart Edit Data / nested editor / changed value persists in exported OOXML');
  console.log('REQUESTS',env.requests.filter(r=>/^https?:/.test(r.url)));assert.equal(env.requests.filter(r=>/^https?:/.test(r.url)).length,0);
 }finally{await stop(env)}
 const reopened=await launch({file:await fixture('sample.docx'),profile});
 try{await editable(reopened);assert.equal(await reopened.page.evaluate(()=>EOLocalSession.api.DocInfo.get_UserName()),'Public Local Author');console.log('PASS author persists across process restart')}finally{await stop(reopened)}
})().catch(error=>{console.error(error);process.exitCode=1});
