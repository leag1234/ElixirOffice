// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const [directory,output]=process.argv.slice(2);assert(directory&&output,'Pass installer dist and a new extraction output directory');
 const dist=path.resolve(directory),out=path.resolve(output);
 assert(!fs.existsSync(out),'Choose a new extraction output directory');
 const config=require(path.join(root,'desktop/package.json'));
 const installer=path.join(dist,'ElixirOffice-'+config.version+'-win-x64.exe');
 assert(fs.statSync(installer).isFile());
 const zip=await require(path.join(root,'desktop/node_modules/app-builder-lib/out/toolsets/7zip')).getPath7za();
 fs.mkdirSync(out,{recursive:true});
 const run=(program,args)=>cp.execFileSync(program,args,{stdio:'inherit'});
 run(zip,['t',installer]);
 run(zip,['x',installer,'-o'+path.join(out,'installer')]);
 const archive=path.join(out,'installer','$PLUGINSDIR','app-64.7z');
 assert(fs.statSync(archive).size>0,'Missing x64 application payload');
 run(zip,['t',archive]);
 run(zip,['x',archive,'-o'+path.join(out,'payload')]);
 for(const base of [path.join(dist,'win-unpacked'),path.join(out,'payload')]){
  run(process.execPath,[path.join(root,'tools/desktop/check-version.cjs'),path.join(base,'resources/app.asar')]);
  run('python3',[path.join(root,'tests/desktop/verify-resources.py'),path.join(base,'resources/assets')]);
 }
 run(process.execPath,[path.join(root,'tests/desktop/windows-package.cjs'),dist,path.join(out,'payload')]);
 console.log('PASS Windows installer artifact acceptance; native Windows checks remain unverified');
})().catch(error=>{console.error(error);process.exitCode=1});
