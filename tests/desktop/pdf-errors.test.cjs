// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Errors=require('../../desktop/errors.js'),catalogs=require('../../tools/desktop/i18n-extra.json');
test('manual error detail survives IPC wrapping and known causes use translated catalog reasons',()=>{
 assert.equal(Errors.message(Error("Error invoking remote method 'eo:save': Error: ENOSPC: no space left"),catalogs.fr),catalogs.fr.saveSpace);
 assert.equal(Errors.message(Error('Choose a different destination for the PDF copy'),catalogs.fr),catalogs.fr.saveDifferent);
 assert.equal(Errors.message(Error('Ce PDF contient des informations de signature.'),catalogs.fr),'Ce PDF contient des informations de signature.');
 assert.equal(Errors.message(Error('Unexpected writer failure: byte preservation failed'),catalogs.fr),'Unexpected writer failure: byte preservation failed');
 assert.equal(Errors.message({code:'EACCES',message:'private path'},catalogs.fr),catalogs.fr.savePermission);
 assert.equal(Errors.message({code:'EBUSY',message:'private path'},{}),Errors.fallback.saveBusy);
});
test('cancellation matching is explicit and never masks a real failure mentioning cancellation',()=>{
 assert(Errors.cancelled(Error("Error invoking remote method 'eo:save': Error: Save cancelled")));
 assert(Errors.cancelled({name:'AbortError'}));assert(Errors.cancelled({reason:'cancelled'}));
 assert(!Errors.cancelled(Error('Write failed after cancellation cleanup')));assert(!Errors.cancelled(Error('Save cancellation backup was damaged')));
});
test('all45desktop catalogs contain safety/PDF explanation and mapped save reasons with English fallback',()=>{
 assert.equal(Object.keys(catalogs).length,45);
 for(const [language,strings] of Object.entries(catalogs))for(const key of [...Object.keys(Errors.fallback),'pdfTextUnavailable','pdfRecoveryOff','recoveryFailed','fatalMessage','fatalDetail'])assert.equal(typeof strings[key],'string',language+'/'+key);
 assert.match(catalogs.fr.pdfTextUnavailable,/texte original/);
});

test('unmapped operating-system errors cannot expose Unix or Windows paths',()=>{
 for(const code of ['EISDIR','EEXIST','EIO','ENOTDIR','UNKNOWN']){
  for(const value of [{code,message:'private/path/name'},Error(code+': failure, open '+JSON.stringify('/private/path/name')),Error("Error invoking remote method 'eo:save': Error: "+code+': open C:\\private\\name')]){
   assert.equal(Errors.message(value,{error:'Localized error'}),'Localized error');
  }
 }
});
