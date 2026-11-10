// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Print preview panel: options reach the native PDF pipeline, Print and Save as PDF route to the right native call,
// and "Export a copy" has its own wording while Save As is unchanged.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const desktop=path.join(__dirname,'../../desktop');
const pdfSource=fs.readFileSync(path.join(desktop,'pdf.js'),'utf8'),renderer=fs.readFileSync(path.join(desktop,'renderer.js'),'utf8');
const slice=(from,to)=>{const a=renderer.indexOf(from),b=renderer.indexOf(to,a);assert(a>=0&&b>a,'renderer section '+from);return renderer.slice(a,b)};

// ---- EODesktopPdf -------------------------------------------------------------------------------------------------
function parseRanges(value,current,count){
 if(value==='all')return undefined;
 const pages=new Array(count);
 if(value==='current'){pages[current-1]=true;return pages}
 for(const part of String(value).split(',')){const [a,b=a]=part.split('-').map(Number);for(let i=a;i<=b;i++)if(i>=1&&i<=count)pages[i-1]=true}
 return pages;
}
function pdfEnv(){
 const log={nativePrint:[],slot:[],built:[],fed:[]};
 const context={URL,setTimeout,location:{origin:'http://localhost'},fetch:async()=>({ok:true,json:async()=>({artifact_version:'abcst'})}),
  Asc:{c_oAscPrintType:{ActiveSheets:0,EntireWorkbook:1,Selection:2}},
  AscCommon:{ClientPdf:{getRawImage(){},build:async(api,options)=>{log.built.push(options);return {bytes:new Uint8Array([1]),stats:{backend:'wasm'}}}},
   getNativePrintRanges:parseRanges,g_oTextMeasurer:{m_oManager:{}},
   CMemory:function(){this.GetDataUint8=()=>new Uint8Array([9]);this.GetCurPosition=()=>1},
   CDocumentRenderer:function(){this.InitPicker=()=>{};this.DocInfo=()=>{};this.Memory=new context.AscCommon.CMemory()}},
  EOWasmPdf:{Writer:function(){this.stats={};this.feed=async data=>{log.fed.push(data)};this.finish=async()=>new Uint8Array([37])}}};
 context.window=context;vm.createContext(context);vm.runInContext(pdfSource,context);
 const memory={GetDataUint8:()=>new Uint8Array([7]),GetCurPosition:()=>1};
 const api={ShowParaMarks:true,asc_getCoreProps:()=>({}),pages:5,
  asc_nativePrintPagesCount(){return this.pages},
  asc_nativePrint(printer,page,options){log.nativePrint.push({printer,page,options});log.slot.push(context.AscDesktopEditor_PrintOptions);if(printer)printer.Memory=memory;return memory}};
 return {context,log,api,run:(format,options)=>context.EODesktopPdf(api,format,options)};
}
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
const adjust=printType=>({printType,asc_getPrintType(){return this.printType},pageOptionsMap:[{sheet:0},{sheet:1}]});

