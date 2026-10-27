// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function prepareDeclinedProfile(root,name){
 assert(typeof name==='string'&&name.length>0&&name!=='.'&&name!=='..'&&!/[\\/]/.test(name),'Expected one owned profile name');
 const profiles=path.join(root,'profiles'),directory=path.join(profiles,name);
 await fs.mkdir(profiles,{recursive:true});
 // Create once before the first launch; an existing/reopened profile must never be reset.
 await fs.mkdir(directory,{mode:0o700});
 await fs.writeFile(path.join(directory,'desktop-settings.json'),JSON.stringify({fontConsent:false,fontChoice:'declined',recents:[],releaseNotice:{enabled:false}})+'\n',{flag:'wx',mode:0o600});
 return directory;
}
async function assertNoFonts(page){
 // Keep unexpected host indexes in the renderer: the failure must stay bounded.
 const empty=await page.evaluate(async()=>{const list=await eoDesktop.fonts();return Array.isArray(list)&&list.length===0});
 assert.equal(empty,true,'Expected no computer fonts without permission');
}
module.exports={prepareDeclinedProfile,assertNoFonts};
