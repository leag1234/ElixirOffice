// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function normalize(items){
 return (Array.isArray(items)?items:[]).filter(item=>item&&typeof item.id==='string'&&item.id&&typeof item.name==='string'&&typeof item.target==='string'&&path.isAbsolute(item.target)).slice(0,15);
}
async function metadata(items,report){
 const result=[];
 for(const item of normalize(items)){
  let modified=null;
  try{modified=(await fs.stat(item.target)).mtime.toISOString()}
  catch(error){await report(error)}
  result.push({id:item.id,name:item.name,folder:path.dirname(item.target),modified});
 }
 return result;
}
module.exports={normalize,metadata};
