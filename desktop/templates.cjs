// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// The assembled manifest is trusted; missing UI languages explicitly fall back to English.
function resolve(template,language) {
 const chosen=template.languages.includes(language)?language:'en';
 return {...template,file:chosen+'/'+template.file,thumb:chosen+'/'+template.thumb,
  title:template.title[chosen]||template.title.en,language:chosen};
}
module.exports={resolve};
