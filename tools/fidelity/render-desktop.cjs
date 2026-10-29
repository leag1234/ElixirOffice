// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// One owned Linux display, profile and temporary source copy per invocation.
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const [input,executableArg,outputArg,xvfbArg,playwrightArg,fontMode]=process.argv.slice(2);
assert(input&&executableArg&&outputArg&&xvfbArg&&playwrightArg,'Usage: render-desktop.cjs INPUT EXECUTABLE OUTPUT XVFB PLAYWRIGHT');
assert.equal(process.platform,'linux');
assert(['bundled-only','system-allowed'].includes(fontMode),'Explicit valid font mode required');
const output=path.resolve(outputArg);
process.env.EO_DESKTOP_ROOT=output;
process.env.EO_TEST_FONT_DECLINED=fontMode==='bundled-only'?'1':'0';
process.env.EO_PLAYWRIGHT=path.resolve(playwrightArg);
const crypto=require('node:crypto');
const {launch,stop,editable}=require('../../tests/desktop/harness.cjs');
let env,display,displayLog,closing;
async function cleanup(){
 if(closing)return closing;
 closing=(async()=>{
  if(env)await stop(env);
  if(display){display.kill('SIGTERM');await new Promise(resolve=>{if(display.exitCode!==null)return resolve();display.once('exit',resolve);setTimeout(resolve,3000).unref()});}
  if(displayLog)await displayLog.close();
  await fs.rm(path.join(output,'profiles'),{recursive:true,force:true});
  await fs.rm(path.join(output,'input'),{recursive:true,force:true});
 })();return closing;
}
process.once('SIGTERM',()=>cleanup().finally(()=>process.exit(143)));
process.once('SIGINT',()=>cleanup().finally(()=>process.exit(130)));
(async()=>{
 await fs.mkdir(path.join(output,'input'),{recursive:true});
 const file=path.join(output,'input',path.basename(input));
 await fs.copyFile(input,file);
 await fs.writeFile(path.join(output,'desktop.Xauthority'),'');
 displayLog=await fs.open(path.join(output,'display.log'),'w');
 display=cp.spawn(xvfbArg,['-screen','0','1360x960x24','-nolisten','tcp','-displayfd','1'],{stdio:['ignore','pipe',displayLog.fd]});
 try{
  const number=await new Promise((resolve,reject)=>{
   let data='';const timer=setTimeout(()=>reject(Error('Owned display startup timeout')),20000);
   const finish=(error,value)=>{clearTimeout(timer);error?reject(error):resolve(value)};
   display.stdout.on('data',chunk=>{data+=chunk;if(data.includes('\n'))finish(null,data.trim())});
   display.once('error',error=>finish(error));display.once('exit',code=>finish(Error('Owned display exited '+code)));
  });
  assert(/^\d+$/.test(number));process.env.EO_DESKTOP_DISPLAY=':'+number;
  const profile='differential-'+crypto.randomUUID();
  if(fontMode==='system-allowed'){
   const directory=path.join(output,'profiles',profile);await fs.mkdir(directory,{recursive:true});
   await fs.writeFile(path.join(directory,'desktop-settings.json'),JSON.stringify({recents:[],fontConsent:true,fontChoice:'granted',releaseNotice:{enabled:false}})+'\n',{flag:'wx',mode:0o600});
  }
  env=await launch({file,executable:path.resolve(executableArg),profile,
   onSpawn:async application=>{
    const stat=await fs.readFile('/proc/'+application.pid+'/stat','utf8');
    await fs.writeFile(path.join(output,'owned-app.json'),JSON.stringify({pid:application.pid,start:stat.slice(stat.lastIndexOf(')')+1).trim().split(/\s+/)[19]}));
   }});
  const ready=await editable(env);
  const fontState=await env.page.evaluate(async mode=>{
   const permission=await eoDesktop.fontPermission();
   if(permission!==(mode==='system-allowed'))throw Error('Font consent mode mismatch');
   if(permission){
    const index=await eoDesktop.fontIndex(false);
    const session=EOLocalSession,w=session.win,fonts=w.Common.ElixirLocalFonts;
    if(!w.EOComputerFonts||!fonts)throw Error('Desktop font interface unavailable');
    w.EOComputerFonts.install(index);
    await fonts.enable(session.api);
    if(!fonts.desktopPolicy||fonts.status!=='on')throw Error('System font refresh did not settle');
   }
   const warning=EOLocalSession.win.EOComputerFontWarning;
   if(warning)throw Error('Computer font bridge reported a failure');
   return{mode,permission,choice:await eoDesktop.fontChoice()};
  },fontMode);
  await env.page.waitForFunction(()=>{
   const w=window.EOLocalSession?.win,e=w?.Asc?.editor;
   if(!e)return false;
   const l=e.WordControl?.m_oLogicDocument;
   return !e.isLongAction?.()&&!(l?.FullRecalc?.Id);
  },null,{timeout:120000});
  const pdf=await env.page.evaluate(async()=>{
   const session=EOLocalSession,w=session.win;
   const load=url=>new Promise((ok,no)=>{const tag=w.document.createElement('script');tag.src=url;tag.onload=ok;tag.onerror=()=>no(Error('Local PDF script unavailable'));w.document.head.append(tag)});
   if(!w.EOClientPdf)await load('/example/local-assets/sdkjs/common/clientpdf/clientpdf.js');
   if(!w.EOWasmPdf)await load('/example/local-assets/sdkjs/common/clientpdf/wasm-pdf.js');
   if(!w.EODesktopPdf)await load('/example/local-assets/sdkjs/common/desktop/pdf.js');
   const value=await w.EODesktopPdf(session.api,session.format);
   return{bytes:Array.from(value.bytes),stats:value.stats};
  });
  assert.equal(pdf.stats.backend,'wasm');assert(pdf.bytes.length>0);
  assert.deepEqual(env.errors,[]);
  const external=env.requests.filter(r=>!['eoapp:','blob:','data:'].some(prefix=>r.url.startsWith(prefix))||r.method!=='GET');
  assert.deepEqual(external,[],'Unexpected network/mutating request');
  await fs.writeFile(path.join(output,'candidate.pdf'),Buffer.from(pdf.bytes));
  await fs.writeFile(path.join(output,'render.json'),JSON.stringify({status:'rendered',fontState,format:ready.format,stats:pdf.stats,errors:env.errors,externalRequests:external},null,2)+'\n');
 }finally{await cleanup()}
})().catch(error=>{console.error(error);process.exitCode=1});
