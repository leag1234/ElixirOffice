// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {inspectPackage}=require('../../tools/desktop-updates/check-packaged-updater.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
 const root=path.resolve(__dirname,'../../desktop/vendor/lazy-val-shim');
 const source={package:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),code:fs.readFileSync(path.join(root,'index.cjs')),license:fs.readFileSync(path.join(root,'LICENSE'))};
 const map=new Map(),put=(name,value)=>map.set(name,Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value)));
 put('package.json',{name:'synthetic-package',version:'0.0.0'});
 put('update-production-trust.cjs',fs.readFileSync(path.resolve(__dirname,'../../desktop/update-production-trust.cjs')));
 put('node_modules/electron-updater/package.json',{name:'electron-updater',version:'6.8.9',license:'MIT'});
 put('node_modules/electron-updater/LICENSE','synthetic MIT notice');
 for(const [name,value] of [['package.json',source.package],['index.cjs',source.code],['LICENSE',source.license]])put('node_modules/lazy-val/'+name,value);
 const inventory=[{name:'electron-updater',version:'6.8.9',license:'MIT',notice_files:[{member:'package/LICENSE',sha256:sha(Buffer.from('synthetic MIT notice'))}]}];
 return {source,map,inventory,put,run(){return inspectPackage({files:[...map.keys()],read:name=>map.get(name),source,inventory});}};
}
test('actual packaged closure accepts only owned shim source and notices',()=>{
 const f=fixture(),r=f.run();assert.equal(r.lazyDirectory,'node_modules/lazy-val');
 assert.equal(r.updaterVersion,'6.8.9');assert.equal(r.shimSha256,sha(f.source.code));
});
for(const [label,change] of [
 ['original registry lazy',f=>f.put('node_modules/lazy-val/package.json',{name:'lazy-val',version:'1.0.5',license:'MIT'})],
 ['shadowing nested original',f=>f.put('node_modules/electron-updater/node_modules/lazy-val/package.json',{name:'lazy-val',version:'1.0.5'})],
 ['changed shim bytes',f=>f.put('node_modules/lazy-val/index.cjs','changed')],
 ['changed shim notice',f=>f.put('node_modules/lazy-val/LICENSE','changed')],
 ['changed shim main',f=>f.put('node_modules/lazy-val/package.json',{...f.source.package,main:'other.cjs'})],
 ['missing upstream notice',f=>f.map.delete('node_modules/electron-updater/LICENSE')],
 ['changed upstream notice',f=>f.put('node_modules/electron-updater/LICENSE','changed')],
 ['unexpected runtime module',f=>f.put('node_modules/unreviewed/package.json',{name:'unreviewed',version:'1.0.0'})],
 ['build-only module',f=>f.put('node_modules/app-builder-lib/package.json',{name:'app-builder-lib',version:'26.15.3'})],
 ['wrong updater version',f=>f.put('node_modules/electron-updater/package.json',{name:'electron-updater',version:'6.8.10',license:'MIT'})],
 ['updater absent',f=>f.map.delete('node_modules/electron-updater/package.json')],
 ['shim absent',f=>f.map.delete('node_modules/lazy-val/package.json')],
 ['unsafe path',f=>f.put('../package.json',{name:'bad'})],
])test('packaged closure refuses '+label,()=>{const f=fixture();change(f);assert.throws(()=>f.run());});
test('actual packaged closure refuses substituted QA trust and nested QA key IDs',()=>{
 const f=fixture();f.put('update-production-trust.cjs','module.exports=[{keyId:"eo-qa-synthetic"}];');assert.throws(()=>f.run());
 const next=fixture();next.put('package.json',{name:'synthetic-package',version:'0.0.0',trust:{keyId:'eo-qa-'+'a'.repeat(32)}});assert.throws(()=>next.run());
 const missing=fixture();missing.map.delete('update-production-trust.cjs');assert.throws(()=>missing.run());
});
