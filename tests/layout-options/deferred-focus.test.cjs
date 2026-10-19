// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
assert(process.env.EO_UPSTREAM,'Set EO_UPSTREAM to the owned DocumentServer checkout');
const root=path.join(process.env.EO_UPSTREAM,'web-apps/apps/documenteditor/main/app');
function method(file,name){
 const full=process.env.EO_FOCUS_BASELINE_DIR?path.join(process.env.EO_FOCUS_BASELINE_DIR,path.basename(file)):path.join(root,file);
 const source=fs.readFileSync(full,'utf8'),key=source.indexOf(name+': function');assert(key>=0,name);
 const start=source.indexOf('function',key),brace=source.indexOf('{',start);
 let depth=0,quote=null,escaped=false,line=false,block=false;
 for(let i=brace;i<source.length;i++){
  const c=source[i],n=source[i+1];
  if(line){if(c==='\n')line=false;continue;}
  if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
  if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
  if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}
  if(c==="'"||c==='"'){quote=c;continue;}
  if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(start,i+1);
 }
 assert.fail('Unterminated '+name);
}
const sources={main:method('controller/Main.js','onEditComplete'),wrap:method('controller/PageLayout.js','onClickMenuWrapping'),move:method('elixir-images/LayoutOptions.js','applyMove'),flyout:method('elixir-images/LayoutOptions.js','applyWrap')};
function fixture(){
 const document={activeElement:{id:'radio'}},tasks=[],events={focus:0,shape:[],marker:[],cancel:0,save:[],hints:[],apply:[],toolbar:[],notifications:[],polygon:0,paneFocus:0,refresh:0};
 const shape={pressed:true,toggle(v){this.pressed=v;}},highlight={pressed:true,toggle(v){this.pressed=v;}};
 const toolbar={btnInsertShape:shape,btnInsertText:{pressed:false,toggle(v){this.pressed=v;}},btnHighlightColor:highlight},right={_isEyedropperStart:true};
 function Property(){this.values={};}
 for(const [name,key]of [['put_WrappingStyle','wrap'],['put_PositionH','h'],['put_PositionV','v']])Property.prototype[name]=function(v){this.values[key]=v;};
 Property.prototype.get_PositionH=function(){return this.values.h;};Property.prototype.get_PositionV=function(){return this.values.v;};
 function Position(){this.values={};}
 for(const [name,key]of [['put_UseAlign','align'],['put_Percent','percent'],['put_RelativeFrom','relative'],['put_Value','value']])Position.prototype[name]=function(v){this.values[key]=v;};
 const api={ImgApply:p=>events.apply.push(p),StartAddShape:(...a)=>events.shape.push(a),SetMarkerFormat:v=>events.marker.push(v),asc_cancelEyedropper:()=>events.cancel++,asc_isDocumentCanSave:()=>true,StartChangeWrapPolygon:()=>events.polygon++};
 const holder={focus:()=>{events.focus++;tasks.push(()=>{document.activeElement={id:'area_id'};});}};
 const application={getController:name=>({getView:()=>name==='Toolbar'?toolbar:name==='RightMenu'?right:holder})};
 const main={appOptions:{isEdit:true},api,disableSaveButton:v=>events.save.push(v),getApplication:()=>application};
 const context={document,WRAPS:[{key:'square',style:'Square'}],_imgOriginalProps:{get_WrappingStyle:()=>0,get_Value_X:()=>11,get_Value_Y:()=>22},
  Asc:{asc_CImgProperty:Property,CImagePositionH:Position,CImagePositionV:Position,c_oAscWrapStyle2:{Inline:0,Square:1},c_oAscRelativeFromH:{Column:'column',Page:'page'},c_oAscRelativeFromV:{Paragraph:'paragraph',Page:'page'}},
  _:{defer:fn=>tasks.push(fn),isObject:v=>v!==null&&typeof v==='object',findWhere:(xs,q)=>xs.find(x=>Object.entries(q).every(([k,v])=>x[k]===v)),find:(xs,fn)=>xs.find(fn)},Common:{UI:{HintManager:{clearHints:v=>events.hints.push(v)}}}};
 const functions={};for(const [name,source]of Object.entries(sources))functions[name]=vm.runInNewContext('('+source+')',context);
 toolbar.fireEvent=(...args)=>{events.toolbar.push(args);functions.main.call(main,...args.slice(1));};
 context.Common.NotificationCenter={trigger:(...args)=>{events.notifications.push(args);functions.main.call(main,...args.slice(1));}};
 const item={options:{wrapType:1}},layout={api,toolbar},menu={items:[item],trigger:(...args)=>functions.wrap.call(layout,...args.slice(1))};
 context.DE={getController:()=>({toolbar:{btnImgWrapping:{menu}}})};
 const tile={id:'selected-tile'},view={api,imgProps:{get_Value_X:()=>11,get_Value_Y:()=>22},refresh:()=>events.refresh++,$pane:{find:()=>({focus:()=>{events.paneFocus++;document.activeElement=tile;}})}};
 return {main,layout,item,view,functions,document,events,toolbar,right,flush:()=>{while(tasks.length)tasks.shift()();}};
}
function cleanup(f){
 assert.equal(f.toolbar.btnInsertShape.pressed,false);assert.equal(f.toolbar.btnHighlightColor.pressed,false);assert.equal(f.right._isEyedropperStart,false);
 assert.deepEqual(f.events.shape,[['',false]]);assert.deepEqual(f.events.marker,[false]);assert.equal(f.events.cancel,1);
 assert.deepEqual(f.events.save,[true]);assert.deepEqual(f.events.hints,[true]);
}
for(const [name,options]of [['undefined',undefined],['empty',{}],['false',{preserveFocus:false}],['string',{preserveFocus:'true'}]]){
 test('Main default focus remains for '+name+' options',()=>{const f=fixture();f.functions.main.call(f.main,{},options);cleanup(f);assert.equal(f.events.focus,1);f.flush();assert.equal(f.document.activeElement.id,'area_id');});
}
test('only literal true preserves focus with all completion side effects',()=>{
 const f=fixture(),owner=f.document.activeElement;f.functions.main.call(f.main,{}, {preserveFocus:true});cleanup(f);assert.equal(f.events.focus,0);f.flush();assert.equal(f.document.activeElement,owner);
});
test('flyout wrapping forwards through the actual PageLayout handler and retains position properties',()=>{
 const f=fixture();f.functions.flyout.call(f.view,'square');cleanup(f);
 assert.equal(f.events.toolbar.length,1);assert.equal(f.events.toolbar[0].length,3);assert.equal(f.events.toolbar[0][2].preserveFocus,true);assert.equal(f.events.focus,0);assert.equal(f.events.refresh,1);assert.equal(f.events.paneFocus,1);
 const p=f.events.apply[0].values;assert.equal(p.wrap,1);assert.equal(p.h.values.value,11);assert.equal(p.v.values.value,22);assert.equal(p.h.values.relative,'column');assert.equal(p.v.values.relative,'paragraph');
});
test('native ribbon wrap retains its original event arity and document focus',()=>{
 const f=fixture();f.functions.wrap.call(f.layout,null,f.item,{});cleanup(f);assert.equal(f.events.toolbar[0].length,2);assert.equal(f.events.focus,1);
});
test('polygon edit keeps its original focus even when given the option',()=>{
 const f=fixture();f.functions.wrap.call(f.layout,null,{options:{wrapType:'edit'}},{preserveFocus:true});assert.equal(f.events.polygon,1);assert.equal(f.events.apply.length,0);assert.equal(f.events.toolbar[0].length,2);assert.equal(f.events.focus,1);
});
test('radio completion forwards through NotificationCenter without document focus',()=>{
 const f=fixture();f.functions.move.call(f.view,true);cleanup(f);assert.equal(f.events.notifications[0][0],'edit:complete');assert.equal(f.events.notifications[0][2].preserveFocus,true);assert.equal(f.events.focus,0);assert.equal(f.events.apply.length,1);
});
for(const action of ['Escape','F6','Shift+F6','pointer','other-pane-control','other-outside-control']){
 test('radio completion cannot queue focus over a later '+action,()=>{
  const f=fixture();f.functions.move.call(f.view,false);const next={id:action};f.document.activeElement=next;f.flush();assert.equal(f.document.activeElement,next);assert.equal(f.events.focus,0);
 });
}
