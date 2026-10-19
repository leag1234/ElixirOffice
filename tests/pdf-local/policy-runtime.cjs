// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const create=require(path.join(process.env.EO_PDF_RELEASE,'x2t.js')),root=process.env.EO_PDF_POLICY;
async function run(input,changes,inspect){
 const m=await create({noInitialRun:true,print(){},printErr(){}}),F=m.FS;
 ['/p','/fonts','/tmp/pdf'].forEach(p=>F.mkdirTree(p));
 if(input)F.writeFile('/p/in.pdf',input);if(changes)F.writeFile('/p/changes.bin',changes);
 let exit;try{exit=m.callMain([inspect?'--inspect-pdf':'--edit-pdf'])}catch(e){if(typeof e.status==='number')exit=e.status;else throw e}
 const policy=JSON.parse(F.readFile('/p/policy.json',{encoding:'utf8'}));
 const output=F.analyzePath('/p/out.pdf').exists?F.readFile('/p/out.pdf'):null;
 if(input)assert.deepEqual(F.readFile('/p/in.pdf'),new Uint8Array(input));
 return {exit,policy,output};
}
(async()=>{
 const cases=[
 ['public-page-order-inherited.pdf',''],['public-page-order-inherited-compressed.pdf',''],
 ['public-page-order-nested.pdf',''],['public-page-order-nested-compressed.pdf',''],
 ...['named-bad-page','named-numeric-page','named-bad-mode','named-cycle','named-extra-tree','tagged-marker'].map(name=>['public-'+name+'.pdf','unsupported-catalog']),
 ['public-forms.pdf',''],['public-compressed.pdf',''],['public-annotations-link.pdf',''],['public-compressed-annotations-link.pdf',''],
 ['public-signature-marker.pdf','signature'],['public-compressed-signature-marker.pdf','signature'],['public-xfa-marker.pdf','xfa'],
 ['public-unsupported-field.pdf','form'],['public-unsupported-catalog.pdf','unsupported-catalog'],['public-unsupported-annotation.pdf','annotation'],
 ['public-encrypted-empty-password.pdf','encrypted'],['public-over-page-limit.pdf','page-limit'],['public-invalid.pdf','protected-or-invalid'],
 ['public-scripted.pdf','unsupported-catalog'],['public-linearized-marker.pdf','linearized'],
 ['public-stream-signature.pdf','signature'],['public-stream-byte-range.pdf','signature'],['public-stream-script.pdf','scripted'],
 ['public-stream-actions.pdf','scripted'],['public-stream-xfa.pdf','xfa'],
 ['public-sigflags-0.pdf',''],['public-sigflags-1.pdf','signature'],['public-sigflags-3.pdf','signature']
 ];
 for(const [name,reason] of cases){
  const input=fs.readFileSync(path.join(root,name)),inspection=await run(input,null,true);
  assert.equal(inspection.exit,0,name);assert.equal(inspection.policy.reason,reason,name);assert.equal(inspection.policy.writable,!reason,name);assert.equal(inspection.policy.reorderSafe,!reason,name);
  const edited=await run(input,null,false);
  assert.equal(edited.exit,reason?2:0,name);assert.equal(edited.policy.writable,!reason,name);
  if(reason)assert(!edited.output,name+' unsafe writer ran');else assert.deepEqual(edited.output.subarray(0,input.length),new Uint8Array(input));
  console.log('PASS native parsed policy',name,reason||'writable');if(global.gc)global.gc();
 }
 for(const [name,input,changes] of [['missing-input',null,null],['invalid-changes',fs.readFileSync(path.join(root,'public-forms.pdf')),new Uint8Array([1,2,3,4,5])],['short-changes',fs.readFileSync(path.join(root,'public-forms.pdf')),new Uint8Array([37,80,68,70])]]){
  const result=await run(input,changes,false);assert.notEqual(result.exit,0,name);assert.equal(result.policy.writable,false,name);console.log('PASS fail-closed policy',name,result.policy.reason);if(global.gc)global.gc();
 }
 // Expected native refusals update Node exitCode; clear it only after every assertion succeeds.
 process.exitCode=0;
})().catch(e=>{console.error(e);process.exitCode=1});

