// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),decisions=require('./decisions.cjs');
function defaultPath(current){return (current.target||current.name).replace(/\.[^.]+$/,current.format==='pdf'?'-copy.pdf':'.pdf');}
async function confirmCopy(current,dialog,win,t){
 if(current.format!=='pdf')return true;
 const accepted=await dialog.showMessageBox(win,{type:'warning',message:t('pdfCopyWarning'),buttons:decisions.buttons([t('cancel'),t('saveCopy')]),normalizeAccessKeys:true,defaultId:0,cancelId:0});
 return accepted.response===1;
}
async function assertCopyDestination(current,target){
 if(current.format!=='pdf'||!current.target)return;
 // Original PDF saving waits for its separate whole-document preservation gate.
 if(path.resolve(target)===path.resolve(current.target))throw Error('Choose a different destination for the PDF copy');
 const selected=await fs.lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error});
 if(selected&&selected.ino===current.inode&&selected.dev===current.device)throw Error('Choose a different destination for the PDF copy');
}
module.exports={defaultPath,confirmCopy,assertCopyDestination};
