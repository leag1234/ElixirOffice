// SPDX-License-Identifier: AGPL-3.0-only
// Explicit real-font integration gate; requires own output directory and installed public fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const product=path.resolve(new URL('../..',import.meta.url).pathname);
const sdk=process.env.EO_SDKJS,work=process.env.EO_FONT_WORK;
assert(sdk&&work,'Set EO_SDKJS and EO_FONT_WORK');
const {Fonts}=require(path.join(product,'desktop/fonts.cjs'));
const resolver=require(path.join(product,'desktop/font-resolver.js'));
const sfnt=require(path.join(product,'desktop/font-sfnt.cjs'));
const fixture=path.join(work,'fixtures');await fs.mkdir(fixture,{recursive:true});
const sources=[
 process.env.EO_FONT_TTC,
 process.env.EO_FONT_VARIABLE,
 process.env.EO_FONT_ARABIC_REGULAR,
 process.env.EO_FONT_ARABIC_BOLD,
 process.env.EO_FONT_CJK_PRIMARY,
 process.env.EO_FONT_STATIC_VARIANT
];
assert(sources.every(Boolean),'Provide TTC, variable, Arabic regular/bold primary CJK and static-variant fixture paths');
for(const source of sources)await fs.copyFile(source,path.join(fixture,path.basename(source)));
const fonts=new Fonts();fonts.allowed=[fixture];
fonts.configure({cacheDir:path.join(work,'index-cache'),bundled:path.join(product,'desktop/assets'),bundleIdentity:'S2-public-baseline'});
const index=await fonts.index();
assert(index.system.some(f=>f.bytes>20*1024*1024),'Real over20MiB collection must be indexed');
assert(index.system.some(f=>f.faceIndex>>>16),'Real named variable instances must be indexed');
assert(!JSON.stringify(index).includes(fixture),'Public catalogue must not expose paths');
const ttc=index.system.filter(f=>f.family.startsWith('Noto Serif CJK'));
assert(ttc.length>=5);assert.equal(new Set(ttc.map(f=>f.fileId)).size,1);
const one=await fonts.read(ttc[0].id),two=await fonts.read(ttc[1].id);
assert.equal(one,two,'Physical TTC bytes must be shared in main');
const store=new Map(),reads=new Map();let permission=true;
const window={Common:{},Asc:{editor:{}},console,document:{},performance:{now:()=>0},
 localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 location:{href:'https://desktop.test/editor/'},EOFontResolver:resolver,
 AscFonts:{FontStyle:{FontStyleRegular:0,FontStyleBold:1,FontStyleItalic:2,FontStyleBoldItalic:3},
  CreateFontData2:()=>({data:new Uint8Array(1),size:1}),FontStream:function(data,size){this.data=data;this.size=size;}},
 AscCommon:{g_font_loader:{LoadDocumentFonts(){}},AscBrowser:{}}
};
window.parent={eoDesktop:{
 fontConsent:async()=>permission,fontPermission:async()=>permission,
 fonts:async()=>index.system,font:async id=>{const f=index.system.find(f=>f.id===id);reads.set(f.fileId,(reads.get(f.fileId)||0)+1);return fonts.read(id);}
}};
const context=vm.createContext({window,AscFonts:window.AscFonts,AscCommon:window.AscCommon,console,
 Uint8Array,ArrayBuffer,DataView,TextEncoder,TextDecoder,URL,Response,Blob,Map,Set,performance:window.performance,
 define:(_deps,fn)=>fn(),setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref();return t;},clearTimeout,
 setInterval,clearInterval,fetch:()=>{throw Error('Network is forbidden in this gate');}});
async function script(file){vm.runInContext(await fs.readFile(file,'utf8'),context,{filename:file});}
await script(path.join(sdk,'common/libfont/character.js'));
await script(path.join(product,'desktop/assets/sdkjs/common/AllFonts.js'));
await script(path.join(sdk,'common/Drawings/Externals.js'));
await script(path.join(sdk,'common/libfont/manager.js'));
const A=window.AscFonts;window.AscCommon.g_font_loader.fontFiles=A.g_font_files;
A.g_fontApplication={g_fontDictionary:{FD_Substitutes:{Calibri:['Carlito']}},
 GetSubstituteList:name=>name==='Calibri'?['Carlito']:[],
 GetFontFile:name=>({m_wsFontName:name}),GetFontFileWeb:name=>({m_wsFontName:name})};
