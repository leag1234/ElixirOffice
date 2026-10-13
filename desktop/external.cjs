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
module.exports={validate,handler};
