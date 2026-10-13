// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {template}=require('../../desktop/menu.cjs'),{policy,response,ORIGIN}=require('../../desktop/resources.cjs');
test('all OS menus include localized functional offline Help',()=>{
 for(const platform of ['linux','win32','darwin']){
  let opened=0;const menus=template(platform,()=>()=>{},()=>opened++,key=>key==='help'?'Aide':key);
  const help=menus.find(item=>item.role==='help');assert.equal(help.label,'Aide');help.submenu[0].click();assert.equal(opened,1);
 }
});
test('media policy accepts only bundled/blob/data media and keeps external connections blocked',()=>{
 const csp=policy(true);assert(csp.includes("media-src 'self' blob: data:"));assert(csp.includes("connect-src 'self' blob: data:"));assert(!/https?:/.test(csp));assert(csp.includes("object-src 'none'"));
});
test('new desktop author and AI consent labels cover every supported locale',()=>{
 const labels=JSON.parse(fs.readFileSync(path.join(__dirname,'../../tools/desktop/i18n-extra.json'),'utf8'));
 assert.equal(Object.keys(labels).length,45);
 const upstream=process.env.EO_UPSTREAM||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer');
 const supported=fs.readdirSync(path.join(upstream,'web-apps/apps/documenteditor/main/locale')).filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5)).sort();
 assert.deepEqual(Object.keys(labels).sort(),supported);
 for(const [language,strings] of Object.entries(labels))for(const name of ['authorName','aiConsent','aiLocal','aiRemote'])assert(typeof strings[name]==='string'&&strings[name].length>0,language+'/'+name);
});
