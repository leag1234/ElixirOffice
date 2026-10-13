// SPDX-License-Identifier: AGPL-3.0-only
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {response,ORIGIN}=require('../../desktop/resources.cjs');
test('only bundle resources and GET/HEAD can be served, wasm MIME and CSP preserved',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-resources-'));
 try{
  await fs.mkdir(path.join(dir,'sdkjs'),{recursive:true});await fs.writeFile(path.join(dir,'sdkjs/test.wasm'),'wasm');
  const url=ORIGIN+'/example/local-assets/sdkjs/test.wasm';
  const r=await response(new Request(url),dir,dir);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/wasm');assert.match(r.headers.get('content-security-policy'),/object-src 'none'/);
  assert.equal((await response(new Request(url,{method:'POST'}),dir,dir)).status,403);
  assert.equal((await response(new Request('https://example.com/sdkjs/test.wasm'),dir,dir)).status,403);
  assert.equal((await response(new Request(ORIGIN+'/example/local-assets/sdkjs/%2e%2e%2fsecret'),dir,dir)).status,403);
  assert.equal((await response(new Request(ORIGIN+'/etc/passwd'),dir,dir)).status,404);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test('native file transport serves only manifest assets and retains bytes and HEAD headers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-desktop-native-'));
 try{
  await fs.writeFile(path.join(dir,'desktop-manifest.json'),JSON.stringify({files:{'sdkjs/test.wasm':{bytes:4}}}));
  const calls=[],handler=await require('../../desktop/resources.cjs').createHandler(dir,dir,async url=>{calls.push(url);return new Response('wasm')});
  const url=ORIGIN+'/example/local-assets/sdkjs/test.wasm';
  const result=await handler(new Request(url));assert.equal(await result.text(),'wasm');assert.equal(result.headers.get('content-length'),'4');assert.equal(calls.length,1);
  const alias=await handler(new Request(ORIGIN+'/example/local-assets/sdkjs//test.wasm'));assert.equal(await alias.text(),'wasm');
  const head=await handler(new Request(url,{method:'HEAD'}));assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'4');
  const before=calls.length;assert.equal((await handler(new Request(ORIGIN+'/example/local-assets/sdkjs/unlisted.js'))).status,404);assert.equal(calls.length,before);
  assert.equal((await handler({url:ORIGIN.replace('://','://attacker@')+'/index.html',method:'GET'})).status,403);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});

test('thesaurus byte ranges stream exact slices, clamp ends, support suffix and reject invalid ranges',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'eo-range-'));
 try{
  await fs.mkdir(path.join(dir,'dictionaries/en_US'),{recursive:true});
  await fs.writeFile(path.join(dir,'dictionaries/en_US/test.dat'),'0123456789');
  const url=ORIGIN+'/example/local-assets/dictionaries/en_US/test.dat';
  for(const [value,wanted,contentRange] of [['bytes=2-5','2345','bytes 2-5/10'],['bytes=8-999','89','bytes 8-9/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=7-','789','bytes 7-9/10']]){
   const r=await response(new Request(url,{headers:{Range:value}}),dir,dir);
   assert.equal(r.status,206);assert.equal(await r.text(),wanted);assert.equal(r.headers.get('content-range'),contentRange);assert.equal(r.headers.get('content-length'),String(wanted.length));
  }
  for(const value of ['bytes=10-','bytes=4-2','bytes=-0','bytes=1-2,4-5','bytes=9007199254740993-','units=0-2']){
   const r=await response(new Request(url,{headers:{Range:value}}),dir,dir);assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */10');
  }
  const head=await response(new Request(url,{method:'HEAD',headers:{Range:'bytes=2-5'}}),dir,dir);assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'10');
  await fs.symlink('/etc/passwd',path.join(dir,'dictionaries/en_US/link.dat'));
  assert.equal((await response(new Request(url.replace('test.dat','link.dat'),{headers:{Range:'bytes=0-3'}}),dir,dir)).status,403);
 }finally{await fs.rm(dir,{recursive:true,force:true})}
});
