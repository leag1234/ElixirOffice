// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {migrate}=require('../../desktop/font-preferences.cjs'),resolver=require('../../desktop/font-resolver.js'),sfnt=require('../../desktop/font-sfnt.cjs'),{Fonts,names}=require('../../desktop/fonts.cjs');
const root=path.resolve(__dirname,'../..'),assets=path.join(root,'desktop/assets');
const face=(family,source,styleCode=0,coverage=[[32,126]])=>({family,source,styleCode,coverage,style:['Regular','Bold','Italic','Bold Italic'][styleCode]});
test('default-on applies to unset desktop only and preserves explicit decline without mutating settings',()=>{
 for(const initial of [{},{fontConsent:false},{fontConsent:false,fontChoice:'unset'}]){const snapshot={...initial},next=migrate(initial);assert.equal(next.fontConsent,true);assert.equal(next.fontChoice,'default');assert.deepEqual(initial,snapshot);}
 for(const initial of [{fontConsent:false,fontChoice:'declined'},{fontConsent:true,fontChoice:'declined'}])assert.equal(migrate(initial).fontConsent,false);
 assert.deepEqual(migrate({fontConsent:true,fontChoice:'granted'}),{fontConsent:true,fontChoice:'granted'});
 assert.equal(migrate({fontConsent:true},{capture:true}).fontConsent,false);
});
test('priority is bundled requested/metric, then usable regional system, then fallback for the requested style/script',()=>{
 const policy=resolver.create([face('Carlito','bundled'),face('Calibri','system'),face('Noto Sans CJK JP','system',0,[[0x3040,0x30ff]]),face('Noto Sans CJK KR','system',0,[[0x3040,0x30ff]]),face('Emergency','fallback',0,[[0x600,0x6ff]])],{substitutes:{Calibri:['Carlito']}});
 assert.equal(policy.resolve({name:'Calibri'}).family,'Carlito');
 assert.equal(policy.resolve({name:'Unknown',codepoints:[0x3042],locale:'ja'}).family,'Noto Sans CJK JP');
 assert.equal(policy.resolve({name:'Unknown',codepoints:[0x3042],locale:'ko'}).family,'Noto Sans CJK KR');
 assert.equal(policy.resolve({name:'Calibri',codepoints:[0x600],candidates:['Emergency']}).source,'fallback');
 assert.equal(policy.resolve({name:'Unknown',codepoints:[0x600]}),null);
 const italic=policy.resolve({name:'Calibri',style:2});assert.equal(italic.family,'Carlito');assert.equal(italic.syntheticItalic,true);
 assert.throws(()=>policy.resolve({name:'Calibri',style:4}),/style/);
});
test('exact normalized Unicode names preserve punctuation and do not collide across scripts',()=>{
 const policy=resolver.create([face('Font-A','bundled'),face('Font A','system'),face('خط','system'),face('글꼴','system')]);
 for(const name of ['Font-A','Font A','خط','글꼴'])assert.equal(policy.resolve({name}).family,name);
 assert.equal(policy.resolve({name:'font a'}).family,'Font A');
});
test('font-name normalization reuses repeated values and stays correct after bounded eviction',async()=>{
 const source=await fs.readFile(path.join(root,'desktop/font-resolver.js'),'utf8');
 const context={module:{exports:{}},exports:{}};vm.createContext(context);
 vm.runInContext("let calls=0;const original=String.prototype.normalize;String.prototype.normalize=function(){calls++;return original.apply(this,arguments)};"+source+";globalThis.normalizeCalls=()=>calls",context);
 const isolated=context.module.exports;
 assert.equal(isolated.normalize('Repeated Name'),'repeated name');
 assert.equal(isolated.normalize('Repeated Name'),'repeated name');
 assert.equal(context.normalizeCalls(),1);
 for(let i=0;i<5000;i++)isolated.normalize('Unique '+i);
 assert.equal(isolated.normalize('E\u0301cole'),isolated.normalize('\u00c9cole'));
});
test('private index caches real SFNT coverage, exposes no paths and rejects changed handle bytes',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'eo-system-fonts-'));try{
  const directory=path.join(temp,'fonts');await fs.mkdir(directory);
  const raw=Buffer.from(await fs.readFile(path.join(assets,'fonts/000'))),wire=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];for(let i=0;i<32;i++)raw[i]^=wire[i%16];
  const filename=path.join(directory,'fixture.ttf');await fs.writeFile(filename,raw);
  const actual=sfnt.inspect(raw);assert(actual.coverage.length>0);assert.equal(typeof names(raw,0).family,'string');
  const fonts=new Fonts();fonts.allowed=[directory];const options={cacheDir:path.join(temp,'cache'),bundleIdentity:'fixture'};fonts.configure(options);
  const first=await fonts.index();assert.equal(first.system.length,1);assert.equal(first.stats.files,1);assert.equal(first.stats.cacheHits,0);assert(!JSON.stringify(first).includes(directory));assert.deepEqual(Buffer.from(await fonts.read(first.system[0].id)),raw);
  fonts.clear();const second=await fonts.index();assert.equal(second.id,first.id);assert.equal(second.stats.cacheHits,1);assert.equal(second.system[0].id,first.system[0].id);
  const mode=(await fs.stat(path.join(temp,'cache/index-v3.json'))).mode&511;assert.equal(mode,384);
  raw[raw.length-1]^=1;await fs.writeFile(filename,raw);await assert.rejects(fonts.read(second.system[0].id),/changed/);
  const third=await fonts.index();assert.notEqual(third.id,first.id);assert.notEqual(third.system[0].id,second.system[0].id);await assert.rejects(fonts.read(second.system[0].id),/Unknown font handle/);
  await fs.writeFile(path.join(directory,'broken.ttf'),Buffer.from([0,1,2]));fonts.clear();const broken=await fonts.index();assert.equal(broken.system.length,1);assert.equal(broken.stats.skipped,1);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('SFNT and TTC bounds fail closed for malformed tables and collections',()=>{
 for(const bytes of [Buffer.alloc(2),Buffer.alloc(12),Buffer.from('ttcf0000ffffffff','ascii')])assert.throws(()=>{for(const offset of sfnt.offsets(bytes))sfnt.inspect(bytes,offset);});
});
test('desktop policy stays outside legacy local-first hooks in both registration load orders',async()=>{
 const core=await fs.readFile(process.env.UPSTREAM?path.join(process.env.UPSTREAM,'web-apps/apps/common/main/lib/elixir-localfonts/Core.js'):path.join(assets,'desktop-home/localfonts-Core.js'),'utf8');
 const adapter=await fs.readFile(path.join(root,'desktop/computer-fonts.js'),'utf8');
 for(const late of [false,true]){
  const store=new Map(),files=[],infos=[{name:'Carlito'},{name:'Font-A'}];
  const app={g_fontDictionary:{FD_Substitutes:{Calibri:['Carlito']}},GetSubstituteList:name=>name==='Calibri'?['Carlito']:[],GetFontFile:name=>({m_wsFontName:name}),GetFontFileWeb:name=>({m_wsFontName:name})};
  const A={DesktopFontPolicyVersion:1,g_map_font_index:{Carlito:0,'Font-A':1},g_font_infos:infos,g_font_files:files,g_fontApplication:app,CFontFileLoader:function(id){this.Id=id;},CFontInfo:function(name){this.name=name;}};
  const window={AscFonts:A,AscCommon:{g_font_loader:{LoadDocumentFonts(){}}},Common:{},EOFontResolver:resolver,performance:{now:()=>0},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},parent:{eoDesktop:{fontConsent(){}}}};
  const context={window,AscCommon:window.AscCommon,performance:window.performance,define:(_deps,fn)=>fn(),setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout,Blob,Uint8Array,ArrayBuffer};
  vm.runInNewContext(core,context);const LF=window.Common.ElixirLocalFonts;
  if(!late)LF.install();
  vm.runInNewContext(adapter,context);
  const index={id:'fixture',bundled:[face('Carlito','bundled'),face('Carlito','bundled',1),face('Carlito','bundled',2),face('Font-A','bundled')],system:[face('Calibri','system'),face('Font A','system'),face('خط','system'),face('글꼴','system')]};
  A.DesktopFontPolicyVersion=0;assert.throws(()=>window.EOComputerFonts.install(index),/engine update/);A.DesktopFontPolicyVersion=1;
  const policy=window.EOComputerFonts.install(index);LF.fonts=index.system.map(f=>({...f,postscriptName:f.family,fullName:f.family,blob(){}}));LF.register();
  assert.equal(policy.resolve('Calibri',1).styleCode,1);assert.equal(policy.resolve('Calibri',2).styleCode,2);
  assert.equal(A.g_map_font_index.Calibri,undefined,'Protected metric alias must not register a local override');
  assert.equal(app.GetFontFileWeb('Calibri').m_wsFontName,'Carlito');
  assert.equal(app.GetFontFileWeb('Font-A').m_wsFontName,'Font-A');
  assert.equal(LF.resolveName('خط'),'خط');assert.equal(LF.resolveName('글꼴'),'글꼴');assert.equal(LF.resolveName('not-installed'),null);
  assert.equal(app.GetFontFileWeb('Font A').m_wsFontName,'Font A');
  LF.register();assert.equal(app.GetFontFileWeb('Calibri').m_wsFontName,'Carlito');assert.equal(window.EOComputerFonts.install(index),policy);
 }
});

