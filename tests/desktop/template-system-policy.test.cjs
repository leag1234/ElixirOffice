// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const templates=require('../../desktop/templates.cjs'),resolver=require('../../desktop/font-resolver.js');
const face=(family,source,styleCode,coverage)=>({family,source,styleCode,coverage});
const entry={id:'public-template',languages:['en','ja','si','ur'],file:'public.docx',thumb:'public.png',
 title:{en:'English',ja:'Japanese',si:'Sinhala',ur:'Urdu'},systemLocales:['ja'],
 fontRequirements:{ja:[{name:'Noto Sans CJK JP',style:1,codepoints:[0x3042,0x4e00]},{name:'DejaVu Sans',style:0,codepoints:[65]}]}};
test('system-dependent Home variants require exact requested-style coverage; small scripts stay available off',()=>{
 const bundled=[face('DejaVu Sans','bundled',0,[[32,126]])];
 assert.equal(templates.resolve(entry,'ja').language,'en');
 assert.equal(templates.resolve(entry,'si').language,'si');assert.equal(templates.resolve(entry,'ur').language,'ur');
 assert.equal(templates.resolve(entry,'unknown').language,'en');
 const bad={bundled,system:[face('Yu Gothic','system',0,[[0x3042,0x3042],[0x4e00,0x4e00]]),face('Yu Gothic','system',1,[[0x3042,0x3042]])]};
 assert.equal(templates.resolve(entry,'ja',{index:bad}).language,'en','An actual bold slot lacking a required scalar cannot impersonate covering regular');
 const good={bundled,system:[face('Yu Gothic','system',0,[[0x3042,0x3042],[0x4e00,0x4e00]])]};
 assert.equal(templates.resolve(entry,'ja',{index:good}).language,'ja','A covering physical regular can synthesize bold');
 const registered=templates.resolve(entry,'ja',{index:good});
 assert.equal(registered.file,'ja/public.docx');assert.equal(registered.thumb,'ja/public.png');
 assert(!('fontRequirements' in registered));
});
test('named regional and small-script document faces resolve to real OS alternatives before small fallback',()=>{
 for(const [requested,actual,cp] of [['Noto Sans CJK JP','Hiragino Sans',0x3042],['Noto Sans CJK TC','Microsoft JhengHei',0x4e00],['Noto Sans CJK KR','Malgun Gothic',0xac00],['Noto Sans CJK SC','Microsoft YaHei',0x4e00]]){
  const policy=resolver.create([face(actual,'system',0,[[cp,cp]])]);
  assert.equal(policy.resolve({name:requested,codepoints:[cp]}).family,actual);
 }
 const small=face('Elixir Fallback Sinhala','fallback',0,[[0xd80,0xdff]]);
 assert.equal(resolver.create([small]).resolve({name:'Noto Sans Sinhala',codepoints:[0xd85]}).family,small.family);
 assert.equal(resolver.create([small,face('Sinhala MN','system',0,[[0xd80,0xdff]])]).resolve({name:'Noto Sans Sinhala',codepoints:[0xd85]}).family,'Sinhala MN');
});
test('actual main Home uses English immediately, shares discovery, refreshes later and respects failure/revocation',async()=>{
 const source=fs.readFileSync(require.resolve('../../desktop/main.cjs'),'utf8');
 const code=source.slice(source.indexOf('let homeFontDiscovery,homeFontGeneration;'),source.indexOf('function active('));
 function harness(failing=false){
  let calls=0,finish,ready=null;const events=[],settings={fontConsent:false},index={bundled:[],system:[]};
  const fonts={generation:0,peek:()=>ready,index(){calls++;return failing?Promise.reject(Error('public fixture discovery failure')):new Promise(resolve=>{finish=()=>{ready=index;resolve(index);};});}};
  const registry={windows:()=>[{id:'window'}],documents:()=>[{contents:{send:(...args)=>events.push(args)}}]};
  const context=vm.createContext({registry,settings,captureOptions:null,fonts,win:{isDestroyed:()=>false,webContents:{send:(...args)=>events.push(args)}}});
  vm.runInContext(code,context);return {context,settings,fonts,index,events,calls:()=>calls,finish:()=>finish()};
 }
 const h=harness(),c=h.context;
 assert.deepEqual(Object.keys(c.templateFonts([entry],'ja')),[]);assert.equal(h.calls(),0);
 h.settings.fontConsent=true;c.captureOptions={};c.templateFonts([entry],'ja');assert.equal(h.calls(),0);
 c.captureOptions=null;c.templateFonts([entry],'si');assert.equal(h.calls(),0);
 for(let i=0;i<20;i++)assert.deepEqual(Object.keys(c.templateFonts([entry],'ja')),[],'Pending CJK discovery must return synchronously');
 assert.equal(h.calls(),1);assert.equal(templates.resolve(entry,'ja',c.templateFonts([entry],'ja')).language,'en');
 h.finish();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(h.events,[['eo:action','font-index-ready']]);assert.equal(c.templateFonts([entry],'ja').index,h.index);assert.equal(h.calls(),1);
 h.fonts.generation++;h.fonts.peek=()=>null;
 assert.deepEqual(Object.keys(c.templateFonts([entry],'ja')),[]);assert.equal(h.calls(),2,'A cleared successful generation must get a fresh observer');
 h.finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.events.length,2);
 const failed=harness(true);failed.settings.fontConsent=true;
 for(let i=0;i<3;i++){assert.deepEqual(Object.keys(failed.context.templateFonts([entry],'ja')),[]);await new Promise(resolve=>setImmediate(resolve));}
 assert.equal(failed.calls(),1);assert.equal(failed.events.length,0);
 const revoked=harness();revoked.settings.fontConsent=true;revoked.context.templateFonts([entry],'ja');
 revoked.settings.fontConsent=false;revoked.fonts.generation++;revoked.finish();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(revoked.events.length,0);assert.deepEqual(Object.keys(revoked.context.templateFonts([entry],'ja')),[]);
});

