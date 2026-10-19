// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Execute the real SDK repaint prefix and CPage.Draw on a real Canvas2D surface.
// This isolates compositing; it does not claim a newly built editor package.
const {firefox}=require(process.env.EO_PLAYWRIGHT||'playwright-core');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const sdk=process.env.EO_SDKJS,output=process.env.EO_SHADOW_OUTPUT;assert(sdk&&output);await fs.mkdir(output,{recursive:true});
 const html=await fs.readFile(path.join(sdk,'word/Drawing/HtmlPage.js'),'utf8'),drawing=await fs.readFile(path.join(sdk,'word/Drawing/DrawingDocument.js'),'utf8');
 const a=html.indexOf('this.OnPaint = function()'),b=html.indexOf('var rectsPages = [];',a);assert(a>0&&b>a);
 const paint=html.slice(a,b)+'};';
 const c=drawing.indexOf('CPage.prototype.Draw = function'),d=drawing.indexOf('CPage.prototype.DrawSelection',c);assert(c>0&&d>c);
 const draw=drawing.slice(c,d);
 const browser=await firefox.launch({headless:true}),page=await browser.newPage();
 try{
  await page.setContent('<canvas id="canvas"></canvas>');
  const rows=[];
  for(const dpr of [1,2])for(const layout of ['single','two-pages']){
   const result=await page.evaluate(({paint,draw,dpr,layout})=>{
    const canvas=document.getElementById('canvas');canvas.width=260*dpr;canvas.height=280*dpr;
    const context=canvas.getContext('2d'),GlobalSkin={BackgroundColor:'#e2e2e2',PageShadow:'rgba(0,0,0,0.22)'};
    const AscCommon={AscBrowser:{retinaPixelRatio:dpr,isSailfish:false,getContext2D:()=>context}},g_page_outline_inner=false,CPage=function(){};
    eval(draw);
    const wp={m_oApi:{isLongAction:()=>false,isDocumentRenderer:()=>false,checkLastWork(){},isDarkMode:false},m_oDrawingDocument:{m_lDrawingFirst:0,m_lDrawingEnd:0},m_oEditor:{HtmlElement:canvas}};
    new Function('window','AscCommon','GlobalSkin',paint).call(wp,{},AscCommon,GlobalSkin);
    const p=new CPage();p.drawingPage={cachedImage:null};
    const api={isDarkMode:false},paintPage=()=>{wp.OnPaint();if(layout==='single')p.Draw(context,50*dpr,40*dpr,120*dpr,180*dpr,api);else{p.Draw(context,50*dpr,25*dpr,120*dpr,100*dpr,api);p.Draw(context,40*dpr,145*dpr,160*dpr,80*dpr,api);}};
    canvas.fullRepaint=true;paintPage();const first=context.getImageData(0,0,canvas.width,canvas.height).data.slice();
    for(let i=0;i<30;i++)paintPage();
    const last=context.getImageData(0,0,canvas.width,canvas.height).data;let differences=0;
    for(let i=0;i<first.length;i+=4)if(first[i]!==last[i]||first[i+1]!==last[i+1]||first[i+2]!==last[i+2])differences++;
    return {dpr,layout,differences,png:canvas.toDataURL('image/png').split(',')[1]};
   },{paint,draw,dpr,layout});
   await fs.writeFile(path.join(output,'shadow-'+layout+'-dpr'+dpr+'.png'),Buffer.from(result.png,'base64'));delete result.png;rows.push(result);
  }
  const guards=await page.evaluate(({paint})=>{
   const results=[];
   for(const mode of ['renderer','first-negative','end-negative','transparent','spaced-zero']){
    const canvas=document.createElement('canvas');canvas.width=30;canvas.height=30;const context=canvas.getContext('2d');
    context.fillStyle='#123456';context.fillRect(0,0,30,30);
    const GlobalSkin={BackgroundColor:'#e2e2e2',PageShadow:mode==='transparent'?'transparent':mode==='spaced-zero'?'rgba(0, 0, 0, 0)':'rgba(0,0,0,0.22)'};
    const AscCommon={AscBrowser:{isSailfish:false,getContext2D:()=>context}};
    const wp={m_oApi:{isLongAction:()=>false,isDocumentRenderer:()=>mode==='renderer',checkLastWork(){},isDarkMode:false},m_oDrawingDocument:{m_lDrawingFirst:mode==='first-negative'?-1:0,m_lDrawingEnd:mode==='end-negative'?-1:0},m_oEditor:{HtmlElement:canvas}};
    new Function('window','AscCommon','GlobalSkin',paint).call(wp,{},AscCommon,GlobalSkin);
    wp.OnPaint();const survived=Array.from(context.getImageData(0,0,1,1).data);
    canvas.fullRepaint=true;wp.OnPaint();const full=Array.from(context.getImageData(0,0,1,1).data);
    results.push({mode,survived,full});
   }
   return results;
  },{paint});
  await fs.writeFile(path.join(output,'guards.json'),JSON.stringify(guards,null,2));
  for(const guard of guards){assert.deepEqual(guard.survived,[18,52,86,255],guard.mode);assert.deepEqual(guard.full,[226,226,226,255],guard.mode+' retains explicit fullRepaint');}
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(rows,null,2));
  for(const row of rows)assert.equal(row.differences,0,JSON.stringify(row));
  console.log('PASS actual SDK repaint/page-draw pixels stay identical after thirty redraws',rows);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
