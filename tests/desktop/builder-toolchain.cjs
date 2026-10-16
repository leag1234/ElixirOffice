// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {createRequire}=require('node:module'),path=require('node:path');
module.exports=function builderRequire(context,root,required=process.env.EO_RELEASE_REQUIRE_BUILDER==='1'){
 const load=createRequire(path.join(root,'package.json'));
 try{load.resolve('app-builder-lib/package.json');}
 catch(error){
  if(error.code!=='MODULE_NOT_FOUND'||required)throw error;
  context.skip('Packaging toolchain is absent: run npm ci in desktop; release builds require this check.');
  return null;
 }
 return load;
};
