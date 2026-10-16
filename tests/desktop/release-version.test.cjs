// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verify}=require('../../tools/desktop/check-version.cjs');
test('packaged semantic version including RC must match selected identity',()=>{
 assert.equal(verify({version:'0.2.1-rc.42'},'0.2.1-rc.42'),'0.2.1-rc.42');
 assert.equal(verify({version:'0.2.1'},'0.2.1'),'0.2.1');
 assert.throws(()=>verify({version:'0.3.0'},'0.2.1'),/differs/);
 assert.throws(()=>verify({version:'0.2.1-rc.0'},'0.2.1-rc.0'));
});
