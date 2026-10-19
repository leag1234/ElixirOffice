// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('desktop overlay has reproducible localized documents and matching licensed previews',()=>{
 execFileSync('python3',[path.join(__dirname,'desktop-template-overlay.test.py')],{stdio:'pipe'});
});
