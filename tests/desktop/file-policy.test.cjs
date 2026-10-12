// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const {validatePath}=require('../../desktop/file-policy.cjs');
test('Windows total and component limits fail clearly before use',()=>{
 const path='C:\\'+ 'a'.repeat(255);
 assert.equal(validatePath(path,'win32'),path);
 assert.throws(()=>validatePath('C:\\x\\'+'a'.repeat(255),'win32'),/Windows path is too long/);
 assert.throws(()=>validatePath('a'.repeat(256),'win32'),/Windows path is too long/);
 assert.equal(validatePath(path+'long','linux'),path+'long');
});
