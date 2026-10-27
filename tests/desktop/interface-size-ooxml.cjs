// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const cp=require('node:child_process'),path=require('node:path');
function xlsxEquivalence(before,after){
 return JSON.parse(cp.execFileSync('python3',[path.join(__dirname,'interface-size-ooxml.py')],{
  input:JSON.stringify({before:before.toString('base64'),after:after.toString('base64')}),
  encoding:'utf8',maxBuffer:16*1024*1024
 }));
}
module.exports={xlsxEquivalence};
