// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM;assert(upstream,'Explicit owned EO_UPSTREAM required');
const web=path.join(upstream,'web-apps'),local=path.join(web,'apps/common/main/lib/elixir-local/Password.js');
const keys=['txtLocalKeepCurrentPassword','txtLocalKeepWithoutPassword','txtLocalChangePassword','txtLocalAddPassword','txtLocalRemovePassword','txtLocalPlaintextCopyWarning','txtLocalRemovePasswordWarning'];
const defaults=['Keep current password','Keep without password','Change password','Add password','Remove password','This exported copy will not be password protected. Continue?','This save will remove password protection and may overwrite the encrypted original with an unprotected file. Continue?'];
const prefix='Common.Views.PasswordDialog.',editors=['documenteditor','spreadsheeteditor','presentationeditor'];
const folder=editor=>path.join(web,'apps',editor,'main/locale');
const languages=fs.readdirSync(folder(editors[0])).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).sort();
const catalog=(editor,language)=>JSON.parse(fs.readFileSync(path.join(folder(editor),language+'.json'),'utf8'));
const tick=()=>new Promise(setImmediate);
async function setup(language,strings,{deferred=false,missingView=false,notFound=false,failedFetch=false,unprotected=false}={}){
 const dialogs=[],writes=[],requests=[];let module;
 class Dialog{constructor(options){this.options=options;dialogs.push(this)}close(){this.closed=true}show(){}}
 Dialog.prototype.txtPassword='Password';Dialog.prototype.txtDescription='Password required';
 const Common={Views:{OpenDialog:Dialog,PasswordDialog:Dialog},UI:{alert:options=>new Dialog(options),warning:options=>new Dialog(options)}};
 let releaseLocale;const loaded=deferred?new Promise(resolve=>{releaseLocale=resolve}):Promise.resolve(strings);
 if(missingView)delete Common.Views.PasswordDialog;
 const window={Common,fetch:async url=>{requests.push(url);if(failedFetch)throw Error('Injected locale fetch failure');if(notFound&&url!=='locale/en.json')return {ok:false};return {ok:true,json:async()=>loaded}},document:{},location:{search:'?lang='+language}};
 const context={window,Common,fetch:window.fetch,location:window.location,document:window.document,console:{log(){}},Promise,URL,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/common/locale.js'),'utf8'),context);await tick();
 if(!deferred)assert.equal(Common.Locale.get('txtPassword',{name:'Common.Views.PasswordDialog',default:'Password'}),strings[prefix+'txtPassword']||'Password');
 window.document.currentScript={src:'https://office.example.invalid/sdkjs/common/wasm-convert/api.js'};window.location.origin='https://office.example.invalid';
 vm.runInNewContext(fs.readFileSync(path.join(upstream,'sdkjs/common/wasm-convert/api.js'),'utf8'),{window,document:window.document,URL});
 vm.runInNewContext(fs.readFileSync(local,'utf8'),{define:(_deps,fn)=>{module=fn((_dependencies,resolve)=>resolve())},window,Common,Promise});
 const api={documentFormat:'docx',eoLocalMode:true,DocInfo:{get_OfflineApp:()=>true},sendEvent(){},asc_setCurrentPassword(){},asc_resetPassword(){}};
 module.prepare(api,{appOptions:{isEdit:true}});
 const state=module.install(api,{isBusy:()=>false,onProtectionLock:async()=>{},onError:error=>{throw error},save:choice=>state.save(async(options,metadata)=>{writes.push({options,metadata});return true},choice)});
 if(!unprotected)await state.save(async()=>true,'public-test-password');
 return {state,dialogs,writes,requests,locale:Common.Locale,releaseLocale:async()=>{if(releaseLocale)releaseLocale(strings);await tick();}};
}
test('all 45 editor catalogs include every local password choice and consequence without markup',()=>{
 assert.equal(languages.length,45);
 for(const editor of editors){
  assert.deepEqual(fs.readdirSync(folder(editor)).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).sort(),languages);
  for(const language of languages){
   const strings=catalog(editor,language);
   for(const [i,key] of keys.entries()){
    const value=strings[prefix+key];assert.equal(typeof value,'string',editor+'/'+language+'/'+key);
    assert(value.trim().length>0,editor+'/'+language+'/'+key);assert(!/<\/?[a-z]/i.test(value),key);
    if(language==='en')assert.equal(value,defaults[i]);
    else assert.notEqual(value,defaults[i],language+'/'+key+' must be translated');
   }
  }
 }
});
test('actual locale loader and local password flow use translated labels while refusal preserves protection',async()=>{
 for(const editor of editors)for(const language of languages){
  const strings=catalog(editor,language),s=await setup(language,strings),expected=key=>strings[prefix+key];
  try{
   let ran=false;
   const choosing=s.state.saveAs(async choice=>{assert.equal(choice,undefined);ran=true;});choosing.catch(()=>{});await tick();
   try{
    const options=s.dialogs.at(-1).options,buttons=Array.from(options.buttons);
    assert.equal(options.title,strings[prefix+'txtPassword']||'Password',editor+'/'+language+'/title');
    assert.equal(options.msg,strings[prefix+'txtDescription']||'A Password is required to open this document',editor+'/'+language+'/description');
    assert.equal(buttons[0].value,'keep');assert.equal(buttons[0].caption,expected(keys[0]),editor+'/'+language+'/keep');
    assert.equal(buttons[1].value,'change');assert.equal(buttons[1].caption,expected(keys[2]),editor+'/'+language+'/change');
    assert.equal(buttons[2].value,'remove');assert.equal(buttons[2].caption,expected(keys[4]),editor+'/'+language+'/remove');
    assert.equal(buttons[3],'cancel');assert.equal(ran,false);
    options.callback('keep');await choosing;assert(ran);
   }finally{if(!s.dialogs.at(-1).closed)s.dialogs.at(-1).options.callback('cancel');await choosing.catch(()=>{});}
   const changing=s.state.copyAs('docx',async()=>assert.fail('Cancel must not write a changed-password copy')),changeCanceled=assert.rejects(changing,e=>e.code==='cancelled');await tick();
   s.dialogs.at(-1).options.callback('change');await tick();
   try{
    const labels=s.dialogs.at(-1).options.localPasswordLabels;assert(labels,'Local dialog labels reach the actual password view');
    for(const key of ['txtTitle','txtPassword','txtDescription','txtRepeat','txtIncorrectPwd','txtWarning'])assert.equal(labels[key],strings[prefix+key],editor+'/'+language+'/'+key);
    assert(!JSON.stringify(labels).includes('public-test-password'));
   }finally{s.dialogs.at(-1).options.handler('cancel','');await changeCanceled;}
   const exporting=s.state.confirmExport();const exportRefused=assert.rejects(exporting,e=>e.code==='cancelled');await tick();
   try{
    const options=s.dialogs.at(-1).options;
    assert.equal(options.msg,expected(keys[5]),editor+'/'+language+'/plaintext-copy');assert.deepEqual(Array.from(options.buttons),['no','yes']);
   }finally{s.dialogs.at(-1).options.callback('no');await exportRefused;}
   let wrote=false;
   const removing=s.state.save(async()=>{wrote=true;},null),removeRefused=assert.rejects(removing,e=>e.code==='cancelled');await tick();
   try{
    const options=s.dialogs.at(-1).options;assert.equal(options.msg,expected(keys[6]),editor+'/'+language+'/removal');assert.deepEqual(Array.from(options.buttons),['no','yes']);
   }finally{s.dialogs.at(-1).options.callback('no');await removeRefused;}
   assert.equal(wrote,false);assert(s.state.isProtected());assert(s.state.isRecoveryLocked());assert.equal(s.writes.length,0);
   await s.state.save(async options=>{assert.equal(options.savePassword,'public-test-password');return true;});
   assert.deepEqual(s.requests,['locale/'+language+'.json']);
  }finally{s.state.dispose();}
 }
});
test('missing, empty and unknown-language catalogs keep readable English safety messages and cancellation',async()=>{
 for(const [language,strings]of [['fr',{}],['zz',Object.fromEntries(keys.map(k=>[prefix+k,'']))]]){
  const s=await setup(language,strings);
  try{
   const choosing=s.state.saveAs(async()=>assert.fail('Cancel must not continue saving'));const canceled=assert.rejects(choosing,e=>e.code==='cancelled');await tick();
   try{const buttons=s.dialogs.at(-1).options.buttons;assert.equal(buttons[0].caption,defaults[0]);assert.equal(buttons[1].caption,defaults[2]);assert.equal(buttons[2].caption,defaults[4]);}
   finally{s.dialogs.at(-1).options.callback('cancel');await canceled;}
   const exporting=s.state.confirmExport(),refused=assert.rejects(exporting,e=>e.code==='cancelled');await tick();
   try{assert.equal(s.dialogs.at(-1).options.msg,defaults[5]);}finally{s.dialogs.at(-1).options.callback('no');await refused;}
   const removing=s.state.save(async()=>assert.fail('Refusal must not write'),null),kept=assert.rejects(removing,e=>e.code==='cancelled');await tick();
   try{assert.equal(s.dialogs.at(-1).options.msg,defaults[6]);}finally{s.dialogs.at(-1).options.callback('no');await kept;}
   assert(s.state.isProtected());assert.equal(s.writes.length,0);
  }finally{s.state.dispose();}
 }
});


