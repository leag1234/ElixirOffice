// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),{execFileSync}=require('node:child_process'),path=require('node:path');
test('template coverage resolves real styled faces and inherited table/default fonts',()=>{
 execFileSync('python3',[path.join(__dirname,'template-font-styles.test.py')],{stdio:'pipe'});
});
