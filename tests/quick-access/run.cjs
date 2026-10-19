// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Exercise the real packaged editor and the source header declaration on a
// private Linux display. Baseline mode must expose the Classic Light regression.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {launch,stop,editable,sleep}=require('../desktop/harness.cjs');
const themes=['theme-classic-light','theme-light','theme-white','theme-gray','theme-dark','theme-contrast-dark','theme-night'];
const slots=['save','undo','redo','quick-access'];
const pixels=String.raw`import json,sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB')
# The upper-left corner is the uniform header background; ignore the outer
# border/focus ring when measuring the icon's central 14 x 14 pixel region.
bg=im.getpixel((0,0))
def lum(c):
 v=[x/255 for x in c];v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
 return sum(x*y for x,y in zip(v,[.2126,.7152,.0722]))
def ratio(a,b):
 a,b=lum(a),lum(b);return (max(a,b)+.05)/(min(a,b)+.05)
cx,cy=im.width//2,im.height//2
values=sorted([ratio(p,bg) for p in list(im.crop((cx-7,cy-7,cx+7,cy+7)).getdata())],reverse=True)
print(json.dumps({'background':bg,'contrast':values[2],'visiblePixels':sum(v>1.2 for v in values)}))
`;
(async()=>{
 const out=path.resolve(process.env.EO_UI_OUTPUT||path.join(__dirname,'results'));await fs.mkdir(out,{recursive:true});
 const baseline=process.env.EO_UI_BASELINE==='1';
 const header=process.env.EO_HEADER_LESS||path.join(process.env.EO_WEB_APPS||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer/web-apps'),'apps/common/main/resources/less/header.less');
 let css='';
 if(!baseline){
  const source=await fs.readFile(header,'utf8');
  const rule=source.match(/\.btn-header\s*\{[\s\S]*?(--icon-gray-primary:\s*var\(--icon-toolbar-header\);)/);assert(rule,'Source must bind the monochrome path color in header buttons');
  const less=require(process.env.EO_LESS||path.join(require('node:os').homedir(),'elixiroffice/DocumentServer/web-apps/build/node_modules/less'));
  css=(await less.render('.btn-header {'+rule[1]+'}')).css;
 }
 const e=await launch({file:process.env.EO_UI_FIXTURE||path.join(process.env.EO_DESKTOP_ROOT,'fixtures/sample.docx'),profile:'quick-access-'+Date.now()});
 const rows=[];
 try{
  await editable(e);const frame=e.page.frames().find(f=>/main\/index.html/.test(f.url()));assert(frame);
  if(css)await frame.addStyleTag({content:css});
  for(const theme of themes){
   await frame.evaluate(theme=>Common.UI.Themes.setTheme(theme),theme);await sleep(350);
   for(const slot of slots){
    const button=frame.locator('#slot-btn-dt-'+slot+' button');await button.waitFor({state:'visible'});
    for(const state of ['normal','hover']){
     if(state==='hover')await button.hover();else await e.page.mouse.move(1200,900);
     const file=path.join(out,theme+'-'+slot+'-'+state+'.png');await button.screenshot({path:file});
     const row={theme,slot,state,disabled:await button.isDisabled(),...JSON.parse(cp.execFileSync('python3',['-c',pixels,file],{encoding:'utf8'}))};rows.push(row);
    }
   }
   // Real edits/undo enable the header controls; do not remove disabled attrs.
   for(const slot of ['save','undo','redo']){
    await e.page.evaluate(slot=>{const api=EOLocalSession.api;api.asc_AddText(' Contrast check.');if(slot==='redo')api.Undo();},slot);
    const button=frame.locator('#slot-btn-dt-'+slot+' button');
    await button.waitFor({state:'visible'});await button.evaluate(el=>new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(!el.disabled){clearInterval(timer);resolve();}else if(++n>100){clearInterval(timer);reject(Error('Actual edit did not enable control'));}},20);}));
    for(const state of ['enabled','enabled-hover','enabled-focus','enabled-active']){
     if(state==='enabled')await e.page.mouse.move(1200,900);
     if(state==='enabled-hover'||state==='enabled-active')await button.hover();
     if(state==='enabled-focus')await button.focus();
     if(state==='enabled-active')await e.page.mouse.down();
     try{
      const file=path.join(out,theme+'-'+slot+'-'+state+'.png');await button.screenshot({path:file});
      rows.push({theme,slot,state,disabled:false,...JSON.parse(cp.execFileSync('python3',['-c',pixels,file],{encoding:'utf8'}))});
     }finally{if(state==='enabled-active'){await e.page.mouse.move(1200,900);await e.page.mouse.up();}}
    }
   }
   await e.page.screenshot({path:path.join(out,theme+'.png')});
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({baseline,source:header,rows,errors:e.errors},null,2));
  assert.deepEqual(e.errors,[]);
  for(const row of rows){
   assert(row.visiblePixels>=3,JSON.stringify(row));
   if(!row.disabled)assert(row.contrast>=3,JSON.stringify(row));
  }
  console.log('PASS actual editor Quick Access pixels across seven themes and hover states',rows.length);
 }finally{await stop(e)}
})().catch(error=>{console.error(error);process.exitCode=1});
