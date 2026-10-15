// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/Pdf.js'),'utf8');
let PdfMessages;vm.runInNewContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-local/PdfMessages.js'),'utf8'),{define:(_deps,factory)=>{PdfMessages=factory()}});

function setup(offline=true,writable=false){
 let Pdf,written,opened=0,continued=0,current,scriptRuns=0,modified=true,restriction=0;const callbacks={},errors=[],exports=[];
 function Action(){}Action.prototype.RunScript=()=>scriptRuns++;Action.prototype.Do=()=>scriptRuns++;
 const nativeBytes=new Uint8Array(Buffer.from('%PDF-public-copy'));
 const doc={widgets:[{SetEditMode(value){this.design=value}}],BlurActiveObject(){},RecalculateAll(){},History:{Index:3,Reset_SavedIndex(){this.saved=this.Index;}},GetActionsQueue:()=>({SetCurAction:action=>{current=action},Continue:()=>continued++})};
 const viewer={isFullText:true,file:{Selection:{},selectAll(){this.Selection={Glyph1:-2,Glyph2:-1,IsSelection:false}},onUpdateSelection(){},onUpdateOverlay(){},pages:[{originIndex:1},{originIndex:0},{originIndex:undefined}],originalPagesCount:2,nativeFile:{SplitPages:(indexes,changes)=>{written={indexes:Array.from(indexes),changes};return nativeBytes}}},getPDFDoc:()=>doc,Save:()=>new Uint8Array([37,80,68,70,45]),SaveForSplit:()=>new Uint8Array([37,80,68,70])};
 const context={window:null,AscPDF:{CActionRunScript:Action},Asc:{c_oAscFileType:{PDF:513},c_oAscRestrictionType:{View:1}},Uint8Array,setTimeout,clearTimeout,define:(_deps,factory)=>{Pdf=factory({inspect:async()=>({writable,reason:writable?'':'unsupported'}),write:async()=>nativeBytes.slice()},PdfMessages)}};context.window=context;
 vm.runInNewContext(source,context);
 const api={DocInfo:{get_OfflineApp:()=>offline},DocumentRenderer:viewer,getPDFDoc:()=>doc,openDocument(){opened++},asc_registerCallback:(name,fn)=>{callbacks[name]=fn},asc_unregisterCallback:name=>{delete callbacks[name]},asc_openDocumentFromBytes(){api.openDocument();callbacks.asc_onDocumentContentReady()},asc_addRestriction(value){restriction|=value},asc_removeRestriction(value){restriction&=~value},SetDocumentModified(value){modified=value},canEdit:()=>false,isDocumentModified:()=>modified};
 const options={onError:error=>errors.push(error.message),onExport:async(...args)=>exports.push(args)};
 return {context,Pdf,api,options,callbacks,nativeBytes,Action,errors,exports,stats:()=>({written,opened,continued,current,scriptRuns,restriction})};
}
test('hosted PDF APIs are untouched; local installation requires offline DocInfo',()=>{
 const e=setup(false),original=e.api.openDocument,script=e.Action.prototype.RunScript;
 assert.throws(()=>e.Pdf.install(e.api,e.options),/offline/);assert.equal(e.api.openDocument,original);assert.equal(e.Action.prototype.RunScript,script);
});
test('local PDF opens raw bytes, disables scripts and URI actions, preserves page order in copy serialization',async()=>{
 const e=setup(),controller=e.Pdf.install(e.api,e.options);
 const stats=await controller.open(new Uint8Array(Buffer.from('%PDF-public-input')));assert.equal(stats.pages,3);assert.equal(stats.backend,'drawingfile');assert.equal(e.stats().opened,1);
 e.api.DocumentRenderer.file.selectAll();assert.equal(e.api.DocumentRenderer.file.Selection.IsSelection,true);
 const script=new e.Action();script.RunScript();script.Do();assert.equal(e.stats().scriptRuns,0);assert.equal(e.stats().continued,1);assert.equal(e.stats().current,script);
 let links=0,next=0;e.callbacks.asc_onOpenLinkPdfForm('https://example.invalid',()=>links++,()=>next++);assert.equal(links,0);assert.equal(next,1);
 const bytes=controller.serialize();assert.deepEqual(e.stats().written.indexes,[1,0,2]);e.nativeBytes[0]=0;assert.equal(bytes[0],37,'copy owns returned bytes');assert.equal(controller.isModified(),true);
});
test('local PDF export routes only PDF to the local callback; read-only original Save and server formats remain unavailable',async()=>{
 const e=setup(),controller=e.Pdf.install(e.api,e.options);
 await controller.open(new Uint8Array(Buffer.from('%PDF-public-input')));
 await assert.rejects(controller.save(),/read-only/);assert.equal(e.api.asc_Save(true),false);assert.equal(e.errors.length,0);assert.equal(e.api.asc_Save(false),false);assert.match(e.errors[0],/read-only/);
 await assert.rejects(controller.exportAs('docx',{}),/Only PDF/);
 assert.equal(e.api.asc_DownloadAs({fileType:65}),false);assert.equal(e.exports.length,0);
 await controller.exportAs('pdf',{isPdfPrint:true});assert.equal(e.exports.length,1);assert.equal(e.exports[0][1],'pdf');assert.equal(e.exports[0][2].isPdfPrint,true);
 assert.equal(controller.isModified(),true,'export must not acknowledge the unsaved original');
});
test('invalid PDF input can be retried, and unavailable script isolation fails closed',async()=>{
 const e=setup(),controller=e.Pdf.install(e.api,e.options);
 await assert.rejects(controller.open(new Uint8Array([1,2,3])),/Invalid PDF/);
 await controller.open(new Uint8Array(Buffer.from('%PDF-valid')));
 e.context.AscPDF.CActionRunScript=null;await assert.rejects(controller.open(new Uint8Array(Buffer.from('%PDF-valid'))),/script isolation/);
});


