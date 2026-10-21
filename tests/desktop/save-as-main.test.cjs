// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),scope={exports:{}};
const bootstrap=fs.readFileSync(helper,'utf8');
vm.runInNewContext(bootstrap+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:scope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
// These native-dialog mocks model Linux; Mac/Windows require actual runtime proof.
const {boot:baseBoot}=scope.exports;
async function boot(options){const env=await baseBoot(options);assert(Array.isArray(env.saveDialogs),'The shared boot must record actual native Save dialog options');env.process.platform='linux';return env;}
const plain=()=>new Uint8Array(Buffer.from('PKpublic-save-as'));
const protection={protected:false,remove:false};
test('real-main Save As info includes client PDF per family and preserves converted source default/folder',async()=>{
 const env=await boot({document:true});
 try{
  const info=await env.invoke('save-as-info',env.selected.token);
  assert.equal(info.nativeFormats,false);assert.equal(info.defaultFormat,'docx');
  assert.deepEqual(Array.from(info.formats,x=>x.value),['docx','odt','rtf','txt','pdf']);
  for(const format of ['xlsx','pptx']){
   await env.invoke('return-home');
   const selected=await env.invoke('new',format),options=await env.invoke('save-as-info',selected.token);
   assert.equal(options.defaultFormat,format);assert(options.formats.some(x=>x.value==='pdf'));
  }
  const source=path.join(env.directory,'source.rtf');await fsp.writeFile(source,'public RTF fixture');
  await env.invoke('return-home');
  const selected=await env.invoke('drop',source),options=await env.invoke('save-as-info',selected.token);
  assert.equal(selected.format,'docx');assert.equal(options.defaultFormat,'rtf');
  env.saveResponses.push({canceled:true});assert.equal(await env.invoke('save-as-choose',selected.token,'rtf'),null);
  assert.equal(path.dirname(env.saveDialogs.at(-1).defaultPath),env.directory);
  assert.notEqual(env.saveDialogs.at(-1).defaultPath,source);
  const target=path.join(env.directory,'adopted.docx');env.saveResponses.push({canceled:false,filePath:target});
  const ticket=await env.invoke('save-as-choose',selected.token,'docx');
  const saved=await env.invoke('save',selected.token,plain(),true,protection,'local-operation-301',ticket.ticket);
  assert.equal(typeof saved.artifactId,'string','Only a committed target receives a scoped saved-file action');
  const stages=env.sent.filter(x=>x[0]==='eo:operation-stage').map(x=>x[1]);
  assert(stages.some(x=>x.id==='local-operation-301'&&x.scope===selected.token&&x.phase==='writing'));
  assert(!stages.some(x=>x.id==='local-operation-301'&&x.phase==='awaiting-user'),'A preselected ticket does not open a second destination');
  assert.equal((await env.invoke('save-as-info',selected.token)).defaultFormat,'docx');
  assert.equal(await fsp.readFile(source,'utf8'),'public RTF fixture');

 }finally{await env.cleanup()}
});
test('fallback uses one native filter and explicit overwrite confirmation; cancel leaves bytes untouched',async()=>{
 const env=await boot({document:true});
 try{
  const source=path.join(env.directory,'test.docx'),before=await fsp.readFile(source);
  env.saveResponses.push({canceled:true});
  assert.equal(await env.invoke('save-as-choose',env.selected.token,'docx'),null);
  const options=env.saveDialogs.at(-1);
  assert.deepEqual(Array.from(options.filters,x=>Array.from(x.extensions)),[['docx']]);
  assert(options.properties.includes('showOverwriteConfirmation'));
  assert.equal(options.defaultPath,source);
  assert.deepEqual(await fsp.readFile(source),before);assert.equal(env.dialogs.length,0);
 }finally{await env.cleanup()}
});
test('suffixless selection is rejected and reopened without writing either possible destination',async()=>{
 const env=await boot({document:true});
 try{
  const base=path.join(env.directory,'existing'),normalized=base+'.docx';
  await fsp.writeFile(base,'extensionless original');await fsp.writeFile(normalized,'PKnormalized original');
  env.saveResponses.push({canceled:false,filePath:base},{canceled:false,filePath:normalized});env.responses.push(0,1);
  const selected=await env.invoke('save-as-choose',env.selected.token,'docx');
  assert.equal(env.saveDialogs.length,2);assert.equal(env.saveDialogs[1].defaultPath,base);
  assert.equal(await fsp.readFile(base,'utf8'),'extensionless original');
  assert.equal(await fsp.readFile(normalized,'utf8'),'PKnormalized original');
  assert.equal(selected.name,'existing.docx');assert.equal(selected.target,undefined);assert.equal(env.dialogs.length,2);
  await env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket);
  assert.equal(await fsp.readFile(normalized,'utf8'),'PKpublic-save-as');
  assert.equal(await fsp.readFile(base,'utf8'),'extensionless original');assert.equal(env.saveDialogs.length,2);
 }finally{await env.cleanup()}
});
test('selected lossy format alone asks confirmation; cancellation never creates a copy',async()=>{
 const env=await boot({document:true});
 try{
  const target=path.join(env.directory,'copy.txt');
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(0);
  assert.equal(await env.invoke('save-as-choose',env.selected.token,'txt'),null);
  assert.equal(env.dialogs.length,1);await assert.rejects(fsp.stat(target),{code:'ENOENT'});
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(1);
  const selected=await env.invoke('save-as-choose',env.selected.token,'txt');
  await env.invoke('export',env.selected.token,new Uint8Array(Buffer.from('public text')),'txt',protection,undefined,selected.ticket);
  assert.equal(await fsp.readFile(target,'utf8'),'public text');
  assert.equal(await fsp.readFile(path.join(env.directory,'test.docx'),'utf8'),'PKtest-public-document');
  assert.equal(env.saveDialogs.length,2);assert.equal(env.dialogs.length,2);
 }finally{await env.cleanup()}
});
test('ticket is single use and cannot overwrite a destination changed during conversion',async()=>{
 const env=await boot({document:true});
 try{
  const target=path.join(env.directory,'copy.docx');await fsp.writeFile(target,'PKold');
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(1);
  const selected=await env.invoke('save-as-choose',env.selected.token,'docx');
  await fsp.writeFile(target,'PKexternal-change');
  await assert.rejects(env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket),/The destination changed\. Choose it again\./);
  assert.equal(await fsp.readFile(target,'utf8'),'PKexternal-change');
  await assert.rejects(env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket),/The destination changed\. Choose it again\./);
  assert.equal(env.saveDialogs.length,1);
 }finally{await env.cleanup()}
});
test('ticket rejects a newly created destination, cancellation, and a switched document',async()=>{
 const env=await boot({document:true});
 try{
  const target=path.join(env.directory,'copy.docx');
  env.saveResponses.push({canceled:false,filePath:target});
  let selected=await env.invoke('save-as-choose',env.selected.token,'docx');
  await fsp.writeFile(target,'PKexternal-new');
  await assert.rejects(env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket),/The destination changed\. Choose it again\./);
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(1);
  selected=await env.invoke('save-as-choose',env.selected.token,'docx');await env.invoke('save-as-cancel',env.selected.token);
  await assert.rejects(env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket),/The destination changed\. Choose it again\./);
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(1);
  selected=await env.invoke('save-as-choose',env.selected.token,'docx');
  assert.equal(await env.invoke('new','docx'),null);
  const other=env.documents.at(-1),next=await env.invokeFor(other,'initial');
  await assert.rejects(env.invokeFor(other,'save',next.token,plain(),true,protection,undefined,selected.ticket),/The destination changed\. Choose it again\./);
  assert.equal(await fsp.readFile(target,'utf8'),'PKexternal-new');
 }finally{await env.cleanup()}
});
test('original PDF Save As and flattened PDF copy keep distinct consent routes',async()=>{
 const env=await boot({document:'pdf'});
 try{
  const source=path.join(env.directory,'test.pdf'),target=path.join(env.directory,'copy.pdf');
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(0);
  assert.equal(await env.invoke('save-as-choose',env.selected.token,'pdf',true),null);
  await assert.rejects(fsp.stat(target),{code:'ENOENT'});
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(1);
  const selected=await env.invoke('save-as-choose',env.selected.token,'pdf',true);
  assert.equal(env.dialogs.length,2);
  const copy=await env.invoke('pdf',env.selected.token,new Uint8Array(Buffer.from('%PDF-public-copy')),false,false,'local-operation-302',selected.ticket);
  assert.equal(typeof copy.artifactId,'string','Committed PDF copies retain scoped Open/Show actions');
  assert.equal(copy.name,'copy.pdf');
  assert.equal(copy.bytes,Buffer.byteLength('%PDF-public-copy'));
  assert(env.sent.some(([name,event])=>name==='eo:operation-stage'&&event.id==='local-operation-302'&&event.scope===env.selected.token&&event.phase==='writing'));
  assert.equal(await env.invoke('saved-show',copy.artifactId),true);
  assert.equal(env.dialogs.length,2,'PDF copy consent must not be repeated after serialization');
  assert.equal(await fsp.readFile(source,'utf8'),'%PDF-public-source');
  env.saveResponses.push({canceled:false,filePath:path.join(env.directory,'preserved.pdf')});
  const original=await env.invoke('save-as-choose',env.selected.token,'pdf',false);
  await env.invoke('save',env.selected.token,new Uint8Array(Buffer.from('%PDF-original-append')),true,protection,undefined,original.ticket);
  assert.equal(env.dialogs.length,2,'preserving PDF Save As has no flattened-copy warning');
 }finally{await env.cleanup()}
});
test('atomic commit enforces both existing and absent destination snapshots after ticket consumption',async()=>{
 const files=require('../../desktop/files.cjs'),os=require('node:os'),directory=await fsp.mkdtemp(path.join(os.tmpdir(),'eo-save-as-atomic-'));
 const target=path.join(directory,'copy.txt'),originalOpen=fsp.open;
 try{
  await fsp.writeFile(target,'approved original');const snapshot=await files.fingerprint(target);
  await fsp.writeFile(target,'external replacement');
  await assert.rejects(files.atomic(target,Buffer.from('should not replace'),snapshot),/changed on disk/i);
  assert.equal(await fsp.readFile(target,'utf8'),'external replacement');
  await fsp.unlink(target);
  fsp.open=async(filename,...args)=>{
   const handle=await originalOpen(filename,...args);
   if(String(filename).endsWith('.tmp')){const sync=handle.sync.bind(handle);handle.sync=async()=>{await fsp.writeFile(target,'created during temporary write');return sync()};}
   return handle;
  };
  await assert.rejects(files.atomic(target,Buffer.from('should not replace'),{absent:true}),/changed before replacement/i);
  assert.equal(await fsp.readFile(target,'utf8'),'created during temporary write');
 }finally{fsp.open=originalOpen;await fsp.rm(directory,{recursive:true,force:true})}
});

