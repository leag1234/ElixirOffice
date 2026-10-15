// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),install=require(process.env.EO_PDF_COMPAT_SOURCE||'../../desktop/pdf-compat.js');
function fixture(){
 const listeners={},keys={},calls=[],status=[],doc={},parent={clientHeight:900,onmousewheel:()=>calls.push('legacy'),addEventListener:(name,fn,options)=>{listeners[name]=fn;calls.push(['add',name,options]);},removeEventListener:(name,fn)=>{if(listeners[name]===fn)delete listeners[name];calls.push(['remove',name]);}};
 const viewer={parent,height:900,isVisibleHorScroll:true,file:{Selection:{IsSelection:true}},onMouseWhell:event=>{calls.push(['wheel',event.deltaX,event.deltaY,event.wheelDeltaX,event.wheelDeltaY]);event.preventDefault();event.stopPropagation();}};
 const api={DocInfo:{get_OfflineApp:()=>true},DocumentRenderer:viewer,getPDFDoc:()=>doc,zoomIn:()=>calls.push('zoomIn'),zoomOut:()=>calls.push('zoomOut'),asc_EditPage:()=>calls.push('edit-original')};
 const main={api,appOptions:{canPDFEdit:true,isPDFEdit:true,isEditTextSupport:true}},notifications={trigger:(...args)=>calls.push(['notification',...args])};
 const win={Common:{NotificationCenter:notifications},PDFE:{getController:()=>({documentHolder:{btnEditText:{cmpEl:{hide:()=>calls.push('hide-original')}}}})},document:{addEventListener:(name,fn)=>keys[name]=fn,removeEventListener:(name,fn)=>{if(keys[name]===fn)delete keys[name];}}};
 const adapter=install(win,main,{pdfTextUnavailable:'Localized unavailable'},text=>status.push(text));
 return {adapter,api,main,viewer,parent,listeners,keys,calls,status,doc,notifications};
}
function event(values={}){return {deltaX:0,deltaY:12,deltaMode:0,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;},...values};}
test('local modern PDF wheel uses non-passive pixels/lines/pages once and removes legacy delivery',()=>{
 const f=fixture();assert.equal(f.parent.onmousewheel,null);assert.deepEqual(f.calls.find(x=>x[0]==='add'),['add','wheel',{passive:false,capture:true}]);
 for(const [mode,expected] of [[0,12],[1,540],[2,10800]]){const e=event({deltaMode:mode});f.listeners.wheel(e);assert(e.prevented&&e.stopped);assert.deepEqual(f.calls.at(-1),['wheel',0,expected,0,-expected*120/45]);}
 const count=f.calls.filter(x=>x[0]==='wheel').length;assert.equal(count,3);f.adapter.dispose();assert.equal(typeof f.parent.onmousewheel,'function');assert.equal(f.listeners.wheel,undefined);
});
test('Ctrl/Meta zoom, Shift-horizontal and normal field behavior remain separate',()=>{
 const f=fixture();
 for(const modifier of ['ctrlKey','metaKey']){const e=event({[modifier]:true,deltaY:-100});f.listeners.wheel(e);assert.equal(f.calls.at(-1),'zoomIn');assert(e.prevented&&e.stopped);}
 const e=event({shiftKey:true,deltaY:20});f.listeners.wheel(e);assert.deepEqual(f.calls.at(-1),['wheel',20,0,-20*120/45,0]);
 f.viewer.isVisibleHorScroll=false;f.listeners.wheel(event({shiftKey:true,deltaY:20}));assert.deepEqual(f.calls.at(-1),['wheel',0,20,0,-20*120/45]);
});
test('original PDF text entry points show only a status hint; forms/comments and Copy remain available',()=>{
 const f=fixture();assert.equal(f.main.appOptions.canPDFEdit,false);assert.equal(f.main.appOptions.isEditTextSupport,false);assert.equal(f.api.asc_EditPage(),false);assert.equal(f.status.at(-1),'Localized unavailable');assert(!f.calls.includes('edit-original'));
 f.notifications.trigger('pdf:mode-apply','edit');assert.equal(f.status.length,2);f.notifications.trigger('other','value');assert.deepEqual(f.calls.at(-1),['notification','other','value']);
 for(const key of ['a','Delete','Backspace']){const e=event({key});f.keys.keydown(e);assert(e.prevented&&e.stopped);}
 for(const key of ['x','v']){const e=event({key,metaKey:true});f.keys.keydown(e);assert(e.prevented);}
 const copy=event({key:'c',metaKey:true});f.keys.keydown(copy);assert(!copy.prevented);
 f.doc.activeForm={};const form=event({key:'a'});f.keys.keydown(form);assert(!form.prevented);f.doc.activeForm=null;
 const input=event({key:'a',target:{isContentEditable:true}});f.keys.keydown(input);assert(!input.prevented);
 f.doc.mouseDownAnnot={};const annot=event({key:'a'});f.keys.keydown(annot);assert(!annot.prevented);
});
test('desktop PDF adapter refuses a hosted API before changing its listeners',()=>{
 assert.throws(()=>install({},{api:{DocInfo:{get_OfflineApp:()=>false},DocumentRenderer:{parent:{}}}}, {},()=>{}),/offline viewer/);
});

test('small pinch deltas accumulate, reverse cleanly and clamp huge events',()=>{
 const f=fixture(),zoom=()=>f.calls.filter(c=>c==='zoomIn'||c==='zoomOut');
 for(let i=0;i<99;i++)f.listeners.wheel(event({ctrlKey:true,deltaY:-1}));
 assert.equal(zoom().length,0);f.listeners.wheel(event({ctrlKey:true,deltaY:-1}));assert.deepEqual(zoom(),['zoomIn']);
 f.listeners.wheel(event({metaKey:true,deltaY:-90}));f.listeners.wheel(event({metaKey:true,deltaY:10}));assert.equal(zoom().length,1);
 f.listeners.wheel(event({metaKey:true,deltaY:90}));assert.deepEqual(zoom(),['zoomIn','zoomOut']);
 f.listeners.wheel(event({ctrlKey:true,deltaY:100000}));assert.equal(zoom().length,5);
});

test('capture adapter prevents inherited holder and document zoom delivery exactly once',()=>{
 const f=fixture(),options=f.calls.find(x=>x[0]==='add'&&x[1]==='wheel')[2];
 let holderZoom=0,documentZoom=0;
 function dispatch(delta){
  const e=event({ctrlKey:true,deltaY:delta});let immediate=false;
  e.stopImmediatePropagation=()=>{immediate=true;e.stopped=true;};
  if(options.capture)f.listeners.wheel(e);
  if(!immediate){holderZoom++;f.api.zoomIn();if(!options.capture)f.listeners.wheel(e);}
  if(!e.stopped){documentZoom++;f.api.zoomIn();}
  return e;
 }
 for(let n=0;n<8;n++){const e=dispatch(-10);assert(e.prevented&&e.stopped);}
 assert.equal(holderZoom,0);assert.equal(documentZoom,0);assert.equal(f.calls.filter(x=>x==='zoomIn').length,0);
 dispatch(-20);assert.equal(f.calls.filter(x=>x==='zoomIn').length,1);
 f.adapter.dispose();assert.equal(f.listeners.wheel,undefined);
});