test('Indonesian removal identifies password protection instead of inheriting an unrelated file-name label',()=>{
 for(const editor of editors){
  const strings=catalog(editor,'id');
  assert.equal(strings[prefix+'txtLocalRemovePassword'],'Hapus kata sandi',editor);
  assert.equal(strings[prefix+'txtLocalAddPassword'],'Tambahkan kata sandi',editor);
 }
});
test('delayed actual locale loading without the lazy password view keeps both safety warnings usable',async()=>{
 const s=await setup('fr',catalog('documenteditor','fr'),{deferred:true,missingView:true});
 try{
  for(const [run,index]of [[()=>s.state.confirmExport(),5],[()=>s.state.save(async()=>assert.fail('Refusal must not write'),null),6]]){
   const pending=run();pending.catch(()=>{});await tick();const options=s.dialogs.at(-1)?.options;
   try{
    assert(options,'English safety warning must render before locale/view availability');
    assert.equal(options.msg,defaults[index]);assert.deepEqual(Array.from(options.buttons),['no','yes']);
    options.callback('no');await assert.rejects(pending,e=>e.code==='cancelled');
   }finally{if(options&&!s.dialogs.at(-1).closed)options.callback('no');await pending.catch(()=>{});}
   assert(s.state.isProtected());assert.equal(s.writes.length,0);
  }
 }finally{await s.releaseLocale();s.state.dispose();}
});


