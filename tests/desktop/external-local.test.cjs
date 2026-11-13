// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Links to files of this computer (issue #77): what the desktop application may open, and what it refuses.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {isLocalLink,parseLocal,resolveLocal,denied,handler,validate}=require('../../desktop/external.cjs');

test('what is a link to a local file',()=>{
 for(const yes of ['file:///Users/x/doc.pdf','file://localhost/etc/a.pdf','FILE:///C:/x/a.pdf','/Users/x/doc.pdf','/tmp/a b.pdf','C:\\x\\doc.pdf','C:/x/doc.pdf',
  '\\\\server\\share\\a.pdf','..\\docs\\a.pdf','../docs/a.pdf','./a.pdf','.\\a.pdf'])assert.equal(isLocalLink(yes),true,yes);
 for(const no of ['https://example.org/a','mailto:a@b.c','//host/a','/','C:','a.pdf','docs/a.pdf','javascript:alert(1)','data:text/html,x','','\\\\',null,123,'/tmp/a\n.pdf','/tmp/a\u0000.pdf','/'+'a'.repeat(8192)])assert.equal(isLocalLink(no),false,JSON.stringify(no));
});

test('file: URLs and paths become file system paths',()=>{
 assert.deepEqual(parseLocal('file:///Users/x/a%20b.pdf',{platform:'darwin'}),{path:'/Users/x/a b.pdf'});
 assert.deepEqual(parseLocal('file://localhost/Users/x/a.pdf',{platform:'darwin'}),{path:'/Users/x/a.pdf'});
 assert.deepEqual(parseLocal('/Users/x/a b.pdf',{platform:'darwin'}),{path:'/Users/x/a b.pdf'});
 assert.deepEqual(parseLocal('file:///C:/x/a.pdf',{platform:'win32'}),{path:'C:\\x\\a.pdf'});
 assert.deepEqual(parseLocal('file://server/share/a.pdf',{platform:'win32'}),{path:'\\\\server\\share\\a.pdf'});
 assert.deepEqual(parseLocal('\\\\server\\share\\a.pdf',{platform:'win32'}),{path:'\\\\server\\share\\a.pdf'});
 for(const bad of ['file://evil.example/share/a.pdf','file:///a.pdf?x=1','file:///a.pdf#page=2','file://u:p@localhost/a.pdf','file:///a%2Fb.pdf','file:///%00.pdf'])
  assert.deepEqual(parseLocal(bad,{platform:'darwin'}),{error:'invalid'},bad);
});

test('a relative link is resolved against the folder of the document, with Windows separators too',()=>{
 assert.deepEqual(parseLocal('..\\docs\\a.pdf',{baseDir:'/Users/x/work',platform:'darwin'}),{path:'/Users/x/docs/a.pdf'});
 assert.deepEqual(parseLocal('./sub/a.pdf',{baseDir:'/Users/x/work',platform:'linux'}),{path:'/Users/x/work/sub/a.pdf'});
 assert.deepEqual(parseLocal('..\\docs\\a.pdf',{baseDir:'C:\\Users\\x\\work',platform:'win32'}).path,path.resolve('C:\\Users\\x\\work','..\\docs\\a.pdf'));
 assert.deepEqual(parseLocal('../a.pdf',{platform:'darwin'}),{error:'relative'},'document not saved yet');
});

test('programs, scripts and installers are never opened',()=>{
 for(const name of ['a.exe','a.EXE','a.bat','a.cmd','a.com','a.msi','a.sh','a.command','a.app','a.js','a.vbs','a.ps1','a.jar','a.scr','a.lnk','a.url','a.hta','a.pkg','a.dmg','a.py',
  'report.pdf.exe','invoice.exe.pdf','a.exe.','a.exe ','/Users/x/Applications/Tool.app','C:\\x\\run.bat'])assert.equal(denied(name),true,name);
 for(const name of ['a.pdf','a.xlsx','a.docx','photo.JPG','a.b.pdf','archive.zip','notes.txt'])assert.equal(denied(name),false,name);
 assert.equal(denied('README'),true,'a file without extension');
 assert.equal(denied('Documents',{needExtension:false}),false,'a folder');
});

