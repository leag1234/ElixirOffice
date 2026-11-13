const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../../desktop/renderer.js'),'utf8');
test('the PDF editor Print button of the quick access toolbar starts the native print',()=>{
 assert.match(source,/if\(kind==='pdf'\)frame\.Common\.NotificationCenter\.on\('eo:native-print',\(\)=>openPrint\(true\)\);/);
 assert.match(source,/function openPrint\(print=false\)\{[^}]*file\.format==='pdf'[^}]*return pdf\(print\)/);
});
