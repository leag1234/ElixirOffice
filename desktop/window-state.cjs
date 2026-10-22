// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Electron bounds/work areas are device-independent outer-window coordinates.
function rectangle(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const {x,y,width,height}=value;
 if(![x,y,width,height].every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000)||width<1||height<1)return null;
 return {x,y,width,height};
}
function restore(value,displays=[],ordinal=0){
 const areas=(Array.isArray(displays)?displays:[]).map(d=>rectangle(d?.workArea)).filter(Boolean);
 if(!areas.length)areas.push({x:0,y:0,width:1360,height:960});
 const saved=rectangle(value?.bounds),maximized=!!saved&&value.maximized===true;
 let area=areas[0],overlap=0;
 if(saved)for(const candidate of areas){
  const width=Math.max(0,Math.min(saved.x+saved.width,candidate.x+candidate.width)-Math.max(saved.x,candidate.x));
  const height=Math.max(0,Math.min(saved.y+saved.height,candidate.y+candidate.height)-Math.max(saved.y,candidate.y));
  if(width*height>overlap){overlap=width*height;area=candidate;}
 }
 const width=Math.min(area.width,Math.max(Math.min(320,area.width),saved?.width||1360));
 const height=Math.min(area.height,Math.max(Math.min(240,area.height),saved?.height||960));
 const cascade=!maximized&&Number.isSafeInteger(ordinal)&&ordinal>0?(ordinal%8)*28:0;
 const x=(saved?saved.x:area.x+Math.round((area.width-width)/2))+cascade;
 const y=(saved?saved.y:area.y+Math.round((area.height-height)/2))+cascade;
 return {bounds:{x:Math.min(area.x+area.width-width,Math.max(area.x,x)),y:Math.min(area.y+area.height-height,Math.max(area.y,y)),width,height},maximized};
}
function capture(window){
 if(window.isDestroyed?.()||window.isMinimized?.()||window.isFullScreen?.())return null;
 const bounds=rectangle(window.getNormalBounds?.());
 return bounds?{bounds,maximized:window.isMaximized?.()===true}:null;
}
module.exports={restore,capture};
