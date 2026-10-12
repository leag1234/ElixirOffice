// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
function template(platform,action,help) {
 const file={label:'File',submenu:[
  {label:'New document',accelerator:'CommandOrControl+N',click:action('new-docx')},
  {label:'New spreadsheet',click:action('new-xlsx')},{label:'New presentation',click:action('new-pptx')},
  {label:'Open',accelerator:'CommandOrControl+O',click:action('open')},
  {label:'Save',accelerator:'CommandOrControl+S',click:action('save')},
  {label:'Save As',accelerator:'CommandOrControl+Shift+S',click:action('save-as')},
  {label:'Export PDF',accelerator:'CommandOrControl+Shift+E',click:action('pdf')},
  {label:'Print',accelerator:'CommandOrControl+P',click:action('print')}
 ]};
 // Empty (not null) overrides Electron's default role accelerators.
 // The editor owns undo/redo keyboard handling on every desktop platform.
 const edit={label:'Edit',submenu:[{role:'undo',accelerator:''},{role:'redo',accelerator:''},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]};
 if(platform!=='darwin'){file.submenu.push({type:'separator'},{role:'quit'});return [file,edit]}
 return [{label:'ElixirOffice',submenu:[
  {role:'about',label:'About ElixirOffice'},{type:'separator'},
  {label:'Settings…',accelerator:'Command+,',click:action('settings')},
  {type:'separator'},{role:'services'},{type:'separator'},
  {role:'hide'},{role:'hideOthers'},{role:'unhide',label:'Show All'},
  {type:'separator'},{role:'quit'}
 ]},file,edit,{role:'windowMenu',label:'Window',submenu:[
  {role:'minimize',accelerator:'Command+M'},{role:'zoom'},
  {role:'close',accelerator:'Command+W'}
 ]},{role:'help',label:'Help',submenu:[{label:'ElixirOffice Help',click:help}]}];
}
module.exports={template};
