// SPDX-License-Identifier: AGPL-3.0-only
(function(factory){if(typeof module==='object'&&module.exports)module.exports=factory();else window.EODesktopErrors=factory();})(function(){
 'use strict';
 const fallback={printFailed:"Printing failed. Try again or export PDF.",printTimedOut:"Printing timed out. Try again or export PDF.",printHelperError:"The print helper failed. Try again or export PDF.",saveRestoreUncertain:'The save failed and restoring the original file could not be confirmed. Keep the backup in the same folder and use Save As for your edits.',opFileMissing:'This file is no longer available. It may have been moved or deleted.',savePermission:'Permission denied. Your edits remain open. Use Save As with a new name.',saveBusy:'The file is open elsewhere or cannot be replaced. Your edits remain open. Use Save As with a new name.',saveSpace:'The disk is full. Free space or choose another disk.',savePath:'The destination is unavailable or its path is too long. Choose another folder or filename.',saveDifferent:'Choose a different destination for the PDF copy. The original was not changed.',saveInvalid:'The conversion did not produce a valid file. The original was not changed.'};
 const openFallback={
  openPermission:'ElixirOffice cannot read this file. Check its permissions or open it with File → Open.',
  openPermissionMac:'ElixirOffice is not allowed to read this file. Allow access in System Settings → Privacy & Security → Files and Folders, or open it with File → Open.',
  openBusy:'The file is temporarily unavailable or in use by another application. Close the other application and try opening it again.',
  openMissing:'This file may have been moved or deleted. Choose it again with File → Open.',
  openUnavailable:'The file could not be read. If it is stored in the cloud, make it available offline and check the connection. Check that security software allows ElixirOffice to read it.',
  openInvalid:'Choose a supported, regular document under 512 MiB, not a symbolic link. Text and CSV files must use UTF-8.',
  openPath:'The file path is too long. Move the document to a shorter folder path and open it again.'
 };
 function openMessage(error,strings={},platform){
  const code=error?.code;let key='openUnavailable';
  if(['ELOOP','EISDIR'].includes(code))key='openInvalid';
  else if(code==='ENOENT')key='openMissing';
  else if(code==='EBUSY')key='openBusy';
  else if(['EACCES','EPERM'].includes(code))key=platform==='darwin'?'openPermissionMac':platform==='win32'?'openUnavailable':'openPermission';
  else if(code==='ENAMETOOLONG')key='openPath';
  else if(!code&&/^(?:Unsupported document format|Choose a regular document|Document grew beyond|Text and CSV documents must use UTF-8)/.test(raw(error)))key='openInvalid';
  return strings[key]||openFallback[key];
 }
 function raw(error){return String(error?.message||error||'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');}
 function cancelled(error){if(error?.rollbackUncertain||/^SAVE_RESTORE_UNCERTAIN:/.test(raw(error)))return false;return error?.code==='cancelled'||error?.reason==='cancelled'||error?.name==='AbortError'||/^(?:Save cancelled|Conversion cancelled|PDF saving cancelled)(?::|$)/.test(raw(error));}
 function approved(reason,strings){
  if(Object.values(fallback).includes(reason)||Object.values(openFallback).includes(reason)||Object.values(strings).includes(reason))return true;
  // PDF policies are composed only from trusted bundled catalog strings.
  if(!strings.pdfSaveCopy)return false;
  return Object.keys(strings).filter(key=>key.startsWith('pdfReason')).some(key=>{
   const policy=strings[key]+' '+strings.pdfSaveCopy;
   return reason===policy||strings.pdfReadOnlyState&&reason===strings.pdfReadOnlyState+' '+policy;
  });
 }
 function backupLabel(error,reason){
  let name;
  try{name=JSON.parse(reason.slice('SAVE_RESTORE_UNCERTAIN:'.length));}catch{}
  if(typeof name==='string')name=name.replace(/[\x00-\x1f\x7f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'');
  if(typeof name!=='string'||!name||name.length>255||/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(name))return '';
  return ' ('+'\u2068'+name+'\u2069'+')';
 }
 function message(error,strings={}){
  const reason=raw(error);let key;
  if(error?.code==='operation-busy'||/^A local (?:operation|conversion|save|export) is already running$/.test(reason))return strings.opPreparing||'An operation is in progress. Please wait.';
  const code=error?.code||(/^(E[A-Z0-9_]+|UNKNOWN)(?::|$)/.exec(reason)||[])[1];
  if(/^EOPRINT_/.test(code||'')){
   key=/_(?:READY|CALLBACK)_TIMEOUT$/.test(code)?'printTimedOut':['EOPRINT_RENDERER','EOPRINT_VIEWER','EOPRINT_CACHE','EOPRINT_CLEANUP'].includes(code)?'printHelperError':'printFailed';
  }
  else if(error?.rollbackUncertain||/^SAVE_RESTORE_UNCERTAIN:/.test(reason))key='saveRestoreUncertain';
  else if(/^Saved file unavailable$/.test(reason))key='opFileMissing';
  else if(['EACCES','EROFS'].includes(code))key='savePermission';
  else if(['EPERM','EBUSY'].includes(code)||/^Could not save: the file may be open in another application/.test(reason))key='saveBusy';
  else if(code==='ENOSPC')key='saveSpace';
  else if(['ENOENT','ENAMETOOLONG'].includes(code)||/^This Windows path is too long/.test(reason))key='savePath';
  else if(/^Choose a different destination for the PDF copy/.test(reason))key='saveDifferent';
  else if(/^Invalid (?:document|PDF) output/.test(reason))key='saveInvalid';
  return key?(strings[key]||fallback[key])+(key==='saveRestoreUncertain'?backupLabel(error,reason):''):!code&&approved(reason,strings)?reason:(strings.error||'Unknown local file error');
 }
 return {message,openMessage,cancelled,raw,fallback,openFallback};
});