test('spreadsheet without panel options keeps the historical active-sheet print',async()=>{
 const e=pdfEnv();await e.run('xlsx',{});
 assert.equal(e.log.nativePrint.length,1);same(e.log.nativePrint[0].options,{adjustOptions:{printType:0}});assert.equal(e.log.slot[0],undefined);
});
for(const [name,type] of [['ActiveSheets',0],['EntireWorkbook',1],['Selection',2]])test('spreadsheet honours the panel print type '+name+' and per-sheet page setup',async()=>{
 const e=pdfEnv(),options=adjust(type);await e.run('ods',{advancedOptions:options});
 assert.equal(e.log.nativePrint.length,1);assert.equal(e.log.slot[0].advancedOptions,options,'the engine reads the panel asc_CAdjustPrint');
 assert.equal(e.log.slot[0].advancedOptions.asc_getPrintType(),type);assert.equal(e.log.slot[0].advancedOptions.pageOptionsMap.length,2);
 assert.equal(e.log.nativePrint[0].printer,undefined);assert.equal(e.log.nativePrint[0].options,undefined,'no adjustOptions override of the panel');
 assert.equal(e.context.AscDesktopEditor_PrintOptions,undefined,'the slot never outlives the call');
});
test('spreadsheet clears the engine slot even when printing fails',async()=>{
 const e=pdfEnv();e.api.asc_nativePrint=()=>{throw Error('engine')};
 await assert.rejects(e.run('xlsx',{advancedOptions:adjust(1)}),/engine/);assert.equal(e.context.AscDesktopEditor_PrintOptions,undefined);
});
const native=pages=>({asc_getNativeOptions:()=>({pages,currentPage:3})});
test('presentation prints all pages by default and only the selected pages for a range or the current page',async()=>{
 let e=pdfEnv();await e.run('pptx',{});same(e.log.nativePrint.map(x=>x.page),[0,1,2,3,4]);
 e=pdfEnv();await e.run('pptx',{advancedOptions:native('2-3,5')});same(e.log.nativePrint.map(x=>x.page),[1,2,4]);
 e=pdfEnv();await e.run('odp',{advancedOptions:native('current')});same(e.log.nativePrint.map(x=>x.page),[2]);
 e=pdfEnv();await e.run('pptx',{advancedOptions:native('all')});assert.equal(e.log.nativePrint.length,5);
 assert.equal(e.api.ShowParaMarks,true,'paragraph marks are restored');
});
test('presentation progress counts only the selected pages and an empty selection is an error',async()=>{
 const e=pdfEnv(),progress=[];await e.run('pptx',{advancedOptions:native('1,4'),onProgress:value=>progress.push(value)});
 same(progress.filter(x=>x.total).map(x=>[x.completed,x.total]),[[0,2],[1,2],[2,2]]);
 const bad=pdfEnv();await assert.rejects(bad.run('pptx',{advancedOptions:native('9')}),/No pages selected/);assert.equal(bad.api.ShowParaMarks,true);
});
test('documents hand the panel options (pages, selection) to the client PDF builder',async()=>{
 const e=pdfEnv(),options={advancedOptions:native('2'),signal:undefined};await e.run('docx',options);
 assert.equal(e.log.built.length,1);assert.equal(e.log.built[0].advancedOptions,options.advancedOptions);
});

// ---- renderer routing ---------------------------------------------------------------------------------------------
test('desktop actions: Print and Export PDF open the panel; the panel buttons run the native pipeline with its options',()=>{
 const calls=[],stub=name=>(...args)=>{calls.push([name,...args]);return name};
 const line=renderer.split('\n').find(x=>x.startsWith('function desktopAction'));assert(line);
 const context=vm.createContext({choosingSaveAs:false,openPrint:stub('openPrint'),pdf:stub('pdf'),exportCopy:stub('exportCopy'),save:stub('save')});
 vm.runInContext(line+'\nthis.desktopAction=desktopAction;',context);
 const options={advancedOptions:{}};
 context.desktopAction('print');context.desktopAction('pdf');context.desktopAction('print-now',options);context.desktopAction('pdf-now',options);context.desktopAction('export');context.desktopAction('save-as');
 same(calls,[['openPrint',true],['openPrint',false],['pdf',true,undefined,options],['pdf',false,undefined,options],['exportCopy'],['save',true]]);
 assert.match(renderer,/'print-now':\(\)=>pdf\(true,undefined,value\)/);
 assert.equal((renderer.match(/pdf:\(\)=>openPrint\(false\),print:\(\)=>openPrint\(true\)/g)||[]).length,2,'native menu and in-window tables route alike');
});
function openPrintEnv(format,canPrint=true){
 const triggered=[],direct=[];
 const context=vm.createContext({controller:{},operationBusy:false,file:{format},pdf:(...a)=>direct.push(a),
  main:{appOptions:{canPrint}},frame:{Common:{NotificationCenter:{trigger:name=>triggered.push(name)}}}});
 vm.runInContext(slice('function openPrint','async function pdf(')+'\nthis.openPrint=openPrint;',context);
 return {openPrint:context.openPrint,triggered,direct};
}
test('Print and Export PDF open the print preview panel for Office documents only',()=>{
 for(const format of ['docx','xlsx','pptx','odt','ods','odp']){const e=openPrintEnv(format);e.openPrint(true);e.openPrint(false);same(e.triggered,['file:print','file:print']);assert.equal(e.direct.length,0)}
 const pdf=openPrintEnv('pdf');pdf.openPrint(true);pdf.openPrint(false);same(pdf.direct,[[true],[false]]);assert.equal(pdf.triggered.length,0);
 const blocked=openPrintEnv('docx',false);blocked.openPrint(true);same(blocked.direct,[[true]],'without print permission the native pipeline is used directly');
});
test('documents get the print permission, PDF documents keep their own handling',()=>{assert.match(renderer,/download:true,print:kind!=='pdf',chat:false/)});

