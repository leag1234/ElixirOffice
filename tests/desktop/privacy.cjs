// SPDX-License-Identifier: AGPL-3.0-only
const http=require('node:http'),assert=require('node:assert/strict');
async function networkDenied(page){
 let hits=0;
 const server=http.createServer((_request,response)=>{hits++;response.setHeader('Access-Control-Allow-Origin','*');response.end('reachable')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/desktop-privacy-probe';
  await new Promise((resolve,reject)=>http.get(url,response=>{response.resume();response.once('end',resolve)}).once('error',reject));
  assert.equal(hits,1,'Control endpoint must actually be reachable');hits=0;
  assert.equal(await page.evaluate(async url=>{try{await fetch(url);return false}catch(e){return true}},url),true);
  await new Promise(resolve=>setTimeout(resolve,200));
  assert.equal(hits,0,'A rejected fetch must not reach the controlled endpoint');
  return {controlledEndpointReachable:true,rendererRequestsReceived:0};
 }finally{await new Promise(resolve=>server.close(resolve))}
}
module.exports={networkDenied};

if(require.main===module)(async()=>{const {launch,stop}=require('./harness.cjs'),env=await launch({profile:'privacy-control-'+Date.now()});try{console.log('PASS controlled network',JSON.stringify(await networkDenied(env.page)))}finally{await stop(env)}})().catch(e=>{console.error(e);process.exitCode=1});
