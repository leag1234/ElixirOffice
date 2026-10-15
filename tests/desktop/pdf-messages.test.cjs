// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const upstream=process.env.EO_UPSTREAM||path.join(os.homedir(),'elixiroffice/DocumentServer');
let messages;vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/PdfMessages.js'),'utf8'),{define:(_deps,factory)=>{messages=factory()}});
const codes=['complexity','signature','annotation','xfa','scripted','linearized','form','protected-or-invalid','encrypted','permissions','page-limit','catalog','unsupported-catalog','size-or-invalid','writer-failure','original-changed','page-count-changed','runtime-unavailable','cancelled','timeout'];
test('all refusal reasons are human readable through all 45 existing catalogs',()=>{
 assert.equal(Object.keys(messages.catalogs).length,45);
 for(const language of Object.keys(messages.catalogs))for(const code of codes){
  const text=messages.message(code,language);assert(text.length>60);if(code.includes('-'))assert(!text.includes(code),'Raw reason code: '+code);
  assert(/Save As|Enregistrer sous/.test(text),'Copy offer missing: '+code);
 }
 assert.match(messages.message('signature','fr-FR'),/signature/);
 assert.match(messages.message('unsupported-catalog','fr'),/destinations nommées/);
 assert.match(messages.message('unknown','zz'),/module is unavailable/);
});
test('desktop supplied strings use the same catalog with English fallback',()=>{
 assert.match(messages.message('signature','fr',{pdfReasonSignature:'Translated reason',pdfSaveCopy:'Translated copy offer'}),/^Translated reason Translated copy offer$/);
 assert.match(messages.message('page-count-changed','en',{}),/number of PDF pages/);
});

test('cancellation does not mislabel a writable PDF as read-only',()=>{
 assert(!messages.message('cancelled','en').includes('read-only'));
 assert(!messages.message('cancelled','fr').includes('lecture seule'));
 assert.match(messages.readOnlyMessage('signature','en'),/read-only/);
 assert.match(messages.readOnlyMessage('signature','fr-FR'),/lecture seule/);
});
