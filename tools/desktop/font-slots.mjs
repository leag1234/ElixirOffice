// SPDX-License-Identifier: AGPL-3.0-only
// Generate exact coverage-oracle slot ranges from the pinned SDK implementation.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const [sourcePath,output]=process.argv.slice(2);
if(!sourcePath||!output)throw Error('Provide SDK FontClassification.js and fresh output path');
if(fs.existsSync(output))throw Error('Choose a fresh output');
const source=fs.readFileSync(sourcePath),window={};
vm.runInNewContext(source.toString(),{window,AscFonts:{allocate:n=>new Uint8Array(n)},lcid_zh:0x7804});
const modes={};
for(const [name,hint,lang] of [['default',0,0],['eastAsia',2,0],['chinese',2,0x7804]]){
 const ranges=[];let start=0,previous=window.AscWord.GetFontSlot(0,hint,lang,false,false);
 for(let cp=1;cp<=0x110000;cp++){
  const slot=cp<0x110000?window.AscWord.GetFontSlot(cp,hint,lang,false,false):-1;
  if(slot!==previous){ranges.push([start,cp-1,previous]);start=cp;previous=slot;}
 }
 modes[name]=ranges;
}
fs.writeFileSync(output,JSON.stringify({source:'sdkjs/word/Editor/Paragraph/Run/FontClassification.js',
 sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),modes},null,2)+'\n');
console.log('PASS exact SDK slot oracle across all Unicode scalars and default/EastAsia/Chinese modes');
