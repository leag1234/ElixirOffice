// SPDX-License-Identifier: AGPL-3.0-only
"use strict";
// Stable-layout predicate for the differential renderer. Exporting a PDF while
// the editor is still paginating gives truncated documents, so the exporter
// waits until the page count is unchanged and no recalculation is pending for
// REQUIRED consecutive polls.
const REQUIRED=12;
// Pure step: given the editor-like object and the previous state, returns the new state.
function step(editor,state){
 const prev=state||{streak:0,pages:-1};
 const logic=editor&&editor.WordControl&&editor.WordControl.m_oLogicDocument;
 let ok=!!editor&&!(editor.isLongAction&&editor.isLongAction())&&!(logic&&logic.FullRecalc&&logic.FullRecalc.Id);
 let pages=-1;
 const dd=editor&&editor.WordControl&&editor.WordControl.m_oDrawingDocument;
 if(ok&&logic&&logic.Pages&&dd&&dd.m_lPagesCount!==undefined&&dd.m_lCountCalculatePages!==undefined){
  pages=logic.Pages.length;
  ok=dd.m_lCountCalculatePages===dd.m_lPagesCount&&dd.m_lPagesCount===pages&&!dd.m_bIsDocumentCalculating;
 }
 if(ok&&prev.pages!==-1&&pages!==prev.pages)return{streak:0,pages};
 return{streak:ok?prev.streak+1:0,pages};
}
module.exports={REQUIRED,step};
