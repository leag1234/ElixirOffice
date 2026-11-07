// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {isTemporaryPath}=require('../../desktop/temp-location.cjs');
test('macOS recognizes mail and system temporary locations',()=>{
 const options={platform:'darwin',env:{},homedir:'/Users/test',tmpdir:'/var/folders/ab/cd/T'};
 for(const value of ['/var/folders/ab/cd/T/TemporaryItems/report.docx','/private/var/folders/ab/cd/T/TemporaryItems/report.docx','/Users/test/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/123/report.docx'])
 assert.equal(isTemporaryPath(value,options),true);
 assert.equal(isTemporaryPath('/Users/test/Documents/report.docx',options),false);
 assert.equal(isTemporaryPath('/Users/test/Desktop/report.docx',options),false);
 assert.equal(isTemporaryPath('/Users/test/Downloads/report.docx',options),false);
 assert.equal(isTemporaryPath('/Volumes/External/report.docx',options),false);
});
test('Linux recognizes temporary and runtime locations',()=>{
 const options={platform:'linux',env:{XDG_RUNTIME_DIR:'/run/user/1000'},homedir:'/home/test',tmpdir:'/tmp'};
 assert.equal(isTemporaryPath('/tmp/attachment.docx',options),true);
 assert.equal(isTemporaryPath('/run/user/1000/attachment.docx',options),true);
 assert.equal(isTemporaryPath('/home/test/Documents/attachment.docx',options),false);
 assert.equal(isTemporaryPath('/home/test/Desktop/attachment.docx',options),false);
 assert.equal(isTemporaryPath('/home/test/Downloads/attachment.docx',options),false);
 assert.equal(isTemporaryPath('/mnt/external/attachment.docx',options),false);
});
test('Windows recognizes temporary locations case-insensitively',()=>{
 const options={platform:'win32',env:{LOCALAPPDATA:'C:\\Users\\Test\\AppData\\Local'},homedir:'C:\\Users\\Test',tmpdir:'C:\\Users\\Test\\AppData\\Local\\Temp'};
 assert.equal(isTemporaryPath('C:\\Users\\Test\\AppData\\Local\\Temp\\attachment.docx',options),true);
 assert.equal(isTemporaryPath('c:\\users\\test\\appdata\\local\\temp\\attachment.docx',options),true);
 assert.equal(isTemporaryPath('C:\\Users\\Test\\AppData\\Local\\Temp\\Content.Outlook\\ABC\\attachment.docx',options),true);
 assert.equal(isTemporaryPath('C:\\Users\\Test\\AppData\\Local\\Microsoft\\Windows\\INetCache\\Content.Outlook\\ABC\\attachment.docx',options),true);
 assert.equal(isTemporaryPath('C:\\Users\\Test\\Documents\\attachment.docx',options),false);
 assert.equal(isTemporaryPath('C:\\Users\\Test\\Desktop\\attachment.docx',options),false);
 assert.equal(isTemporaryPath('C:\\Users\\Test\\Downloads\\attachment.docx',options),false);
 assert.equal(isTemporaryPath('D:\\External\\attachment.docx',options),false);
});

test("test launches can switch the temporary-folder check off; it stays on by default", () => {
 const options = {platform: "linux", homedir: "/home/test", tmpdir: "/tmp"};
 assert.equal(isTemporaryPath("/tmp/attachment.docx", {...options, env: {}}), true);
 assert.equal(isTemporaryPath("/tmp/attachment.docx", {...options, env: {EO_TEMP_LOCATION_CHECK: "1"}}), true);
 assert.equal(isTemporaryPath("/tmp/attachment.docx", {...options, env: {EO_TEMP_LOCATION_CHECK: "0"}}), false);
});
