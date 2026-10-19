// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Apply the desktop policy without changing browser consent or inventing a user grant.
function migrate(settings,{capture=false}={}) {
  if(capture)return {...settings,fontConsent:false};
  if(settings.fontChoice==='declined')return {...settings,fontConsent:false};
  if(settings.fontConsent===true)return {...settings};
  return {...settings,fontConsent:true,fontChoice:'default',fontPolicyVersion:1};
}
module.exports={migrate};