test('verified PDF saving clears dirty only after acknowledged native persistence',async()=>{
 const e=setup(true,true),events=[],controller=e.Pdf.install(e.api,{...e.options,saveAcknowledgesOriginal:true,onSave:async()=>events.push('written')});
 await controller.open(new Uint8Array(Buffer.from('%PDF-public-input')));assert.equal(controller.canSave(),true);assert.equal(e.stats().restriction,0);assert.equal(e.api.getPDFDoc().widgets[0].design,undefined,'writable PDFs keep the original filling mode');
 await controller.save();assert.deepEqual(events,['written']);assert.equal(e.api.getPDFDoc().History.saved,3);assert.equal(controller.isModified(),false);
});
test('PDF download, failed persistence and concurrent edits keep the source dirty',async()=>{
 for(const mode of ['download','failed','concurrent']){
  const e=setup(true,true),controller=e.Pdf.install(e.api,{...e.options,saveAcknowledgesOriginal:mode!=='download',onSave:async()=>{if(mode==='failed')throw Error('disk failure');if(mode==='concurrent')e.api.getPDFDoc().History.Index++;}});
  await controller.open(new Uint8Array(Buffer.from('%PDF-public-input')));
  if(mode==='failed')await assert.rejects(controller.save(),/disk failure/);else await controller.save();
  assert.equal(controller.isModified(),true,mode);assert.equal(e.api.getPDFDoc().History.saved,undefined,mode);
 }
});
test('unsupported PDF policy enforces View restriction and retains raw bytes in recovery',async()=>{
 const e=setup(),controller=e.Pdf.install(e.api,e.options),input=new Uint8Array(Buffer.from('%PDF-public-input'));
 await controller.open(input);assert.equal(controller.canSave(),false);assert.equal(e.stats().restriction,1);
 assert.deepEqual((await controller.snapshot()).bytes,input);
});

test('read-only PDF exposes the localized refusal and copy offer end to end',async()=>{
 const e=setup(true,false);e.options.lang='fr';const controller=e.Pdf.install(e.api,e.options);await controller.open(new Uint8Array(Buffer.from('%PDF-public')));
 assert.match(controller.readOnlyMessage(),/Enregistrer sous/);assert.match(controller.readOnlyMessage(),/lecture seule/);
 await assert.rejects(controller.save(),/Enregistrer sous/);
});
