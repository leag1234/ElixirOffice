// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Handle native file commands before a focused editor iframe consumes them.
function command(input,platform,format) {
 if(input.type!=='keyDown'||input.isComposing||input.alt||(input.modifiers||[]).some(value=>/^altgr(?:aph)?$/i.test(value)))return null;
 if(platform!=='darwin'&&(input.key==='F12'||input.code==='F12')&&!input.control&&!input.meta&&!input.shift)return 'save-as';
 if(platform==='darwin'?(!input.meta||input.control):(!input.control||input.meta))return null;
 let key=String(input.key||'').toLowerCase();
 // Keep Latin layout labels (including AZERTY); use physical letters for non-Latin layouts.
 if(/^[^\x00-\x7f]+$/u.test(key)&&/^Key[A-Z]$/.test(input.code||''))key=input.code.slice(3).toLowerCase();
 if(input.shift)return platform==='darwin'&&key==='s'?'save-as':null;
 if(key==='n')return ['xlsx','ods','xls','csv'].includes(format)?'new-xlsx':['pptx','odp','ppt'].includes(format)?'new-pptx':'new-docx';
 return ({o:'open',s:'save',p:'print',...(platform==='darwin'?{q:'quit'}:{})})[key]||null;
}
function install(contents,platform,format,dispatch,enabled=()=>true) {
 contents.on('before-input-event',(event,input)=>{
  const action=command(input,platform,format());
  if(!action)return;
  // Prevent both the editor default and a second dispatch from the native menu.
  event.preventDefault();
  if(!input.isAutoRepeat&&enabled())dispatch(action);
 });
}
module.exports={command,install};
