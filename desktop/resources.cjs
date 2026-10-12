// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createReadStream}=require('node:fs'),{Readable}=require('node:stream'),{pathToFileURL}=require('node:url');
const SCHEME='eoapp',HOST='desktop.elixiroffice.invalid',ORIGIN=SCHEME+'://'+HOST;
const MIME={'.html':'text/html','.htm':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.otf':'font/otf'};
function policy(editor){
 const scripts=editor?"'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'":"'self'";
 return ["default-src 'none'",'script-src '+scripts,"style-src 'self' 'unsafe-inline'","img-src 'self' blob: data:","font-src 'self' blob: data:","connect-src 'self' blob: data:","worker-src 'self' blob:","frame-src 'self'","media-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'"].join('; ');
}
function resolve(url,assets,shell){
 let relative;try{relative=decodeURIComponent(url.pathname)}catch{return {status:400}}
 let root;
 if(['/index.html','/renderer.js','/style.css','/pdf.js'].includes(relative)){root=shell;relative=relative.slice(1)}
 else if(/^\/example\/local-assets\/sdkjs\/common\/desktop\/(pdf|legacy-worker)\.js$/.test(relative)){root=shell;relative=path.basename(relative)}
 else if(relative.startsWith('/example/local-assets/')){
  root=assets;relative=relative.slice('/example/local-assets/'.length).replace(/^\d+\.\d+\.\d+-[a-f0-9]+\//,'');
  if(!/^(sdkjs|web-apps|fonts|dictionaries)\//.test(relative))return {status:404};
 }else return {status:404};
 if(relative.split('/').some(part=>part.startsWith('.')||part.includes('\\')))return {status:403};
 relative=relative.split('/').filter(Boolean).join('/');
 const filename=path.resolve(root,relative);if(!filename.startsWith(path.resolve(root)+path.sep))return {status:403};
 return {root,relative,filename};
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
  let body=null,length=record?.bytes;
  if(relative.endsWith('.html')&&root===assets){
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
  if(Number.isFinite(length))headers['Content-Length']=String(length);
  return new Response(request.method==='HEAD'?null:body,{headers});
 }catch(error){return new Response('Missing',{status:error.code==='ENOENT'?404:500})}
}
async function createHandler(assets,shell,fetch){
 const manifest=JSON.parse(await fs.readFile(path.join(assets,'desktop-manifest.json'),'utf8'));
 const transport={files:manifest.files,html:new Map(),fetch};
 return request=>response(request,assets,shell,transport);
}
module.exports={SCHEME,ORIGIN,response,policy,createHandler};
