// Verify the same saved document after recreation or restoration; no new edit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as L from '../../tools/eval/lib.mjs';
const out = process.env.EO_SERVER_OUT;
assert(out && process.env.EO_BASE, 'explicit evidence directory and own URL required');
const {name,marker} = JSON.parse(fs.readFileSync(out+'/lifecycle.json'));
const launch = L.chromium.launch.bind(L.chromium);
L.chromium.launch = options => launch({...options, args:process.env.EO_TEST_CA_SPKI ?
 ['--ignore-certificate-errors-spki-list='+process.env.EO_TEST_CA_SPKI,
  '--host-resolver-rules=MAP office-server-d.test 127.0.0.1'] : []});
let healthy=false;
for(let i=0;i<120;i++){
 try {const r=await fetch(L.BASE+'/healthcheck');if(r.ok&&await r.text()==='true'){healthy=true;break;}}catch{}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert(healthy);
let saved;
for(let i=0;i<60;i++){
 saved=await fetch(L.BASE+'/example/download?fileName='+encodeURIComponent(name),
  {headers:{Cookie:'uid=uid-1'}});
 if(saved.status!==502 && saved.status!==503) break;
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert.equal(saved.status,200);
fs.writeFileSync(out+'/persisted.docx',Buffer.from(await saved.arrayBuffer()));
const xml=execFileSync('python3',['-c',
 'import zipfile,sys,xml.etree.ElementTree as E; r=E.fromstring(zipfile.ZipFile(sys.argv[1]).read("word/document.xml")); print("".join(x.text or "" for x in r.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")))',
 out+'/persisted.docx'],{encoding:'utf8'});
assert(xml.includes(marker),'stored DOCX retains original edit');
const s=await L.launch();
try{
 const f=await L.openEditor(s.page,name);
 assert((await L.cmd(f,'Api.GetDocument().GetText({Numbering:false})')).includes(marker));
 assert.deepEqual(s.errors,[]);
 console.log(JSON.stringify({storedEdit:true,reopened:true,errors:0}));
}finally{await s.browser.close();}
