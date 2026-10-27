// SPDX-License-Identifier: AGPL-3.0-only
// Real generated pan-CJK assets, common SDK lazy loader and desktop system-font policy.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),product=path.resolve(new URL('../..',import.meta.url).pathname);
const sdk=process.env.EO_SDKJS,work=process.env.EO_FONT_WORK,assets=process.env.EO_FONT_ASSETS,system=process.env.EO_FONT_SYSTEM_DIRECTORY;
assert(sdk&&work&&assets&&system,'Set EO_SDKJS, EO_FONT_WORK, EO_FONT_ASSETS and EO_FONT_SYSTEM_DIRECTORY');
await fs.mkdir(work,{recursive:true});
const resolver=require(path.join(product,'desktop/font-resolver.js'));
const {Fonts}=require(path.join(product,'desktop/fonts.cjs'));
const fonts=new Fonts();fonts.allowed=[system];
fonts.configure({bundled:assets,cacheDir:path.join(work,'cache'),bundleIdentity:'CJK-real-generated'});
const index=await fonts.index();
assert.equal(index.bundled.filter(face=>face.source==='bundled').length,110);
assert.equal(index.bundled.filter(face=>face.source==='fallback').length,24);
for(const region of ['JP','SC','TC','KR']){
 assert(index.bundled.some(face=>face.family==='Elixir Fallback CJK '+region&&face.styleCode===0));
 assert(index.system.some(face=>face.family==='Noto Sans CJK '+region));
}

let allowed=false,privateCalls=0;
const store=new Map(),transports=[];
async function packaged(url){
 const parsed=new URL(url,'https://local.test/');
 assert.equal(parsed.origin,'https://local.test','CJK fonts must remain same-origin');
 assert(/^\/fonts\/\d+$/.test(parsed.pathname),'Only generated font assets may be fetched');
 transports.push(parsed.pathname);
 return new Uint8Array(await fs.readFile(path.join(assets,parsed.pathname)));
}
class XHR{
 open(method,url){assert.equal(method,'GET');this.url=url;}
 overrideMimeType(){}
 send(){packaged(this.url).then(data=>{this.status=200;this.response=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);this.onload();}).catch(error=>{this.error=error;this.onerror();});}
}
const window={Common:{},Asc:{editor:{DocInfo:{get_OfflineApp:()=>true},asc_enterText(){}}},console,document:{},performance:{now:()=>0},
 localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
 location:{href:'https://local.test/editor/'},EOFontResolver:resolver,
 AscFonts:{FontStyle:{FontStyleRegular:0,FontStyleBold:1,FontStyleItalic:2,FontStyleBoldItalic:3},
  CreateFontData2:()=>({data:new Uint8Array(1),size:1}),FontStream:function(data,size){this.data=data;this.size=size;}},
 AscCommon:{g_font_loader:{LoadDocumentFonts(){}},AscBrowser:{}}
};
window.parent={eoDesktop:{
 fontPermission:async()=>allowed,fontConsent:async()=>allowed,
 fonts:async()=>{privateCalls++;assert(allowed);return index.system;},
 font:async id=>{privateCalls++;assert(allowed);return fonts.read(id);}
}};
const context=vm.createContext({window,AscFonts:window.AscFonts,AscCommon:window.AscCommon,console,
 Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,Response,Blob,Map,Set,XMLHttpRequest:XHR,
 define:(_deps,factory)=>factory(),performance:window.performance,setInterval,clearInterval,
 setTimeout:(callback,delay)=>{const timer=setTimeout(callback,delay);timer.unref();return timer;},clearTimeout,
 fetch:async url=>new Response(await packaged(url))});
