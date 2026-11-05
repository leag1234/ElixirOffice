// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Pictures pasted from a web page arrive as remote URLs. The editor cannot fetch them (offline CSP, CORS), so
// the main process downloads the bytes once, on the user's paste or explicit "insert from URL"; the editor then
// decodes them and stores them in the document like a picture inserted from a file, never as a link.
const dns=require('node:dns').promises,net=require('node:net');
const MAX_BYTES=20*1024*1024,MAX_REDIRECTS=3,TIMEOUT=15000;
const TYPES=/^image\/(?:png|jpeg|gif|bmp|webp|svg\+xml)$/;

function privateAddress(address){
 if(net.isIPv4(address)){
  const [a,b]=address.split('.').map(Number);
  return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127;
 }
 const v=address.toLowerCase();
 if(v.startsWith('::ffff:'))return privateAddress(v.slice(7));
 return v==='::'||v==='::1'||/^f[cd]/.test(v)||/^fe[89ab]/.test(v)||v.startsWith('ff');
}
async function publicUrl(source){
 let url;try{url=new URL(source)}catch{throw Error('The picture URL is not valid.')}
 if(!['http:','https:'].includes(url.protocol))throw Error('Picture URLs must use HTTP or HTTPS.');
 if(url.username||url.password)throw Error('Picture URLs cannot contain credentials.');
 const host=url.hostname.replace(/^\[|\]$/g,'');
 const addresses=net.isIP(host)?[host]:(await dns.lookup(host,{all:true,verbatim:true})).map(entry=>entry.address);
 if(!addresses.length||addresses.some(privateAddress))throw Error('Pictures from local network addresses are not downloaded.');
 return url;
}
function create({session}){
 // A separate in-memory session: no cookies, cache or credentials of the app or of any site.
 const ses=session.fromPartition('eo-pasted-images',{cache:false});
 async function fetchPicture(source){
  if(typeof source!=='string'||source.length>8192)throw Error('The picture URL is too long.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT);
  try{
   let url=await publicUrl(source),response;
   for(let hop=0;;hop++){
    response=await ses.fetch(url.href,{redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal});
    if(response.status<300||response.status>=400)break;
    const location=response.headers.get('location');
    if(!location||hop>=MAX_REDIRECTS)throw Error('The picture URL redirects too many times.');
    url=await publicUrl(new URL(location,url).href);
   }
   if(!response.ok)throw Error('The picture could not be downloaded.');
   const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(!TYPES.test(type))throw Error('The pasted link is not a supported picture.');
   if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Pictures must be smaller than 20 MiB.');
   const reader=response.body.getReader(),parts=[];let length=0;
   for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>MAX_BYTES){await reader.cancel();throw Error('Pictures must be smaller than 20 MiB.');}parts.push(part.value);}
   const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
   return bytes;
  }catch(error){if(controller.signal.aborted)throw Error('The picture download timed out.');throw error;}
  finally{clearTimeout(timer);}
 }
 return {fetch:fetchPicture};
}
module.exports={create,privateAddress};
