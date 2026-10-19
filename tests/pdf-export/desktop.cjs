// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Actual packaged export, actual native chooser, actual file; no bridge mock.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const {launch,stop,editable,root}=require('../desktop/harness.cjs'),{modal,keys}=require('../desktop/lifecycle.cjs'),action=require('../desktop/file-action.cjs');
(async()=>{
 const source=path.join(root,'fixtures/public-export-300.docx'),target=path.join(root,'results/public-export-300-'+Date.now()+'.pdf');
 const original=await fs.readFile(source),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const env=await launch({file:source,profile:'pdf-export-'+Date.now()});
 try{
  await editable(env);
  await env.page.waitForFunction(()=>EOLocalSession.api.WordControl.m_oLogicDocument.GetPagesCount()===300,null,{timeout:120000});
  const pages=await env.page.evaluate(()=>EOLocalSession.api.WordControl.m_oLogicDocument.GetPagesCount());
  assert.equal(pages,300);
  await env.page.evaluate(()=>{
   window.ExportProgress=[];
   window.addEventListener('eo:local-operation',({detail:event})=>{
    if(event.kind!=='pdf-export')return;
    const docs=[document,EOLocalSession.win.document];
    const notices=docs.flatMap(d=>Array.from(d.querySelectorAll('.eo-operation')).map(n=>{
     const style=d.defaultView.getComputedStyle(n),p=n.querySelector('progress');
     return {visible:!n.hidden&&n.getClientRects().length>0&&style.display!=='none'&&style.visibility!=='hidden',
      value:p?.hasAttribute('value')?Number(p.getAttribute('value')):null,max:p?.getAttribute('max'),label:n.querySelector('.eo-operation-text')?.textContent,busy:n.getAttribute('aria-busy')};
    }));
    ExportProgress.push({time:performance.now(),...event,notices});
   });
  });
  await action(env.page,'pdf');
  await modal(env);
  await env.page.screenshot({path:path.join(root,'results/native-export-choice.png')});
  keys(env,'save-path',target);
  await env.page.waitForFunction(()=>window.EOLastPdf||window.EOLocalFailure,null,{timeout:180000});
  assert.equal(await env.page.evaluate(()=>window.EOLocalFailure),null);
  const receipt=await env.page.evaluate(()=>({result:EOLastPdf,events:ExportProgress}));
  await fs.writeFile(path.join(root,'results/export-observations.json'),JSON.stringify(receipt,null,2));
  assert.equal(receipt.result.stats.backend,'wasm');
  assert.equal(receipt.result.stats.pages,300);
  const counted=receipt.events.filter(e=>e.phase==='converting'&&Number.isInteger(e.completed)&&e.total===300);
  assert(counted.some(e=>e.completed>0&&e.completed<300),'Real intermediate page counts required');
  assert(counted.some(e=>e.notices.some(n=>n.visible&&n.value===e.completed&&Number(n.max)===300&&n.busy==='true')),'Visible count must track real conversion progress');
  assert.equal(receipt.events.at(-1).phase,'ready');assert(receipt.events.at(-1).artifactId);
  const frame=env.page.frames().find(f=>f.url().includes('/main/index.html'));
  const mainPanel=env.page.locator('.eo-operation:visible').last();
  const panel=await mainPanel.isVisible()?mainPanel:frame.locator('.eo-operation:visible').last();await panel.waitFor({state:'visible'});
  for(const label of ['Open file','Show in folder']){const button=panel.getByRole('button',{name:label,exact:true});assert(await button.isVisible());assert(await button.isEnabled());}
  await env.page.screenshot({path:path.join(root,'results/export-ready.png')});
  const output=await fs.readFile(target);assert.equal(output.subarray(0,5).toString(),'%PDF-');
  const info=cp.execFileSync('pdfinfo',[target],{encoding:'utf8'});assert.equal(Number(info.split(String.fromCharCode(10)).find(line=>line.startsWith('Pages:')).split(':')[1].trim()),300);
  const text=cp.execFileSync('pdftotext',[target,'-'],{encoding:'utf8',maxBuffer:1024*1024});
  for(let i=1;i<=300;i++)assert(text.includes('PUBLIC PDF EXPORT PAGE '+String(i).padStart(4,'0')),String(i));
  assert.equal(hash(await fs.readFile(source)),hash(original));assert.equal(env.application.exitCode,null);assert.deepEqual(env.errors,[]);
  receipt.output={bytes:output.length,sha256:hash(output),pages:300,allPublicPageLabels:true,originalUnchanged:true,openShowActionsVisibleEnabled:true};
  await fs.writeFile(path.join(root,'results/export-progress.json'),JSON.stringify(receipt,null,2));
  console.log('PASS actual300pageDOCX PDF export, real visible counts, native chooser, ready Open/Show',JSON.stringify(receipt.output));
 }finally{await stop(env)}
})().catch(error=>{console.error(error);process.exitCode=1});