test('Linux overwrite decline preserves bytes; consent is bound to the fingerprint before the prompt',async()=>{
 const env=await boot({document:true});
 try{
  const target=path.join(env.directory,'occupied.docx');await fsp.writeFile(target,'PKapproved');
  env.saveResponses.push({canceled:false,filePath:target});env.responses.push(0);
  assert.equal(await env.invoke('save-as-choose',env.selected.token,'docx'),null);
  assert.equal(await fsp.readFile(target,'utf8'),'PKapproved');
  env.saveResponses.push({canceled:false,filePath:target});
  env.responses.push(async()=>{await fsp.writeFile(target,'PKchanged during confirmation');return {response:1}});
  const selected=await env.invoke('save-as-choose',env.selected.token,'docx');
  await assert.rejects(env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket),/The destination changed\. Choose it again\./);
  assert.equal(await fsp.readFile(target,'utf8'),'PKchanged during confirmation');
 }finally{await env.cleanup()}
});

test('stale Save As tickets use a translated native save error through IPC',async()=>{
 const env=await boot({document:true,systemLanguages:['fr'],systemLocale:'fr'});
 try{
  const target=path.join(env.directory,'copy.docx');env.saveResponses.push({canceled:false,filePath:target});
  const selected=await env.invoke('save-as-choose',env.selected.token,'docx');await env.invoke('save-as-cancel',env.selected.token);
  const strings=JSON.parse(await fsp.readFile(path.join(__dirname,'../../desktop/assets/desktop-home/i18n/fr.json'),'utf8'));
  await assert.rejects(env.invoke('save',env.selected.token,plain(),true,protection,undefined,selected.ticket),error=>{
    assert.equal(error.message,strings.saveDestinationChanged);
    const ipc=Error("Error invoking remote method 'eo:save': Error: "+error.message);
    assert.equal(require('../../desktop/errors.js').message(ipc,strings),strings.saveDestinationChanged);
    return true;
  });
  await assert.rejects(fsp.stat(target),{code:'ENOENT'});
 }finally{await env.cleanup()}
});

