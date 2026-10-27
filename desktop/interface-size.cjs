// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// This policy does not change document zoom or perform renderer/network I/O.
const levels=Object.freeze([80,90,100,110,125,150,175,200]);
function validate(value){
 if(typeof value!=='number'||!levels.includes(value))throw Error('Invalid interface size');
 return value;
}
function read(value){return levels.includes(value)?value:100;}
function step(value,direction){
 validate(value);
 if(direction!==1&&direction!==-1)throw Error('Invalid interface size direction');
 return levels[Math.max(0,Math.min(levels.length-1,levels.indexOf(value)+direction))];
}
module.exports={levels,validate,read,step};
