// SPDX-License-Identifier: AGPL-3.0-only
// Actual generated packaged fonts and SDK loader/service; only HTTP transport is mapped to local fixtures.
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
fonts.configure({bundled:assets,cacheDir:path.join(work,'cache'),bundleIdentity:'S3-real-generated'});
const index=await fonts.index();
index.system.push({...index.system.find(f=>f.family==='Noto Sans Arabic'),family:'ELIXIR FALLBACK ARABIC',style:'Italic',fullName:'ELIXIR FALLBACK ARABIC Italic'});
assert.equal(index.bundled.filter(f=>f.source==='bundled').length,110);
assert.equal(index.bundled.filter(f=>f.source==='fallback').length,4);
assert(index.system.some(f=>f.family==='Noto Sans Arabic'));
assert(index.system.some(f=>f.family==='Noto Sans Sinhala'));
let allowed=false,privateCalls=0;
const store=new Map(),transports=[];
async function packaged(url){
 const parsed=new URL(url,'https://desktop.test/');
 assert.equal(parsed.origin,'https://desktop.test','No external font request');
 assert(/^\/fonts\/\d+$/.test(parsed.pathname),'Only packaged font transport is allowed');
 transports.push(parsed.pathname);
 return new Uint8Array(await fs.readFile(path.join(assets,parsed.pathname)));
}
class XHR{
 open(method,url){assert.equal(method,'GET');this.url=url;}
 overrideMimeType(){}
 send(){packaged(this.url).then(data=>{this.status=200;this.response=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);this.onload();}).catch(error=>{this.error=error;this.onerror();});}
}
const window={Common:{},Asc:{editor:{}},console,document:{},performance:{now:()=>0},
 localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 location:{href:'https://desktop.test/editor/'},EOFontResolver:resolver,
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
 define:(_deps,fn)=>fn(),performance:window.performance,setInterval,clearInterval,
 setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout,
 fetch:async url=>new Response(await packaged(url))});
async function script(file){vm.runInContext(await fs.readFile(file,'utf8'),context,{filename:file});}
await script(path.join(sdk,'common/libfont/character.js'));
await script(path.join(assets,'sdkjs/common/AllFonts.js'));
await script(path.join(sdk,'common/Drawings/Externals.js'));
await script(path.join(sdk,'common/libfont/manager.js'));
const A=window.AscFonts;
A.g_fontApplication={g_fontDictionary:{FD_Substitutes:{Calibri:['Carlito']}},
 GetSubstituteList:name=>name==='Calibri'?['Carlito']:[],
 GetFontFile:name=>({m_wsFontName:name}),GetFontFileWeb:name=>({m_wsFontName:name})};
