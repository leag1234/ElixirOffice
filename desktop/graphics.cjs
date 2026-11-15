// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs'),path=require('node:path');
const TRUE=/^(?:1|true|yes|on)$/i;
// Synchronous and defensive: a missing, unreadable or corrupt file leaves acceleration on.
function readSetting(userData,reader=fs){
 try{
  const value=JSON.parse(reader.readFileSync(path.join(userData,'desktop-settings.json'),'utf8'));
  return value&&typeof value==='object'&&value.hardwareAcceleration===false?false:true;
 }catch{return true;}
}
// Decides, before the app is ready, whether hardware graphics acceleration stays off.
// Priority: command line, environment, saved setting.
function decide({argv=[],env={},userData,reader}={}){
 if(argv.includes('--disable-gpu'))return {disabled:true,source:'command-line'};
 if(TRUE.test(String(env.ELIXIROFFICE_DISABLE_GPU||'').trim()))return {disabled:true,source:'environment'};
 if(userData&&readSetting(userData,reader)===false)return {disabled:true,source:'setting'};
 return {disabled:false,source:null};
}
function summary(state,t,backend){
 return t('hardwareAcceleration').replace(/\s*\([^)]*\)\s*$/,'')+': '+t(state.disabled?'graphicsOff':'graphicsOn')+'\n'+'Display: '+backend;
}
module.exports={readSetting,decide,summary};