async function script(file){vm.runInContext(await fs.readFile(file,'utf8'),context,{filename:file});}
await script(path.join(sdk,'common/libfont/character.js'));
await script(path.join(assets,'sdkjs/common/AllFonts.js'));
await script(path.join(sdk,'common/Drawings/Externals.js'));
await script(path.join(sdk,'common/libfont/manager.js'));
const A=window.AscFonts;
A.g_fontApplication={FontPickerMap:{},g_fontDictionary:{FD_Substitutes:{}},GetSubstituteList:()=>[],GetFontFile:name=>({m_wsFontName:name})};
A.g_fontApplication.GetFontFileWeb=function(name){return this.FontPickerMap[name]||{m_wsFontName:name};};
A.g_fontApplication.GetFontInfo=name=>A.g_font_infos[A.g_map_font_index[A.g_fontApplication.GetFontFileWeb(name).m_wsFontName]];
await script(path.join(sdk,'common/GlobalLoaders.js'));
window.AscCommon.g_font_loader.fontFilesPath='/fonts/';
window.AscCommon.g_font_loader.Api={asyncFontsDocumentStartLoaded(){},asyncFontsDocumentEndLoaded(){window.Asc.editor.asyncMethodCallback?.();}};
await script(path.join(product,'desktop/assets/desktop-home/localfonts-Core.js'));
const LF=window.Common.ElixirLocalFonts;LF.setConsent(false);
const picker=A.FontPickerByCharacter,expected=[[0x3042,'JP'],[0x3105,'TC'],[0x4e00,'SC'],[0xac00,'KR']];
await new Promise((resolve,reject)=>{
 const deadline=Date.now()+5000;
 const check=()=>picker.__elixirCjkLazy?resolve():Date.now()>=deadline?reject(Error('CJK lazy hook installation timed out')):setTimeout(check,25);
 check();
});
assert.equal(transports.length,0,'AllFonts metadata must not eagerly fetch either CJK collection');
const covered=[...expected,[0x1100,'KR'],[0xFF76,'JP']];
for(const [codepoint,region] of covered){
 const family='Elixir Fallback CJK '+region;
 assert.equal(picker.getFontBySymbol(codepoint),family);
 const info=A.g_font_infos[A.g_map_font_index[family]];assert(info);
 for(const style of [0,1,2,3]){
  const selected=info.GetFontID(window.AscCommon.g_font_loader,style),need=info.GetNeedInfo(style);
  assert.equal(selected.faceIndex,['JP','KR','SC','TC'].indexOf(region));
  assert.equal(!!need.needI,!!(style&2));assert.equal(!!need.needB,false);
 }
}
assert.equal(privateCalls,0);
assert.equal(transports.length,0,'document-open symbol lookup must remain lazy until content scan');
picker.getFontsByString2(covered.map(([codepoint])=>codepoint));
await new Promise((resolve,reject)=>{
 const deadline=Date.now()+15000;
 const check=()=>{
  if(!window.AscCommon.g_font_loader.isFontLoadInProgress())return resolve();
  if(Date.now()>=deadline)return reject(Error('Automatic local CJK lazy loader timed out'));
  setTimeout(check,25);
 };
 setTimeout(check,0);
});
const cjkTransports=[];
for(const resource of transports)if((await fs.stat(path.join(assets,resource))).size>19_000_000)cjkTransports.push(resource);
assert.equal(new Set(cjkTransports).size,2,'One shared Regular and one shared Bold OTC are lazy-loaded');
assert.equal(cjkTransports.length,2,'Each generated OTC is fetched once');
const fetched=transports.length;
await new Promise(resolve=>window.AscCommon.g_font_loader.LoadFonts(
 ['Elixir Fallback CJK JP','Elixir Fallback CJK SC','Elixir Fallback CJK TC','Elixir Fallback CJK KR'],resolve));
assert.equal(transports.length,fetched,'Loaded CJK assets are reused without another request');
assert.equal(privateCalls,0,'Fallback loading must not read private computer fonts');

allowed=true;LF.setConsent(true);
await script(path.join(product,'desktop/computer-fonts.js'));
const policy=window.EOComputerFonts.install(index);
await LF.readList();LF.register();
for(const [codepoint,region] of expected){
 const selected=policy.fallback('',2,codepoint,'Elixir Fallback CJK '+region);
 assert.equal(selected.family,'Noto Sans CJK '+region);assert.equal(selected.source,'system');
 assert.equal(picker.getFontBySymbol(codepoint),'Noto Sans CJK '+region);
}
allowed=false;LF.setConsent(false);
for(const [codepoint,region] of expected)assert.equal(picker.getFontBySymbol(codepoint),'Elixir Fallback CJK '+region);
await script(path.join(sdk,'common/clientpdf/clientpdf.js'));
await script(path.join(sdk,'common/clientpdf/wasm-fonts.js'));
const service=window.EOWasmFonts,pdfSelections=[];
for(const [,region] of expected){
 const snapshot=new Map(),style=region==='JP'?3:0;
 const selected=await service.prepareFS({FS:{mkdirTree(){},writeFile:(name,bytes)=>snapshot.set(name,bytes)}},
  [{name:'Elixir Fallback CJK '+region,style}]);
 assert.equal(selected.missing.length,0);assert.equal(selected.written.length,1);
 const font=selected.written[0];assert.equal(font.source,'server');
 assert.equal(font.faceIndex,['JP','KR','SC','TC'].indexOf(region));
 assert.equal(font.needItalic,region==='JP');assert.equal(font.needBold,false);
 assert(snapshot.has(font.path));assert(font.bytes.length>19_000_000);
 pdfSelections.push({region,faceIndex:font.faceIndex,needItalic:font.needItalic,bytes:font.bytes.length});
}
await fs.writeFile(path.join(work,'cjk-result.json'),JSON.stringify({fallbackFaces:24,
 regions:expected.map(([,region])=>region),lazySameOriginRequests:cjkTransports,
 repeatedRequests:transports.length-fetched,systemPriority:'PASS',revocation:'PASS',syntheticItalic:'PASS',pdfSelections},null,2)+'\n');
fonts.clear();
console.log('PASS regional CJK fallback, same-origin lazy cache, system priority, italic and revocation');
