// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path');
function validate(value){
 if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f]/.test(value))return null;
 let url;try{url=new URL(value)}catch{return null}
 if(['http:','https:'].includes(url.protocol))return url.hostname&&!url.username&&!url.password?url.href:null;
 if(url.protocol==='mailto:'&&url.pathname&&!url.host)return url.href;
 return null;
}
// Links to files of this computer (file: URLs, absolute paths, paths relative to the document), as Excel stores them.
// A click is confirmed in the editor; the desktop application then opens the file with the system handler, only when
// it exists and is not a program: the files that run code are never opened from a link.
const DENIED=new Set(['exe','com','bat','cmd','msi','msp','mst','scr','pif','lnk','url','hta','cpl','reg','inf','dll','sys','drv','ocx','msc',
 'jar','jnlp','js','jse','mjs','cjs','vbs','vbe','wsf','wsh','ws','ps1','ps1xml','psm1','psd1','psc1','gadget','application','appref-ms','xll',
 'sh','bash','zsh','csh','ksh','fish','command','tool','run','bin','appimage','desktop','app','pkg','mpkg','dmg','workflow','action','scpt','scptd',
 'applescript','terminal','py','pyw','pl','rb','php','chm','apk','deb','rpm',
 'webloc','inetloc','fileloc','msix','msixbundle','appx','appxbundle','appinstaller','settingcontent-ms','library-ms',
 'searchconnector-ms','search-ms','diagcab','iso','img','vhd','vhdx','mof','scf','xbap','website','cab']);
const WINDOWS=/^[A-Za-z]:[\\/]/,UNC=/^\\\\[^\\/\s]+[\\/]/,POSIX=/^\/(?!\/)\S/,RELATIVE=/^\.{1,2}[\\/]/;
function isLocalLink(value){
 if(typeof value!=='string'||value.length>8192||/[\u0000-\u001f\u007f]/.test(value))return false;
 const v=value.trim();
 return /^file:/i.test(v)||WINDOWS.test(v)||UNC.test(v)||POSIX.test(v)||RELATIVE.test(v);
}
function denied(name,{needExtension=true}={}){
 // "report.pdf.exe", a trailing dot or space (Windows drops them), and for a file a missing extension: all refused
 const base=String(name).replace(/[. ]+$/,'').split(/[\\/]/).pop().toLowerCase();
 const parts=base.split('.');
 if(parts.length<2||!parts[parts.length-1])return needExtension;
 return parts.slice(1).some(part=>DENIED.has(part));
}
// The path of a local link, or {error}: 'invalid' (not a usable local link), 'relative' (relative link, document not saved)
function parseLocal(value,{baseDir=null,platform=process.platform}={}){
 if(!isLocalLink(value))return {error:'invalid'};
 const v=value.trim();let p;
 if(/^file:/i.test(v)){
  let url;try{url=new URL(v)}catch{return {error:'invalid'}}
  if(url.username||url.password||url.search||url.hash)return {error:'invalid'};
  try{
   if(platform==='win32')p=require('node:url').fileURLToPath(v,{windows:true});
   else{if(url.hostname&&url.hostname.toLowerCase()!=='localhost')return {error:'invalid'};p=require('node:url').fileURLToPath('file://'+url.pathname);}
  }catch{return {error:'invalid'}}
 }else if(RELATIVE.test(v)){
  if(!baseDir)return {error:'relative'};
  p=path.resolve(baseDir,platform==='win32'?v:v.replace(/\\/g,'/'));
 }else p=v;
 if(/[\u0000-\u001f\u007f]/.test(p))return {error:'invalid'};
 return {path:p};
}
async function resolveLocal(value,{baseDir=null,platform=process.platform}={},fs=require('node:fs/promises')){
 const parsed=parseLocal(value,{baseDir,platform});
 if(parsed.error)return parsed;
 if(denied(parsed.path,{needExtension:false}))return {error:'denied'};
 let real,stat;
 try{real=await fs.realpath(parsed.path);stat=await fs.stat(real)}catch{return {error:'missing'}}
 // a link to a program is a program: judge the file the link leads to, not only its name
 if(stat.isDirectory()){if(denied(real,{needExtension:false}))return {error:'denied'};}
 else if(!stat.isFile()||denied(parsed.path)||denied(real))return {error:'denied'};
 return {path:real};
}
function handler(open,onError=()=>{},local){
 return details=>{
  const url=validate(details.url);
  if(url)Promise.resolve().then(()=>open(url)).catch(onError);
  else if(local&&isLocalLink(details.url))Promise.resolve().then(()=>local(details.url)).catch(onError);
  return {action:'deny'};
 };
}
// The slide show window of Presenter View: the editor opens its own packaged page with window.open and talks to it
// through the opener, so only that exact page of this app may open, as a plain sandboxed window.
const REPORTER=/^\/example\/local-assets\/web-apps\/apps\/presentationeditor\/main\/index\.reporter\.html$/;
function reporter(details,origin){
 let url;try{url=new URL(details.url)}catch{return null}
 if(typeof origin!=='string'||url.protocol+'//'+url.host!==origin||!REPORTER.test(url.pathname)||url.username||url.password||url.hash)return null;
 if([...url.searchParams.keys()].some(key=>key!=='lang')||!/^[A-Za-z0-9_-]{0,16}$/.test(url.searchParams.get('lang')||''))return null;
 return {action:'allow',overrideBrowserWindowOptions:{width:960,height:640,title:'ElixirOffice',autoHideMenuBar:true,
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false}}};
}
module.exports={validate,handler,reporter,isLocalLink,parseLocal,resolveLocal,denied};
