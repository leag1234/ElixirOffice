// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
// Use visible application controls; preserve native-dialog assertions in callers.
module.exports=async function fileAction(page,action,format){
 const frame=page.frames().find(f=>/\/(documenteditor|spreadsheeteditor|presentationeditor|pdfeditor)\/main\//.test(f.url()));
 if(!frame){if(action!=='open')throw Error('Editor unavailable for File action');await page.locator('#home button').filter({hasText:/Browse|Parcourir/}).click({timeout:20000});return;}
 for(let i=0;i<12;i++){let closed=false;for(const tip of await frame.locator('.asc-synchronizetip .close,.asc-synchronizetip .btn-div,.asc-synchronizetip .show-link').all())if(await tip.isVisible()){await tip.click({timeout:20000});closed=true;}if(!closed)break;}
 if(!await frame.locator('#fm-btn-save').isVisible())await frame.locator('#file[role=tab]').click({timeout:20000});
 const selectors={save:'#fm-btn-save','save-as':'#fm-btn-download',open:'#fm-btn-elx-open',pdf:'#fm-btn-elx-export',print:'#fm-btn-print:visible,#fm-btn-print-with-preview:visible'};
 if(!selectors[action])throw Error('Unknown File action');
 await frame.locator(selectors[action]).click({timeout:20000});
 if(action==='save-as'){
  const selected=format||await page.evaluate(()=>EOLocalSession.format);
  await page.locator('.eo-format-dialog input[value="'+selected+'"]').check({timeout:20000});
  await page.locator('.eo-format-dialog button[type=submit]').click({timeout:20000});
 }

};
