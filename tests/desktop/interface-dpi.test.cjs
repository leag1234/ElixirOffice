// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sdk=process.env.EO_SDKJS||path.join(process.env.EO_UPSTREAM||path.resolve(process.env.HOME,'elixiroffice/DocumentServer'),'sdkjs');
const source=fs.readFileSync(path.join(sdk,'common/device_scale.js'),'utf8');
function sample(dpr,bridge='desktop'){
 const window={devicePixelRatio:dpr,parent:{}},document={firstElementChild:{style:{}},body:{}};
 if(bridge==='desktop')window.parent.eoDesktop={interfaceSize(){}};
 else if(bridge==='top')window.eoDesktop={interfaceSize(){}};
 else if(bridge==='wrong')window.parent.eoDesktop={interfaceSize:true};
 else if(bridge==='cross-origin')Object.defineProperty(window.parent,'eoDesktop',{get(){throw Error('Cross-origin access denied')}});
 vm.runInNewContext(source,{window,document,navigator:{userAgent:'Chrome/152.0.0.0'}});
 const value=window.AscCommon.checkDeviceScale();window.AscCommon.correctApplicationScale(value);
 return {value,css:document.firstElementChild.style.zoom||'normal'};
}
test('hosted and ordinary local-browser scaling retain the inherited rounding policy',()=>{
 for(const mode of ['hosted','wrong','cross-origin']){
  const row=sample(1.66,mode);assert.equal(row.value.applicationPixelRatio,1.5,mode);assert.equal(row.value.correct,true,mode);
  assert(Math.abs(Number(row.css)-1.5/1.66)<1e-8,mode);
 }
 assert.equal(sample(2,'hosted').value.applicationPixelRatio,2);
});
test('feature-detected desktop preload keeps actual fractional DPR without compensating it down',()=>{
 for(const mode of ['desktop','top'])for(const dpr of [1,1.25,1.5,1.66,1.671875,1.75,2]){
  const row=sample(dpr,mode);
  assert.equal(row.value.applicationPixelRatio,dpr,mode+':'+dpr);assert.equal(row.value.devicePixelRatio,dpr);
  assert.equal(row.value.correct,false);assert.equal(row.value.zoom,1);assert.equal(row.css,'normal');
 }
});
test('desktop browser zoom preserves actual density across every interface preset and OS scale',()=>{
 for(const os of [1,1.671875,2])for(const preset of [80,90,100,110,125,150,175,200]){
  const dpr=os*preset/100,row=sample(dpr);
  assert.equal(row.value.applicationPixelRatio,dpr,os+':'+preset);
  assert.equal(row.value.zoom,1);assert.equal(row.css,'normal');
 }
});
