// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../desktop',name),'utf8');
test('temporary save notice is wired without an undeclared renderer file',()=>{
 const renderer=read('renderer.js');
 assert.doesNotMatch(renderer,/file\?\.temporary/);
 assert.match(renderer,/status\(t\('temporaryLocation'\)\)/);
 assert.match(renderer,/saveAsButton\.addEventListener\('click',\(\)=>save\(true\)\)/);
 const main=read('main.cjs');
 assert.match(main,/documentState\(\)\.current\.temporary/);
 assert.match(main,/app\.getPath\('documents'\)/);
});
