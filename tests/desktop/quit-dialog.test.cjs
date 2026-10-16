// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const decisions=require('../../desktop/decisions.cjs');
const words={quitSave:'Save',save:'Save',dontSave:"Don't Save",cancel:'Cancel',untitled:'Untitled',saveChangesNamed:'Do you want to save the changes to "{name}"?',closeWithoutSavingNamed:'Close "{name}" without saving?',closeUnavailable:'The editor is busy or not responding.',closeUnsavedRisk:'Changes not yet saved may be lost. Choose Cancel to keep waiting.'};
const t=key=>words[key],plain=labels=>labels.map(label=>label.replace(/&/g,''));
test('named quit uses platform button IDs with Save default and Cancel on Escape',()=>{
 for(const platform of ['win32','linux','darwin']){
  const options=decisions.unsaved(t,true,'Public report.docx',platform);
  assert.equal(options.message,'Do you want to save the changes to "\u2068Public report.docx\u2069"?');
  assert.deepEqual(plain(options.buttons),platform==='darwin'?['Save','Cancel',"Don't Save"]:['Save',"Don't Save",'Cancel']);
  assert.equal(options.defaultId,0);assert.equal(plain(options.buttons)[options.cancelId],'Cancel');assert.equal(options.noLink,true);
  for(let response=-1;response<=3;response++)assert.equal(decisions.discard({response},true,platform),plain(options.buttons)[response]==="Don't Save");
 }
});
test('name isolation strips injected direction controls and does not treat replacement tokens as templates',()=>{
 const options=decisions.unsaved(t,true,'Public \u202eRTL\u2069 $&\nreport.docx','win32');
 assert.equal(options.message,'Do you want to save the changes to "\u2068Public RTL $& report.docx\u2069"?');
 assert.equal((options.message.match(/\u2068/g)||[]).length,1);assert.equal((options.message.match(/\u2069/g)||[]).length,1);
 assert(decisions.unsaved(t,true,'','linux').message.includes('\u2068Untitled\u2069'));
 assert(decisions.unsaved(t,true,'\u202e  \n','linux').message.includes('\u2068Untitled\u2069'));
});
test('busy close names the document and retains only explicit Cancel or Do not Save',()=>{
 const options=decisions.busy(t,'Public.docx');
 assert.equal(options.message,'Close "\u2068Public.docx\u2069" without saving?');
 assert.deepEqual(plain(options.buttons),['Cancel',"Don't Save"]);assert.equal(options.defaultId,0);assert.equal(options.cancelId,0);
 assert.match(options.detail,/busy or not responding/);assert.match(options.detail,/keep waiting/);
 assert.equal(decisions.discard({response:options.cancelId}),false);assert.equal(decisions.discard({response:1}),true);
});
test('all 45 source and assembled catalogs have named questions and a separate Do not Save action',()=>{
 const extra=require('../../tools/desktop/i18n-extra.json');
 assert.equal(Object.keys(extra).length,45);
 for(const [language,strings]of Object.entries(extra)){
  const assembled=JSON.parse(fs.readFileSync(path.join(__dirname,'../../desktop/assets/desktop-home/i18n',language+'.json')));
  for(const key of ['saveChangesNamed','closeWithoutSavingNamed','dontSave','closeUnsavedRisk']){
   assert.equal(typeof strings[key],'string',language+':'+key);assert(strings[key].length>0,language+':'+key);
   assert.equal(assembled[key],strings[key],language+':assembled:'+key);
  }
  for(const key of ['saveChangesNamed','closeWithoutSavingNamed'])assert.equal(strings[key].split('{name}').length,2,language+':'+key);
  assert.notEqual(strings.dontSave,strings.discard,language+':close must describe not saving, not generic discard');
  assert.equal(typeof assembled.quitSave,'string',language+':translated Save');
  assert(assembled.quitSave.length>0,language);
  if(language!=='en')assert.notEqual(assembled.quitSave,'Save',language+':do not reuse untranslated shortcut label');
  const expected={de:'Speichern',es:'Guardar',nl:'Opslaan',pl:'Zapisz','pt-pt':'Guardar',ro:'Salvează',ru:'Сохранить',zh:'保存'};
  if(expected[language])assert.equal(assembled.quitSave,expected[language]);
  const question=decisions.unsaved(key=>assembled[key],true,'Public مرحبا.docx','linux');
  assert(question.message.includes('\u2068Public مرحبا.docx\u2069'),language);
  assert.equal(plain(question.buttons)[question.cancelId],assembled.cancel,language);
 }
});
