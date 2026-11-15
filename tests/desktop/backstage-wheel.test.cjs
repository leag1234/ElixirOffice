// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Issue #83: with a document open the File menu Home/New/Open pages did not react to the mouse wheel.
// sdkjs baseEditorsApi._correctEmbeddedWork() cancels every unmodified legacy mousewheel/DOMMouseScroll
// event on #viewport; the pages must stop those events before they get there (and stay scrollable).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(process.env.EO_BACKSTAGE_SOURCE||path.join(__dirname,'../../desktop/backstage.js'),'utf8');
const assets=fs.readFileSync(path.join(__dirname,'../../tools/desktop/shell_assets.py'),'utf8');
function guard(){
 const line=source.split('\n').find(l=>l.includes('const guardWheel='));assert(line,'guardWheel helper missing');
 return vm.runInNewContext('(()=>{'+line+';return guardWheel})()');
}
function element(){const listeners=[];return {listeners,addEventListener(type,fn,options){listeners.push({type,fn,options})}}}
test('guard stops legacy wheel events without cancelling the native scroll',()=>{
 const el=element();guard()(el);
 assert.deepEqual(el.listeners.map(l=>l.type).sort(),['DOMMouseScroll','mousewheel']);
 for(const l of el.listeners){
  const event={stopped:0,prevented:0,stopPropagation(){this.stopped++},preventDefault(){this.prevented++}};
  l.fn(event);assert.equal(event.stopped,1);assert.equal(event.prevented,0);assert.equal(l.options.passive,true);
 }
});
test('guard is installed once per element and tolerates missing elements',()=>{
 const g=guard(),el=element();g(el);g(el);g(null);g({});assert.equal(el.listeners.length,2);
});
test('Home, Open and New pages install the guard',()=>{
 assert.match(source,/const homePage=page=>\{guardWheel\(page&&page\.\$el&&page\.\$el\[0\]\)/);
 assert.match(source,/this\._newDesktopPanel=panel;\s*guardWheel\(panel\.\$el\[0\]\)/);
});
test('Home pages keep a native vertical scroller (page.refresh is replaced, so the SDK scroller never attaches)',()=>{
 assert.match(assets,/#file-menu-panel \.elx-page\.eo-desktop-page\s*\{overflow-y:auto!important;overflow-x:hidden!important\}/);
});
