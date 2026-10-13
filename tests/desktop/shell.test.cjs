// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parse}=require('../../desktop/capture.cjs'),{choose}=require('../../desktop/locale.cjs');
test('capture is opt-in and refuses document paths or ambiguous options',()=>{
 assert.equal(parse([]),null);assert.equal(parse(['sample.docx']),null);
 assert.throws(()=>parse(['--locales','fr']),/requires/);
 assert.throws(()=>parse(['--capture-screens']),/folder/);
 assert.throws(()=>parse(['--capture-screens','out','sample.docx']),/never document/);
 assert.throws(()=>parse(['--capture-screens','out','--locales','en,fr','--locales','en']),/Duplicate/);
 assert.throws(()=>parse(['--capture-screens','out','--locales','en,../fr']),/locales/);
 const captured=parse(['--capture-screens','out','--locales','en,fr']);assert.deepEqual(captured.locales,['en','fr']);assert.equal(captured.folder,path.resolve('out'));
});
test('OS language preference preserves regional/script catalogs and falls back to English',()=>{
 const supported=['en','fr','pt','pt-pt','zh','zh-tw','sr','sr-cyrl','no'];
 for(const [preferred,wanted] of [[['fr-CA','en'],'fr'],[['pt-PT'],'pt-pt'],[['pt-BR'],'pt'],[['zh-Hant-HK'],'zh-tw'],[['zh-CN'],'zh'],[['sr-Cyrl-RS'],'sr-cyrl'],[['sr-Latn'],'sr'],[['nb-NO'],'no'],[['unknown'],'en']])assert.equal(choose(preferred,supported),wanted);
});
function fonts(bridge){
  const filename=process.env.EO_FONT_CORE||(process.env.UPSTREAM?path.join(process.env.UPSTREAM,'web-apps/apps/common/main/lib/elixir-localfonts/Core.js'):path.join(__dirname,'../../desktop/assets/desktop-home/localfonts-Core.js'));
 const source=fs.readFileSync(filename,'utf8');
 let queried=0,listed=0;const storage=new Map(),window={Common:{},parent:{eoDesktop:bridge},isSecureContext:true,performance:{now:()=>0},Blob,
  localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  queryLocalFonts:async()=>{listed++;return [{family:'Web'}]},navigator:{permissions:{query:async()=>{queried++;return {state:'granted'}}}}};
 window.performance=performance;
 const context={window,navigator:window.navigator,performance,Blob,Uint8Array,ArrayBuffer,define:(_deps,fn)=>fn(),setInterval:()=>0,clearInterval(){},setTimeout,clearTimeout};
 vm.runInNewContext(source,context);
 return {LF:window.Common.ElixirLocalFonts,counts:()=>({queried,listed})};
}
test('desktop metadata/blob reads require real bridge consent and never browser font APIs',async()=>{
 let allowed=false,prompts=0,reads=0;
 const bridge={fontPermission:async()=>allowed,fontConsent:async()=>{prompts++;return allowed},fonts:async()=>[{family:'Desktop',id:'face'}],font:async id=>{assert.equal(id,'face');reads++;return new Uint8Array([1,2,3])}};
 const {LF,counts}=fonts(bridge);assert.equal(LF.support(),'ok');assert.equal(await LF.permission(),'prompt');
 await assert.rejects(LF.readList(),/cancelled/);assert.equal(prompts,1);assert.deepEqual(counts(),{queried:0,listed:0});
 allowed=true;const list=await LF.readList();assert.equal(list[0].family,'Desktop');assert.deepEqual(Array.from(new Uint8Array(await (await list[0].blob()).arrayBuffer())),[1,2,3]);assert.equal(reads,1);assert.equal(await LF.permission(),'granted');assert.deepEqual(counts(),{queried:0,listed:0});
});
test('incomplete desktop bridge fails closed without browser fallback',async()=>{
 const {LF,counts}=fonts({fontConsent:async()=>false});assert.equal(await LF.permission(),'prompt');await assert.rejects(LF.readList());assert.deepEqual(counts(),{queried:0,listed:0});
});
test('web font permission and enumeration behavior is preserved',async()=>{
 const {LF,counts}=fonts(null);assert.equal(await LF.permission(),'granted');assert.equal((await LF.readList())[0].family,'Web');assert.deepEqual(counts(),{queried:1,listed:1});
});

test('unsaved replacement and close decisions use explicit Discard and safe cancellation',()=>{
 const {unsaved,discard,buttons}=require('../../desktop/decisions.cjs');
 const words={unsaved:'Unsaved changes',cancel:'Cancel',save:'Save',discard:'Discard'};
 for(const closing of [false,true]){
  const options=unsaved(key=>words[key],closing);
  assert.deepEqual(options.buttons.map(label=>label.replace('&','')),closing?['Save','Discard','Cancel']:['Cancel','Discard']);
  assert.equal(options.cancelId,closing?2:0);assert.equal(discard({response:options.cancelId}),false);
  assert.equal(discard({response:1}),true);assert.equal(discard({response:-1}),false);
 }
 assert.deepEqual(buttons(['Annuler','Autoriser']),['&Annuler','A&utoriser']);
});

test('turning desktop fonts off revokes bridge consent and drops the cached list',async()=>{
 let allowed=true,revoked=0;
 const bridge={fontPermission:async()=>allowed,fontConsent:async()=>allowed,fonts:async()=>[{family:'Desktop',id:'face'}],font:async()=>new Uint8Array([1]),fontDisable:async()=>{revoked++;allowed=false}};
 const {LF,counts}=fonts(bridge);await LF.readList();LF.setConsent(true);LF.disable();await Promise.resolve();
 assert.equal(revoked,1);assert.equal(allowed,false);assert.equal(LF.fonts,null);assert.equal(LF.hasConsent(),false);
 await assert.rejects(LF.readList(),/cancelled/);assert.deepEqual(counts(),{queried:0,listed:0});
});
test('font metadata enumeration retains valid lazy handles without enlarging the face bound',async()=>{
 const promises=require('node:fs/promises'),os=require('node:os'),{Fonts}=require('../../desktop/fonts.cjs');
 const directory=await promises.mkdtemp(path.join(os.tmpdir(),'eo-font-handles-'));
 try{
  const encoded=await promises.readFile(path.join(__dirname,'../../desktop/assets/fonts/000'));
  const raw=Buffer.from(encoded),guid=[160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72];
  for(let i=0;i<32;i++)raw[i]^=guid[i%16];
  await promises.writeFile(path.join(directory,'test.ttf'),raw);
  const fonts=new Fonts();fonts.allowed=[directory];
  const first=await fonts.enumerate();assert(first.length>0,'Bundled public test font must enumerate');
  const again=await fonts.enumerate();assert.deepEqual(again.map(face=>face.id),first.map(face=>face.id));
  assert.deepEqual(Buffer.from(await fonts.read(first[0].id)),raw);
 }finally{await promises.rm(directory,{recursive:true,force:true})}
});
