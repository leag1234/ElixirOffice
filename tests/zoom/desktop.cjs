// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,stop,editable,root}=require('../desktop/harness.cjs');
const upstream=process.env.EO_UPSTREAM,output=process.env.EO_ZOOM_OUTPUT||path.join(root,'results/zoom');
assert(upstream,'Set EO_UPSTREAM to the owned source worktree');
const themes=(process.env.EO_ZOOM_THEMES||'theme-white,theme-classic-light,theme-night').split(',');
const scales=(process.env.EO_ZOOM_SCALES||'1,1.25,1.5,2').split(',').map(Number);
const sourcePatch=process.env.EO_ZOOM_SOURCE!=='0';
async function compiledRule(kind){
 const less=require(process.env.EO_LESS||path.join(upstream,'web-apps/build/node_modules/less'));
 const common=path.join(upstream,'web-apps/apps/common/main/resources/less');
 const variables=[];
 for(const [file,name]of [['colors-table-ie-fix.less','slider-thumb-size-ie'],['colors-table.less','slider-thumb-size']]){
  const text=await fs.readFile(path.join(common,file),'utf8'),match=text.match(new RegExp('^@'+name+':[^;]+;','m'));assert(match,name);variables.push(match[0]);
 }
 const [file,selector,scope]=kind==='xlsx'?['spreadsheeteditor/main/resources/less/excel.less','.status-zoom-slider','#statusbar .elx-zoom-box']:['presentationeditor/main/resources/less/elixir-slide.less','.elx-sb-zoom-slider','.statusbar.elx-slide-statusbar'];
 const text=await fs.readFile(path.join(upstream,'web-apps/apps',file),'utf8'),start=text.indexOf(selector+' {');assert(start>=0);
 const rule=text.slice(start,text.indexOf('}',start)+1);
 return (await less.render(variables.join('\n')+'\n'+scope+' '+rule)).css;
}
async function snapshot(frame,ext){
 return frame.evaluate(ext=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
  const slider=document.querySelector(ext==='pptx'?'#elx-sb-zoom-slider':'#status-zoom-slider');
  const plus=document.querySelector(ext==='xlsx'?'#status-btn-zoomup':'#btn-zoom-up'),minus=document.querySelector(ext==='xlsx'?'#status-btn-zoomdown':'#btn-zoom-down');
  const buttons=[rect(minus),rect(plus)].sort((a,b)=>a.left-b.left),track=rect(slider.querySelector('.track')),thumb=rect(slider.querySelector('.thumb'));
  return{dpr:devicePixelRatio,wrapper:rect(slider),track,thumb,buttons,overlap:Math.max(0,buttons[0].right-track.left,track.right-buttons[1].left,buttons[0].right-thumb.left,thumb.right-buttons[1].left),thumbSize:getComputedStyle(document.body).getPropertyValue('--slider-thumb-size')};
 },ext);
}
(async()=>{
 await fs.mkdir(output,{recursive:true});const rows=[],interactions=[];
 for(const scale of scales)for(const ext of ['docx','xlsx','pptx']){
  const env=await launch({file:path.join(root,'fixtures','public.'+ext),profile:'zoom-'+scale+'-'+ext+'-'+Date.now(),args:['--force-device-scale-factor='+scale]});
  try{
   await editable(env);const frame=env.page.frames().find(f=>/\/(?:documenteditor|spreadsheeteditor|presentationeditor)\/main\//.test(f.url()));assert(frame);
   const sliderSelector=ext==='pptx'?'#elx-sb-zoom-slider':'#status-zoom-slider';
   await frame.locator(sliderSelector).waitFor();
   if(sourcePatch&&ext!=='docx'){
    const style=await frame.addStyleTag({content:await compiledRule(ext)});
    // The packaged bundle uses a body stylesheet link. Append after that link
    // so this exact source rule replaces its old compiled counterpart.
    await style.evaluate(el=>document.body.appendChild(el));
   }
   for(const theme of themes){
    await frame.evaluate(theme=>Common.UI.Themes.setTheme(theme),theme);
    await frame.waitForFunction(theme=>Common.UI.Themes.currentThemeId()===theme,theme);
    await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    for(const direction of ['ltr','rtl']){
     // Layout-only direction coverage; this does not claim an Arabic OS launch.
     await frame.locator('#statusbar').evaluate((el,dir)=>{el.dir=dir},direction);
     for(const value of [0,50,100]){
      await frame.evaluate(({ext,value})=>{
       const controller=ext==='docx'?DE.getController('Statusbar'):ext==='xlsx'?SSE.getController('ExcelGrid'):PE.getController('SlideStatusbar');
       const slider=ext==='pptx'?controller.slider:controller.zoomSlider;slider.setValue(value);
      },{ext,value});
      const geometry=await snapshot(frame,ext),row={ext,scale,theme,direction,value,...geometry};rows.push(row);
      await fs.writeFile(path.join(output,'geometry.json'),JSON.stringify({sourcePatch,rows,interactions},null,2)+'\n');
      assert(Math.abs(geometry.dpr-scale)<.01,'Real device scale '+scale);assert(geometry.overlap<=.25,JSON.stringify(row));
     }
    }
    await frame.locator('#statusbar').evaluate(el=>{el.dir='ltr'});
    const label=ext==='docx'?'#label-zoom':'#status-label-zoom',plus=ext==='xlsx'?'#status-btn-zoomup':'#btn-zoom-up',minus=ext==='xlsx'?'#status-btn-zoomdown':'#btn-zoom-down';
    const reset=async()=>{await frame.evaluate(ext=>{const api=Asc.editor;if(ext==='xlsx')api.asc_setZoom(1);else api.zoom(100)},ext);await frame.waitForFunction(selector=>document.querySelector(selector)?.textContent.trim()==='100%',label)};
    await reset();await frame.locator(plus).click();await frame.waitForFunction(selector=>document.querySelector(selector)?.textContent.trim()==='110%',label);
    await frame.locator(minus).click();await frame.waitForFunction(selector=>document.querySelector(selector)?.textContent.trim()==='100%',label);
    // Click the actual track away from the thumb; the SDK callback must change zoom.
    await frame.locator(sliderSelector+' .track').click({position:{x:20,y:2}});
    await frame.waitForFunction(selector=>document.querySelector(selector)?.textContent.trim()!=='100%',label);
    const clicked=await frame.locator(label).textContent();assert(/%/.test(clicked));interactions.push({ext,scale,theme,plus:'110%',minus:'100%',track:clicked.trim()});
    await reset();
    if(scale===scales[0]&&theme===themes[0]){
     await frame.locator(plus).focus();await env.page.keyboard.press('Enter');await frame.waitForFunction(selector=>document.querySelector(selector)?.textContent.trim()==='110%',label);
     await frame.locator(minus).focus();await env.page.keyboard.press('Enter');await frame.waitForFunction(selector=>document.querySelector(selector)?.textContent.trim()==='100%',label);
     interactions.at(-1).keyboard={plus:'110%',minus:'100%'};
    }
    await frame.locator('#statusbar').screenshot({path:path.join(output,ext+'-'+scale+'-'+theme+'.png')});
   }
   assert.deepEqual(env.errors,[]);assert(!env.requests.some(r=>/^https?:/.test(r.url)));
  }finally{await stop(env)}
 }
 await fs.writeFile(path.join(output,'geometry.json'),JSON.stringify({sourcePatch,rows,interactions},null,2)+'\n');
 console.log('PASS real packaged editors:',rows.length,'geometry states,',interactions.length,'plus/minus/track interactions; device scales',scales.join(','),'layout LTR/RTL; source rules',sourcePatch);
})().catch(error=>{console.error(error);process.exitCode=1});