function pdfRun(print,printOptions){
 const log={pdfCalls:[],engine:[],operations:[]};
 const operation={id:'op1',progress(){},phase(){},finish:value=>log.operations.push(value),fail:error=>log.operations.push(error)};
 const context=vm.createContext({AbortController,Error,Object,Promise,window:{},operationBusy:false,abort:null,main:{api:{}},
  controller:{beginOperation:()=>operation,snapshot:async()=>{},confirmUnprotectedExport:async()=>true},
  EOOperationFeedback:{paint:async()=>{}},status(){},t:key=>key,script:async()=>{},buttons(){},fail:error=>log.operations.push(error),
  file:{format:'xlsx',token:'tok'},
  frame:{EODesktopPdf:async(api,format,options)=>{log.engine.push([format,options]);return {bytes:new Uint8Array([1]),stats:{backend:'wasm'}}}},
  eoDesktop:{pdf:async(...args)=>{log.pdfCalls.push(args);return {printed:true,name:'x.pdf'}},cancelWrite:async()=>{}}});
 vm.runInContext(slice('function outputOutcome','async function exportOutput')+slice('async function pdf(','async function recoveryCopy')+'\nthis.pdf=pdf;',context);
 return context.pdf(print,'ticket',printOptions).then(result=>({result,log,context}));
}
test('Save as PDF sends the panel options to the engine and writes through the save pipeline (print=false)',async()=>{
 const options={advancedOptions:{marker:1}},{result,log}=await pdfRun(false,options);
 assert.equal(log.engine.length,1);assert.equal(log.engine[0][0],'xlsx');assert.equal(log.engine[0][1].advancedOptions,options.advancedOptions);
 assert.equal(log.pdfCalls.length,1);assert.equal(log.pdfCalls[0][2],false,'print flag off');assert.equal(log.pdfCalls[0][3],true,'confirmed unprotected export is forwarded');assert.equal(log.pdfCalls[0][5],'ticket');
});
test('Print sends the panel options to the engine and then the native print dialog (print=true)',async()=>{
 const options={advancedOptions:{marker:2}},{log}=await pdfRun(true,options);
 assert.equal(log.engine[0][1].advancedOptions,options.advancedOptions);assert.equal(log.pdfCalls[0][2],true);
 assert.equal(log.operations.at(-1).kind,'print-started');
});
test('direct export without a panel keeps default options',async()=>{
 const {log}=await pdfRun(false);assert.equal(log.engine[0][1].advancedOptions,undefined);
});

