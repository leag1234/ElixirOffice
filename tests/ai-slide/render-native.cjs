// SPDX-License-Identifier: AGPL-3.0-only
// Actual fixed-size Linux canvas pixels, not a source-string or text-only check.
'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),web=process.env.EO_WEB_APPS;assert(web&&path.isAbsolute(web));assert.equal(process.platform,'linux');
const {launch,editable,stop,root}=require('../desktop/harness.cjs'),sharp=require(path.join(web,'build/node_modules/sharp'));
function helper(){const p='/opt/elixiroffice-qa/chrome-sandbox-44.9.1',s=sync.lstatSync(p);assert(s.uid===0&&s.gid===0&&(s.mode&0o7777)===0o4755&&s.size===15232);assert.equal(crypto.createHash('sha256').update(sync.readFileSync(p)).digest('hex'),'a4f6dfd7325ddd55f94ddc0c487d22726d40ef099ded6475d5dffe236e277896');assert.equal(sync.readlinkSync(repo+'/desktop/node_modules/electron/dist/chrome-sandbox'),p);}
(async()=>{
 let env;const receipt={};
 try{
  env=await launch({file:root+'/fixtures/ai-public.pptx',profile:'slide-render-qualified',args:['--ozone-platform=x11'],onSpawn:helper});await editable(env);
  const result=await env.page.evaluate(async()=>{const ts=EOLocalSession.win.Common.ElixirAI.toolsets.slide.create(EOLocalSession.api),c=await ts.init();try{await ts.execute('submit_plan',{goal:'Visible public slide',read_only:false,steps:[{tool:'create_slides',purpose:'Append'}]},c);const r=await ts.execute('create_slides',{slides:[{title:'Public lesson',bullets:['Read together','Discuss in pairs']}]},c);await ts.end(c,true);return r;}catch(e){await ts.end(c,false);throw e;}});
  assert.equal(result.ok,true,JSON.stringify(result));await env.page.waitForTimeout(1000);
  const file=root+'/results/slide-render-qualified.png';await env.page.screenshot({path:file});
  const {data,info}=await sharp(file).extract({left:300,top:250,width:950,height:430}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let dark=0;for(let i=0;i<data.length;i+=info.channels)if(data[i]<180&&data[i+1]<180&&data[i+2]<180)dark++;
  receipt.darkTextPixels=dark;receipt.minimum=100;assert(dark>100,'Generated text must be visible on the actual slide canvas, not inherited white-on-white');
  const sizes=await env.page.evaluate(()=>new Promise(resolve=>EOLocalSession.api.callCommand('(function(){return JSON.stringify(Api.GetPresentation().GetAllSlides().slice(-1)[0].GetAllShapes().map(function(q){return q.GetContent().GetElement(0).GetElement(0).GetTextPr().GetFontSize();}));})()',true,v=>resolve(JSON.parse(v)))));
  assert.deepEqual(sizes,[64,40],'Public font sizes are half-points:32pt title and20pt body');receipt.halfPointSizes=sizes;assert.deepEqual(env.errors,[]);receipt.pass=true;console.log('PASS actual generated slide canvas text visibility and public font sizes');
 }finally{receipt.rendererErrors=env?.errors||[];await fs.writeFile(root+'/results/slide-render-qualified.json',JSON.stringify(receipt,null,2)+'\n');if(env)await stop(env);}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
