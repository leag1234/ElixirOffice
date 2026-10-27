// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const nsisQualified=require('./update-production-nsis-qualification.cjs');
if(typeof nsisQualified!=='boolean')throw Error('Update qualification refused');
// AppImage is reviewed for production. NSIS remains a separate source-owned
// switch until the lead records the reviewed native Windows QA result.
module.exports=Object.freeze({
 reviewed:true,
 electronVersion:'44.9.1',
 platforms:Object.freeze({nsis:nsisQualified,AppImage:true})
});
