// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function validate(value){
 if(typeof value!=='string'||value.length>8192||/[\u0000-\u0020\u007f]/.test(value))return null;
 let url;try{url=new URL(value)}catch{return null}
 if(['http:','https:'].includes(url.protocol))return url.hostname&&!url.username&&!url.password?url.href:null;
 if(url.protocol==='mailto:'&&url.pathname&&!url.host)return url.href;
 return null;
}
function handler(open,onError=()=>{}){
 return details=>{
  const url=validate(details.url);
  if(url)Promise.resolve().then(()=>open(url)).catch(onError);
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
module.exports={validate,handler,reporter};
