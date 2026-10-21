// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const {ORIGIN}=require('../../desktop/resources.cjs');
const DOCUMENT_URL=ORIGIN+'/index.html',SHELL_URL=ORIGIN+'/tabs.html';
function pages(browser,url){return browser.contexts().flatMap(context=>context.pages()).filter(page=>!page.isClosed()&&page.url()===url);}
function documentPages(browser){return pages(browser,DOCUMENT_URL);}
function shellPages(browser){return pages(browser,SHELL_URL);}
async function documentPage(browser,id){
 if(typeof id!=='string'||!id)throw Error('A document identity is required');
 const matches=[];
 for(const page of documentPages(browser)){
  // Closed/navigated renderers cannot stand in for another document.
  const identity=await page.evaluate(()=>window.eoDesktop.identity());
  if(identity.documentId===id)matches.push(page);
 }
 if(matches.length!==1)throw Error('Expected exactly one live document for this identity');
 return matches[0];
}
async function activeDocument(browser,shell){
 if(!shellPages(browser).includes(shell))throw Error('Expected a registered tab shell');
 const snapshot=await shell.evaluate(async()=> (await window.eoTabs.initial()).state);
 return documentPage(browser,snapshot.activeId);
}
module.exports={DOCUMENT_URL,SHELL_URL,documentPages,shellPages,documentPage,activeDocument};
