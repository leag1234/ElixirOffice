// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sdk=process.env.EO_SDKJS||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer/sdkjs');
function boot(){const AscCommon={},window={AscCommon};const c={window,AscCommon};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(sdk,'common/skin.js'),'utf8'),c);return c;}
test('page shadow alpha survives empty-token themes, repeated theme switches and fresh initialization',()=>{
 const c=boot();for(const value of ['rgba(0, 0, 0, 0.22)','','rgba(0, 0, 0, 0.22)','rgba(0, 0, 0, 0.6)','rgba(0, 0, 0, 0.22)']){
  c.updateGlobalSkin({name:'theme-white',type:'light','canvas-page-shadow':value});
  assert.equal(c.AscCommon.GlobalSkin.PageShadow,value||'rgba(0,0,0,0)');
 }
 const fresh=boot();fresh.updateGlobalSkin({name:'theme-white',type:'light','canvas-page-shadow':'rgba(0, 0, 0, 0.22)'});
 assert.equal(fresh.AscCommon.GlobalSkin.PageShadow,c.AscCommon.GlobalSkin.PageShadow);
});