A.g_fontApplication.GetFontInfo=name=>A.g_font_infos[A.g_map_font_index[A.g_fontApplication.GetFontFileWeb(name).m_wsFontName]];
await script(path.join(sdk,'common/GlobalLoaders.js'));
window.AscCommon.g_font_loader.Api={asyncFontsDocumentStartLoaded(){},asyncFontsDocumentEndLoaded(){window.Asc.editor.asyncMethodCallback?.();}};
await script(path.join(product,'desktop/assets/desktop-home/localfonts-Core.js'));
const LF=window.Common.ElixirLocalFonts;LF.setConsent(true);
const renderer=await fs.readFile(path.join(product,'desktop/renderer.js'),'utf8');
const rendererSetup=vm.createContext({eoDesktop:{fontPermission:async()=>permission,fontIndex:async()=>index},
 script:async(_frame,url)=>script(path.join(product,'desktop',url.slice(1))),t:key=>key,status(){throw Error('Unexpected renderer font warning');}});
vm.runInContext(renderer.slice(renderer.indexOf('async function installFonts('),renderer.indexOf('async function drainPending(')),rendererSetup);
assert.equal(await rendererSetup.installFonts(window),true);
const policy=LF.desktopPolicy;
assert(A.g_map_font_index['Noto Serif CJK TC']!==undefined,'Actual renderer setup must register fallback families before returning to document parsing');
assert.equal(A.g_fontApplication.GetFontFileWeb('Calibri').m_wsFontName,'Carlito');
const picker=A.FontPickerByCharacter;
for(let i=1;i<picker.Ranges.length;i++)assert(picker.Ranges[i-1].End<picker.Ranges[i].Start,'Ranges must stay sorted and disjoint');
assert.equal(picker.getFontBySymbol(0xf0b7),'');assert.equal(picker.getFontBySymbol(0xf0001),'');
assert.equal(policy.fallback('DejaVu Sans',2,0x633,'DejaVu Sans').family,'Noto Sans Arabic');
assert.equal(policy.fallback('DejaVu Sans',0,0x633,'DejaVu Sans').family,'DejaVu Sans');
for(const [name,cp] of [['Noto Serif CJK JP',0x3042],['Noto Serif CJK TC',0x4e00],['Noto Serif CJK KR',0xac00]])
 assert.equal(policy.fallback(name,0,cp,'').family,name);
