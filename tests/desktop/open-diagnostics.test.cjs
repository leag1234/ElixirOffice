// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {create}=require('../../desktop/open-diagnostics.cjs');
test('open diagnostics retain only bounded allowlisted timings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-open-diagnostics-'));
 try{
  const diagnostics=create(()=>root,{version:'0.3.1',electron:'44.7.0',platform:'win32',private:'SECRET'});
  await diagnostics.record({trace:4,stage:'wasm-compile',durationMs:1234.567,outcome:'ok',path:'/private/document.docx',name:'SECRET'});
  await diagnostics.record({trace:-1,stage:'SECRET',durationMs:Infinity,outcome:'SECRET'});
  const text=diagnostics.text();assert(!text.includes('SECRET'));assert(!text.includes('/private'));await diagnostics.flush();
  assert.equal(text,await fs.readFile(path.join(root,'desktop-open-diagnostics.jsonl'),'utf8'));
  const [header,...events]=text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(Object.keys(header),['diagnostic','app','version','electron','platform']);
  assert.deepEqual(events[0],{trace:4,stage:'wasm-compile',durationMs:1234.57,outcome:'ok'});
  assert.deepEqual(events[1],{trace:0,stage:'renderer-ready',durationMs:0,outcome:'failed'});
  assert.equal((await fs.stat(path.join(root,'desktop-open-diagnostics.jsonl'))).mode&0o777,0o600);
  for(let n=0;n<300;n++)diagnostics.record({trace:n,stage:'first-paint',durationMs:n,outcome:'ok'});
  await diagnostics.flush();assert.equal(diagnostics.text().trim().split('\n').length,257);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('open diagnostics never follow a symlink',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-open-diag-link-'));
 try{
  const outside=path.join(root,'keep.txt');await fs.writeFile(outside,'keep');await fs.symlink(outside,path.join(root,'desktop-open-diagnostics.jsonl'));
  const diagnostics=create(()=>root);await assert.doesNotReject(diagnostics.record({stage:'view-create',outcome:'ok'}));
  assert.equal(await fs.readFile(outside,'utf8'),'keep');
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
