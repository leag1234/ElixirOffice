// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Issue 65 with the data seen in the packaged 0.7.2 app (Linux, computer fonts granted, the reporter's static
// Open Sans files installed). Unit tests on synthetic names passed while the real app drew "Open Sans Bold"
// regular and "Open Sans SemiBold"/"ExtraBold" with overlapping glyphs. Every name, file index and load status
// below was read from the running app or from the real font files; keep them as they are.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const resolver=require('../../desktop/font-resolver.js');
const root=path.resolve(__dirname,'../..');
const coverage=[[32,0x24f],[0x2000,0x206f]];
// sdkjs/common/AllFonts.js of the 0.7.2 package: [family, R, faceR, I, faceI, B, faceB, BI, faceBI].
const allFonts=[['Carlito',17,0,16,0,14,0,15,0],['Open Sans',59,0,-1,-1,56,0,-1,-1],['Open Sans Extrabold',57,0,-1,-1,-1,-1,-1,-1],['Open Sans Light',58,0,-1,-1,-1,-1,-1,-1],['Open Sans Semibold',60,0,-1,-1,-1,-1,-1,-1]];
// desktop/fonts.cjs names() of the packaged Open Sans files (DocumentServer core-fonts, Open Sans 1.10): note
// the lower-case "Semibold"/"Extrabold".
const packagedNames={59:{style:'Regular',fullName:'Open Sans',postscriptName:'OpenSans',aliases:[]},56:{style:'Bold',fullName:'Open Sans Bold',postscriptName:'OpenSans-Bold',aliases:[]},
 57:{style:'Extrabold',fullName:'Open Sans Extrabold',postscriptName:'OpenSans-Extrabold',aliases:['Open Sans Extrabold']},58:{style:'Light',fullName:'Open Sans Light',postscriptName:'OpenSans-Light',aliases:['Open Sans Light']},
 60:{style:'Semibold',fullName:'Open Sans Semibold',postscriptName:'OpenSans-Semibold',aliases:['Open Sans Semibold']},17:{style:'Regular',fullName:'Carlito',postscriptName:'Carlito',aliases:[]},
 16:{style:'Italic',fullName:'Carlito Italic',postscriptName:'Carlito-Italic',aliases:[]},14:{style:'Bold',fullName:'Carlito Bold',postscriptName:'Carlito-Bold',aliases:[]},15:{style:'Bold Italic',fullName:'Carlito Bold Italic',postscriptName:'Carlito-BoldItalic',aliases:[]}};
// desktop/fonts.cjs names() of the reporter's files (Arch /usr/share/fonts/TTF/OpenSans-*.ttf, Open Sans 3.x:
// ID 1 "Open Sans SemiBold", ID 2 "Regular", ID 4 "Open Sans SemiBold", ID 16 "Open Sans", ID 17 "SemiBold").
const installed=[['Regular','Open Sans Regular','OpenSans-Regular',[]],['Italic','Open Sans Italic','OpenSans-Italic',[]],['Bold','Open Sans Bold','OpenSans-Bold',[]],['Bold Italic','Open Sans Bold Italic','OpenSans-BoldItalic',[]],
 ['Light','Open Sans Light','OpenSans-Light',['Open Sans Light']],['Light Italic','Open Sans Light Italic','OpenSans-LightItalic',['Open Sans Light']],
 ['SemiBold','Open Sans SemiBold','OpenSans-SemiBold',['Open Sans SemiBold']],['SemiBold Italic','Open Sans SemiBold Italic','OpenSans-SemiBoldItalic',['Open Sans SemiBold']],
 ['ExtraBold','Open Sans ExtraBold','OpenSans-ExtraBold',['Open Sans ExtraBold']],['ExtraBold Italic','Open Sans ExtraBold Italic','OpenSans-ExtraBoldItalic',['Open Sans ExtraBold']]]
 .map(([style,fullName,postscriptName,aliases],i)=>({family:'Open Sans',style,fullName,postscriptName,aliases,source:'system',faceIndex:0,coverage,id:'os'+i,fileId:'sha'+i,bytes:1000}));
// The fonts of elixiroffice-font-weight-name.docx, as LoadDocumentFonts received them at open.
const documentFonts=['Symbol','Courier New','Wingdings','Arial','Times New Roman','Open Sans','Open Sans Bold','Open Sans Bold Test','Open Sans SemiBold','Open Sans ExtraBold'];

