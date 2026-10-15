// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
const source=fs.readFileSync(path.join(upstream,'web-apps/apps/pdfeditor/main/app/controller/Main.js'),'utf8');
const start=source.indexOf('var localLauncher = false;'),end=source.indexOf('if (localLauncher)',start),guard=source.slice(start,end);
test('actual PDF bootstrap guard detects local parents and safely rejects cross-origin parent access',()=>{
 assert(start>0&&end>start);
 for(const [parent,expected]of [[{EOLocalOpen(){}},true],[{EODesktopState(){}},true],[{},false],[new Proxy({},{get(){throw Error('cross-origin SecurityError')}}),false]]){
  const context={window:{parent}};assert.doesNotThrow(()=>vm.runInNewContext(guard,context));assert.equal(context.localLauncher,expected);
 }
 const window={};window.parent=window;const context={window};vm.runInNewContext(guard,context);assert.equal(context.localLauncher,false);
});