// ---- Export a copy ------------------------------------------------------------------------------------------------
function exportEnv(format){
 const opened=[],chosen=[];
 const context=vm.createContext({controller:{canSave:()=>true},operationBusy:false,choosingSaveAs:false,file:{format,token:'tok'},window:{},
  frame:{document:{body:{className:''}},getComputedStyle:()=>({getPropertyValue:()=>''})},info:{language:'en'},pendingRequested:false,fontRefreshRequested:false,saveAsTicket:null,
  t:key=>({saveAs:'Save As',ok:'OK',cancel:'Cancel',saveFormat:'File format',exportTitle:'Export a copy',exportButton:'Export',exportNote:'The document stays open on its original file.'})[key]||key,
  status(){},fail:error=>{throw error},exportAs:async()=>true,
  EOFormatDialog:{open:async options=>{opened.push(options);return options.defaultFormat}},
  eoDesktop:{saveAsInfo:async()=>({nativeFormats:false,defaultFormat:format,formats:['docx','odt','pdf','txt'].map(value=>({value}))}),
   saveAsChoose:async(...args)=>{chosen.push(args);return {ticket:'t',format:args[1]}},saveAsCancel:async()=>{}}});
 vm.runInContext(slice('function exportCopy','async function exportAs(')+'\nthis.chooseExport=chooseExport;this.exportCopy=exportCopy;',context);
 return {context,opened,chosen};
}
test('Export a copy has its own title, button and explanation and never offers the document format',async()=>{
 const e=exportEnv('docx');await e.context.exportCopy();
 const dialog=e.opened[0];assert.equal(dialog.title,'Export a copy');assert.equal(dialog.ok,'Export');assert.match(dialog.note,/stays open on its original file/);
 same(dialog.formats.map(x=>x.value),['odt','pdf','txt']);assert.equal(dialog.defaultFormat,'odt');
 same(e.chosen[0],['tok','odt',false,true]);
});
test('Save As keeps its title, button, formats and non-export dialog flag',async()=>{
 const e=exportEnv('docx');await e.context.chooseExport();
 const dialog=e.opened[0];assert.equal(dialog.title,'Save As');assert.equal(dialog.ok,'OK');assert.equal(dialog.note,undefined);
 same(dialog.formats.map(x=>x.value),['docx','odt','pdf','txt']);same(e.chosen[0],['tok','docx',false,false]);
});
test('choosing PDF in Export a copy or Save As opens the print panel instead of exporting directly',async()=>{
 for(const copy of [true,false]){
  const opened=[],chosen=[],panel=[];
  const context=vm.createContext({controller:{canSave:()=>true},operationBusy:false,choosingSaveAs:false,file:{format:'xlsx',token:'tok'},window:{},
   frame:{document:{body:{className:''}},getComputedStyle:()=>({getPropertyValue:()=>''}),Common:{NotificationCenter:{}}},main:{appOptions:{canPrint:true}},
   info:{language:'en'},pendingRequested:false,fontRefreshRequested:false,saveAsTicket:null,t:key=>key,status(){},fail:error=>{throw error},
   exportAs:async()=>{throw Error('direct export must not run for PDF')},openPrint:print=>panel.push(print),setTimeout:fn=>fn(),
   EOFormatDialog:{open:async options=>{opened.push(options);return 'pdf'}},
   eoDesktop:{saveAsInfo:async()=>({nativeFormats:false,defaultFormat:'xlsx',formats:['xlsx','ods','pdf'].map(value=>({value}))}),
    saveAsChoose:async(...args)=>{chosen.push(args);return {ticket:'t',format:args[1]}},saveAsCancel:async()=>{}}});
  vm.runInContext(slice('function exportCopy','async function exportAs(')+'\nthis.chooseExport=chooseExport;',context);
  assert.equal(await context.chooseExport(copy),false);
  same(panel,[false]);assert.equal(chosen.length,0,'no native save dialog before the panel');
 }
});
test('the backstage Export item and the native dialog use the export wording',()=>{
 const backstage=fs.readFileSync(path.join(desktop,'backstage.js'),'utf8'),main=fs.readFileSync(path.join(desktop,'main.cjs'),'utf8'),preload=fs.readFileSync(path.join(desktop,'preload.cjs'),'utf8');
 assert.match(backstage,/'elx-export':'export'/);assert.match(backstage,/asc_Print=options=>options\?\.advancedOptions\?panelAction\('print-now',options\)/);
 assert.match(main,/title:t\(exportCopy\?'exportTitle':'saveAs'\),\.\.\.\(exportCopy\?\{buttonLabel:t\('exportButton'\)/);
 assert.match(preload,/exportCopy === true/);
});
test('Export strings exist in every desktop language, English fallback and French are localized',()=>{
 const catalogs=require('../../tools/desktop/i18n-extra.json'),main=fs.readFileSync(path.join(desktop,'main.cjs'),'utf8');
 for(const [language,strings] of Object.entries(catalogs))for(const key of ['exportTitle','exportButton','exportNote'])assert.equal(typeof strings[key],'string',language+' '+key);
 assert.equal(catalogs.en.exportTitle,'Export a copy');assert.equal(catalogs.en.exportButton,'Export');assert.match(main,/exportTitle:'Export a copy',exportButton:'Export',exportNote:'The document stays open on its original file\.'/,'main-process English fallback');
 assert.equal(catalogs.fr.exportTitle,'Exporter une copie');assert.equal(catalogs.fr.exportButton,'Exporter');assert.notEqual(catalogs.fr.exportNote,catalogs.en.exportNote);
});

test('the entry point decides the panel mode: Print for Ctrl+P / File > Print, Export as PDF for File > Export and PDF choices',()=>{
 const log=[];
 const context=vm.createContext({controller:{},operationBusy:false,file:{format:'xlsx'},pdf(){},main:{appOptions:{canPrint:true}},
  frame:{Common:{Utils:{InternalSettings:{set:(k,v)=>log.push(['set',k,v])}},NotificationCenter:{trigger:name=>log.push(['trigger',name])}}}});
 vm.runInContext(slice('function openPrint','async function pdf(')+'\nthis.openPrint=openPrint;',context);
 context.openPrint(true);context.openPrint(false);
 same(log,[['set','eo-print-mode','print'],['trigger','file:print'],['set','eo-print-mode','pdf'],['trigger','file:print']]);
 assert.match(renderer,/'pdf-now':\(\)=>pdf\(false/);
});