test('registered main font IPC returns pending immediately, validates requests and observes a new generation',async()=>{
 const path=require('node:path'),{createRequire}=require('node:module');
 const helper=path.join(__dirname,'close-recovery.test.cjs'),load=createRequire(helper),moduleScope={exports:{}};
 const helperCode=fs.readFileSync(helper,'utf8');
 vm.runInNewContext(helperCode+'\nmodule.exports={boot};',{require:name=>name==='node:test'?()=>{}:load(name),module:moduleScope,__dirname,process,console,Buffer,Uint8Array,URL,setTimeout,clearTimeout,setImmediate});
 let ready=null,complete,calls=0;
 const fonts={generation:0,configure(){},peek:()=>ready,index(){calls++;return new Promise(resolve=>{complete=()=>{ready={id:'ready',bundled:[],system:[]};resolve(ready);};});},clear(){this.generation++;ready=null;}};
 const env=await moduleScope.exports.boot({fontService:fonts,fontSettings:{fontConsent:true,fontChoice:'granted'}});
 try{
  for(let i=0;i<20;i++)assert.equal(await env.invoke('font-index',true),null);
  assert.equal(calls,1);await assert.rejects(env.invoke('font-index','true'),/Invalid font index request/);
  complete();await new Promise(setImmediate);
  assert.equal((await env.invoke('font-index',true)).id,'ready');assert.equal(calls,1);
  fonts.clear();assert.equal(await env.invoke('font-index',true),null);assert.equal(calls,2);
  complete();await new Promise(setImmediate);
  assert.equal(env.sent.filter(event=>event[1]==='font-index-ready').length,2);
  await env.invoke('font-disable');await assert.rejects(env.invoke('font-index',true),/Computer fonts are disabled/);
 }finally{await env.cleanup();}
});
test('font-ready Home refresh preserves the current view and respects close/save guards',async()=>{
 const source=fs.readFileSync(require.resolve('../../desktop/renderer.js'),'utf8');
 const code=source.slice(source.indexOf('eoDesktop.onAction(async (action,details)=>{'),source.indexOf("\ndocument.addEventListener('dragover'"));
 let handler;const views=[],home={hidden:false,querySelector:()=>({dataset:{view:'new'}})};
 const context=vm.createContext({eoDesktop:{onAction:callback=>{handler=callback;}},$:()=>home,refreshHome:async view=>views.push(view),refreshFonts:async()=>{},fontRefreshRequested:false,closeCheck:false,choosingSaveAs:false});
 vm.runInContext(code,context);
 await handler('font-index-ready');assert.deepEqual(views,['new']);
 home.hidden=true;await handler('font-index-ready');assert.equal(views.length,1);
 home.hidden=false;context.closeCheck=true;await handler('font-index-ready');assert.equal(views.length,1);
 context.closeCheck=false;context.choosingSaveAs=true;await handler('font-index-ready');assert.equal(views.length,1);
});