async function openInApp(){
 const core=await fs.readFile(process.env.UPSTREAM?path.join(process.env.UPSTREAM,'web-apps/apps/common/main/lib/elixir-localfonts/Core.js'):path.join(root,'desktop/assets/desktop-home/localfonts-Core.js'),'utf8');
 const adapter=await fs.readFile(path.join(root,'desktop/computer-fonts.js'),'utf8');
 const files=[],infos=[],map={},loads=[];
 // Load state seen in the app after open: only the files of "Open Sans" (59, 56) and Carlito were loaded.
 for(let i=0;i<61;i++)files.push({Id:String(i).padStart(3,'0'),Status:[14,15,16,17,56,59].includes(i)?0:-1});
 function CFontInfo(name,_t,r,fr,it,fi,b,fb,bi,fbi){
  Object.assign(this,{Name:name,indexR:r,faceIndexR:fr,indexI:it,faceIndexI:fi,indexB:b,faceIndexB:fb,indexBI:bi,faceIndexBI:fbi});
 }
 // CFontInfo.LoadFont (sdkjs Externals.js) gives text shaping the info name only for local or embedded faces.
 CFontInfo.prototype.LoadFont=function(_loader,_manager,_size,style){loads.push({name:this.Name,style,identity:this.isLocalFont?this.Name:null});return {};};
 for(const info of allFonts){map[info[0]]=infos.length;infos.push(new CFontInfo(info[0],0,...info.slice(1)));}
 // The SDK font application: case-sensitive name map; a name outside the font selection list (AllFonts) is
 // answered by the dictionary, the document altName, or the unknown-font substitute (Carlito).
 const selections=new Set(allFonts.map(info=>info[0]));
 const app={g_fontDictionary:{FD_Substitutes:{}},DocumentAltNames:{'Open Sans Bold':'Open Sans'},GetSubstituteList:()=>[],FontPickerMap:{}};
 app.GetFontFileWeb=app.GetFontFile=function(name){
  if(selections.has(name))return {m_wsFontName:name};
  const alt=this.DocumentAltNames[name];
  return {m_wsFontName:alt&&selections.has(alt)?alt:'Carlito'};
 };
 const A={DesktopFontPolicyVersion:1,g_map_font_index:map,g_font_infos:infos,g_font_files:files,g_fontApplication:app,CFontFileLoader:function(id){this.Id=id;this.Status=-1;},CFontInfo};
 const requested=[],store=new Map();
 const window={AscFonts:A,AscCommon:{g_font_loader:{LoadDocumentFonts(){},LoadFonts:(names,callback)=>{requested.push(...names);callback();}}},Common:{},EOFontResolver:resolver,performance:{now:()=>0},
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},requestAnimationFrame:()=>0,setTimeout,clearTimeout};
 const context={window,AscCommon:window.AscCommon,performance:window.performance,define:(_deps,fn)=>fn(),setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,Blob,Uint8Array,ArrayBuffer};
 vm.runInNewContext(core,context);const LF=window.Common.ElixirLocalFonts;LF.install();
 // The document fonts are loaded at open, before the computer-font consent and policy (seen in LF.trace).
 window.AscCommon.g_font_loader.LoadDocumentFonts(documentFonts.map(name=>({name})));
 LF.setConsent(true);
 vm.runInNewContext(adapter,context);
 const bundled=allFonts.flatMap(([family,...slots])=>[0,1,2,3].flatMap(position=>{
  const file=slots[position*2];if(file<0)return [];
  return [{...packagedNames[file],family,styleCode:(position&1?2:0)|(position&2?1:0),source:family==='Carlito'||family.startsWith('Open Sans')?'bundled':'fallback',faceIndex:0,file:String(file).padStart(3,'0'),coverage,bytes:1000}];
 }));
 const policy=window.EOComputerFonts.install({id:'issue65-real',bundled,system:installed});
 LF.fonts=installed.map(face=>({...face,blob(){}}));LF.register();
 await new Promise(resolve=>setTimeout(resolve,0));
 return {app,A,LF,policy,files,loads,requested};
}

test('issue 65: "Open Sans Bold" with altName "Open Sans" reaches the engine as the packaged bold face',async()=>{
 const {app,A,loads}=await openInApp();
 const picked=app.GetFontFileWeb('Open Sans Bold',0).m_wsFontName;
 assert.equal(picked,'Open Sans Bold','the engine must get a family it has, not the altName "Open Sans"');
 const info=A.g_font_infos[A.g_map_font_index[picked]];
 assert.equal(info.indexR,56,'regular slot = packaged OpenSans-Bold (file 056)');
 assert.equal(info.indexB,56);
 assert.equal(app.GetFontFileWeb('Open Sans Bold',1).m_wsFontName,'Open Sans Bold');
 // Text shaping must look the face up under "Open Sans Bold", not under the file family "Open Sans".
 info.LoadFont(null,null,11,0);
 assert.deepEqual(loads.at(-1),{name:'Open Sans Bold',style:0,identity:'Open Sans Bold'});
 assert.equal(info.isLocalFont,false,'a packaged face must not count as a computer face for the PDF export');
 assert.equal(app.GetFontFileWeb('Open Sans',0).m_wsFontName,'Open Sans');
 assert.equal(app.GetFontFileWeb('Open Sans Bold Test',0).m_wsFontName,'Carlito');
});

test('issue 65: SemiBold/ExtraBold names reach the packaged faces and their files are loaded',async()=>{
 const {app,files,requested}=await openInApp();
 assert.equal(app.GetFontFileWeb('Open Sans SemiBold',0).m_wsFontName,'Open Sans Semibold');
 assert.equal(app.GetFontFileWeb('Open Sans ExtraBold',0).m_wsFontName,'Open Sans Extrabold');
 // The document fonts were loaded before the policy chose these families: their files must be loaded now.
 assert.equal(files[60].Status,-1);assert.equal(files[57].Status,-1);
 assert.ok(requested.includes('Open Sans Semibold'),JSON.stringify(requested));
 assert.ok(requested.includes('Open Sans Extrabold'),JSON.stringify(requested));
 assert.ok(!requested.includes('Open Sans SemiBold'),'load by the engine family name');
});