test('direct native PDF copy acknowledges its committed file and writing stage',async()=>{
 const env=await boot({document:true});
 try{
  const target=path.join(env.directory,'direct-copy.pdf'),source=path.join(env.directory,'test.docx'),before=await fsp.readFile(source);
  env.saveResponses.push({canceled:false,filePath:target});
  const copy=await env.invoke('pdf',env.selected.token,new Uint8Array(Buffer.from('%PDF-direct-public-copy')),false,false,'local-operation-303');
  assert.equal(typeof copy.artifactId,'string');
  assert.equal(copy.name,'direct-copy.pdf');
  assert.equal(copy.bytes,Buffer.byteLength('%PDF-direct-public-copy'));
  assert.equal(copy.durabilityUnconfirmed,false);
  assert.equal(await env.invoke('saved-show',copy.artifactId),true);
  const stages=env.sent.filter(([name])=>name==='eo:operation-stage').map(([,event])=>event);
  assert(stages.some(event=>event.id==='local-operation-303'&&event.scope===env.selected.token&&event.phase==='writing'));
  assert(stages.some(event=>event.id==='local-operation-303'&&event.phase==='awaiting-user'));
  assert.deepEqual(await fsp.readFile(source),before);
 }finally{await env.cleanup()}
});

test('all desktop languages provide the dedicated destination-changed message',()=>{
 const catalogs=require('../../tools/desktop/i18n-extra.json');
 assert.equal(Object.keys(catalogs).length,45);
 assert.equal(catalogs.en.saveDestinationChanged,'The destination changed. Choose it again.');
 for(const [language,strings] of Object.entries(catalogs)){
  assert.equal(typeof strings.saveDestinationChanged,'string',language);
  assert(strings.saveDestinationChanged.trim(),language);
  assert.notEqual(strings.saveDestinationChanged,strings.saveBusy,language);
  const assembled=JSON.parse(fs.readFileSync(path.join(__dirname,'../../desktop/assets/desktop-home/i18n',language+'.json'),'utf8'));
  assert.equal(assembled.saveDestinationChanged,strings.saveDestinationChanged,language);
 }
});
