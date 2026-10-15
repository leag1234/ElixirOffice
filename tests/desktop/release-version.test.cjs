// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verify}=require('../../tools/desktop/check-version.cjs');
test('packaged version cannot reuse the previous public release',()=>{
 assert.throws(()=>verify({version:'0.1.0'},'0.1.0'),/already published/);
 assert.equal(verify({version:'0.2.0'},'0.2.0'),'0.2.0');
 assert.throws(()=>verify({version:'0.3.0'},'0.2.0'),/differs/);
});
