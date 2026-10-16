// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path'),crypto=require('node:crypto');
const formats=require('./formats.cjs'),files=require('./files.cjs');
const labels={docx:'saveFormatDocx',odt:'saveFormatOdt',rtf:'saveFormatRtf',txt:'saveFormatTxt',xlsx:'saveFormatXlsx',ods:'saveFormatOds',csv:'saveFormatCsv',pptx:'saveFormatPptx',odp:'saveFormatOdp',pdf:'saveFormatPdf'};
function available(current){
 const result=formats.exports[formats.kind(current.format)];
 if(!result)throw Error('Unsupported Save As document');
 return result.slice();
}
function preferred(current){
 const list=available(current);
 return list.includes(current.sourceFormat)?current.sourceFormat:current.format;
}
function choices(current){
 const first=preferred(current);
 return [first,...available(current).filter(format=>format!==first)];
}
function extension(target,current,explicitFormat){
 if(typeof target!=='string'||!path.isAbsolute(target)||/[. ]$/.test(target))throw extensionError(current);
 const format=files.extension(target);
 if(!format||!available(current).includes(format)||explicitFormat&&format!==explicitFormat)throw extensionError(current);
 return format;
}
function extensionError(current){
 const error=Error('Choose a supported file format extension');
 error.code='SAVE_AS_EXTENSION';error.formats=available(current);return error;
}
function suggestion(current,format=preferred(current),copyLabel='Copy'){
 if(!available(current).includes(format))throw extensionError(current);
 const source=current.target||current.sourceTarget;
 let name=path.basename(current.name).replace(/\.[^.]+$/,'');
 if(!current.target&&current.sourceTarget)name+=' - '+copyLabel;
 name+='.'+format;
 return source?path.join(path.dirname(source),name):name;
}
function filters(current,t,explicitFormat){
 const list=explicitFormat?[explicitFormat]:choices(current);
 if(list.some(format=>!available(current).includes(format)))throw extensionError(current);
 return list.map(format=>({name:t(labels[format]),extensions:[format]}));
}
function warning(current,format){
 if(!available(current).includes(format))throw extensionError(current);
 if(format===current.format)return null;
 return {rtf:'saveLossRtf',txt:'saveLossTxt',csv:'saveLossCsv',pdf:current.format==='pdf'?null:'saveLossPdf'}[format]||null;
}
function nativeFormats(platform=process.platform,enabled=false){return enabled===true&&(platform==='darwin'||platform==='win32');}
async function destinationState(target){
 try{return await files.fingerprint(target)}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function selectionError(message){const error=Error(message);error.code='SAVE_AS_SELECTION';return error;}
function sameDestination(a,b){return a===null&&b===null||a&&b&&a.hash===b.hash&&a.inode===b.inode&&a.device===b.device;}
class Destinations{
 constructor({now=Date.now,lifetime=10*60*1000}={}){this.now=now;this.lifetime=lifetime;this.pending=null;this.generation=0;}
 clear(){this.pending=null;this.generation++;}
 async issue(current,target,format,route){
  this.clear();const generation=this.generation;extension(target,current,format);
  if(!(route==='save'&&format===current.format||route==='export'&&format!==current.format&&format!=='pdf'||route==='pdf'&&format==='pdf'))throw Error('Invalid Save As route');
  const state=await destinationState(target),id=crypto.randomUUID();
  if(generation!==this.generation)throw Error('Save As selection cancelled');
  this.pending={id,token:current.token,source:current.target||null,sourceFormat:current.format,target,format,route,state,expires:this.now()+this.lifetime};
  return {ticket:id,format,name:path.basename(target)};
 }
 async take(id,current,format,route){
  const selected=this.pending;this.clear();
  if(!selected||typeof id!=='string'||selected.id!==id||selected.token!==current.token||selected.source!==(current.target||null)||selected.sourceFormat!==current.format||selected.format!==format||selected.route!==route||this.now()>=selected.expires)
   throw selectionError('Save As selection expired or no longer matches this document');
  extension(selected.target,current,format);
  if(!sameDestination(selected.state,await destinationState(selected.target)))throw selectionError('The destination changed after it was selected. Choose it again.');
  return selected;
 }
}
module.exports={available,preferred,choices,extension,suggestion,filters,warning,nativeFormats,Destinations,labels};
