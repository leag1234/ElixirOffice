// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),base=require('../../desktop/package.json').build,{configuration}=require('../../tools/desktop/mac-config.cjs');
function dimensions(file){const bytes=fs.readFileSync(file);assert.equal(bytes.subarray(1,4).toString(),'PNG');return[bytes.readUInt32BE(16),bytes.readUInt32BE(20)]}
test('The Mac icon is a full-resolution platform override; other platform icons and signing remain unchanged',()=>{
 const config=configuration({});
 assert.equal(config.mac.icon,path.resolve(root,'desktop',base.mac.icon));
 assert.deepEqual(dimensions(path.join(root,'tools/desktop/artwork/mac-icon.png')),[1024,1024]);
 require('../../tools/desktop/check-icns.cjs').validate(fs.readFileSync(config.mac.icon));
 assert.equal(config.linux.icon,base.linux.icon);assert.equal(config.win.icon,base.win.icon);assert.equal(path.extname(base.mac.icon),'.icns');
 assert.equal(config.mac.identity,null);assert.equal(config.mac.notarize,false);assert.equal(config.mac.hardenedRuntime,true);
});
test('DMG layout provides real application and Applications targets with unobstructed copy direction',()=>{
 const config=configuration({}),dmg=config.dmg;
 assert(dmg,'Mac configuration must explicitly define the DMG layout');
 assert.deepEqual(dimensions(dmg.background),[640,420]);assert.deepEqual(dmg.window,{width:640,height:420});assert.equal(dmg.iconSize,112);
 const app=dmg.contents.find(e=>e.type!=='link'),destination=dmg.contents.find(e=>e.type==='link');
 assert.equal(destination.path,'/Applications');assert.equal(app.y,destination.y);assert(app.x<destination.x);
 for(const item of dmg.contents){assert(item.x-dmg.iconSize/2>=0&&item.x+dmg.iconSize/2<=640);assert(item.y-dmg.iconSize/2>=100&&item.y+dmg.iconSize/2<=330)}
 assert(destination.x-app.x>=dmg.iconSize*2);
 const svg=fs.readFileSync(path.join(root,'tools/desktop/artwork/dmg-background.svg'),'utf8');
 assert(!/<(?:script|image|foreignObject)\b|\b(?:href|url\(\s*https?:)/i.test(svg),'Artwork must be self-contained');
 assert.deepEqual([...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m=>m[1]),['ElixirOffice'],'No baked-in untranslated instructions or Finder labels');
});
