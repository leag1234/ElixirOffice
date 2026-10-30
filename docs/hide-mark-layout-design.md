# Held cell marker layout: Undo diagnosis and cell-widow design

Draft for lead decision, release review reference 449. No implementation or integration is proposed by this document alone.

This concerns the **unintegrated hideMark layout experiment** (SDK8971410c82 plus held v2 patch526643c7e8a4). It does not describe a regression in the integrated property-only fix SDKdc173b5fca. The latter preserves data without changing layout.

## Exact Undo fast path

A passive single-case native observer reproduces the original empty-only-true-size12 failure. Original table bottom19.019025207519533mm; incremental Undo27.094544345431856mm; explicit full recalculation restores19.019025207519533mm. The delta is8.075519137912323mm. Text and hideMark restore correctly.

The exact dispatch is:

1. Document.private_RecalculateFastRunRange returns false.
2. Document.private_RecalculateFastParagraph calls Paragraph.Recalculate_FastWholeParagraph.
3. That paragraph calls Recalculate_Page(0,true,true), receives NextElement and returns [0].
4. Document.private_RecalculateFastParagraph returns true and redraws. Neither Table.Recalculate_Page nor CellContent.Recalculate_Page runs during Undo.

The empty paragraph's ordinary top/bottom remain6.174611111111112/14.250130249023439mm, matching the edited paragraph's ordinary bounds. The fast path therefore accepts them. Yet the cell's IsHiddenCellEndParagraph predicate is already true: the content-container layout should collapse that nonprinting marker to zero height.

The paragraph fast guard (Paragraph_Recalculate.js39 onward) only consults the global document page Check_EndSectionPara. The held collapse is registered in the cell content page EndSectionParas, not the global document page. After typing and full recalculation the local registration is false; after Undo it is still false although the semantic hidden predicate is true. Consequently checking cached registration alone would also miss this transition. Explicit full recalculation enters CellContent.Recalculate_Page, collapses the bounds and restores local registration, correcting the row height.

Evidence: /srv/elixiroffice/wt/hide-mark-diagnosis-A-work/native-observer/{fast-trace.json,undo-diagnostic.json}, diagnosis-summary.json. Seventeen observed calls, zero observer errors, no truncation. Wrappers delegate original arguments/results and retain the original failing Undo equality assertion (runner exit1). No memory-only behavior override, engine edit, test waiver or geometry fix was applied.

A future narrow fast-path fix should route both semantic transitions through cell-content recalculation: hidden-to-printing (old collapsed registration) and printing-to-hidden (current semantic predicate). Do not merely clear drawing bounds or force a post-Undo full recalculation in the test. The range fast path already excludes table cells; the observed accepting method is the whole-paragraph path. Any fix needs typing/delete/Undo/Redo and full-recalculation parity before the held layout is reconsidered.

## Why cell widow control is a different scheduler task

The approved owner helper deliberately resolves only main-body CDocument owners. Cell content has local RecalcInfo, but returning that object from the helper does not establish a rollback protocol.

The existing body SDT previous-page bridge is restricted to body owners. In TableRecalculate.js around2923 the cell return is consumed as CurPage, NextPage or End; another path around3156 checks exact NextPage. Current result2 encodings are End0, NextPage1, CurPage2 and body PrevPage5. Sending5 blindly into the table's bitwise NextPage test would treat it as advancement because5&1 is nonzero. The exact-equality path would not advance or rewind. Both consumers must be redesigned explicitly before any cell owner is enabled.

A rewind also changes shared row geometry, sibling-cell page allocation, borders and later document flow. A previous cell-local page is not necessarily the previous table/document page, particularly with merges, repeated headings and nested tables.

## Design options for review

| Option | Replay owner | Benefits | Required work and risk |
| --- | --- | --- | --- |
| A: table-local rewind | Table restores an earlier row/page checkpoint and replays cells locally | Smallest repeated cell calculation | Still must notify the outer document about earlier changed pages; duplicates replay orchestration and is complex for nested/merged rows |
| B: table-mediated parent rewind | Cell records a request; table maps it to its earliest affected page/row, invalidates dependent caches, then propagates rewind to the parent scheduler | Reuses parent page replay and keeps following document flow coherent | Requires explicit cell/table request handling and page mapping at every nesting boundary; broader than a lookup patch |
| C: keep layout held | Preserve properties only, as already integrated | No new pagination risk | Existing marker-height/cell-widow gaps remain disclosed |

Recommendation for a later authorized implementation: investigate B first for correctness, after references establish expected geometry. Do not choose A merely to minimize line count. This is not a release decision.

## Proposed request and replay contract

- Use one cell-content owner consistently for request, replay check and reset through transparent SDTs. Preserve ordinary body owner behavior.
- A request identifies the paragraph, cut line, cell-local page, table row/page mapping and recalculation generation. Scope it to its owner; never share one cell's widow request with another.
- Decode a dedicated rewind request **before** ordinary result2 bit tests. Do not reuse body PrevPage5 as a table bit flag. Pick the final representation after auditing all table-content consumers.
- Map the earliest affected cell page to the earliest dependent row/table/document page. Invalidate row bottoms/heights, cell page counts, split-row markers, content bounds and borders for every participating cell, including the start of vertical merges.
- Preserve unaffected prefix checkpoints. Replay the relevant parent page with the original widow request until its cut line is consumed, then reset on success, abort, Undo or a new generation. Detect repeated identical request states; report a failed invariant rather than accepting a no-progress loop.
- At nested table boundaries propagate and translate through the outer cell/table. An apparent negative/empty local page must not underflow a page index or silently become NextPage.
- Keep explicit page breaks, row height/CantSplit policy, existing keep-next and compatibility-mode rules separate. Never turn KeepLines on globally or insert document-specific page breaks.
- Compare visible line allocations (EndLine>=StartLine), not raw paragraph start-page values: a zero-line placeholder page can precede the first printed line.

## Evidence gates and decisions still required

The public source paragraph135 currently splits1+3 lines inside a cell SDT with widow=true; the Word reference places all four on its next page. A QA-only KeepLines counterfactual moved it correctly but does not prove the generic widow solution or authorize that setting.

D's twelve original one-table probes cover hideMark omitted/true/false, trailing empty on/off and10/12pt marker sizes. They can establish marker-height semantics. They do **not** independently cover boundary-controlled cell widow/split behavior. The public page pair plus targeted two/three/four-line split references are needed before claiming the new scheduler matches Word.

Qualification must include plain/cell-SDT/nested paragraphs; inherited/explicit on/off widow; first/last and multi-cell rows; auto/min/exact heights; CantSplit; repeated headers; horizontal/vertical merges; nested tables; manual/section breaks; long paragraphs; keep-next/KeepLines interactions; typing/delete/Undo/Redo; save/fresh reopen; full versus incremental geometry; bounded convergence and existing body/header/shape/note controls.

Stage the work as (1) reference interpretation and explicit assertions, (2) request/rollback protocol tests failing before source changes, (3) separately reviewed implementation, (4) full native/public regression. Keep the fast-path marker transition fix separately reviewable from cell-widow scheduling. No engine patch, new source build or integration belongs to this diagnosis task.

## release review reference 452 disposition and0.7reference plan

The frozen59 gate fails the no-page-regression rule; layout and the dependent fast guard remain out of0.6. The [cell-widow0.7design](cell-widow-07-design.md) binds the mandatorya507two-word regression, original24case Word request and the expanded five-consumer table audit. No engine implementation before actual Word geometry and protocol review.
