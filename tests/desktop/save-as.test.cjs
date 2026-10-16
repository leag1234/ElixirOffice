// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const policy=require('../../desktop/save-as.cjs');
const current={token:'document',name:'Report.docx',format:'docx',target:'/documents/Report.docx'};
test('Save As formats cover each editor including client PDF and preserve supported source defaults',()=>{
 for(const [format,list]of [['docx',['docx','odt','rtf','txt','pdf']],['xlsx',['xlsx','ods','csv','pdf']],['pptx',['pptx','odp','pdf']],['pdf',['pdf']]])
  assert.deepEqual(policy.available({...current,format}),list);
 assert.equal(policy.preferred({...current,format:'odt',sourceFormat:'odt'}),'odt');
 assert.equal(policy.preferred({...current,sourceFormat:'rtf'}),'rtf');
 assert.equal(policy.preferred({...current,format:'xlsx',sourceFormat:'csv'}),'csv');
 assert.equal(policy.preferred({...current,sourceFormat:'doc'}),'docx');
 assert.deepEqual(policy.choices({...current,format:'odt'}),['odt','docx','rtf','txt','pdf']);
});
test('suggestions use document/source folders and keep converted source suggestions distinct',()=>{
 assert.equal(policy.suggestion(current),'/documents/Report.docx');
 assert.equal(policy.suggestion({...current,format:'odt',name:'Report.odt',target:'/documents/Report.odt'}),'/documents/Report.odt');
 assert.equal(policy.suggestion({...current,target:null,sourceTarget:'/original/Report.rtf',sourceFormat:'rtf'},'rtf','Copie'),'/original/Report - Copie.rtf');
 assert.equal(policy.suggestion({...current,target:null,name:'Untitled.docx'}),'Untitled.docx');
});
test('returned suffix determines native output; explicit fallback must match, no post-prompt suffix appending',()=>{
 assert.equal(policy.extension('/tmp/report.v2.ODT',current),'odt');
 assert.equal(policy.extension('/tmp/report.docx',current),'docx','GTK selected filter cannot be inferred from the path');
 for(const filename of ['/tmp/report','/tmp/report.','/tmp/report.docx ','/tmp/report.exe','/tmp/report.xlsx','relative.docx'])
  assert.throws(()=>policy.extension(filename,current),{code:'SAVE_AS_EXTENSION'});
 assert.throws(()=>policy.extension('/tmp/report.docx',current,'odt'),{code:'SAVE_AS_EXTENSION'});
 assert.equal(policy.extension('/tmp/report.odt',current,'odt'),'odt');
});
test('loss warning is scoped to selected lossy output and PDF original uses its existing copy policy',()=>{
 for(const format of ['docx','odt'])assert.equal(policy.warning(current,format),null);
 for(const format of ['rtf','txt','pdf'])assert.match(policy.warning(current,format),/^saveLoss/);
 assert.equal(policy.warning({...current,format:'xlsx'},'csv'),'saveLossCsv');
 assert.equal(policy.warning({...current,format:'pdf'},'pdf'),null);
 for(const platform of ['linux','win32','darwin'])assert.equal(policy.nativeFormats(platform),false);assert.equal(policy.nativeFormats('win32',true),true);assert.equal(policy.nativeFormats('darwin',true),true);assert.equal(policy.nativeFormats('linux',true),false);
 const filters=policy.filters(current,key=>'translated '+key);
 assert.equal(filters.length,5);assert(filters.every(filter=>filter.name.startsWith('translated ')));
 assert.deepEqual(policy.filters(current,key=>key,'odt').map(item=>item.extensions),[['odt']]);
});
async function withFolder(run){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-save-as-policy-'));
 try{await run(directory)}finally{await fs.rm(directory,{recursive:true,force:true})}
}
test('destination capability is single-use and rejects stale document, changed route/format and expiry',()=>withFolder(async directory=>{
 let now=100;const store=new policy.Destinations({now:()=>now,lifetime:100});
 const target=path.join(directory,'copy.docx');
 await assert.rejects(store.issue(current,target,'docx','pdf'),/Invalid Save As route/);
 const issue=()=>store.issue(current,target,'docx','save');
 let selected=await issue();assert.equal((await store.take(selected.ticket,current,'docx','save')).target,target);
 await assert.rejects(store.take(selected.ticket,current,'docx','save'),/expired/);
 for(const [doc,format,route]of [[{...current,token:'other'},'docx','save'],[{...current,target:'/renamed.docx'},'docx','save'],[current,'odt','save'],[current,'docx','export']]){
  selected=await issue();await assert.rejects(store.take(selected.ticket,doc,format,route),/expired/);
 }
 selected=await issue();now=200;await assert.rejects(store.take(selected.ticket,current,'docx','save'),/expired/);
}));
test('destination created or replaced after native selection is refused, and symlinks are never selected',()=>withFolder(async directory=>{
 const store=new policy.Destinations(),target=path.join(directory,'copy.docx');
 let selected=await store.issue(current,target,'docx','save');
 await fs.writeFile(target,'new other document');await assert.rejects(store.take(selected.ticket,current,'docx','save'),/destination changed/);
 selected=await store.issue(current,target,'docx','save');
 await fs.writeFile(target,'changed other document');await assert.rejects(store.take(selected.ticket,current,'docx','save'),/destination changed/);
 const linked=path.join(directory,'alias.docx');await fs.symlink(target,linked);
 await assert.rejects(store.issue(current,linked,'docx','save'),/symbolic link/);
 assert.equal(await fs.readFile(target,'utf8'),'changed other document');
}));
test('suffixless and normalized existing destinations are both untouched on extension rejection',()=>withFolder(async directory=>{
 const base=path.join(directory,'report'),extended=base+'.docx';
 await fs.writeFile(base,'base existing');await fs.writeFile(extended,'other existing');
 assert.throws(()=>policy.extension(base,current),{code:'SAVE_AS_EXTENSION'});
 assert.equal(await fs.readFile(base,'utf8'),'base existing');assert.equal(await fs.readFile(extended,'utf8'),'other existing');
}));
