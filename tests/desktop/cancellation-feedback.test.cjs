// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const errors=require('../../desktop/errors.js');
const source=fs.readFileSync(require.resolve('../../desktop/renderer.js'),'utf8');
function boot(locked=false){
 const message={textContent:'Previous operation',hidden:false},scope={
  window:{EOLocalFailure:'Previous error'},EODesktopErrors:errors,
  $:id=>{assert.equal(id,'message');return message;},
  controller:{isRecoveryLocked:()=>locked},frame:null,statusOperation:null,
  info:{strings:{savePermission:'Public permission error',error:'Public unknown error'}},
  t:key=>key==='cancel'?'Cancel':key
 };
 const context=vm.createContext(scope);
 const lines=['const status=','const fail='].map(prefix=>{const line=source.split('\n').find(x=>x.startsWith(prefix));assert(line,'Actual renderer handler available: '+prefix);return line;});
 vm.runInContext(lines.join('\n')+'\nwindow.testFailure=fail;',context);
 return {message,window:scope.window,fail:scope.window.testFailure};
}
for(const [name,error]of [
 ['save dialog',Error('Save cancelled')],
 ['Electron IPC save dialog',Error("Error invoking remote method 'eo:save': Error: Save cancelled")],
 ['PDF output dialog',Error('PDF saving cancelled')],
 ['conversion abort',Object.assign(Error('Conversion cancelled'),{name:'AbortError'})],
 ['structured cancellation',Object.assign(Error('Public cancellation'),{code:'cancelled'})]
])test(name+' cancellation clears stale status and permits a later real error',()=>{
 const h=boot();h.fail(error);assert.equal(h.message.hidden,true);assert.equal(h.message.textContent,'');assert.equal(h.window.EOLocalFailure,null);
 h.fail(Object.assign(Error('Public denied output'),{code:'EACCES'}));assert.equal(h.message.hidden,false);assert.equal(h.message.textContent,'Public permission error');assert.equal(h.window.EOLocalFailure,'Public permission error');
 h.fail(error);assert.equal(h.message.hidden,true);assert.equal(h.message.textContent,'');assert.equal(h.window.EOLocalFailure,null);
});
test('cancellation retains the existing password-protection recovery warning',()=>{
 const h=boot(true);h.fail(Error('Save cancelled'));assert.equal(h.message.hidden,false);assert.equal(h.message.textContent,'AutoRecover is disabled for this session because password protection was used');assert.equal(h.window.EOLocalFailure,null);
});
