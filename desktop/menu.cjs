// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function template(platform,action,help,t=key=>({file:'File',blankDoc:'New document',blankBook:'New spreadsheet',blankSlide:'New presentation',open:'Open',save:'Save',saveAs:'Save As',pdf:'Export PDF',print:'Print',close:'Close',edit:'Edit',about:'About',settings:'Settings',window:'Window',help:'Help',quit:'Quit',...require('./interface-size-strings.json')}[key]||key),{interfaceSize=100,interfaceSizeEnabled=true}={}) {
 // On install-eligible platforms the app-owned command records exit intent.
 // macOS keeps Electron's native Quit role and release-page-only updates.
 const quit=platform==='darwin'?{role:'quit'}:{id:'eo-menu-quit',label:t('quit')+(platform==='darwin'?' ElixirOffice':''),click:action('quit')};
 const size=require('./interface-size.cjs').read(interfaceSize);
 const view={id:'eo-interface-view',label:t('viewMenu'),submenu:[
  {id:'eo-interface-zoom-in',label:t('interfaceZoomIn'),enabled:interfaceSizeEnabled&&size<200,click:action('interface-zoom-in')},
  {id:'eo-interface-zoom-out',label:t('interfaceZoomOut'),enabled:interfaceSizeEnabled&&size>80,click:action('interface-zoom-out')},
  {id:'eo-interface-zoom-reset',label:t('interfaceZoomReset'),enabled:interfaceSizeEnabled,click:action('interface-zoom-reset')}
 ]};
 const file={label:t('file'),submenu:[
  {label:t('blankDoc'),accelerator:'CommandOrControl+N',click:action('new-docx')},
  {label:t('blankBook'),click:action('new-xlsx')},{label:t('blankSlide'),click:action('new-pptx')},
  {label:t('open'),accelerator:'CommandOrControl+O',click:action('open')},
  {label:t('save'),accelerator:'CommandOrControl+S',click:action('save')},
  {label:t('saveAs'),accelerator:platform==='darwin'?'Command+Shift+S':'F12',click:action('save-as')},
  {label:t('pdf'),click:action('pdf')},
  {label:t('print'),accelerator:'CommandOrControl+P',click:action('print')},
  {label:t('tabMove'),click:action('move-menu')},
  {label:t('close'),accelerator:'CommandOrControl+W',click:action('close-tab')}
 ]};
 // Empty (not null) overrides Electron's default role accelerators.
 // The editor owns undo/redo keyboard handling on every desktop platform.
 const edit={label:t('edit'),submenu:[{role:'undo',accelerator:''},{role:'redo',accelerator:''},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]};
 if(platform!=='darwin'){file.submenu.push({type:'separator'},quit);return [file,edit,view,{role:'help',label:t('help'),submenu:[{label:'ElixirOffice '+t('help'),accelerator:'F1',click:help},{label:t('about')+' ElixirOffice',click:action('about')}]}]}
 return [{label:'ElixirOffice',submenu:[
  {role:'about',label:t('about')+' ElixirOffice'},{type:'separator'},
  {label:t('settings')+'…',accelerator:'Command+,',click:action('settings')},
  {type:'separator'},{role:'services'},{type:'separator'},
  {role:'hide'},{role:'hideOthers'},{role:'unhide'},
  {type:'separator'},quit
 ]},file,edit,view,{role:'windowMenu',label:t('window'),submenu:[
  {role:'minimize',accelerator:'Command+M'},{role:'zoom'},
  {role:'close',accelerator:''}
 ]},{role:'help',label:t('help'),submenu:[{label:'ElixirOffice '+t('help'),accelerator:'F1',click:help}]}];
}
module.exports={template};
