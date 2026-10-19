// SPDX-License-Identifier: AGPL-3.0-only
// Capture actual save and clipboard style bytes without canonicalizing them.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {firefox}=require(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright');
const [config,out,filter,manifestName='style-output-fixtures.json']=process.argv.slice(2);assert(config&&out);fs.mkdirSync(out,{recursive:false});
const base='http://127.0.0.1:'+JSON.parse(fs.readFileSync(config)).port,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,manifestName))).cases.filter(f=>!filter||f.file===filter);assert(fixtures.length);
function decodeBinary(value){
 assert.equal(typeof value,'string');const start=value.indexOf('DOCY;');assert(start===0||value.slice(0,start)==='docData;','Recognized actual SDK clipboard wrapper');
 const encoded=value.slice(start),match=/^DOCY;v(\d+);(\d+);/.exec(encoded);assert(match);
 const bytes=Buffer.from(encoded.slice(match[0].length),'base64');assert.equal(bytes.length,Number(match[2]));
 const count=bytes[0];assert(count>0&&count<128);const tables=[];
 for(let n=0;n<count;n++){const offset=1+n*5;tables.push({type:bytes[offset],offset:bytes.readUInt32LE(offset+1)});}
 const style=tables.find(t=>t.type===5);assert(style);const length=bytes.readUInt32LE(style.offset),end=style.offset+4+length;assert(end<=bytes.length);
 return{bytes,style:bytes.subarray(style.offset,end),table:style,length};
}
(async()=>{
 const server=await firefox.launchServer({headless:true}),browser=await firefox.connect(server.wsEndpoint()),results=[];
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({version:browser.version(),playwright:require(path.join(process.env.EO_PLAYWRIGHT||'/srv/elixiroffice/pw/node_modules/playwright','package.json')).version,executable:firefox.executablePath(),executableSHA256:sha(fs.readFileSync(firefox.executablePath())),launcher:'Default headless Firefox launchServer; no custom arguments'},null,2));
 try{
  for(const fixture of fixtures){
   const file=path.join(__dirname,'fixtures',fixture.file);assert.equal(sha(fs.readFileSync(file)),fixture.sha256);
   const dir=path.join(out,fixture.file);fs.mkdirSync(dir);const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[],bad=[],inputs=[];
   try{
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{const url=new URL(response.url());if(url.origin===base&&/sdk-all.*\.js$/.test(url.pathname))inputs.push({url:response.url(),status:response.status()});});
    await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(['data:','blob:'].includes(u.protocol)||u.origin===base&&['GET','HEAD'].includes(r.method()))return route.continue();bad.push(r.method()+' '+u.origin+u.pathname);return route.abort();});
    await page.goto(base+'/example/local.html');await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(()=>window.EOLocalSession||window.EOLocalFailure,null,{timeout:120000});assert(!await page.evaluate(()=>window.EOLocalFailure));
    const frame=page.frames().find(f=>f.url().includes('/documenteditor/main/'));assert(frame);
    await frame.waitForFunction(()=>window.Asc?.editor?.isDocumentLoadComplete===true,null,{timeout:120000});await page.waitForTimeout(600);
    const output=await frame.evaluate(()=>{
     const api=Asc.editor,d=api.WordControl.m_oLogicDocument,styles=d.Styles,writer=new AscCommonWord.BinaryFileWriter(d),save=writer.Write(false);
     const tableStyles=Object.values(styles.Style).filter(s=>s.Get_Type()===3);
     const equality=tableStyles.map(a=>tableStyles.map(b=>({raw:a.Is_Equal(b),paste:a.isEqual(b)})));
     const styleInfo=tableStyles.map(s=>({id:s.Id,name:s.Name,basedOn:s.BasedOn,direct:s.TablePr.BidiVisual,compiled:styles.Get_Pr(s.Id,s.Get_Type()).TablePr.BidiVisual}));
     d.SelectAll();const data=[];api.asc_CheckCopy({pushData:(format,value)=>data.push({format,value})},AscCommon.c_oAscClipboardDataFormat.Internal);
     const clipboard=data.find(x=>x.format===AscCommon.c_oAscClipboardDataFormat.Internal)?.value;
     if(!clipboard)throw Error('Actual asc_CheckCopy returned no internal clipboard data');
     return{save,clipboard,styleInfo,equality,tableDirections:d.Content.filter(t=>t.IsTable?.()).map(t=>t.IsRTL?.()||false),defaultDirection:styles.Default.TablePr.BidiVisual??'absent'};
    });
    if(fixture.expectedRTL!==undefined)assert.equal(output.tableDirections[0],fixture.expectedRTL);
    fs.writeFileSync(path.join(dir,'model.json'),JSON.stringify({styleInfo:output.styleInfo,equality:output.equality,tableDirections:output.tableDirections,defaultDirection:output.defaultDirection},null,2));
    const hashes={};
    for(const name of ['save','clipboard']){
     fs.writeFileSync(path.join(dir,name+'.docy'),output[name]);
     const binary=decodeBinary(output[name]);fs.writeFileSync(path.join(dir,name+'.bin'),binary.bytes);fs.writeFileSync(path.join(dir,name+'-styles.bin'),binary.style);
     hashes[name]={binarySHA256:sha(binary.bytes),styleSHA256:sha(binary.style),styleBytes:binary.style.length,table:binary.table};
    }
    const pending=page.waitForEvent('download',{timeout:120000});await page.locator('#save').click();await(await pending).saveAs(path.join(dir,'save.docx'));
    assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
    results.push({fixture:fixture.file,status:'PASS',hashes,inputs,errors,bad});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(fixture.file,'CAPTURED');
   }finally{await context.close();}
  }
 }finally{await browser.close().catch(()=>{});await server.close().catch(()=>{});}
})().catch(error=>{fs.writeFileSync(path.join(out,'failure.txt'),error.stack);console.error(error);process.exitCode=1;});
module.exports={decodeBinary};
