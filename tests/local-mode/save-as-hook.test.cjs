// SPDX-FileCopyrightText: 2026 ElixirOffice contributors
// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const web=process.env.EO_WEB_APPS||(process.env.EO_UPSTREAM&&path.join(process.env.EO_UPSTREAM,'web-apps'));
assert(web&&path.isAbsolute(web),'Explicit owned EO_WEB_APPS or EO_UPSTREAM required');
const source=path.join(web,'apps/common/main/lib/elixir-chrome/Backstage.js');
function setup(mode={isElixirLocal:true,localDownloadFormats:[65,67,68,513]},capability=true){
 function extend(props){function View(){}View.prototype=props;View.extend=extend;return View;}
 const events=[],options=[],names=[],downloads=[],errors=[];let resolve,reject,delegated=0;
 const FormatDialog={chooseFile:config=>{options.push(config);return new Promise((a,b)=>{resolve=a;reject=b;})}};
 function Window(){}Window.prototype.okButtonText='OK';Window.prototype.cancelButtonText='Cancel';
 const Common={Utils:{String:{htmlEncode:value=>value}},UI:{BaseView:extend({initialize(){}}),Window},Views:{},Controllers:{LaunchController:{isScriptLoaded:()=>true}},NotificationCenter:{trigger:name=>events.push(name)}};
 const caps={sourceFormat:'rtf',language:'fr',getName:()=> 'Public copy',validateName:()=>true,commitName:(name,format)=>names.push({name,format}),onError:e=>errors.push(e)};
 const main={api:capability?{eoLocalSaveAs:caps}:{}};
 const context={window:{},Common,Backbone:{View:{extend}},_:{extend:Object.assign},Asc:{c_oAscFileType:{}},define:(_deps,factory)=>factory(null,null,FormatDialog),console,Promise};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),context,{filename:source});
 const me=Object.create(Common.Views.ElixirBackstage.prototype);
 me.mode=mode;me.ctrl=name=>name==='Main'?main:{clickSaveAsFormat:(menu,type)=>downloads.push(type)};
 me.formats=()=>[{type:65,ext:'.docx',name:'txtFmtDocx',desc:'txtFmtDocxDesc',group:'doc'},{type:67,ext:'.odt',name:'txtFmtOdt',desc:'txtFmtOdtDesc',group:'doc'},{type:68,ext:'.rtf',name:'txtFmtRtf',desc:'txtFmtRtfDesc',group:'doc'},{type:513,ext:'.pdf',name:'txtFmtPdf',desc:'txtFmtPdfDesc',group:'pdf'}];
 me.fm={rendered:true,document:{fileType:'docx'},show(panel){assert.equal(panel,'saveas');delegated++;return 'legacy'},fireEvent(){return 'existing event result'},applyMode(){},isVisible:()=>true};
 me.patchFileMenu();
 return {me,caps,options,names,downloads,errors,events,resolve:value=>resolve(value),reject:error=>reject(error),get delegated(){return delegated}};
}
const tick=()=>new Promise(setImmediate);
test('hosted, desktop, and an older browser launcher retain their existing Save As route',()=>{
 for(const [mode,capability]of [[{},true],[{isElixirLocal:true},true],[{isElixirLocal:true,localDownloadFormats:[65]},false]]){
  const s=setup(mode,capability);assert.equal(s.me.fm.show('saveas'),'legacy');assert.equal(s.delegated,1);assert.equal(s.options.length,0);assert.deepEqual(s.events,[]);
 }
});
test('local browser uses source-format default and Cancel starts neither rename nor conversion',async()=>{
 const s=setup(),pending=s.me.fm.show('saveas');assert.equal(s.me.fm.show('saveas'),pending);await tick();
 assert.equal(s.options.length,1);assert.equal(s.options[0].defaultFormat,'rtf');assert.equal(s.options[0].fileName.value,'Public copy');
 assert.deepEqual(Array.from(s.options[0].formats,x=>x.value),['docx','odt','rtf','pdf']);
 s.resolve(null);assert.equal(await pending,null);assert.deepEqual(s.names,[]);assert.deepEqual(s.downloads,[]);assert.deepEqual(s.events,['modal:show','modal:hide']);assert.equal(s.me._localSaveAs,null);
});
test('OK commits the chosen copy name once before the existing conversion handler',async()=>{
 const s=setup();s.caps.sourceFormat='doc';const pending=s.me.fm.show('saveas');await tick();assert.equal(s.options[0].defaultFormat,'docx');
 s.resolve({format:'pdf',name:'Public PDF'});await pending;
 assert.deepEqual(s.names,[{format:'pdf',name:'Public PDF'}]);assert.deepEqual(s.downloads,[513]);assert.equal(s.delegated,0);assert.deepEqual(s.errors,[]);assert.deepEqual(s.events,['modal:show','modal:hide']);
});
test('dialog rejection and synchronous creation failure both release the SDK modal lock',async()=>{
 const s=setup(),pending=s.me.fm.show('saveas');await tick();s.reject(Error('Injected dialog rejection'));assert.equal(await pending,null);
 assert.equal(s.errors.length,1);assert.deepEqual(s.downloads,[]);assert.deepEqual(s.events,['modal:show','modal:hide']);
 const broken=setup();broken.caps.getName=()=>{throw Error('Injected name getter failure')};
 assert.equal(await broken.me.fm.show('saveas'),null);assert.equal(broken.errors.length,1);assert.deepEqual(broken.events,['modal:show','modal:hide']);
});

