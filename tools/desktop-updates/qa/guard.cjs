// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {APP_ID,PRODUCT,NSIS_GUID,hash,safePath,read,fail}=require('./manifest.cjs');
function regular(root,name){
 if(!safePath(name))fail();let p=root;
 for(const part of name.split('/')){p=path.join(p,part);if(fs.lstatSync(p).isSymbolicLink())fail();}
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
 try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size>32*1024*1024)fail();return fs.readFileSync(fd);}finally{fs.closeSync(fd);}
}
function list(root){
 const names=[];
 function walk(folder,prefix){
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
   const name=prefix+entry.name;if(!safePath(name))fail();
   if(entry.isSymbolicLink())fail();
   if(entry.isDirectory()){
    if(!prefix&&['node_modules','assets','dist'].includes(entry.name))continue;
    walk(path.join(folder,entry.name),name+'/');
   }else if(entry.isFile())names.push(name);else fail();
  }
 }
 walk(root,'');return names.sort();
}
function sourcePackageHash(bytes){
 let p;try{p=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 delete p.qaManifestSha256;return hash(Buffer.from(JSON.stringify(p)+'\n'));
}
function packageHash(bytes){
 let p;try{p=JSON.parse(bytes.toString('utf8'));}catch{fail();}
 // The pinned builder26.15.3 strips build-only package metadata. Hash the
 // remaining actual runtime metadata; source builds additionally hash all fields.
 delete p.qaManifestSha256;
 for(const key of ['dist','gitHead','build','jspm','ava','xo','nyc','eslintConfig','contributors','bundleDependencies','tags','scripts','keywords','devDependencies'])delete p[key];
 for(const key of Object.keys(p))if(key.startsWith('_'))delete p[key];
 if(!Object.keys(p.dependencies||{}).some(k=>k.startsWith('babel')))delete p.babel;
 return hash(Buffer.from(JSON.stringify(p)+'\n'));
}
function verifyPrepared(root,expected){
 const bytes=regular(root,'qa/manifest.json');
 if(typeof expected!=='string'||hash(bytes)!==expected)fail();
 let compiled;try{compiled=JSON.parse(bytes);}catch{fail();}
 if(Object.keys(compiled).sort().join(',')!=='buildFiles,buildPackageSha256,files,input,inputSeal,schema'||compiled.schema!==1||
  !bytes.equals(Buffer.from(JSON.stringify(compiled)+'\n')))fail();
 const input=read(Buffer.from(JSON.stringify(compiled.input)+'\n'),compiled.inputSeal);
 if(!compiled.files||typeof compiled.files!=='object'||Array.isArray(compiled.files))fail();
 if(!compiled.buildFiles||typeof compiled.buildFiles!=='object'||Array.isArray(compiled.buildFiles)||
  Object.keys(compiled.buildFiles).some(n=>!['.gitignore','package-lock.json'].includes(n)))fail();
 const all=list(root).filter(n=>n!=='qa/manifest.json');
 const names=all.filter(n=>!Object.hasOwn(compiled.buildFiles,n));
 if(JSON.stringify(names)!==JSON.stringify(Object.keys(compiled.files).sort()))fail();
 for(const name of all.filter(n=>Object.hasOwn(compiled.buildFiles,n)))if(hash(regular(root,name))!==compiled.buildFiles[name])fail();
 for(const name of names){
  const actual=regular(root,name),digest=name==='package.json'?packageHash(actual):hash(actual);
  if(digest!==compiled.files[name])fail();
 }
 const packageBytes=regular(root,'package.json'),pkg=JSON.parse(packageBytes);
 if(pkg.build&&sourcePackageHash(packageBytes)!==compiled.buildPackageSha256)fail();
 if(pkg.qaManifestSha256!==expected||pkg.main!=='qa/entry.cjs'||pkg.name!=='elixiroffice-update-qa'||pkg.version!=='0.0.0-rc.'+input.currentBuild||
  pkg.qaIdentity?.appId!==APP_ID||pkg.qaIdentity.productName!==PRODUCT||pkg.qaIdentity.nsisGuid!==NSIS_GUID||
  (pkg.build&&(pkg.build.appId!==APP_ID||pkg.build.productName!==PRODUCT||pkg.build.nsis?.guid!==NSIS_GUID||pkg.build.publish!==null)))fail();
 return input;
}
module.exports={regular,list,packageHash,sourcePackageHash,verifyPrepared};
