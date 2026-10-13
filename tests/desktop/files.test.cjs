// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const files=require('../../desktop/files.cjs');
test('atomic save preserves modes, rejects concurrent changes, and leaves original intact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-files-'));
 try {
  const filename=path.join(dir,'public.docx');await fs.writeFile(filename,'PK original',{mode:0o664});
  await fs.chmod(filename,0o664); // Establish the fixture mode independently of the build host's umask.
  const fixtureMode=(await fs.stat(filename)).mode&0o777;
  if(process.platform==='win32') assert(fixtureMode&0o200,'Windows fixture must be writable');
  else assert.equal(fixtureMode,0o664);
  const original=await files.read(filename),bytes=Buffer.from('PK edited');
  const saved=await files.atomic(filename,bytes,original);
  assert.equal((await fs.stat(filename)).mode&0o777,fixtureMode);assert.equal((await fs.readFile(filename)).toString(),'PK edited');
  await fs.writeFile(filename,'PK external');
  await assert.rejects(files.atomic(filename,Buffer.from('PK stale'),saved),/changed on disk/);
  assert.equal((await fs.readFile(filename)).toString(),'PK external');
  assert.deepEqual(await fs.readdir(dir),['public.docx']);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('symbolic link targets cannot grant file access or overwrite another file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-links-'));
 try{
  const original=path.join(dir,'original.docx'),link=path.join(dir,'link.docx');await fs.writeFile(original,'PK original');await fs.symlink(original,link);
  await assert.rejects(files.read(link));
  await assert.rejects(files.atomic(link,Buffer.from('PK edited')),/regular file/);
  assert.equal((await fs.readFile(original)).toString(),'PK original');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
test('unsupported format and oversized document rejected before exposing bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-size-'));
 try {
  await assert.rejects(files.read(path.join(dir,'secret.exe')),/Unsupported/);
  const big=path.join(dir,'big.docx');const f=await fs.open(big,'w');await f.truncate(512*1024*1024+1);await f.close();
  await assert.rejects(files.read(big),/512 MiB/);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test('a failed replacement retains a durable original backup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-backup-')),rename=fs.rename;
 try{
  const target=path.join(dir,'public.docx');await fs.writeFile(target,'PK original');
  fs.rename=async(from,to)=>{if(to===target)throw Object.assign(Error('Injected disk failure'),{code:'EIO'});return rename(from,to)};
  await assert.rejects(files.atomic(target,Buffer.from('PK edited')),/Original backup:/);
  assert.equal(await fs.readFile(target,'utf8'),'PK original');
  const entries=await fs.readdir(dir),backup=entries.find(name=>name.endsWith('.bak'));
  assert(backup);assert.equal(await fs.readFile(path.join(dir,backup),'utf8'),'PK original');assert(!entries.some(name=>name.endsWith('.tmp')));
 }finally{fs.rename=rename;await fs.rm(dir,{recursive:true,force:true})}
});
test('a concurrent edit after copying the backup is preserved',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-race-')),copy=fs.copyFile;
 try{
  const target=path.join(dir,'public.docx');await fs.writeFile(target,'PK original');
  fs.copyFile=async(from,to,flags)=>{await copy(from,to,flags);if(from===target)await fs.writeFile(target,'PK external')};
  await assert.rejects(files.atomic(target,Buffer.from('PK edited')),/changed before replacement.*Original backup:/);
  assert.equal(await fs.readFile(target,'utf8'),'PK external');
  const backup=(await fs.readdir(dir)).find(name=>name.endsWith('.bak'));
  assert.equal(await fs.readFile(path.join(dir,backup),'utf8'),'PK original');
 }finally{fs.copyFile=copy;await fs.rm(dir,{recursive:true,force:true})}
});

test('linked destination folders cannot redirect a save',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-folders-'));
 try{
  const actual=path.join(dir,'actual'),linked=path.join(dir,'linked');await fs.mkdir(actual);
  const document=path.join(actual,'public.docx');await fs.writeFile(document,'PK original');
  await fs.symlink(actual,linked,process.platform==='win32'?'junction':'dir');
  await assert.rejects(files.atomic(path.join(linked,'public.docx'),Buffer.from('PK edited')),/symbolic-link folder/);
  assert.equal((await fs.readFile(document)).toString(),'PK original');
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test('a replacement between selection and open cannot return another file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-open-race-')),open=fs.open;
 const target=path.join(dir,'public.docx'),retained=path.join(dir,'retained.docx');
 try{
  await fs.writeFile(target,'PK selected');
  fs.open=async(filename,...args)=>{
   if(filename===target){await fs.rename(target,retained);await fs.writeFile(target,'PK replacement')}
   return open(filename,...args);
  };
  await assert.rejects(files.read(target),/changed during open/);
  assert.equal(await fs.readFile(retained,'utf8'),'PK selected');
  assert.equal(await fs.readFile(target,'utf8'),'PK replacement');
 }finally{fs.open=open;await fs.rm(dir,{recursive:true,force:true})}
});

test('locked or inaccessible replacement reports recovery and preserves original/backup',async()=>{
 const rename=fs.rename;
 for(const code of ['EPERM','EBUSY']) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-locked-'));
  try {
   const target=path.join(dir,'public.docx');await fs.writeFile(target,'PK original');
   fs.rename=async(from,to)=>{if(to===target)throw Object.assign(Error('Replacement refused'),{code});return rename(from,to)};
   const error=await files.atomic(target,Buffer.from('PK edited')).then(()=>assert.fail('Replacement must fail'),error=>error);
   assert.equal(error.code,code);assert.match(error.message,/may be open.*permission.*Save As.*Original backup:/);
   assert.equal(await fs.readFile(target,'utf8'),'PK original');
   const backup=(await fs.readdir(dir)).find(name=>name.endsWith('.bak'));
   assert(backup);assert(error.message.includes(path.join(dir,backup)));
   assert.equal(await fs.readFile(path.join(dir,backup),'utf8'),'PK original');
   assert(!(await fs.readdir(dir)).some(name=>name.endsWith('.tmp')));
  }finally{fs.rename=rename;await fs.rm(dir,{recursive:true,force:true})}
 }
});
