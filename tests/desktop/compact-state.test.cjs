// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize}=require('../../desktop/compact-state.cjs');
const item={visible:true,enabled:true,label:'Undo'};
test('compact state allows only bounded named controls and plain labels',()=>{
 const value={save:item,undo:{...item,label:'<b>Undo</b>'},redo:item,search:item,extra:{url:'file:///private'}};
 const result=normalize(value);
 assert.deepEqual(Object.keys(result),['save','undo','redo','search']);assert.equal(result.undo.label,'<b>Undo</b>');
 assert.equal(Object.hasOwn(result,'extra'),false);value.save.enabled=false;assert.equal(result.save.enabled,true);
});
for(const value of [null,[],true,'bad',{}, {save:{...item,enabled:'yes'},undo:item,redo:item,search:item},{save:{...item,label:'x'.repeat(201)},undo:item,redo:item,search:item}])test('invalid quick state rejected '+JSON.stringify(value).slice(0,70),()=>assert.throws(()=>normalize(value),/compact state/i));
