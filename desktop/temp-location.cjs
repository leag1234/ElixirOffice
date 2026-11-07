// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const nodePath=require('node:path');
function normalize(value,{platform,homedir,tmpdir}){
 const path=platform==='win32'?nodePath.win32:nodePath.posix;
 if(typeof value!=='string'||!value.trim())return null;
 let resolved=platform==='win32'&&/^[a-z]:[\\/]/i.test(value)?value:path.resolve(value);
 if(platform==='win32')resolved=path.normalize(resolved).toLowerCase();
 else if(platform==='darwin'){
 resolved=path.normalize(resolved);
 if(resolved.startsWith('/private/var/'))resolved='/var/'+resolved.slice('/private/var/'.length);
 resolved=resolved.toLowerCase();
 }else resolved=path.normalize(resolved);
 return {resolved,homedir:homedir||'',tmpdir:tmpdir||''};
}
function startsWith(value,prefix,separator){
 separator=separator||(/^[a-z]:\\/.test(value)?'\\':'/');
 return value===prefix||value.startsWith(prefix.endsWith(separator)?prefix:prefix+separator);
}
function isTemporaryPath(filePath,{platform=process.platform,env=process.env,homedir=process.env.HOME||'',tmpdir=process.env.TMPDIR||process.env.TEMP||process.env.TMP||'/tmp'}={}){
 const path=platform==='win32'?nodePath.win32:nodePath.posix;
 // Test launches create their documents under the temporary folder and must keep saving in place.
 if(env.EO_TEMP_LOCATION_CHECK==='0')return false;
 const value=normalize(filePath,{platform,homedir,tmpdir});
 if(!value)return false;
 const {resolved}=value;
 if(platform==='win32'){
 const local=env.LOCALAPPDATA?path.normalize(env.LOCALAPPDATA).toLowerCase():homedir?path.join(path.normalize(homedir).toLowerCase(),'appdata','local'):null;
  const outlook=path.normalize(path.join(local||'','microsoft','windows','inetcache','content.outlook')).toLowerCase();
  return !!(local&&startsWith(resolved,path.join(local,'temp')))||(!!local&&startsWith(resolved,outlook))||startsWith(resolved,path.normalize(tmpdir).toLowerCase());
 }
 if(platform==='darwin'){
 const home=path.normalize(homedir).toLowerCase();
 return startsWith(resolved,path.normalize(tmpdir).toLowerCase())||startsWith(resolved,'/var/folders/')||startsWith(resolved,path.join(home,'library','containers','com.apple.mail','data','library','mail downloads'));
 }
 return startsWith(resolved,path.resolve(tmpdir))||!!(env.XDG_RUNTIME_DIR&&startsWith(resolved,path.resolve(env.XDG_RUNTIME_DIR)));
}
module.exports={isTemporaryPath};
