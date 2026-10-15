import assert from 'node:assert/strict';
import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const {chromium}=createRequire(path.join(os.homedir(),'elixiroffice/pw/package.json'))('playwright');
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(process.env.EO_BASE+'/example/');
 const result=await page.evaluate(()=>{
  const memory=new WebAssembly.Memory({initial:1,maximum:65536});
  let above4GiB=false;try{new WebAssembly.Memory({initial:1,maximum:65537});}catch(e){above4GiB=e instanceof RangeError;}
  const constrained=new WebAssembly.Memory({initial:1,maximum:4096});
  constrained.grow(4095);let limitEnforced=false;
  try{constrained.grow(1);}catch(e){limitEnforced=e instanceof RangeError;}
  return {queryLocalFonts:typeof queryLocalFonts,wasm32MaximumPages:65536,maximum4GiBDeclared:!!memory,above4GiBRejected:above4GiB,boundedMemoryBytes:constrained.buffer.byteLength,boundedGrowRejected:limitEnforced};
 });
 assert.equal(result.above4GiBRejected,true);assert.equal(result.boundedMemoryBytes,268435456);assert.equal(result.boundedGrowRejected,true);console.log('PASS',JSON.stringify(result));
}finally{await browser.close();}
