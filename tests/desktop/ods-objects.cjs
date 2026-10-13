// SPDX-License-Identifier: AGPL-3.0-only
// Public two-chart ODS: native same-file save, reopen and PDF on a real display.
const {launch,stop,editable,root}=require('./harness.cjs');
const {edit,modal,keys}=require('./lifecycle.cjs');
const snapshot=require('../local-mode/ods-chart-snapshot.cjs');
const crypto=require('node:crypto'),{constants}=require('node:fs');
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
(async()=>{
 const source=process.env.EO_LOCAL_FILE||path.join(root,'fixtures/sample-from-x2t.ods');
 assert(path.resolve(source).startsWith(root+path.sep),'Fixture must be inside own desktop root');
 assert((await fs.realpath(source)).startsWith(root+path.sep),'Fixture symlink escaped own desktop root');
 assert(!(await fs.realpath(source)).split(path.sep).includes('corpus-private'),'Public fixture only');
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),
  'e2ff465c4559f42e979859c68351b5972f328abfac3a09e0df0adb4dc228ec18','Unexpected public fixture');
 const checker=path.join(root,'tests/local-mode/ods-objects.py');
 const expected=JSON.parse(cp.execFileSync('python3',[checker,'--expected',source],{encoding:'utf8'}));
 await fs.mkdir(path.join(root,'tmp'),{recursive:true});
 const directory=await fs.mkdtemp(path.join(root,'tmp/ods-objects-'));
 const target=path.join(directory,'edited.ods'),pdf=target.replace(/\.ods$/,'.pdf'),report=[];
 await fs.copyFile(source,target,constants.COPYFILE_EXCL);await fs.chmod(target,0o664);
 const failed=[];
 const onPage=page=>page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText}));
 const capture=async env=>{
  const frame=env.page.frames().find(frame=>/spreadsheeteditor\/main/.test(frame.url()));
  assert(frame);const drawings=await frame.evaluate(snapshot);
  assert.equal(drawings.length,2,JSON.stringify(drawings));
  for(const drawing of drawings){
   assert(drawing.chart&&!drawing.image,JSON.stringify(drawing));
   assert(expected[drawing.title],'Unexpected chart title');
   assert.deepEqual(drawing.values,expected[drawing.title].numbers);
   assert.deepEqual(drawing.orderedValues,expected[drawing.title].orderedValues,'Series data order changed');
   assert.equal(drawing.series.reduce((a,b)=>a+b,0),expected[drawing.title].series);
   assert.deepEqual(drawing.types,[expected[drawing.title].kind==='chart:area'?'CAreaChart':'CLineChart']);
  }
  assert.deepEqual(drawings.map(d=>d.title).sort(),Object.keys(expected).sort());
  assert.deepEqual(env.errors,[]);assert.deepEqual(failed,[]);
  assert(env.requests.every(r=>r.method==='GET'&&(/^(blob:|data:)/.test(r.url)||r.url.startsWith('eoapp://desktop.elixiroffice.invalid/'))));
  return drawings;
 };
 const env=await launch({file:target,onPage,profile:'ods-objects-'+Date.now()});
 try{
  await editable(env);report.push({phase:'open',drawings:await capture(env)});
  await env.page.evaluate(()=>EOLocalSession.api.asc_setZoom(0.4));
  await env.page.waitForTimeout(500);
  await env.page.screenshot({path:path.join(root,'results/ods-objects-open.png')});
  await edit(env);await require('./file-action.cjs')(env.page,'save');
  await env.page.waitForFunction(()=>window.EOLastSave||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  cp.execFileSync('python3',[checker,source,target],{stdio:'inherit'});
  cp.execFileSync('python3',['-c',"import sys,zipfile; assert b'EODESKTOP' in zipfile.ZipFile(sys.argv[1]).read('content.xml')",target]);
  assert.equal((await fs.stat(target)).mode&0o777,0o664);
  await require('./file-action.cjs')(env.page,'pdf');await modal(env);keys(env,'save-path',pdf);
  await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:90000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  const text=cp.execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8'}).replace(/\s/g,'');
  for(const title of ['EODESKTOP',...Object.keys(expected)])assert(text.includes(title.replace(/\s/g,'')),'PDF lost '+title);
  assert.deepEqual(await capture(env),report[0].drawings);
  report.push({phase:'save',save:await env.page.evaluate(()=>window.EOLastSave),pdf:await env.page.evaluate(()=>window.EOLastPdf),requests:env.requests.length});
 }finally{await stop(env)}
 const reopened=await launch({file:target,onPage,profile:'ods-objects-reopen-'+Date.now()});
 try{
  await editable(reopened);const drawings=await capture(reopened);assert.deepEqual(drawings,report[0].drawings);
  const bytes=await reopened.page.evaluate(()=>Array.from(new Uint8Array(EOLocalSession.controller.serialize())));
  assert(Buffer.from(bytes).includes(Buffer.from('EODESKTOP','utf16le')),'Reopen lost edit');
  await reopened.page.evaluate(()=>EOLocalSession.api.asc_setZoom(0.4));
  await reopened.page.waitForTimeout(500);
  await reopened.page.screenshot({path:path.join(root,'results/ods-objects-reopen.png')});
  report.push({phase:'reopen',drawings,requests:reopened.requests.length});
 }finally{await stop(reopened)}
 await fs.writeFile(path.join(root,'results/ods-objects.json'),JSON.stringify(report,null,2));
 console.log('PASS native ODS edit/same-file save/reopen/PDF: both charts and data, no phantom image or missing resources');
})().catch(error=>{console.error(error);process.exitCode=1});
