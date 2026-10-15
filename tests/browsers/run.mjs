import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const [suite,out,...args]=process.argv.slice(2);
if(!suite||!out||!process.env.EO_BASE)throw new Error('EO_BASE=own-instance node tests/browsers/run.mjs SUITE OUTPUT [suite arguments]');
fs.mkdirSync(out,{recursive:true});
const results=[];
for(const engine of (process.env.EO_ENGINES||'chromium,firefox,webkit').split(',')){
 const log=fs.openSync(path.join(out,engine+'.log'),'w'),start=Date.now();
 const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--require',path.join(here,'engine.cjs'),path.resolve(suite),...args],{env:{...process.env,EO_ENGINE:engine,EO_MEMORY_REPORT:path.resolve(out,engine+'-memory.json'),EO_LOCAL_OUT:path.resolve(out,engine+'-outputs')},stdio:['ignore',log,log]});
  const timer=setTimeout(()=>child.kill('SIGTERM'),Number(process.env.EO_SUITE_TIMEOUT_MS||900000));
  child.on('error',reject);child.on('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});
 });
 fs.closeSync(log);results.push({engine,...code,ms:Date.now()-start});console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
if(results.some(r=>r.code!==0))process.exitCode=1;
