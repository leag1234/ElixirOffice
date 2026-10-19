// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const resolver=require('./font-resolver.js'),policies=new WeakMap();
function covered(template,language,index){
 if(!index)return false;
 const requirements=template.fontRequirements?.[language];
 if(!Array.isArray(requirements)||!requirements.length)return false;
 if(!policies.has(index))policies.set(index,resolver.create([...index.bundled,...index.system]));
 const policy=policies.get(index);
 return requirements.every(request=>request.codepoints.every(cp=>policy.resolve({name:request.name,style:request.style,codepoints:[cp]})));
}
// The assembled manifest is trusted. Uncovered system-dependent variants keep the English fallback.
function resolve(template,language,{index}={}) {
 const supported=template.languages.includes(language)&&(!template.systemLocales?.includes(language)||covered(template,language,index));
 const chosen=supported?language:'en';
 const {fontRequirements,systemLocales,...display}=template;
 return {...display,file:chosen+'/'+template.file,thumb:chosen+'/'+template.thumb,
  title:template.title[chosen]||template.title.en,language:chosen};
}
module.exports={resolve,covered};
