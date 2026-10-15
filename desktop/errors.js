// SPDX-License-Identifier: AGPL-3.0-only
(function(factory){if(typeof module==='object'&&module.exports)module.exports=factory();else window.EODesktopErrors=factory();})(function(){
 'use strict';
 const fallback={savePermission:'Permission denied. Choose another folder or use Save As.',saveBusy:'The file is open elsewhere or cannot be replaced. Close the other application or use Save As.',saveSpace:'The disk is full. Free space or choose another disk.',savePath:'The destination is unavailable or its path is too long. Choose another folder or filename.',saveDifferent:'Choose a different destination for the PDF copy. The original was not changed.',saveInvalid:'The conversion did not produce a valid file. The original was not changed.'};
 function raw(error){return String(error?.message||error||'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');}
 function cancelled(error){return error?.code==='cancelled'||error?.reason==='cancelled'||error?.name==='AbortError'||/^(?:Save cancelled|Conversion cancelled|PDF saving cancelled)(?::|$)/.test(raw(error));}
 function message(error,strings={}){
  const reason=raw(error);let key;
  const code=error?.code||(/^(E[A-Z0-9_]+|UNKNOWN):/.exec(reason)||[])[1];
  if(['EACCES','EROFS'].includes(code))key='savePermission';
  else if(['EPERM','EBUSY'].includes(code)||/^Could not save: the file may be open in another application/.test(reason))key='saveBusy';
  else if(code==='ENOSPC')key='saveSpace';
  else if(['ENOENT','ENAMETOOLONG'].includes(code)||/^This Windows path is too long/.test(reason))key='savePath';
  else if(/^Choose a different destination for the PDF copy/.test(reason))key='saveDifferent';
  else if(/^Invalid (?:document|PDF) output/.test(reason))key='saveInvalid';
  return key?(strings[key]||fallback[key]):code?(strings.error||'Unknown local file error'):reason||(strings.error||'Unknown local file error');
 }
 return {message,cancelled,raw,fallback};
});