picker.getFontBySymbol(0x633);assert(picker.FontsByRange['Noto Sans Arabic'],'Fallback must be preloaded');
await script(path.join(sdk,'common/clientpdf/clientpdf.js'));
await script(path.join(sdk,'common/clientpdf/wasm-fonts.js'));
const service=window.EOWasmFonts,get=window.AscCommon.ClientPdf.fonts.get;
const requests=[{name:'Noto Serif CJK JP',style:0},{name:'Noto Serif CJK TC',style:0}];
const selected=await service.ensureFonts(requests);
assert.equal(selected.missing.length,0,JSON.stringify(selected.missing));
assert(selected.written[1].faceIndex>0&&selected.written[1].faceIndex<65536,'Cold TTC must retain nonzero collection face');
assert.equal(selected.written[0].path,selected.written[1].path);
assert.equal(selected.bytes,one.length);
const collectionLoaders=requests.map(request=>A.g_font_infos[A.g_map_font_index[request.name]].GetFontID(window.AscCommon.g_font_loader,request.style).file);
assert.equal(collectionLoaders[0].stream_index,collectionLoaders[1].stream_index,'Editor native font streams must share the physical TTC as well as frame/FS bytes');assert.equal(reads.get(ttc[0].fileId),1,'Desktop bridge must read the shared TTC once');
const variable=index.system.find(f=>f.variable&&f.style==='Bold');assert(variable);
const variableInfo=A.g_font_infos[A.g_map_font_index[variable.family]];
const coldFace=variableInfo.GetFontID(window.AscCommon.g_font_loader,1).faceIndex;
const bold=await get(variable.family,1);assert(bold);
assert.equal(coldFace,0);assert.equal(bold.faceIndex,0,'Named Bold is ineligible: the actual engine must use default Regular');
assert.equal(bold.needBold,true);assert.equal(bold.variableUnsupported,false);
assert.equal(variableInfo.indexB,-1,'Filtering only the pure resolver is insufficient; no nondefault Bold slot may be registered');
const inspection=service.inspectFace(bold.bytes,bold.faceIndex);
assert.equal(inspection.weight,400);assert.equal(inspection.nonDefault,false);
const defaultNamed=index.system.find(font=>font.variable&&font.instanceDefault&&(font.faceIndex>>>16));assert(defaultNamed);
const nativeDefault=service.selection([{...bold,name:variable.family,faceIndex:defaultNamed.faceIndex,style:0,path:'/fonts/default.ttf'}]);
const nativeView=new DataView(nativeDefault.buffer,nativeDefault.byteOffset,nativeDefault.byteLength);
let record=8;record+=4+nativeView.getInt32(record,true);record+=4;record+=4+nativeView.getInt32(record,true);
assert.equal(nativeView.getInt32(record,true),0,'Native default named instance must serialize the collection ordinal');
assert.equal(service.inspectFace(bold.bytes,variable.faceIndex).weight,700,'Rejected named metadata is still parsed correctly');
const rejectedAlias=index.system.find(f=>f.variable&&f.style==='Medium');assert(rejectedAlias);
assert.equal(A.g_map_font_index[rejectedAlias.fullName],undefined,'Nondefault Medium must not register');
const safeMedium=A.g_fontApplication.GetFontFileWeb(rejectedAlias.fullName,0).m_wsFontName;
assert.equal(safeMedium,variable.family);
const medium=await get(safeMedium,0);assert.equal(medium.faceIndex,0);assert.equal(medium.needBold,false);
const alias=index.system.find(f=>!f.variable&&f.style==='Book');assert(alias);
const aliasFont=await get(alias.fullName,0);assert(aliasFont);assert.equal(aliasFont.faceIndex,0);
const fsFiles=new Map();
await service.prepareFS({FS:{mkdirTree(){},writeFile:(name,bytes)=>fsFiles.set(name,bytes)}},requests);
assert.equal(fsFiles.size,2);assert.equal(fsFiles.get('/fonts/font0.ttf').length,one.length);
assert.throws(()=>service.inspectFace(one,65535),/collection/);
assert.throws(()=>service.inspectFace(one,0x7fff0000),/variable|instance/);
const ineligible={...bold,name:rejectedAlias.fullName,faceIndex:rejectedAlias.faceIndex,path:'/fonts/rejected.ttf',style:0,variableUnsupported:true};
assert.throws(()=>service.selection([ineligible]),/nondefault variable instance/);
const acceptedVariable=await service.ensureFonts([{name:variable.family,style:0},{name:variable.family,style:1}]);
assert.equal(acceptedVariable.missing.length,0);assert.equal(acceptedVariable.written.length,2);
assert(acceptedVariable.written.every(font=>font.faceIndex===0));assert.equal(acceptedVariable.written[1].needBold,true);
await script(path.join(sdk,'common/clientpdf/eo-pdf.js'));
const fontkit=require(path.join(sdk,'common/clientpdf/vendor/fontkit/fontkit.umd.min.js'));
const writer=new window.EOPdf.Writer({fontkit,getFont:async()=>ineligible});
const text=Buffer.from(rejectedAlias.fullName,'utf16le'),size=Buffer.alloc(2);size.writeUInt16LE(text.length/2);
const drawing=Buffer.concat([Buffer.from([202,41]),size,text,Buffer.from([83]),Buffer.alloc(16),Buffer.from([203])]);
await assert.rejects(writer.feed(new Uint8Array(drawing)),error=>error.code==='font-variable-instance');
// The above injected state is unreachable through normal registration; retain both PDF guards as defense.
// Execute the actual SDK manager and private glyph-picker methods; only the native font-open boundary is replaced.
const opened=new Map(),manager=Object.create(A.CFontManager.prototype);
manager.m_oFontsCache={LockFont(stream,id,face,size,ext){
 const key=id+'#'+face+'#'+ext;
 if(!opened.has(key))opened.set(key,{m_pFaceInfo:{family_name:'physical base family'},m_fSize:size,m_unHorDpi:72,m_unVerDpi:72,
  SetNeedBold(value){this.needBold=value;},SetNeedItalic(value){this.needItalic=value;},
  SetStringGID(){},SetCharSpacing(){},CheckHintsSupport(){},IsBold(){return false;},IsItalic(){return false;},
  GetFamilyName(){return this.m_pFaceInfo.family_name;}});
 return opened.get(key);
}};
const aliasInfo=A.g_font_infos[A.g_map_font_index[alias.fullName]];
const boundAlias=aliasInfo.LoadFont(window.AscCommon.g_font_loader,manager,12,0,72,72,undefined,true);
assert.equal(boundAlias.m_pFaceInfo.family_name,alias.fullName,'Physical alias must survive shaper family-name relookup');
const boundBase=variableInfo.LoadFont(window.AscCommon.g_font_loader,manager,12,1,72,72,undefined,true);
assert.equal(boundBase.m_pFaceInfo.family_name,variable.family);assert.equal(boundBase.needBold,true);
assert.notEqual(boundAlias,boundBase,'Distinct registered identities must not share a mutable face-info cache object');
let fileCode=await fs.readFile(path.join(sdk,'common/libfont/file.js'),'utf8');
fileCode=fileCode.replace("window['AscFonts'].EGlyphState","window['AscFonts'].TestPicker = CFontLoaderBySymbol;window['AscFonts'].EGlyphState");
vm.runInContext(fileCode,context);
const glyphPicker=new A.TestPicker();
const sourceFile=manager.LoadFont({stream_index:0,Id:'real-oblique-context'},0,12,false,true,false,false,true);
sourceFile.m_oFontManager=manager;sourceFile.m_fSize=12;sourceFile.m_unHorDpi=72;sourceFile.m_unVerDpi=72;
sourceFile.GetFamilyName=()=> 'Uncovered Arabic'; // Represents a missing glyph in the source face.
assert.equal(sourceFile.IsItalic(),false);assert.equal(sourceFile.eoRequestedStyle,2,'Logical Oblique request cannot be inferred from IsItalic literal name check');
const pickedItalic=glyphPicker.GetFontBySymbol(sourceFile,0x633);assert(pickedItalic);assert.equal(pickedItalic.eoFamily,'Noto Sans Arabic');assert.equal(pickedItalic.needItalic,true);
sourceFile.eoRequestedStyle=0;
const pickedRegular=glyphPicker.GetFontBySymbol(sourceFile,0x633);assert(pickedRegular);assert.equal(pickedRegular.needItalic,false);assert.notEqual(pickedRegular,pickedItalic,'Glyph fallback cache must include requested style');
assert.equal(glyphPicker.GetFontBySymbol(sourceFile,0xf0b7),null);
const shaper=await fs.readFile(path.join(sdk,'common/libfont/textshaper.js'),'utf8');
const flushStart=shaper.indexOf('CTextShaper.prototype.FlushWord = function()'),flushEnd=shaper.indexOf('CTextShaper.prototype.GetLigaturesType',flushStart);
vm.runInContext(shaper.slice(flushStart,flushEnd).replace('CTextShaper.prototype.FlushWord','window.TestFlushWord'),context);
const emittedNames=[];A.HB_SCRIPT={HB_SCRIPT_INHERITED:-1,HB_SCRIPT_COMMON:0};A.HB_ShapeString=()=>{};
window.AscCommon.FontNameMap={GetId:name=>{emittedNames.push(name);return 1;}};
window.AscCommon.g_oTextMeasurer={SetFontInternal:name=>emittedNames.push(name)};
window.TestFlushWord.call({Buffer:[65],EndString(){},GetDirection(){return 0;},ResetBuffer(){},
 GetFontInfo(){return {Name:alias.fullName,Style:0,Size:12};},FontSlot:0,FontId:boundAlias,Script:0,GetLigaturesType(){return 0;},ClearBuffer(){}});
