// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {match}=require('./locale.cjs');
function supportedLocale(value,supported){
 if(typeof value!=='string'||value.length>80||! /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i.test(value))return null;
 return match([value],supported);
}
function argument(argv,supported){
 let selected=null;
 for(const value of argv){
  if(value==='--')break;
  if(typeof value==='string'&&value.startsWith('--lang='))selected=supportedLocale(value.slice(7),supported)||selected;
 }
 return selected;
}
function preferred({argv=[],setting,system=[],supported}){
 return [argument(argv,supported),supportedLocale(setting,supported),...system].filter(Boolean);
}
function validate(value,supported){
 if(value==='')return '';
 const selected=supportedLocale(value,supported);
 if(!selected)throw Error('Invalid display language');
 return selected;
}
function choices(supported){
 return supported.map(language=>{
  let name=language;
  try{name=new Intl.DisplayNames([language],{type:'language'}).of(language)||language;}catch{}
  return {language,name};
 });
}
function restartArguments(argv){return argv.filter(value=>typeof value!=='string'||!value.startsWith('--lang='));}
module.exports={supportedLocale,argument,preferred,validate,choices,restartArguments};