test('actual unsupported-locale 404 and failed fetch preserve English consequences and refusal',async()=>{
 for(const failedFetch of [false,true]){
  const s=await setup('fa',catalog('documenteditor','en'),{notFound:!failedFetch,failedFetch});
  try{
   await new Promise(resolve=>setTimeout(resolve,10));
   assert.deepEqual(s.requests,['locale/fa.json','locale/en.json']);
   assert.equal(s.locale.getCurrentLanguage(),failedFetch?null:'en');
   for(const [run,index]of [[()=>s.state.confirmExport(),5],[()=>s.state.save(async()=>assert.fail('Refusal must not write'),null),6]]){
    const pending=run();pending.catch(()=>{});await tick();const options=s.dialogs.at(-1)?.options;
    try{
     assert(options);assert.equal(options.msg,defaults[index]);assert.deepEqual(Array.from(options.buttons),['no','yes']);
     options.callback('no');await assert.rejects(pending,e=>e.code==='cancelled');
    }finally{if(options&&!s.dialogs.at(-1).closed)options.callback('no');await pending.catch(()=>{});}
    assert(s.state.isProtected());assert.equal(s.writes.length,0);
   }
  }finally{s.state.dispose();}
 }
});


test('Arabic password title uses the correctly spelled password label',()=>{
 for(const editor of editors)assert.equal(catalog(editor,'ar')[prefix+'txtPassword'],'كلمة المرور',editor);
});


test('unprotected local copies bypass password choices and preserve the session',async()=>{
 for(const editor of editors)for(const language of languages){
  const s=await setup(language,catalog(editor,language),{unprotected:true});
  try{
   const initial={protected:s.state.isProtected(),locked:s.state.isRecoveryLocked(),dialogs:s.dialogs.length};let copies=0,saves=0;
   assert.equal(await s.state.copyAs('docx',async(options,metadata)=>{
    copies++;assert.equal(Object.keys(options).length,0);assert.equal(metadata.protected,false);assert.equal(metadata.remove,false);return 'public-copy-sentinel';
   }),'public-copy-sentinel');
   assert.equal(await s.state.saveAs(async choice=>{saves++;assert.equal(choice,undefined);return 'public-save-sentinel';}),'public-save-sentinel');
   assert.equal(copies,1);assert.equal(saves,1);assert.equal(s.dialogs.length,initial.dialogs);assert.equal(initial.dialogs,0);
   assert.equal(s.state.isProtected(),initial.protected);assert.equal(s.state.isRecoveryLocked(),initial.locked);assert.equal(s.state.isProtected(),false);assert.equal(s.writes.length,0);
  }finally{s.state.dispose();}
 }
});
