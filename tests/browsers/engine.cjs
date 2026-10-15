// Reuse unchanged suites: only select the real Playwright browser type.
const Module = require('node:module');
const fs = require('node:fs');
const original = Module._load;
const engine = process.env.EO_ENGINE;
if (!['chromium','firefox','webkit'].includes(engine)) throw new Error('Explicit EO_ENGINE required');
const base = new URL(process.env.EO_BASE);
if (!['localhost','127.0.0.1'].includes(base.hostname) || base.port === '8080') throw new Error('Own loopback instance required');
Module._load = function(id, parent, main) {
  const value = original.apply(this, arguments);
  if (id !== 'playwright') return value;
  return new Proxy(value, {get(target, key) {return key === 'chromium' ? target[engine] : Reflect.get(target,key);}});
};
// Linux process-tree RSS includes the Playwright driver and browser children,
// excludes the Node test parent. Sum sampled simultaneously, not individual peaks.
let peakKiB=0, samples=0;
function sample() {
  if(process.platform!=='linux') return;
  try {
    const rows=fs.readdirSync('/proc').filter(p=>/^\d+$/.test(p)).flatMap(pid=>{
      try {const s=fs.readFileSync('/proc/'+pid+'/status','utf8');return [{pid:+pid,ppid:+s.match(/^PPid:\s+(\d+)/m)[1],rss:+(s.match(/^VmRSS:\s+(\d+)/m)||[0,0])[1]}];}catch{return [];}
    });
    const descendants=new Set([process.pid]);let changed=true;
    while(changed){changed=false;for(const row of rows)if(descendants.has(row.ppid)&&!descendants.has(row.pid)){descendants.add(row.pid);changed=true;}}
    peakKiB=Math.max(peakKiB,rows.filter(r=>r.pid!==process.pid&&descendants.has(r.pid)).reduce((n,r)=>n+r.rss,0));samples++;
  }catch{}
}
const timer=setInterval(sample,100);timer.unref();
function cgroupMetrics(){
 if(process.env.EO_CGROUP_REPORT!=='1')return undefined;
 const report={};
 let group='/';try{group=fs.readFileSync('/proc/self/cgroup','utf8').split('\n').find(l=>l.startsWith('0::')).slice(3);}catch{}
 report.scope=group;
 for(const name of ['memory.max','memory.peak','memory.events']){
  try{report[name]=fs.readFileSync('/sys/fs/cgroup'+group+'/'+name,'utf8').trim();}catch{}
 }
 return report;
}
process.on('exit',()=>{sample();if(process.env.EO_MEMORY_REPORT)fs.writeFileSync(process.env.EO_MEMORY_REPORT,JSON.stringify({engine,peakProcessTreeRSSKiB:peakKiB,samples,intervalMs:100,scope:'Playwright driver and browser descendants; summed RSS may double-count shared pages',cgroup:cgroupMetrics()},null,2));});
