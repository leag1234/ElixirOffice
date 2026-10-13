/*
 * SPDX-FileCopyrightText: 2026 ElixirOffice contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * One worker and one module instance per conversion. Cancellation terminates both.
 */
'use strict';
var preparation;
function prepare(runtime){
 if(!preparation||preparation.runtime!==runtime){
  preparation={runtime:runtime,promise:(async function(){
   importScripts(runtime+'x2t.js');
   var response=await fetch(runtime+'x2t.wasm',{credentials:'same-origin',cache:'force-cache'});
   if(!response.ok)throw new Error('Cannot load conversion runtime');
   return WebAssembly.compileStreaming(response);
  })()};
  // Early preparation reports any failure through the conversion job.
  preparation.promise.catch(function(){});
 }
 return preparation.promise;
}
self.onmessage=async function(event){
 var job=event.data;
 if(job.prepare){prepare(job.runtime);return;}
 var start=performance.now(),nativeStatus;
 function progress(stage){self.postMessage({progress:{stage:stage}});}
 try{
  progress('loading-runtime');
  var compiled=await prepare(job.runtime);
  progress('initializing');
  var mod=await createX2t({noInitialRun:true,print:function(){},printErr:function(){},
   instantiateWasm:function(imports,receive){var instance=new WebAssembly.Instance(compiled,imports);receive(instance,compiled);return instance.exports;}
  });
  var FS=mod.FS,codes={docx:65,doc:66,odt:67,rtf:68,txt:69,docm:75,dotx:76,pptx:129,ppt:130,odp:131,ppsx:132,potx:135,xlsx:257,xls:258,ods:259,csv:260,xlsm:261,xltx:262,doct:8193,xlst:8194,pptt:8195};
  if(!codes[job.from]||!codes[job.to])throw new Error('Unsupported conversion format');
  ['/work/media','/fonts','/tmp/conversion'].forEach(function(p){FS.mkdirTree(p);});
  FS.writeFile('/work/input.'+job.from,job.bytes);
  job.files.forEach(function(f){if(f.path!=='/font_selection.bin'&&!/^\/fonts\/font\d+\.ttf$/.test(f.path))throw new Error('Invalid font path');FS.writeFile(f.path,f.bytes);});
  (job.resources||[]).forEach(function(f){
   if(!/^(media|themes)\/[a-zA-Z0-9_./ -]+$/.test(f.path)||f.path.split('/').some(function(p){return !p||p==='.'||p==='..';}))throw new Error('Invalid resource path');
   var path='/work/'+f.path;FS.mkdirTree(path.slice(0,path.lastIndexOf('/')));FS.writeFile(path,f.bytes);
  });
  var output='/work/output.'+job.to;
  FS.writeFile('/task.xml','<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert>'+
   '<m_sFileFrom>/work/input.'+job.from+'</m_sFileFrom><m_sFileTo>'+output+'</m_sFileTo>'+
   '<m_nFormatFrom>'+codes[job.from]+'</m_nFormatFrom><m_nFormatTo>'+codes[job.to]+'</m_nFormatTo>'+
   '<m_bIsNoBase64>true</m_bIsNoBase64><m_sFontDir>/fonts</m_sFontDir>'+
   '<m_nCsvTxtEncoding>46</m_nCsvTxtEncoding><m_nCsvDelimiter>4</m_nCsvDelimiter>'+
   '<m_sTempDir>/tmp/conversion</m_sTempDir></TaskQueueDataConvert>');
  var initMs=performance.now()-start,at=performance.now();progress('converting');
  try{nativeStatus=mod.callMain(['/task.xml']);}catch(e){if(typeof e.status==='number')nativeStatus=e.status;else throw e;}
  if(nativeStatus!==0)throw new Error('Native conversion failed: '+nativeStatus);
  var bytes=FS.readFile(output);if(!bytes.length&&!['txt','csv'].includes(job.to))throw new Error('Conversion produced no output');
  var resources=[];
  function walk(path){FS.readdir(path).forEach(function(n){if(n==='.'||n==='..')return;var p=path+'/'+n;if(FS.isDir(FS.stat(p).mode))walk(p);else resources.push({path:p.slice('/work/'.length),bytes:FS.readFile(p)});});}
  ['media','themes'].forEach(function(p){try{walk('/work/'+p);}catch(e){if(e.code!=='ENOENT'&&e.errno!==44)throw e;}});
  self.postMessage({bytes:bytes,resources:resources,stats:{initMs:Math.round(initMs),convertMs:Math.round(performance.now()-at),heapBytes:mod.HEAPU8.length}},
   [bytes.buffer].concat(resources.map(function(f){return f.bytes.buffer;})));
 }catch(e){self.postMessage({error:String(e.message||e),code:typeof nativeStatus==='number'?'conversion':'runtime',nativeStatus:nativeStatus});}
};
