// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const path=require('node:path'),base=require('../../desktop/package.json').build;
function configuration(env) {
 const identity=env.EO_MAC_SIGNING_IDENTITY||null;
 if(identity&&!identity.startsWith('Developer ID Application:'))throw Error('Select a Developer ID Application signing identity');
 const notarize=env.EO_MAC_NOTARIZE==='1';
 if(notarize&&!identity)throw Error('Notarization requires an explicit Developer ID Application identity');
 if(notarize) {
  const password=!!(env.APPLE_ID&&env.APPLE_APP_SPECIFIC_PASSWORD&&env.APPLE_TEAM_ID);
  const api=!!(env.APPLE_API_KEY&&env.APPLE_API_KEY_ID&&env.APPLE_API_ISSUER);
  if(password===api)throw Error('Provide exactly one complete Apple ID or Apple API key credential set');
 }
 return {...base,afterPack:require.resolve('./mac-after-pack.cjs'),mac:{...base.mac,icon:path.join(__dirname,'artwork/mac-icon.icns'),identity,notarize,hardenedRuntime:true},
  dmg:{...base.dmg,background:path.join(__dirname,'artwork/dmg-background.png'),window:{width:640,height:420},iconSize:112,contents:[{x:180,y:230},{x:460,y:230,type:'link',path:'/Applications'}]}};
}
module.exports=()=>configuration(process.env);
module.exports.configuration=configuration;
