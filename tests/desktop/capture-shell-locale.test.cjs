// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('capture locale changes refresh the actual shell before composing all document scenes',async()=>{
 const source=path.join(__dirname,'../../desktop/capture.cjs'),written=new Map(),frames=[];let language='en',shellLanguage='en',reloads=0;
 const shell={getURL:()=> 'eoapp://desktop.elixiroffice.invalid/tabs.html',loadURL:async()=>{reloads++;shellLanguage=language},executeJavaScript:async expression=>expression.includes('document.documentElement.lang')?shellLanguage:true};
 const contents={executeJavaScript:async expression=>{const match=/^EODesktopCapture\.(\w+)\((.*)\)$/.exec(expression);if(match?.[1]==='locale')language=JSON.parse(match[2]);return{language}}};
 const image={isEmpty:()=>false,toPNG:()=>Buffer.from('synthetic image transport'),getSize:()=>({width:1360,height:944})},output={exports:{}};
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{module:output,exports:output.exports,require:name=>name==='node:fs/promises'?{writeFile:async(file,value)=>written.set(file,value)}:name==='./capture-composite.cjs'?{compose:async()=>{frames.push({language,shellLanguage});return{image,capture:{kind:'shell-and-document-composite'}}}}:require(name),setTimeout:fn=>setImmediate(fn),console:{log(){}},process:{platform:'linux'}},{filename:source});
 await output.exports.run({webContents:contents,window:{webContents:shell},view:{webContents:contents},validate:()=> 'stable'}, {folder:'/synthetic/no-file-written',locales:['en','fr']});
 assert.equal(reloads,2);assert.equal(frames.length,6);assert(frames.every(frame=>frame.language===frame.shellLanguage));
 const result=JSON.parse(written.get('/synthetic/no-file-written/captures.json'));
 assert.deepEqual(result.screens.map(s=>s.capture.shellLanguage),['en','en','en','fr','fr','fr']);
});
