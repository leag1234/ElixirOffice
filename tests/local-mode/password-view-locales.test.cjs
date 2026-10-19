// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM;assert(upstream,'Explicit owned EO_UPSTREAM required');
const web=path.join(upstream,'web-apps'),fields=['txtTitle','txtPassword','txtDescription','txtRepeat','txtIncorrectPwd','txtWarning'];
function view(locale){
 const Common={Locale:locale,Views:{},UI:{Window:{prototype:{initialize(options){this.initConfig=options}},extend(properties){function Dialog(options){this.initialize(options)}Dialog.prototype=properties;return Dialog}}}};
 const _={extend:Object.assign,template:text=>()=>text};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/common/main/lib/view/PasswordDialog.js'),'utf8'),{Common,_,define:(_deps,factory)=>factory()});
 return Common.Views.PasswordDialog;
}
test('local password instance renders catalog fields without changing the hosted prototype or options',()=>{
 const Dialog=view(),before=Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]]));
 for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor']){
  const root=path.join(web,'apps',editor,'main/locale');
  for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.json'))){
   const strings=JSON.parse(fs.readFileSync(path.join(root,name),'utf8')),labels=Object.fromEntries(fields.map(key=>[key,strings['Common.Views.PasswordDialog.'+key]||before[key]])),handler=()=>{};
   const local=new Dialog({handler,localPasswordLabels:{...labels,width:999,handler:'not a handler'}});
   assert.equal(local.initConfig.title,labels.txtTitle,editor+'/'+name+'/title');
   for(const key of fields.filter(key=>!['txtTitle','txtIncorrectPwd'].includes(key)))assert(local.initConfig.tpl.includes(labels[key]),editor+'/'+name+'/'+key);
   assert.equal(local.txtIncorrectPwd,labels.txtIncorrectPwd);assert.equal(local.handler,handler);assert.equal(local.initConfig.width,395);
   assert.deepEqual(Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]])),before);
   const hosted=new Dialog({handler});assert.equal(hosted.initConfig.title,before.txtTitle);assert(hosted.initConfig.tpl.includes(before.txtDescription));assert.equal(hosted.handler,handler);
  }
 }
});


function addThroughController(Dialog,locale,marker){
 let local,options,shows=0;const writes=[],events=[];
 function PasswordDialog(config){options=config;local=new Dialog(config);local.show=()=>{shows++};return local;}
 PasswordDialog.prototype=Dialog.prototype;
 const Common={Locale:locale,Controllers:{},Views:{PasswordDialog},NotificationCenter:{trigger(...args){events.push(args)}}};
 const api={eoLocalMode:marker,asc_setCurrentPassword(value){writes.push(value)}};
 vm.runInNewContext(fs.readFileSync(path.join(web,'apps/common/main/lib/controller/Protection.js'),'utf8'),{Common,Backbone:{Controller:{extend:properties=>properties}},_:{extend:Object.assign},define:(_deps,factory)=>factory()});
 Common.Controllers.Protection.addPassword.call({api});
 return {local,options,api,writes,events,get shows(){return shows}};
}
test('actual local Add controller passes catalog labels without changing hosted construction',()=>{
 for(const editor of ['documenteditor','spreadsheeteditor','presentationeditor']){
  const root=path.join(web,'apps',editor,'main/locale');
  for(const name of fs.readdirSync(root).filter(name=>name.endsWith('.json'))){
   const strings=JSON.parse(fs.readFileSync(path.join(root,name),'utf8')),requests=[],locale={get(key,options){requests.push({key,name:options.name});return strings['Common.Views.PasswordDialog.'+key]||options.default;}};
   const Dialog=view(locale),before=Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]])),s=addThroughController(Dialog,locale,true),local=s.local;
   assert.equal(local.initConfig.title,strings['Common.Views.PasswordDialog.txtTitle'],editor+'/'+name+'/Add-title');
   for(const key of fields.filter(key=>!['txtTitle','txtIncorrectPwd'].includes(key)))assert(local.initConfig.tpl.includes(strings['Common.Views.PasswordDialog.'+key]),editor+'/'+name+'/Add-'+key);
   assert.equal(local.txtIncorrectPwd,strings['Common.Views.PasswordDialog.txtIncorrectPwd']);assert.equal(local.handler,s.options.handler);assert.equal(s.options.api,s.api);assert.equal(s.shows,1);
   assert(local.initConfig.cls.split(/\s+/).includes('eo-local-password'),'Local Add description uses scoped wrapping');
   assert.deepEqual(Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]])),before);
   assert.deepEqual(requests.map(r=>r.key),fields);assert(requests.every(r=>r.name==='Common.Views.PasswordDialog'));
   s.options.handler('cancel','');assert.equal(s.writes.length,0);assert.deepEqual(s.events,[['edit:complete']]);
   s.options.handler('ok','public-add-password');assert.deepEqual(s.writes,['public-add-password']);assert.deepEqual(s.events,[['edit:complete'],['edit:complete']]);
  }
 }
});
test('actual Add lookup failures stay readable and hosted and explicit-label callers preserve their contracts',()=>{
 for(const mode of ['missing','throws','blank','non-string']){
  const locale=mode==='missing'?undefined:{get(){if(mode==='throws')throw Error('Injected lookup failure');return mode==='blank'?'   ':123;}},Dialog=view(locale);
  const expected=Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]])),s=addThroughController(Dialog,locale,true),local=s.local;
  assert.equal(local.initConfig.title,expected.txtTitle,mode);
  for(const key of fields){assert.equal(local[key],expected[key],mode+'/'+key);assert(local[key].trim());}
  assert(local.initConfig.cls.split(/\s+/).includes('eo-local-password'));
  s.options.handler('cancel','');assert.equal(s.writes.length,0);assert.deepEqual(s.events,[['edit:complete']]);
 }
 let lookups=0;
 const locale={get(){lookups++;throw Error('Hosted/explicit callers must not look up labels');}},Dialog=view(locale),before=Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]])),handler=()=>{};
 const labels=Object.fromEntries(fields.map(key=>[key,'Explicit '+key])),options={api:{eoLocalMode:true},handler,cls:'custom-dialog',localPasswordLabels:labels},local=new Dialog(options);
 for(const key of fields)assert.equal(local[key],labels[key]);
 assert.equal(local.initConfig.cls,'custom-dialog');assert.equal(lookups,0);assert.equal(local.handler,handler);
 for(const marker of [undefined,false,'true']){
  const s=addThroughController(Dialog,locale,marker);
  assert.equal(s.local.initConfig.title,before.txtTitle);assert.equal(s.local.initConfig.cls,'modal-dlg');assert.equal(lookups,0);
  assert.deepEqual(Object.keys(s.options).sort(),['api','handler']);s.options.handler('cancel','');assert.equal(s.writes.length,0);
  assert.deepEqual(s.events,[['edit:complete']]);
 }
 assert.deepEqual(Object.fromEntries(fields.map(key=>[key,Dialog.prototype[key]])),before);
});
