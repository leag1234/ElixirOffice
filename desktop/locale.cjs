// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
function match(preferred,supported){
 for(let language of preferred){
  language=String(language).toLowerCase().replaceAll('_','-');
  if(/^(zh-hant|zh-tw|zh-hk)(-|$)/.test(language))language='zh-tw';
  else if(/^zh(-|$)/.test(language))language='zh';
  else if(/^pt-pt(-|$)/.test(language))language='pt-pt';
  else if(/^pt(-|$)/.test(language))language='pt';
  else if(/^sr-cyrl(-|$)/.test(language))language='sr-cyrl';
  else if(/^sr(-|$)/.test(language))language='sr';
  else if(/^(nb|nn)(-|$)/.test(language))language='no';
  for(const candidate of [language,language.split('-')[0]])if(supported.includes(candidate))return candidate;
 }
 return null;
}
function choose(preferred,supported){return match(preferred,supported)||'en';}
async function load(assets,preferred,display){
 const home=path.join(assets,'desktop-home'),supported=JSON.parse(await fs.readFile(path.join(home,'locales.json'),'utf8'));
 if(display)preferred=require('./display-language.cjs').preferred({...display,system:preferred,supported});
 const language=choose(preferred,supported),strings=JSON.parse(await fs.readFile(path.join(home,'i18n',language+'.json'),'utf8'));
 const safety=require('./save-messages.cjs');
 strings.saveRestoreUncertain||=safety[language]||safety.en;
 return {language,strings,supported};
}
module.exports={match,choose,load};
