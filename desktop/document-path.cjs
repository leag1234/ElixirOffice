// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {fileURLToPath}=require('node:url'),{formats,extension}=require('./files.cjs');
function documentPath(value) {
 if(typeof value!=='string'||!value||value.startsWith('-'))return null;
 if(value.startsWith('file:')){try{value=fileURLToPath(value)}catch{return null}}
 return formats.includes(extension(value))?value:null;
}
module.exports={documentPath};
