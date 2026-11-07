// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../../',name),'utf8');
test('main removes one recent file or clears the list and saves settings',()=>{
 const main=read('desktop/main.cjs');
 assert.match(main,/handle\('recent-remove',async id=>\{[^]*?settings\.recents=settings\.recents\.filter\(item=>item\.id!==id\);[^]*?await persist\(\)/);
 assert.match(main,/handle\('recents-clear',async\(\)=>\{[^]*?settings\.recents=\[\];await persist\(\)/);
});
test('preload exposes the two bridges and Home renders accessible buttons',()=>{
 const preload=read('desktop/preload.cjs'),home=read('desktop/home.js');
 assert.match(preload,/removeRecent: id => ipcRenderer\.invoke\('eo:recent-remove', id\)/);
 assert.match(preload,/clearRecents: \(\) => ipcRenderer\.invoke\('eo:recents-clear'\)/);
 assert.match(home,/aria-label',t\('removeRecent'\)/);
 assert.match(home,/aria-label',t\('clearRecents'\)/);
 const strings=JSON.parse(read('tools/desktop/i18n-extra.json'));
 assert.equal(strings.en.removeRecent,'Remove from list');assert.equal(strings.fr.clearRecents,'Vider la liste');
});
