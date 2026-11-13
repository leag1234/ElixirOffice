const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const catalogs=require('../../tools/desktop/i18n-extra.json');
const source=fs.readFileSync(require.resolve('../../desktop/main.cjs'),'utf8');
const keys=['linkMissing','linkDenied','linkRelative','linkFailed','linkConfirm','linkOpen'];
test('every desktop UI catalog translates the local file link dialog strings',()=>{
 assert.equal(Object.keys(catalogs).length,45);
 for(const [language,strings] of Object.entries(catalogs))for(const key of keys){
  assert.equal(typeof strings[key],'string',language+':'+key);assert(strings[key].trim(),language+':'+key);
 }
 assert.equal(catalogs.fr.linkConfirm,'Ouvrir ce fichier avec son application par défaut ?');assert.equal(catalogs.fr.linkOpen,'Ouvrir');
});
test('the English link strings of main.cjs match the English catalog',()=>{
 for(const key of keys.slice(0,5)){
  const match=new RegExp(key+":'([^']*)'").exec(source);assert(match,key);assert.equal(catalogs.en[key],match[1],key);
 }
});
