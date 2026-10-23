// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createReadStream}=require('node:fs'),{Readable}=require('node:stream'),{pathToFileURL}=require('node:url');
const SCHEME='eoapp',HOST='desktop.elixiroffice.invalid',ORIGIN=SCHEME+'://'+HOST;
const MIME={'.html':'text/html','.htm':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.bmp':'image/bmp','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'};
function policy(editor){
 const scripts=editor?"'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'":"'self'";
 return ["default-src 'none'",'script-src '+scripts,"style-src 'self' 'unsafe-inline'","img-src 'self' blob: data:","font-src 'self' blob: data:","connect-src 'self' blob: data:","worker-src 'self' blob:","frame-src 'self'","media-src 'self' blob: data:","object-src 'none'","base-uri 'none'","form-action 'none'"].join('; ');
}
function resolve(url,assets,shell){
 let relative;try{relative=decodeURIComponent(url.pathname)}catch{return {status:400}}
 let root;
 if(['/tabs.html','/tabs.js','/tabs.css','/index.html','/renderer.js','/release-banner.js','/compact-editor.js','/style.css','/pdf.js','/home.js','/backstage.js','/ai.js','/errors.js','/pdf-compat.js','/feedback.js','/feedback.css','/font-resolver.js','/computer-fonts.js'].includes(relative)){root=shell;relative=relative.slice(1)}
 else if(/^\/example\/local-assets\/sdkjs\/common\/desktop\/(pdf|legacy-worker)\.js$/.test(relative)){root=shell;relative=path.basename(relative)}
 else if(relative.startsWith('/example/local-assets/')){
  root=assets;relative=relative.slice('/example/local-assets/'.length).replace(/^\d+\.\d+\.\d+-[a-f0-9]+\//,'');
  if(!/^(sdkjs|web-apps|fonts|dictionaries|desktop-home)\//.test(relative))return {status:404};
 }else return {status:404};
 if(relative.split('/').some(part=>part.startsWith('.')||part.includes('\\')))return {status:403};
 relative=relative.split('/').filter(Boolean).join('/');
 const filename=path.resolve(root,relative);if(!filename.startsWith(path.resolve(root)+path.sep))return {status:403};
 return {root,relative,filename};
}
function byteRange(value,length){
 if(!value)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!match||(!match[1]&&!match[2])||length===0)return false;
 const first=match[1]?Number(match[1]):Math.max(0,length-Number(match[2]));
 const last=match[1]?(match[2]?Math.min(Number(match[2]),length-1):length-1):length-1;
 if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first>=length||last<first||(!match[1]&&Number(match[2])===0))return false;
 return {start:first,end:last};
}
async function response(request,assets,shell,transport){
 const url=new URL(request.url);
 // Node's URL.origin is null for custom schemes; compare the complete authority.
 if(url.protocol!==SCHEME+':'||url.host!==HOST||url.username||url.password||!['GET','HEAD'].includes(request.method))return new Response('Blocked',{status:403});
 const item=resolve(url,assets,shell);if(item.status)return new Response('Missing',{status:item.status});
 const {root,relative,filename}=item;
 try{
  const record=transport&&root===assets?transport.files[relative]:null;
  if(transport&&root===assets&&!record)return new Response('Missing',{status:404});
  let body=null,length=record?.bytes,range=null;
  const requested=request.method==='GET'?request.headers?.get('range'):null;
  if(requested&&!relative.endsWith('.html')){
   const stat=await fs.stat(filename);
   if(!stat.isFile()||!(await fs.realpath(filename)).startsWith(await fs.realpath(root)+path.sep))return new Response('Blocked',{status:403});
   length=stat.size;range=byteRange(requested,length);
   if(range===false)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+length,'Accept-Ranges':'bytes'}});
  }
  if(range){
   body=Readable.toWeb(createReadStream(filename,{start:range.start,end:range.end}));
  }else if(relative.endsWith('.html')&&root===assets){
   if(!transport?.html.has(filename)){
    const bytes=Buffer.from((await fs.readFile(filename)).toString().replace(/(?:\.\.\/)+sdkjs\//g,'/example/local-assets/sdkjs/').replace(/'serviceWorker' in navigator/g,'false'));
    if(transport)transport.html.set(filename,bytes);else body=bytes;
   }
   body=transport?transport.html.get(filename):body;length=body.length;
  }else if(transport){
   const file=await transport.fetch(pathToFileURL(filename).href);
   if(!file.ok)return new Response('Missing',{status:404});
   body=file.body;const declared=file.headers.get('content-length');length=length??(declared===null?undefined:Number(declared));
  }else{
   const stat=await fs.stat(filename);if(!stat.isFile())return new Response('Missing',{status:404});
   length=stat.size;if(request.method!=='HEAD')body=Readable.toWeb(createReadStream(filename));
  }
  if(request.method==='HEAD'&&body?.cancel)await body.cancel();
  const headers={'Content-Type':MIME[path.extname(filename)]||'application/octet-stream','Content-Security-Policy':policy(root===assets||relative==='legacy-worker.js'),'X-Content-Type-Options':'nosniff','Cache-Control':root===assets?'public, max-age=31536000, immutable':'no-store'};
  if(Number.isFinite(length)){
   headers['Content-Length']=String(range?range.end-range.start+1:length);
   headers['Accept-Ranges']='bytes';
   if(range)headers['Content-Range']='bytes '+range.start+'-'+range.end+'/'+length;
  }
  return new Response(request.method==='HEAD'?null:body,{status:range?206:200,headers});
 }catch(error){return new Response('Missing',{status:error.code==='ENOENT'?404:500})}
}
function createFileFetch({net,session,capture=false,identity}){
 if(!capture)return url=>net.fetch(url);
 // net.fetch creates a persistent default-session network context. Keep capture
 // file reads in memory so its shutdown cannot recreate a removed private profile.
 const isolated=session.fromPartition('elixiroffice-capture-transport-'+identity,{cache:false});
 return url=>{
  if(new URL(url).protocol!=='file:')throw Error('Capture file transport accepts only local files');
  return isolated.fetch(url);
 };
}
async function createHandler(assets,shell,fetch){
 const manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json'),'utf8'));
 const transport={files:manifest.files,html:new Map(),fetch};
 return request=>response(request,assets,shell,transport);
}
module.exports={SCHEME,ORIGIN,response,policy,createHandler,createFileFetch,byteRange};
