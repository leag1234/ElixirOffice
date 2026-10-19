// SPDX-License-Identifier: AGPL-3.0-only
// Explicit generated-template/real physical-font coverage gate; no OS/editor acceptance inferred.
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(new URL('../..',import.meta.url).pathname);
const work=process.env.EO_FONT_WORK,assets=process.env.EO_FONT_ASSETS,system=process.env.EO_FONT_SYSTEM_DIRECTORY,sdk=process.env.EO_SDKJS,overlay=process.env.EO_DESKTOP_TEMPLATES;
assert(work&&assets&&system&&sdk&&overlay,'Set all explicit public fixture/SDK/template paths');
await fs.mkdir(work,{recursive:true});
const {Fonts}=require(path.join(root,'desktop/fonts.cjs')),resolver=require(path.join(root,'desktop/font-resolver.js')),templates=require(path.join(root,'desktop/templates.cjs'));
const fonts=new Fonts();fonts.allowed=[system];fonts.configure({bundled:assets,cacheDir:path.join(work,'cache'),bundleIdentity:'S4-public-profile'});
const index=await fonts.index(),off={bundled:index.bundled,system:[]};
assert(index.system.some(face=>face.family==='Noto Sans CJK TC'&&face.style==='Bold'));
const window={AscFonts:{CreateFontData2:input=>{const data=new Uint8Array(Buffer.from(input,'base64'));return {data,size:data.length};},FontStyle:{FontStyleRegular:0,FontStyleBold:1,FontStyleItalic:2,FontStyleBoldItalic:3}},AscCommon:{}};
const context=vm.createContext({window,AscFonts:window.AscFonts,AscCommon:window.AscCommon});
for(const file of [path.join(sdk,'common/libfont/character.js'),path.join(assets,'sdkjs/common/AllFonts.js'),path.join(sdk,'common/Drawings/Externals.js')])
 vm.runInContext(await fs.readFile(file,'utf8'),context,{filename:file});
const picker=window.AscFonts.FontPickerByCharacter;
const base=JSON.parse(await fs.readFile(path.join(root,'branding/example/nodejs/public/elixir/brand/templates/templates.json'))).templates;
const extra=JSON.parse(await fs.readFile(path.join(overlay,'templates.json'))).templates;
const profiles=[['system',index],['off',off]],results=[];
for(const [profile,inventory] of profiles){
 const policy=resolver.create([...inventory.bundled,...inventory.system]);
 for(const entry of extra){
  const original=base.find(item=>item.id===entry.id);
  const merged={...original,languages:[...new Set([...original.languages,...entry.languages])],fontRequirements:entry.fontRequirements,systemLocales:entry.systemLocales};
  for(const locale of entry.languages){
   const selected=templates.resolve(merged,locale,{index:inventory});
   const expected=profile==='off'&&entry.systemLocales.includes(locale)?'en':locale;
   assert.equal(selected.language,expected,profile+' '+entry.id+' '+locale);
   if(expected==='en'){results.push({profile,id:entry.id,locale,language:'en',reason:'No eligible CJK system font'});continue;}
   const misses=[],fallbacks=[],used=new Set();
   for(const request of entry.fontRequirements[locale])for(const cp of request.codepoints){
    let physical=policy.resolve({name:request.name,style:request.style,codepoints:[cp]});
    if(!physical){
     const baseline=picker.getFontBySymbol(cp);
     physical=baseline&&policy.resolve({name:baseline,style:request.style,codepoints:[cp]});
     if(physical)fallbacks.push({requested:request.name,style:request.style,cp,selected:physical.family});
    }
    if(!physical)misses.push({name:request.name,style:request.style,cp});
    else used.add(physical.family+'|'+physical.styleCode+'|'+physical.faceIndex);
   }
   assert.equal(misses.length,0,JSON.stringify({profile,id:entry.id,locale,misses}));
   results.push({profile,id:entry.id,locale,language:selected.language,missing:misses,characterFallbacks:fallbacks,physicalFaces:[...used]});
  }
 }
}
await fs.writeFile(path.join(work,'template-coverage.json'),JSON.stringify({profiles:{system:index.system.length,bundled:index.bundled.length},results,nativeEditor:'UNVERIFIED'},null,2)+'\n');
fonts.clear();
console.log('PASS 24 localized physical-face coverage profiles, packaged si/ur off, and safe English fallback for uncovered CJK');
