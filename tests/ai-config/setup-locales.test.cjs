// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web),'Explicit owned EO_WEB_APPS required');
const source=path.join(web,'apps/common/main/lib/elixir-ai/SetupStrings.js');let strings;
vm.runInNewContext(fs.readFileSync(source,'utf8'),{define:(_deps,f)=>strings=f()});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
test('setup English source is independently sealed for linguistic review',()=>{
 const review=require('../fixtures/reviewed-i18n/ai-setup-strings-Z.json');
 assert.equal(Object.keys(strings).length,18);assert.deepEqual(Object.keys(strings),review.keys);
 assert.equal(sha(fs.readFileSync(source)),review.source_sha256);
 assert.equal(sha(JSON.stringify(strings,null,2)+'\n'),review.translation_source.sha256);
 assert(['pending-session-Z-review','reviewed-session-Z'].includes(review.status));assert(Object.isFrozen(strings));
});
test('all45 catalogs in each editor contain the separately tracked setup keys',()=>{
 for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor']){
  const directory=path.join(web,'apps',editor,'main/locale'),files=fs.readdirSync(directory).filter(n=>n.endsWith('.json'));assert.equal(files.length,45);
  for(const file of files){const catalog=JSON.parse(fs.readFileSync(path.join(directory,file)));
   for(const [key,value]of Object.entries(strings)){const actual=catalog['Common.ElixirAI.SetupStrings.'+key];assert.equal(typeof actual,'string',editor+'/'+file+'/'+key);assert(actual.trim());if(file==='en.json')assert.equal(actual,value);}
  }
 }
});

test('reviewed setup translations match the sealed artifact and identical three-editor catalogs',()=>{
 const review=require('../fixtures/reviewed-i18n/ai-setup-strings-Z.json');assert.equal(review.status,'reviewed-session-Z');
 assert.equal(review.translation_artifact.sha256,'8f41ba457ca20e6ce9dad815c39f2ed821e591359c2db022cea77466a666f70b');
 const values={};
 for(const locale of review.reviewed_locales){
  for(const editor of review.editors){
   const data=JSON.parse(fs.readFileSync(path.join(web,'apps',editor,'main/locale',locale+'.json')));
   const projected=Object.fromEntries(Object.keys(strings).sort().map(key=>[key,data['Common.ElixirAI.SetupStrings.'+key]]));
   if(values[locale])assert.deepEqual(projected,values[locale]);else values[locale]=projected;
  }
 }
 assert.equal(Object.keys(values).length,44);assert.equal(sha(JSON.stringify(values)),review.reviewed_catalog_sha256);
});
