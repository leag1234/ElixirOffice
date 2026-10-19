// SPDX-License-Identifier: AGPL-3.0-only
// Independent parity gate against the actual SDK classifier and Python oracle.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
assert(process.env.EO_SDKJS,'Set EO_SDKJS');
const source=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/Paragraph/Run/FontClassification.js'));
const data=JSON.parse(fs.readFileSync(path.join(root,'tools/desktop/font-slots.json')));
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),data.sourceSha256);
const window={};
vm.runInNewContext(source.toString(),{window,AscFonts:{allocate:n=>new Uint8Array(n)},lcid_zh:0x7804});
const points=new Set([0,65,0x633,0xd85,0x1100,0xe000,0xf8ff,0xff21,0x1d400,0x20000,0x2f800,0x10ffff]);
for(const [mode,hint,lang] of [['default',0,0],['eastAsia',2,0],['chinese',2,0x7804]]){
 let i=0;
 for(let cp=0;cp<=0x10ffff;cp++){
  while(data.modes[mode][i][1]<cp)i++;
  assert.equal(window.AscWord.GetFontSlot(cp,hint,lang,false,false),data.modes[mode][i][2]);
 }
 for(const [start,end] of data.modes[mode])for(const cp of [start-1,start,end,end+1])if(cp>=0&&cp<=0x10ffff)points.add(cp);
}
const vectors=[];
for(const cp of points)for(const hint of [0,1,2])for(const lang of [0,0x7804])for(const cs of [false,true])for(const rtl of [false,true])
 vectors.push([cp,hint,lang,cs,rtl,window.AscWord.GetFontSlot(cp,hint,lang,cs,rtl)]);
const python=spawnSync('python3',['-c',`import sys,json
sys.path.insert(0,sys.argv[1])
from template_font_styles import font_slot
for cp,hint,lang,cs,rtl,expected in json.load(sys.stdin):
 actual=font_slot(cp,hint,lang,cs,rtl)
 assert actual==expected,(cp,hint,lang,cs,rtl,expected,actual)
print('PASS Python classifier parity',len(json.loads(sys.argv[2])))`,path.join(root,'tools/desktop'),'[]'],
 {input:JSON.stringify(vectors),encoding:'utf8'});
assert.equal(python.status,0,python.stderr);
console.log('PASS all Unicode/default/EastAsia/Chinese SDK table entries and '+vectors.length+' Python hint/language/CS/RTL boundary vectors');

// Exercise the actual SDK style selector, whose CS flags have independent defaults.
const styles=fs.readFileSync(path.join(process.env.EO_SDKJS,'word/Editor/Styles.js'),'utf8');
const begin=styles.indexOf('CTextPr.prototype.GetFontInfo = function');
const end=styles.indexOf('function CTextMetrics()',begin);
assert(begin>=0&&end>begin);
const CTextPr=function(){};
const AscWord={fontslot_CS:4,fontslot_EastAsia:2,fontslot_HAnsi:8};
vm.runInNewContext(styles.slice(begin,end),{CTextPr,AscWord,AscFonts:{CTextFontInfo:function(Name,Style,Size){Object.assign(this,{Name,Style,Size});}}});
const requests=[];
for(const slot of [1,2,4,8])for(const b of [false,true])for(const i of [false,true])for(const bc of [undefined,false,true])for(const ic of [undefined,false,true]){
 const properties={ascii:'Ascii',eastAsia:'EastAsia',cs:'CS',hAnsi:'HAnsi',b,i};
 if(bc!==undefined)properties.bCs=bc;
 if(ic!==undefined)properties.iCs=ic;
 const cp={1:65,2:0x4e00,4:0x633,8:0xd85}[slot];
 if(slot===4)properties.rtl=true;
 const actual=CTextPr.prototype.GetFontInfo.call({RFonts:{Ascii:{Name:'Ascii'},EastAsia:{Name:'EastAsia'},CS:{Name:'CS'},HAnsi:{Name:'HAnsi'}},Bold:b,Italic:i,BoldCS:bc,ItalicCS:ic},slot);
 requests.push([properties,cp,actual.Name,actual.Style]);
}
const selector=spawnSync('python3',['-c',`import sys,json
sys.path.insert(0,sys.argv[1])
from template_font_styles import font_request
for properties,cp,family,style in json.load(sys.stdin):
 assert font_request(properties,cp)==(family,style),(properties,cp,family,style,font_request(properties,cp))
`,path.join(root,'tools/desktop')],{input:JSON.stringify(requests),encoding:'utf8'});
assert.equal(selector.status,0,selector.stderr);
console.log('PASS '+requests.length+' actual SDK GetFontInfo family/style vectors, including independent CS defaults');
