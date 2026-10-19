// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {create}=require('../../desktop/save-diagnostics.cjs');
test('save diagnostics allowlist excludes private paths, contents, hashes and arbitrary metadata',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-save-diagnostics-'));
 try{
  const log=create(()=>root,{version:'0.2.4',electron:'44.7.0',node:'22.23.3',platform:'win32',windowsBuild:'10.0.26100',hostname:'PRIVATE'});
  await log.record({step:'backup-sync',code:'EBUSY',retries:2,outcome:'failure',message:'PRIVATE /Users/secret.docx',path:root,hash:'PRIVATE',contents:'PRIVATE'});
  await log.record({step:'PRIVATE',code:'PRIVATE',retries:'PRIVATE',outcome:'PRIVATE'});
  const text=log.text();assert(!text.includes('PRIVATE'));assert(!text.includes(root));assert.equal(text,await fs.readFile(path.join(root,'desktop-save-diagnostics.jsonl'),'utf8'));
  const [header,...events]=text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(Object.keys(header),['app','version','electron','node','platform','windowsBuild']);assert.equal(header.windowsBuild,'10.0.26100');
  assert.deepEqual(events[0],{step:'backup-sync',code:'EBUSY',retries:2,outcome:'failure'});
  assert.deepEqual(events[1],{step:'save',code:'UNKNOWN',retries:0,outcome:'failure'});
  assert.equal((await fs.stat(path.join(root,'desktop-save-diagnostics.jsonl'))).mode&0o777,0o600);
  for(let n=0;n<300;n++)log.record({step:'replace',code:'EPERM',retries:n,outcome:'failure'});
  await log.flush();assert(log.text().length<64*1024);assert.equal(log.text().trim().split('\n').length,129);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('optional diagnostic logging never follows a symlink or interferes with saving',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'eo-save-diag-link-'));
 try{
  const outside=path.join(root,'keep.txt');await fs.writeFile(outside,'public keep');await fs.symlink(outside,path.join(root,'desktop-save-diagnostics.jsonl'));
  const log=create(()=>root,{version:'PRIVATE',windowsBuild:'PRIVATE',platform:'win32'});
  await assert.doesNotReject(log.record({code:'EBUSY'}));assert.equal(await fs.readFile(outside,'utf8'),'public keep');assert(!log.text().includes('PRIVATE'));
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
test('every supported locale has safe Save As guidance and the copy action, with English fallback',async()=>{
 const catalogs=require('../../tools/desktop/i18n-extra.json'),errors=require('../../desktop/errors.js');
 assert.equal(Object.keys(catalogs).length,45);
 for(const [language,strings]of Object.entries(catalogs)){
  assert(strings.opCopyDiagnostics,language);assert(strings.saveBusy.endsWith(strings.saveEditsOpen),language);
  assert.equal(errors.message({code:'EBUSY'},strings),strings.saveBusy);
  assert.equal(errors.message({message:"Error invoking remote method 'eo:save': Error: EBUSY: private path"},strings),strings.saveBusy);
 }
 assert.match(errors.message({code:'EBUSY'}),/edits remain open.*Save As with a new name/);
});
