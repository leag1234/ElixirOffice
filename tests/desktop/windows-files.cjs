// SPDX-License-Identifier: AGPL-3.0-only
// Run on the owner Windows PC/VM; Linux cannot establish Windows filesystem semantics.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const files=require('../../desktop/files.cjs');
(async()=>{
 assert.equal(process.platform,'win32','This acceptance test requires native Windows');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eo-windows-files-'));
 try{
  const target=path.join(directory,'MixedCase.docx');
  await fs.writeFile(target,'PK original');
  const stat=await fs.stat(target,{bigint:true}),handle=await fs.open(target,'r');
  try {const opened=await handle.stat({bigint:true});assert(stat.ino>0n);assert.equal(opened.ino,stat.ino);assert.equal(opened.dev,stat.dev)} finally {await handle.close()}
  const selected=await files.read(target.toUpperCase());
  const mode=(await fs.stat(target)).mode&0o200;
  await files.atomic(target.toLowerCase(),Buffer.from('PK saved'),selected);
  assert.equal((await fs.readFile(target)).toString(),'PK saved');
  assert.equal((await fs.stat(target)).mode&0o200,mode);
  const longTarget=path.join(directory,'x'.repeat(Math.max(1,230-directory.length-6))+'.docx');
  await fs.writeFile(longTarget,'PK original');const before=await fs.readdir(directory);
  await assert.rejects(files.atomic(longTarget,Buffer.from('PK unsafe')),/Windows path is too long/);
  assert.equal(await fs.readFile(longTarget,'utf8'),'PK original');assert.deepEqual(await fs.readdir(directory),before);
  await assert.rejects(files.read(path.join(directory,'x'.repeat(260)+'.docx')),/Windows path is too long/);
  const actual=path.join(directory,'actual'),junction=path.join(directory,'junction');
  await fs.mkdir(actual);await fs.writeFile(path.join(actual,'public.docx'),'PK original');
  await fs.symlink(actual,junction,'junction');
  await assert.rejects(files.atomic(path.join(junction,'public.docx'),Buffer.from('PK unsafe')),/symbolic-link folder/);
  assert.equal((await fs.readFile(path.join(actual,'public.docx'))).toString(),'PK original');
  const fileLink=path.join(directory,'linked.docx');
  try{await fs.symlink(target,fileLink,'file')}catch(error){
    if(['EPERM','EACCES'].includes(error.code)) console.error('UNVERIFIED final-file symlink refusal: creating the fixture requires Windows Developer Mode or an elevated test session');
    throw error;
  }
  await assert.rejects(files.read(fileLink),/symbolic link|ELOOP/);
  await assert.rejects(files.atomic(fileLink,Buffer.from('PK unsafe')),/regular file/);
  assert.equal((await fs.readFile(target)).toString(),'PK saved');
  console.log('PASS native Windows path casing, writable mode, atomic replacement, junction and final-file symlink refusal');
 }finally{await fs.rm(directory,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