assert(emittedNames.every(name=>name===alias.fullName),'Actual shaper must emit/relookup the registered variant identity');
vm.runInContext("String.prototype.getUnicodeIterator=function(){const chars=Array.from(this);let index=0;return {check:()=>index<chars.length,next:()=>index++,value:()=>chars[index].codePointAt(0)};};",context);
picker.UsedRanges=[];picker.LastRange=null;picker.FontsByRange={};picker.FontsByRangeCount=0;
const primary=index.system.find(face=>face.family==='Noto Sans CJK TC'),secondary=index.system.find(face=>face.family==='Noto Serif CJK TC');
assert(primary&&secondary);assert(!resolver.covers(primary,[0x4db6]));assert(resolver.covers(secondary,[0x4db6]));
assert.equal(policy.fallback('Noto Sans CJK TC',0,0x4db6,'').family,'Noto Serif CJK TC');
vm.runInContext("AscFonts.FontPickerByCharacter.getFontsByString(String.fromCodePoint(0x4e00,0x4db6,0x3042));",context);
assert(picker.FontsByRange['Noto Sans CJK SC']);assert(picker.FontsByRange['Noto Serif CJK JP']);assert(picker.FontsByRange['Noto Serif CJK TC']);assert(picker.FontsByRange['Noto Serif CJK KR']);
const loadedFamilies=Object.keys(picker.FontsByRange);
await new Promise((resolve,reject)=>{
 const deadline=setTimeout(()=>reject(Error('Actual fallback preloader timed out')),10000);
 picker.loadFonts(null,()=>{clearTimeout(deadline);resolve();});
});
for(const name of loadedFamilies){
 const info=A.g_font_infos[A.g_map_font_index[name]];
 for(let style=0;style<4;style++)assert.equal(info.GetFontID(window.AscCommon.g_font_loader,style).file.Status,0,'Every regional/style fallback must be loaded before synchronous glyph lookup: '+name);
}
const proofCases=[
 ['cjk-jp','Noto Serif CJK JP',0,'骨漢字あいう'],
 ['cjk-tc','Noto Serif CJK TC',0,'骨漢字'],
 ['variable-regular',variable.family,0,'Hamburgefonts 012345'],
 ['variable-medium-policy',safeMedium,0,'Hamburgefonts 012345'],
 ['variable-bold-policy',variable.family,1,'Hamburgefonts 012345'],
 ['arabic-italic','Noto Sans Arabic',2,'السلام عليكم العربية']
];
for(const [key,name,style,text] of proofCases){
 const directory=path.join(work,'wasm-input',key);await fs.mkdir(path.join(directory,'fonts'),{recursive:true});
 // Snapshot only the production service's returned files; no native full inventory.
 const snapshot=new Map();
 const physical=await service.prepareFS({FS:{mkdirTree(){},writeFile:(name,bytes)=>snapshot.set(name,bytes)}},[{name,style}]);
 for(const [file,bytes] of snapshot)await fs.writeFile(path.join(directory,file),bytes);
 const font=physical.written[0];
 await fs.writeFile(path.join(directory,'metadata.json'),JSON.stringify({name,style,text,
  path:font.path,faceIndex:font.faceIndex,needBold:font.needBold,needItalic:font.needItalic,
  axes:service.inspectFace(font.bytes,font.faceIndex).axes,fileKey:font.fileKey},null,2)+'\n');
}
permission=false;LF.setConsent(false);
const denied=await service.ensureFonts(requests);assert.equal(denied.written.length,0);
assert.equal(picker.LastRange,null);assert.equal(picker.FontsByRangeCount,0);
permission=true;LF.setConsent(true);
const priorGet=window.AscCommon.ClientPdf.fonts.get;
window.AscCommon.ClientPdf.fonts.get=async(...args)=>{const result=await priorGet(...args);permission=false;LF.setConsent(false);return result;};
const revoked=await service.ensureFonts([requests[0]]);assert.equal(revoked.written.length,0);
window.AscCommon.ClientPdf.fonts.get=priorGet;
await fs.writeFile(path.join(work,'real-font-result.json'),JSON.stringify({
 index:{system:index.system.length,bundled:index.bundled.length,stats:index.stats},
 ttc:selected.written.map(f=>({name:f.name,fileKey:f.fileKey,faceIndex:f.faceIndex,path:f.path})),
 ttcBytes:selected.bytes,bridgeReads:reads.get(ttc[0].fileId),
 variable:{family:variable.family,coldFace,loadedFace:bold.faceIndex,weight:inspection.weight,syntheticBold:bold.needBold,rejectedNamedFace:variable.faceIndex,mediumRequested:rejectedAlias.fullName,mediumResolved:safeMedium},
 alias:{name:alias.fullName,face:aliasFont.faceIndex},nativeEditor:'UNVERIFIED',
 nondefaultVariablePdf:'release review: excluded from resolver+actual registration; default/synthetic style used; both defense guards retained',
 results:'PASS real index/private main cache/actual SDK GetNeedInfo+cold loader/desktop byte sharing/production selected FS/TTC/named metadata/revocation/no network'
},null,2)+'\n');
fonts.clear();
console.log('PASS real TTC/default variable, engine alias/style/preload, byte budgets/revocation; release review default-only variable/synthetic policy PASS');
