// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function validatePath(filename,platform=process.platform) {
  if(platform==='win32' && (filename.length>=260 || filename.split(/[\\/]/).some(part=>part.length>255))) {
    const error=Error('This Windows path is too long. Use a shorter folder or filename (including space for save backup names).');
    error.code='ENAMETOOLONG';throw error;
  }
  return filename;
}
function saveFailure(error) {
  if(error.rollbackUncertain)return error;
  if(['EPERM','EBUSY'].includes(error.code))
    error.message='Could not save: the file may be open in another application or you may not have permission. Close the other application or use Save As. '+error.message;
  return error;
}
module.exports={validatePath,saveFailure};