test('revocation during private discovery rejects the pending index and leaves no handles',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'eo-font-revoke-'));try{
  const fonts=new Fonts();fonts.allowed=[];fonts.configure({cacheDir:path.join(temp,'cache'),bundleIdentity:'revoke'});
  const pending=fonts.index();fonts.clear();await assert.rejects(pending,/stopped|changed/);assert.equal(fonts.files.size,0);
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('actual bundled metadata preserves all49 shared families and110 faces plus the exact optional desktop fallbacks',async()=>{
 const fonts=new Fonts();fonts.allowed=[];fonts.configure({bundled:assets,bundleIdentity:'actual-pack'});
 try{
  const index=await fonts.index(),profile=require('./fixtures/shared-font-profile.json'),sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const styles={regular:0,italic:2,bold:1,'bold-italic':3},expected=new Map();
  for(const [family,variants] of Object.entries(profile.variants))for(const [style,[file,faceIndex]] of Object.entries(variants)){
   if(file>=0)expected.set(family+'|'+styles[style]+'|'+faceIndex,profile.files[String(file).padStart(3,'0')]);
  }
  assert.equal(expected.size,110);assert.equal(Object.keys(profile.faces).length,49);
  const shared=index.bundled.filter(f=>Object.hasOwn(profile.faces,f.family)),extra=index.bundled.filter(f=>!Object.hasOwn(profile.faces,f.family));
  assert.equal(new Set(shared.map(f=>f.family)).size,49);assert.equal(shared.length,110);
  for(const f of shared){
   const key=f.family+'|'+f.styleCode+'|'+f.faceIndex;assert(expected.has(key),key);
   assert.equal(sha(await fs.readFile(path.join(assets,'fonts',f.file))),expected.get(key),key);
   expected.delete(key);
  }
  assert.equal(expected.size,0);
  assert([0,4].includes(extra.length),'Only the complete four-face desktop fallback extension is allowed');
  if(extra.length){
   const fallbacks=require('../../tools/desktop/fallback-fonts.json'),seen=new Set(),wire=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
   for(const f of extra){
    const spec=fallbacks.find(item=>item.family===f.family),style=['Regular','Bold'][f.styleCode];assert(spec&&style);assert.equal(f.faceIndex,0);assert.equal(f.source,'fallback');
    const key=f.family+'|'+style;assert(!seen.has(key));seen.add(key);
    const raw=Buffer.from(await fs.readFile(path.join(assets,'fonts',f.file)));for(let i=0;i<Math.min(32,raw.length);i++)raw[i]^=wire[i%16];
    assert.equal(sha(raw),spec.outputs.find(item=>item.style===style).sha256);
   }
   assert.equal(seen.size,4);assert.equal(new Set(index.bundled.map(f=>f.family)).size,51);assert.equal(index.bundled.length,114);
  }
  const info=shared.find(f=>f.family==='Carlito'&&f.styleCode===0);assert(info);assert(resolver.covers(info,[65]));assert.equal(info.faceIndex,0);assert(!resolver.covers(info,[0x3042]));
 }finally{fonts.clear();}
});

test('Arabic italic rejects the actual missing Oblique slot and synthesizes italic in a different covering family',()=>{
 const policy=resolver.create([face('Arabic','bundled',0,[[0x600,0x6ff]]),face('Arabic','bundled',2,[[32,126]]),face('Noto Sans Arabic','system',0,[[0x600,0x6ff]])]);
 assert.equal(policy.resolve({name:'Arabic',style:2,codepoints:[0x633]}),null);
 const selected=policy.resolve({name:'Arabic',style:2,codepoints:[0x633],candidates:['Noto Sans Arabic']});
 assert.equal(selected.family,'Noto Sans Arabic');assert.equal(selected.styleCode,0);assert.equal(selected.syntheticItalic,true);assert.equal(selected.syntheticBold,false);
 assert.equal(policy.resolve({name:'Arabic',style:0,codepoints:[0x633]}).source,'bundled');
});

test('variant slots match local-font registration instead of treating Semibold or Thin Italic as physical styles',()=>{
 const regular={...face('Variants','system'),styleCode:undefined,style:'Regular',id:'regular'};
 const semibold={...regular,style:'Semibold',id:'semibold'},thinItalic={...regular,style:'Thin Italic',id:'thin-italic'};
 const policy=resolver.create([regular,semibold,thinItalic]);
 assert.equal(policy.resolve({name:'Variants',style:1}).id,'regular');assert.equal(policy.resolve({name:'Variants',style:1}).syntheticBold,true);
 assert.equal(policy.resolve({name:'Variants',style:2}).id,'regular');assert.equal(policy.resolve({name:'Variants',style:2}).syntheticItalic,true);
 const lone=resolver.create([semibold]);assert.equal(lone.resolve({name:'Variants',style:0}).id,'semibold');assert.equal(lone.resolve({name:'Variants',style:1}).syntheticBold,true);
});

test('optional index failure resolves a recoverable renderer state with a visible warning',async()=>{
 const source=await fs.readFile(path.join(root,'desktop/renderer.js'),'utf8');
 const functions=source.slice(source.indexOf('async function installFonts('),source.indexOf('async function drainPending('));
 let consent=true,state;const messages=[],LF={setConsent:v=>consent=v,setStatus:v=>state=v},window={Common:{ElixirLocalFonts:LF}};
 const context={eoDesktop:{fontPermission:async()=>true,fontIndex:async()=>{throw Error('Private cache unavailable');}},script:async()=>{},t:key=>key,status:value=>messages.push(value)};
 vm.createContext(context);vm.runInContext(functions,context);
 assert.equal(await context.installFonts(window),false);
 assert.equal(consent,false);assert.equal(state,'error');assert.equal(window.EOComputerFontWarning,'fontFailed');assert.equal(messages.length,1);
});

test('variable system fonts expose only default instances and prefer eligible static slots',()=>{
 const regular={...face('Ubuntu Sans','system'),styleCode:undefined,id:'default',fullName:'Ubuntu Sans Regular',variable:true,faceIndex:0};
 const medium={...regular,id:'medium',style:'Medium',fullName:'Ubuntu Sans Medium',faceIndex:5<<16,instanceDefault:false};
 const bold={...regular,id:'bold',style:'Bold',fullName:'Ubuntu Sans Bold',faceIndex:7<<16,instanceDefault:false};
 const namedDefault={...regular,faceIndex:(4<<16)|3,instanceDefault:true};
 assert.equal(resolver.prepare([namedDefault])[0].faceIndex,3,'Default named aliases must normalize to the collection face for native embedding');
 const defaults=resolver.create([regular,medium,bold]);
 assert.equal(defaults.resolve({name:'Ubuntu Sans',style:0}).id,'default');
 assert.equal(defaults.resolve({name:'Ubuntu Sans',style:1}).id,'default');assert.equal(defaults.resolve({name:'Ubuntu Sans',style:1}).syntheticBold,true);
 assert.equal(defaults.resolve({name:'Ubuntu Sans Medium'}).id,'default');
 const otherBold={...face('Static Alternative','system',1),id:'other-bold',variable:false};
 const alternatives=resolver.create([regular,medium,bold,otherBold]);
 assert.equal(alternatives.resolve({name:'Ubuntu Sans',style:1,candidates:['Static Alternative']}).id,'other-bold','A known eligible physical style precedes synthetic fallback');
 const staticR={...regular,id:'static-regular',variable:false},staticB={...bold,id:'static-bold',variable:false,faceIndex:0};
 const statics=resolver.create([regular,medium,bold,staticR,staticB]);
 assert.equal(statics.resolve({name:'Ubuntu Sans',style:0}).id,'static-regular');
 assert.equal(statics.resolve({name:'Ubuntu Sans',style:1}).id,'static-bold');assert.equal(statics.resolve({name:'Ubuntu Sans',style:1}).syntheticBold,false);
 assert.deepEqual(resolver.prepare([bold,regular,medium,staticB,staticR]).map(f=>f.id),['static-bold','static-regular','default']);
});

test('small packaged fallbacks work without system consent, follow system priority and reserve their family namespace',()=>{
 const arabic=resolver.fallbackFamilies[0],sinhala=resolver.fallbackFamilies[1];
 const small=[face(arabic,'fallback',0,[[0x600,0x6ff]]),face(arabic,'fallback',1,[[0x600,0x6ff]]),face(sinhala,'fallback',0,[[0xd80,0xdff]])];
 const bundled=[face('DejaVu Sans','bundled',0,[[0x600,0x6ff]]),face('DejaVu Sans','bundled',2,[[32,126]]),face('Carlito','bundled')];
 const off=resolver.create([...bundled,...small],{substitutes:{Calibri:['Carlito']}});
 const request={name:'DejaVu Sans',style:2,codepoints:[0x633],candidates:resolver.scriptCandidates(0x633)};
 assert.equal(off.resolve(request).family,arabic);assert.equal(off.resolve(request).syntheticItalic,true);
 assert.equal(off.resolve({...request,style:0}).family,'DejaVu Sans');
 assert.equal(off.resolve({name:'Calibri'}).family,'Carlito');
 assert.equal(off.resolve({name:'Missing',style:3,codepoints:[0xd85],candidates:resolver.scriptCandidates(0xd85)}).family,sinhala);
 const realSystem=face('Noto Sans Arabic','system',0,[[0x600,0x6ff]]);
 const collision=face(arabic.toUpperCase(),'system',2,[[0x600,0x6ff]]);
 assert.equal(resolver.eligible(collision),false);
 assert.equal(resolver.create([...bundled,...small,collision]).resolve(request).family,arabic);
 assert.equal(resolver.create([...bundled,...small,collision,realSystem]).resolve(request).family,'Noto Sans Arabic');
});

test('opening with pending discovery uses packaged fonts immediately and explicit font enable can wait',async()=>{
 const source=await fs.readFile(path.join(root,'desktop/renderer.js'),'utf8');
 const functions=source.slice(source.indexOf('async function installFonts('),source.indexOf('async function drainPending('));
 let consent,statusValue,installed=0;
 const LF={setConsent:value=>{consent=value;},setStatus:value=>{statusValue=value;},readList:async()=>{},register(){}};
 const window={Common:{ElixirLocalFonts:LF},EOComputerFonts:{install(){installed++;LF.desktopPolicy={};}}};
 const readyOnly=[],context={eoDesktop:{fontPermission:async()=>true,fontIndex:async value=>{readyOnly.push(value);return value?null:{bundled:[],system:[]};}},script:async()=>{},t:key=>key,status(){}};
 vm.createContext(context);vm.runInContext(functions,context);
 assert.equal(await context.installFonts(window),false);assert.equal(consent,false);assert.equal(statusValue,'loading');assert.equal(installed,0);
 assert.equal(await context.installFonts(window,true),true);assert.deepEqual(readyOnly,[true,false]);assert.equal(installed,1);
});
