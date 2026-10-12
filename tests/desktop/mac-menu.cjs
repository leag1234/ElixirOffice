// SPDX-License-Identifier: AGPL-3.0-only
const {app,Menu}=require('electron'),assert=require('node:assert/strict'),path=require('node:path');
assert(process.env.EO_DESKTOP_PROFILE);app.setPath('userData',path.resolve(process.env.EO_DESKTOP_PROFILE));
app.whenReady().then(()=>{
 Menu.setApplicationMenu(Menu.buildFromTemplate(require('../../desktop/menu.cjs').template('darwin',()=>()=>{},()=>{})));
 const menu=Menu.getApplicationMenu(),edit=menu.items.find(item=>item.label==='Edit');
 for(const role of ['undo','redo'])assert.equal(edit.submenu.items.find(item=>item.role===role).accelerator,'');
 assert.equal(menu.items.find(item=>item.label==='Window').submenu.items.find(item=>item.role==='close').accelerator,'Command+W');
 console.log('PASS real Electron44 Mac menu constructor preserves empty Undo/Redo accelerators and guarded Close role');app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
