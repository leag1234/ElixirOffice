// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('actual font Core and SDK polling settle after one lazy font read fails, while another face loads',async()=>{
 const product=path.resolve(__dirname,'../..'),upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
 const sdk=fs.readFileSync(path.join(product,'desktop/assets/sdkjs/word/sdk-all.js'),'utf8');
 function actualFunction(pattern){
  const match=pattern.exec(sdk);assert(match,'Expected SDK font method: '+pattern);
  const start=sdk.indexOf('function',match.index),brace=sdk.indexOf('{',start);let depth=0,quote=null,escaped=false;
  for(let i=brace;i<sdk.length;i++){
   const char=sdk[i];
   if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote=null;continue}
   if(char==='"'||char==="'"){quote=char;continue}
   if(char==='{')depth++;else if(char==='}'&&--depth===0)return sdk.slice(start,i+1);
  }
  assert.fail('Unterminated SDK font method');
 }
 const streams=[],warnings=[],reads=[],storage=new Map();
 const fontRoot=path.join(product,'desktop/assets/fonts'),fontFile=fs.readdirSync(fontRoot).sort().find(name=>fs.statSync(path.join(fontRoot,name)).isFile());
 assert(fontFile,'Bundled public font fixture');const bytes=fs.readFileSync(path.join(fontRoot,fontFile));
 const context={console:{warn:()=>warnings.push('font-read-failed')},Buffer,Uint8Array,Blob,performance:{now:()=>0},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},
  document:{},navigator:{},isLoadFontsSync:false,g_fonts_streams:streams,AscCommon:{},AscFonts:{g_font_infos:[],g_font_files:[],g_map_font_index:{},FontStream:function(data,size){this.data=data;this.size=size;}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  eoDesktop:{fontConsent:async()=>true,fontPermission:async()=>true,fonts:async()=>[
   {family:'Public Broken',fullName:'Public Broken',style:'Regular',postscriptName:'PublicBroken',id:'broken'},
   {family:'Public Readable',fullName:'Public Readable',style:'Regular',postscriptName:'PublicReadable',id:'readable'}],
   font:async id=>{reads.push(id);if(id==='broken')throw Object.assign(Error('Injected font read denial'),{code:'EPERM'});return new Uint8Array(bytes)}}};
 context.window=context;context.AscFonts.g_fontApplication={GetFontInfo:name=>context.AscFonts.g_font_infos[context.AscFonts.g_map_font_index[name]]};
 vm.createContext(context);
 for(const name of ['CFontFileLoader','CFontInfo','CFont'])vm.runInContext(actualFunction(new RegExp('function\\s+'+name+'\\s*\\(')),context);
 for(const method of ['CheckLoaded','SetStreamIndex','LoadFontFromData'])vm.runInContext('CFontFileLoader.prototype.'+method+'='+actualFunction(new RegExp('CFontFileLoader\\.prototype\\.'+method+'\\s*=\\s*function')),context);
 vm.runInContext('CFontInfo.prototype.CheckFontLoadStyles='+actualFunction(/["']CheckFontLoadStyles["']\s*:\s*function/),context);
 Object.assign(context.AscFonts,{CFontFileLoader:context.CFontFileLoader,CFontInfo:context.CFontInfo,CFont:context.CFont});
 vm.runInContext(fs.readFileSync(path.join(upstream,'sdkjs/common/GlobalLoaders.js'),'utf8'),context);
 context.define=(_dependencies,factory)=>factory();
 vm.runInContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-localfonts/Core.js'),'utf8'),context);
 const local=context.Common.ElixirLocalFonts;local.docFonts=['Public Broken','Public Readable'];
 let timer;try{
  await Promise.race([local.enable({}),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Lazy font failure blocked SDK LoadFonts')),1500)})]);
 }finally{clearTimeout(timer)}
 assert.equal(local.status,'on');assert.deepEqual(reads.sort(),['broken','readable']);assert.equal(warnings.length,1);
 assert.deepEqual(Array.from(context.AscFonts.g_font_files,loader=>loader.Status),[1,0]);
 assert.equal(context.AscCommon.g_font_loader.loadFontsCounter,0);assert.equal(streams.length,1);assert.equal(streams[0].data.length,bytes.length);
});

test('actual font Core plus desktop installer reports no readable fonts but keeps a readable partial list silent',async()=>{
 const product=path.resolve(__dirname,'../..'),upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
 const renderer=fs.readFileSync(path.join(product,'desktop/renderer.js'),'utf8'),start=renderer.indexOf('async function installFonts('),end=renderer.indexOf('\nasync function ',start+1);
 assert(start>=0&&end>start);
 for(const readable of [false,true]){
  const storage=new Map(),messages=[],context={Buffer,Uint8Array,Blob,setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},document:{},navigator:{},AscCommon:{},AscFonts:{},
   localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
   eoDesktop:{fontPermission:async()=>true,fontConsent:async()=>true,fontIndex:async()=>({system:[],bundled:[]}),fonts:async()=>readable?[{id:'public',family:'Public Readable',fullName:'Public Readable',style:'Regular',postscriptName:'PublicReadable'}]:[]},
   script:async()=>{},t:key=>key==='fontFailed'?'Localized computer-font failure':key,status:value=>messages.push(value)};
  context.window=context;context.define=(_deps,factory)=>factory();vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(upstream,'web-apps/apps/common/main/lib/elixir-localfonts/Core.js'),'utf8'),context);
  context.EOComputerFonts={install(){}};
  vm.runInContext(renderer.slice(start,end)+'\nthis.installFonts=installFonts;',context);
  const result=await context.installFonts(context,true),local=context.Common.ElixirLocalFonts;
  assert.equal(result,readable);
  if(readable){assert.equal(context.EOComputerFontWarning,null);assert.notEqual(local.status,'error');assert.equal(messages.length,0)}
  else{assert.equal(local.status,'error');assert.equal(local.hasConsent(),false);assert.equal(context.EOComputerFontWarning,'Localized computer-font failure');assert.equal(messages.length,1)}
 }
});
