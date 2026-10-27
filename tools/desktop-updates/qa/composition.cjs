// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Used only by generated QA source. No production runtime entry imports this.
const path=require('node:path'),{verifyPrepared}=require('./guard.cjs');
const {APP_ID,PRODUCT,fail}=require('./manifest.cjs'),{createQATransport}=require('./transport.cjs');
function load(root,seal,app=require('electron').app){
 const m=verifyPrepared(root,seal);
 if(app.getVersion()!=='0.0.0-rc.'+m.currentBuild)fail();
 const run=m.endpoint.prefix.split('/')[2],profile=path.join(app.getPath('appData'),PRODUCT,run);
 app.setName(PRODUCT);app.setAppUserModelId?.(APP_ID);app.setPath('userData',profile);
 const {createPolicy}=require(path.join(root,'update-policy.cjs'));
 const policy=createPolicy({trustedKeys:[m.trust],qualifiedElectronVersion:'44.9.1',
  qualification:{reviewed:true,electronVersion:'44.9.1',platforms:{nsis:m.platform==='win32',AppImage:m.platform==='linux'}}});
 return Object.freeze({
  policy,
  createNotice(options){
   const state=options.state,candidate=state?.candidate;
   const match=typeof candidate?.version==='string'?/^0\.0\.0-rc\.([1-9][0-9]{0,4})$/.exec(candidate.version):null;
   // A new sealed QA target must be discoverable in the same profile after an
   // update. Only synthetic discovery state changes, never its real clock,
   // enabled preference, signed cache or the ordinary production cadence.
   const refresh=match&&Number(match[1])<=65535&&
    candidate.url==='https://github.com/leag1234/elixiroffice/releases/tag/v'+candidate.version&&
    'v'+candidate.version!==m.tag;
   const initial=refresh?{...state,lastAttempt:null,candidate:null}:state;
   return require(path.join(root,'release-notice.cjs')).create({...options,state:initial,
    fetch:async()=>[{draft:false,tag_name:m.tag,html_url:'https://github.com/leag1234/elixiroffice/releases/tag/'+m.tag}],
    open:async()=>{throw Error('QA release is unpublished');}});
  },
  createTransport(runtime){
   if(runtime.platform!==m.platform)fail();
   return createQATransport({endpoint:m.endpoint,tag:m.tag,policy,runtime,wire:require(path.join(root,'update-candidate.cjs'))});
  }
 });
}
module.exports={load};
