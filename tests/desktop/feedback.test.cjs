// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Feedback=require('../../desktop/feedback.js'),catalogs=require('../../tools/desktop/i18n-extra.json');
test('all 45 feedback catalogs preserve placeholders and English fallback',()=>{
 assert.equal(Object.keys(catalogs).length,45);
 for(const [language,strings] of Object.entries(catalogs)){
  assert(strings.opFileMissing,language+'/opFileMissing');
  for(const key of Object.keys(Feedback.fallback))assert(strings[key],language+'/'+key);
  for(const key of ['opReady','opDownload','opOpening','opOpened','opDecrypting','opEncrypting'])assert(strings[key].includes('{name}'));
  assert(strings.opFailed.includes('{reason}'));assert(strings.opPages.includes('{completed}')&&strings.opPages.includes('{total}'));
 }
 assert.equal(Feedback.label({phase:'ready',name:'public.pdf'},{}),'File ready: \u2068public.pdf\u2069');
 assert.equal(Feedback.label({phase:'complete',outcome:'download-started',name:'public.pdf'},catalogs.fr),'Téléchargement lancé: \u2068public.pdf\u2069');
 assert.match(Feedback.label({phase:'error',reason:'blocked destination'},catalogs.fr),/blocked destination/);
});
test('feedback labels distinguish cancellation, print submission, warning and unconfirmed completion',()=>{
 for(const phase of ['cancelled','warning','error','complete']){
  const label=Feedback.label({phase,reason:'failure'});assert(!label.includes('File ready'));
 }
 assert.equal(Feedback.label({phase:'complete',outcome:'printed'}),'Sent to the print system');
 assert.equal(Feedback.label({phase:'converting',completed:2,total:4}),'Preparing pages: 2 of 4');
 assert.equal(Feedback.label({phase:'converting'}),'Converting…');
});

test('actual desktop operation observer preserves mapped errors without exposing OS paths or stale documents',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8'),updates=[],announcements=[],statuses=[];
 const start=source.indexOf('function operationEvent('),end=source.indexOf('function outputOutcome(',start);assert(start>=0&&end>start);
 const context={file:{token:'current'},info:{strings:{...catalogs.fr,error:'Erreur locale'}},EODesktopErrors:require('../../desktop/errors.js'),lastOperation:null,statusOperation:null,
 status:text=>statuses.push(text),feedback:{update:event=>updates.push(event)},backstage:{operation(){}},window:{dispatchEvent:event=>announcements.push(event.detail)},CustomEvent:class{constructor(_type,options){this.detail=options.detail;}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 context.operationEvent({scope:'stale',id:'one',phase:'error',reason:'EISDIR: /private/public-fixture'});assert.equal(updates.length,0);
 for(const [reason,expected]of [['EISDIR: open /private/public-fixture','Erreur locale'],['ENOSPC: write /private/public-fixture',catalogs.fr.saveSpace],[catalogs.fr.pdfReasonSignature,catalogs.fr.pdfReasonSignature]]){
  context.operationEvent({scope:'current',id:'one',phase:'error',reason});
  assert.equal(updates.at(-1).reason,expected);assert.equal(announcements.at(-1).reason,expected);assert.equal(context.lastOperation.reason,expected);
 }
 const before=updates.length;context.operationEvent({scope:'current',id:'older-job',phase:'error',reason:'Stale action failure'});assert.equal(updates.length,before);
 assert(updates.every(e=>!e.reason.includes('/private/')));
});

test('feedback paints two visible frames, while hidden windows and stalled frames stay bounded',async()=>{
 const frames=[],timers=new Map();let seq=0,settled=false;
 const view={document:{hidden:false},setTimeout:fn=>{const n=++seq;timers.set(n,fn);return n;},clearTimeout:n=>timers.delete(n),requestAnimationFrame:fn=>frames.push(fn)};
 const pending=Feedback.paint(view).then(()=>settled=true);assert.equal(frames.length,1);frames.shift()();await Promise.resolve();assert.equal(settled,false);assert.equal(frames.length,1);frames.shift()();await pending;assert.equal(settled,true);
 view.document.hidden=true;const hidden=Feedback.paint(view);assert.equal(frames.length,0);for(const fn of [...timers.values()])fn();await hidden;
 view.document.hidden=false;const stalled=Feedback.paint(view);for(const fn of [...timers.values()])fn();await stalled;
});

test('actual desktop format download routes Office copies and PDF to the correct native bridge',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../../desktop/renderer.js'),'utf8'),calls=[];
 const start=source.indexOf('function outputOutcome('),end=source.indexOf('async function updateDirty()',start);assert(start>=0&&end>start);
 const context={file:{token:'public'},lastOperation:{id:'job'},saveAsTicket:'selection-capability',window:{},eoDesktop:{export:async(...args)=>{calls.push(['office',...args]);return {name:'copy.odt',artifactId:'opaque'};},pdf:async(...args)=>{calls.push(['pdf',...args]);return null;}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const protection={protected:true,remove:false},bytes=new Uint8Array([1]);
 const result=await context.exportOutput(bytes,'odt',{},undefined,protection);
 assert.equal(result.kind,'saved');assert.equal(result.committed,true);assert.equal(calls[0][0],'office');assert.equal(calls[0][3],'odt');assert.deepEqual(calls[0][4],protection);assert.equal(calls[0][5],'job');assert.equal(calls[0][6],'selection-capability');
 assert.equal(context.window.EOLastExport.name,'copy.odt');assert.equal(context.window.EOLastPdf,undefined);
 assert.equal((await context.exportOutput(bytes,'pdf',{})).kind,'cancelled');assert.equal(calls[1][0],'pdf');
});

test('feedback isolates untrusted RTL names and reasons without allowing embedded controls to escape',()=>{
 for(const [phase,field] of [['ready','name'],['error','reason']]){
  const value='تقرير-2026.pdf',label=Feedback.label({phase,[field]:value});
  assert(label.includes('\u2068'+value+'\u2069'));
  assert(!Feedback.label({phase,[field]:'a\u2069b\u202ec'}).includes('\u202e'));
 }
 assert.equal(Feedback.label({phase:'awaiting-output'}),'Saving…');
 assert.equal(Feedback.canCancel({kind:'pdf-export',phase:'converting',cancellable:false}),false);
});

test('named opens/crypto stages stay indeterminate and print only describes preparation or system submission',()=>{
 for(const kind of ['open','save']){
  const name='تقرير.docx';
  for(const purpose of ['decrypting','encrypting']){
   const text=Feedback.label({kind,phase:'converting',purpose,name},catalogs.fr);assert(text.includes(Feedback.isolate(name)));assert(!text.includes('%'));
  }
 }
 assert(Feedback.label({kind:'open',phase:'loading-runtime',name:'public.docx'},catalogs.fr).includes('public.docx'));
 assert.equal(Feedback.label({kind:'print',phase:'awaiting-output'}),'Preparing…');
 assert.equal(Feedback.canCancel({kind:'print',phase:'converting'}),true);assert.equal(Feedback.canCancel({kind:'print',phase:'writing'}),false);
});