test('real Controller.prepare carries browser Save As capabilities and keeps desktop capability absent',()=>{
 const Names=require(path.join(web,'apps/common/main/lib/elixir-local/FileNames.js'));let controller;
 const define=(_deps,factory)=>{controller=factory({}, {}, {prepare(){}},{},Names)};define.amd=true;
 class Request{open(){}}
 const context={define,Common:{},navigator:{},location:{href:'https://office.example.invalid/example/local.html'},fetch:async()=>{},XMLHttpRequest:Request,URL,Asc:{c_oLicenseResult:{Success:1},c_oRights:{Edit:1}},console};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/common/main/lib/elixir-local/Controller.js'),'utf8'),context);
 for(const saveAs of [{sourceFormat:'rtf',getName:()=> 'Public copy'},undefined]){
  const api={DocInfo:{get_OfflineApp:()=>true},eoLocalSaveAs:{stale:true}},main={appOptions:{},onEditorPermissions:()=> 'existing permission result',
   getApplication:()=>({getController:()=>({leftMenu:{getMenu:()=>({txtVersionNum:'9.3.4'})}})})};
  const formats=[65,67,68,513];controller.prepare(api,main,{downloadFormats:formats,saveAs});
  assert.equal(api.eoLocalMode,true);assert.equal(api.eoLocalSaveAs,saveAs);
  const params={setLicenseType(){},setRights(){},setIsLight(){},setBuildVersion(){}};
  assert.equal(main.onEditorPermissions(params),'existing permission result');assert.equal(main.appOptions.isElixirLocal,true);
  assert.equal(main.appOptions.localDownloadFormats,formats);
 }
});


test('opening File does not open a dialog; the explicit Save As item opens it without another button step',async()=>{
 const s=setup();let shown=0;
 const element={hasClass:()=>false,addClass(){return this},html(){return this},find:()=>({on(){}})};
 s.me.fm.panels={saveas:{$el:element,show(){shown++;return 'existing panel result'}}};
 s.me.enhanceSaveAs();assert.equal(s.me.fm.panels.saveas.show(),'existing panel result');await tick();
 assert.equal(shown,1);assert.equal(s.options.length,0,'Default Save As panel must not launch a modal on File');
 const pending=s.me.fm.fireEvent('item:click',[s.me.fm,'saveas',true]);await tick();assert.equal(s.options.length,1);
 s.resolve(null);await pending;assert.deepEqual(s.downloads,[]);assert.deepEqual(s.events,['modal:show','modal:hide']);
 assert.equal(s.me.fm.fireEvent('menu:show',[s.me.fm]),'existing event result');
});
