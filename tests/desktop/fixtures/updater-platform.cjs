// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test');
const DARWIN_STORE_SKIP='updater unsupported on macOS by design';
function storeTest(name,options,run){
 if(typeof options==='function'){run=options;options={};}
 return test(name,options,t=>process.platform==='darwin'?t.skip(DARWIN_STORE_SKIP):run(t));
}
module.exports={DARWIN_STORE_SKIP,storeTest};
