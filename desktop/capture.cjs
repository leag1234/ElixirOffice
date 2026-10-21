// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function parse(args){
 const index=args.indexOf('--capture-screens');
 if(index<0){if(args.includes('--locales'))throw Error('--locales requires --capture-screens');return null}
 const folder=args[index+1];if(!folder||folder.startsWith('--')||folder.includes('\0'))throw Error('Capture output folder required');
 let locales=['en','fr'];const seen=new Set();
 for(let i=0;i<args.length;i++){
  const flag=args[i];if(seen.has(flag))throw Error('Duplicate capture option');seen.add(flag);
  if(flag==='--capture-screens'){i++;continue}
  if(flag==='--locales'){const value=args[++i];if(!value||!/^[a-z]+(?:-[a-z]+)*(?:,[a-z]+(?:-[a-z]+)*)*$/.test(value))throw Error('Invalid capture locales');locales=value.split(',');continue}
  throw Error('Capture mode accepts only capture options, never document paths');
 }
 if(new Set(locales).size!==locales.length||locales.length>45)throw Error('Invalid capture locale list');
 return {folder:path.resolve(folder),locales};
}
async function run(win,options){
 const invoke=(name,value)=>win.webContents.executeJavaScript('EODesktopCapture.'+name+'('+JSON.stringify(value===undefined?null:value)+')');
 const receipts=[];
 for(const language of options.locales){
  await invoke('locale',language);
  if(win.window||win.view){
   if(!win.window||!win.view)throw Error('Capture composition target unavailable');
   const shell=win.window.webContents;
   await shell.loadURL(shell.getURL());
   for(let i=0;i<100;i++){
    if(await shell.executeJavaScript('window.EOTabShellReady===true'))break;
    if(i===99)throw Error('Capture tab shell did not become ready');
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   if(await shell.executeJavaScript('document.documentElement.lang')!==language)throw Error('Capture tab shell language mismatch');
  }
  await invoke('start');
  for(const [view,action] of [['start',null],['home','document'],['file','backstage']]){
   if(action)await invoke(action);
   await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await new Promise(resolve=>setTimeout(resolve,400));
   const validation=await invoke('validate',view);
   let image,capture;
   if(win.window||win.view){
    if(win.webContents!==win.view?.webContents)throw Error('Capture document target mismatch');
    ({image,capture}=await require('./capture-composite.cjs').compose(win.window,win.view,{validate:win.validate,nativeImage:win.nativeImage}));
    capture.shellLanguage=await win.window.webContents.executeJavaScript('document.documentElement.lang');
    if(capture.shellLanguage!==language)throw Error('Capture tab shell language changed');
   }else{image=await win.webContents.capturePage();capture={kind:'document-only',nativeFrame:false};}
   const filename=language+'-'+view+'.png';
   if(image.isEmpty())throw Error('Empty application capture');
   await fs.writeFile(path.join(options.folder,filename),image.toPNG(),{flag:'wx'});
   receipts.push({language,view,file:filename,size:image.getSize(),validation,capture});
  }
 }
 await fs.writeFile(path.join(options.folder,'captures.json'),JSON.stringify({platform:process.platform,app:'ElixirOffice',screens:receipts},null,2)+'\n',{flag:'wx'});
 console.log('CAPTURES',options.folder,receipts.length);
}
module.exports={parse,run};