A.g_fontApplication.GetFontInfo=name=>A.g_font_infos[A.g_map_font_index[A.g_fontApplication.GetFontFileWeb(name).m_wsFontName]];
await script(path.join(sdk,'common/GlobalLoaders.js'));
window.AscCommon.g_font_loader.fontFilesPath='/fonts/';
window.AscCommon.g_font_loader.Api={asyncFontsDocumentStartLoaded(){},asyncFontsDocumentEndLoaded(){window.Asc.editor.asyncMethodCallback?.();}};
await script(path.join(product,'desktop/assets/desktop-home/localfonts-Core.js'));
const LF=window.Common.ElixirLocalFonts;LF.setConsent(false);
const picker=A.FontPickerByCharacter;
for(const [cp,family] of [[0x633,'Elixir Fallback Arabic'],[0x6d2,'Elixir Fallback Arabic'],[0xd85,'Elixir Fallback Sinhala']]){
 assert.equal(picker.getFontBySymbol(cp),family);
 const info=A.g_font_infos[A.g_map_font_index[family]];
 assert.equal(info.isLocalFont,undefined);
 for(const style of [0,1,2,3]){
  const id=info.GetFontID(window.AscCommon.g_font_loader,style),need=info.GetNeedInfo(style);
  assert.equal(id.faceIndex,0);assert.equal(!!need.needI,!!(style&2));assert.equal(!!need.needB,false);
 }
}
assert.equal(privateCalls,0);
vm.runInContext("String.prototype.getUnicodeIterator=function(){const chars=Array.from(this);let index=0;return {check:()=>index<chars.length,next:()=>index++,value:()=>chars[index].codePointAt(0)};};",context);
vm.runInContext("AscFonts.FontPickerByCharacter.getFontsByString('السلام اردو සිංහල');",context);
await new Promise((resolve,reject)=>{
 const deadline=setTimeout(()=>reject(Error('Actual packaged preloader timed out')),10000);
 picker.loadFonts(null,()=>{clearTimeout(deadline);resolve();});
});
for(const name of resolver.fallbackFamilies){
 const info=A.g_font_infos[A.g_map_font_index[name]];
 for(const style of [0,1,2,3])assert.equal(info.GetFontID(window.AscCommon.g_font_loader,style).file.Status,0);
}
await script(path.join(sdk,'common/clientpdf/clientpdf.js'));
await script(path.join(sdk,'common/clientpdf/wasm-fonts.js'));
const service=window.EOWasmFonts;
const cases=[
 ['arabic-regular','Elixir Fallback Arabic',0,'السلام عليكم العربية'],
 ['arabic-italic','Elixir Fallback Arabic',2,'السلام عليكم العربية'],
 ['arabic-bold-italic','Elixir Fallback Arabic',3,'السلام عليكم العربية'],
 ['urdu-italic','Elixir Fallback Arabic',2,'اردو زبان میں خوش آمدید'],
 ['sinhala-regular','Elixir Fallback Sinhala',0,'සිංහල භාෂාව පාසල'],
 ['sinhala-italic','Elixir Fallback Sinhala',2,'සිංහල භාෂාව පාසල'],
 ['sinhala-bold-italic','Elixir Fallback Sinhala',3,'සිංහල භාෂාව පාසල']
];
for(const [key,name,style,text] of cases){
 const directory=path.join(work,'wasm-input',key);await fs.mkdir(path.join(directory,'fonts'),{recursive:true});
 const snapshot=new Map();
 const selected=await service.prepareFS({FS:{mkdirTree(){},writeFile:(name,bytes)=>snapshot.set(name,bytes)}},[{name,style}]);
 assert.equal(selected.missing.length,0);assert.equal(selected.written.length,1);
 const font=selected.written[0];
 assert.equal(font.source,'server','Packaged bytes never require local consent');
 assert.equal(font.needItalic,!!(style&2));
 assert.equal(require(path.join(product,'desktop/font-sfnt.cjs')).inspect(Buffer.from(font.bytes),0).variable,false);
 for(const [name,bytes] of snapshot)await fs.writeFile(path.join(directory,name),bytes);
 await fs.writeFile(path.join(directory,'metadata.json'),JSON.stringify({name,style,text,path:font.path,
  faceIndex:font.faceIndex,needBold:font.needBold,needItalic:font.needItalic,axes:{},fileKey:font.fileKey},null,2)+'\n');
}
assert.equal(privateCalls,0,'Disabled system fonts must not enumerate/read through the bridge');
allowed=true;LF.setConsent(true);
await script(path.join(product,'desktop/computer-fonts.js'));
const policy=window.EOComputerFonts.install(index);
await LF.readList();LF.register();
assert(A.g_map_font_index['Noto Sans Arabic']!==undefined,'Packaged fallback must not block same-script system registration');
assert(A.g_map_font_index['Noto Sans Sinhala']!==undefined);
assert.equal(A.g_map_font_index['ELIXIR FALLBACK ARABIC'],undefined,'Reserved normalized fallback namespace cannot register system aliases');
assert.equal(policy.fallback('DejaVu Sans',0,0x633,'').family,'DejaVu Sans','Existing bundled requested face retains priority');
assert.equal(policy.fallback('Calibri',0,65,'').family,'Carlito','Metric substitute retains priority');
for(const [cp,name] of [[0x633,'Noto Sans Arabic'],[0xd85,'Noto Sans Sinhala']]){
 assert.equal(policy.fallback('',2,cp,'').family,name);
 assert.equal(picker.getFontBySymbol(cp),name,'Ranges must prefer system over small packaged fallback');
}
allowed=false;LF.setConsent(false);
assert.equal(picker.getFontBySymbol(0x633),'Elixir Fallback Arabic');
assert.equal(picker.getFontBySymbol(0xd85),'Elixir Fallback Sinhala');
const revoked=await service.ensureFonts([{name:'Elixir Fallback Arabic',style:3}]);
assert.equal(revoked.missing.length,0);
await fs.writeFile(path.join(work,'bundled-result.json'),JSON.stringify({existingFaces:110,fallbackFaces:4,
 packagedTransports:transports.length,privateBridgeCalls:privateCalls,permissionOffAndRevocation:'PASS',
 systemPriority:'PASS',syntheticItalic:'Actual SDK GetNeedInfo and production FS PASS; real converter follows',
 nativeEditor:'UNVERIFIED'},null,2)+'\n');
fonts.clear();
console.log('PASS actual generated packaged fonts/SDK preload/style/selected FS without consent; system priority and revocation');
