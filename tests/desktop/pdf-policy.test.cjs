// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const policy=require('../../desktop/pdf-policy.cjs');
test('PDF copy refuses original resolved path and hard-link identity',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-pdf-policy-'));
 try{
  const original=path.join(dir,'original.pdf'),link=path.join(dir,'linked.pdf');
  await fs.writeFile(original,'%PDF-public');await fs.link(original,link);
  const stat=await fs.lstat(original),current={format:'pdf',target:original,inode:stat.ino,device:stat.dev};
  await assert.rejects(policy.assertCopyDestination(current,path.join(dir,'nested','..','original.pdf')),/different destination/);
  await assert.rejects(policy.assertCopyDestination(current,link),/different destination/);
  await policy.assertCopyDestination(current,path.join(dir,'copy.pdf'));
  assert.equal(await fs.readFile(original,'utf8'),'%PDF-public');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('PDF copy confirmation defaults to cancel and honors cancellation',async()=>{
 let options;const win={},dialog={async showMessageBox(window,value){assert.equal(window,win);options=value;return {response:0};}};
 assert.equal(await policy.confirmCopy({format:'pdf'},dialog,win,key=>key),false);
 assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);
 dialog.showMessageBox=async()=>({response:1});
 assert.equal(await policy.confirmCopy({format:'pdf'},dialog,win,key=>key),true);
});
test('every shipped locale supplies the PDF copy disclosure',()=>{
 const locales=require('../../tools/desktop/i18n-extra.json');
 const entries=Object.entries(locales);assert.equal(entries.length,45);
 for(const [locale,strings] of entries)assert.ok(typeof strings.pdfCopyWarning==='string'&&strings.pdfCopyWarning.trim(),locale);
});