test('only existing local files and folders resolve, never through a symbolic link to a program',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo-link-'));
 try{
  const mk=(name,body='x',mode)=>{const p=path.join(dir,name);fs.writeFileSync(p,body);if(mode)fs.chmodSync(p,mode);return p;};
  const pdf=mk('doc.pdf'),exe=mk('tool.exe'),script=mk('run.sh','#!/bin/sh\n',0o755),bare=mk('Makefile');
  fs.mkdirSync(path.join(dir,'folder'));fs.mkdirSync(path.join(dir,'Tool.app'));fs.mkdirSync(path.join(dir,'docs'));mk('docs/a.pdf');
  const real=fs.realpathSync(dir);
  assert.deepEqual(await resolveLocal(pdf),{path:path.join(real,'doc.pdf')});
  assert.deepEqual(await resolveLocal('file://'+pdf.split(path.sep).map(encodeURIComponent).join('/'),{platform:process.platform}),{path:path.join(real,'doc.pdf')});
  assert.deepEqual(await resolveLocal(path.join(dir,'folder')),{path:path.join(real,'folder')});
  assert.deepEqual(await resolveLocal('../docs/a.pdf',{baseDir:path.join(dir,'folder')}),{path:path.join(real,'docs','a.pdf')});
  for(const denied of [exe,script,bare,path.join(dir,'Tool.app')])assert.deepEqual(await resolveLocal(denied),{error:'denied'},denied);
  assert.deepEqual(await resolveLocal(path.join(dir,'missing.pdf')),{error:'missing'});
  assert.deepEqual(await resolveLocal(path.join(dir,'missing.exe')),{error:'denied'});
  if(process.platform!=='win32'){
   const link=path.join(dir,'harmless.pdf');fs.symlinkSync(exe,link);
   assert.deepEqual(await resolveLocal(link),{error:'denied'},'symbolic link to a program');
   const dangling=path.join(dir,'dangling.pdf');fs.symlinkSync(path.join(dir,'nowhere.pdf'),dangling);
   assert.deepEqual(await resolveLocal(dangling),{error:'missing'});
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('the opener hands a local link to the local handler, and never to openExternal',async()=>{
 const external=[],local=[];
 const h=handler(url=>external.push(url),()=>{},url=>local.push(url));
 for(const url of ['file:///Users/x/doc.pdf','/Users/x/doc.pdf','C:\\x\\doc.pdf','..\\docs\\a.pdf'])assert.deepEqual(h({url}),{action:'deny'});
 for(const url of ['https://example.org/','mailto:a@b.c'])h({url});
 h({url:'javascript:alert(1)'});h({url:'data:text/html,x'});h({url:'relative.docx'});
 await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(local,['file:///Users/x/doc.pdf','/Users/x/doc.pdf','C:\\x\\doc.pdf','..\\docs\\a.pdf']);
 assert.deepEqual(external,['https://example.org/','mailto:a@b.c']);
 assert.equal(validate('file:///tmp/document.docx'),null,'validate still refuses file: for openExternal');
 // without a local handler (a window that must not open files) the link is refused as before
 const none=[];handler(url=>none.push(url))({url:'file:///tmp/a.pdf'});await new Promise(r=>setTimeout(r,5));assert.deepEqual(none,[]);
});

test('a failing local handler reports the error',async()=>{
 const errors=[];
 handler(()=>{},e=>errors.push(e),()=>{throw Error('boom')})({url:'/tmp/a.pdf'});
 await new Promise(r=>setTimeout(r,10));assert.equal(errors.length,1);
});

test('the editor reaches the application through its bridge, which asks natively before opening (Chromium blocks file: URLs from the page)',()=>{
 const root=path.join(__dirname,'../../desktop');
 const preload=fs.readFileSync(path.join(root,'preload.cjs'),'utf8'),main=fs.readFileSync(path.join(root,'main.cjs'),'utf8');
 assert.match(preload,/openLocalLink: url => ipcRenderer\.invoke\('eo:open-local-link', url\)/);
 const line=main.split('\n').find(l=>l.includes("handle('open-local-link'"));
 assert(line,'main registers the bridge');
 assert.match(line,/isLocalLink\(url\)/,'only local links are accepted');
 assert.match(line,/openLocalLink\(document,url\)/,'the same path as a link opened by the page: native question, file checks');
 const opener=main.slice(main.indexOf('async function openLocalLink'),main.indexOf('function dispatchDocumentAction'));
 assert(opener.indexOf('showMessageBox')<opener.indexOf('shell.openPath'),'the question comes before the file is opened');
});
