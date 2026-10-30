# Cell replay consumer audit, release review reference 454

Audit base: SDK c1380f14fdbf614ad4f3f7062776f145f845407b, retained0.7layout/fast stack. No engine source changed during this audit.

## Complete static inventory

All tracked production JavaScript files containing the exact Recalculate_Page name were parsed (48files, tests excluded). The source-bound catalog contains121calls,7member definitions and one non-call reference: CFootEndnote delegates to CDocumentContent.prototype.Recalculate_Page.call. An independent iterative AST traversal and token census reproduce121calls and129exact-name tokens/member references, with no unmatched tokens. Comments, PageEndInfo and PageColumn methods are not counted as page-call sites. Source hashes remain unchanged.

[Every call, context and required policy](handoff/cell-widow-consumer-audit.csv). Generic content receivers are conservatively table-capable; variable names such as oParagraph are not proof of type. This completes the statically named source-consumer inventory, not a proof that a future guard works at runtime. Dynamically constructed plugin method names are outside this static census; an internal capability must prevent such callers from creating a request accidentally.

| Family | Calls | Required handling |
| --- | ---: | --- |
| Table->cell content | 5 | Explicit new-status decode before row bounds and ordinary bit tests; repeated-header/vertical entry must not issue unsupported requests |
| Block SDT | 1 | Convert content status to element status explicitly; never turn replay into successful completion |
| Main document element | 1 | Establish live body scheduler capability, map/handle previous-page result |
| Body/content floating table | 3+4 | Preserve existing flow-object paths; no initial cell-replay capability |
| Generic document-content element | 1 | Escape through cell/SDT content before local current-page recursion |
| Current-page recursion / whole-content measurement loop | 1+1 | Pending replay cannot be consumed by recursion; measurement does not acquire capability/reset a pass budget |
| Direct presentation table / table-style preview | 1+1 | Ignored table return; no Word-body capability |
| Generic drawing content | 1 | May contain tables; drawing owner excluded |
| Header/note content | 9 | Exact End/Next/Cur loops retained; auxiliary roots excluded |
| Document scheduler callbacks/drivers | 5 | Generation/work budget survives callbacks within one pass |
| Paragraph-only calls | 36 | Isolated font/math/form/preview recalculation cannot acquire a cell capability |
| Other auxiliary generic content | 51 | Charts/shapes/PDF forms/signature/clipboard/TOC/slide notes: conservatively table-capable but never eligible by mere LogicDocument identity |

Source/proof files outside Git: /srv/elixiroffice/wt/cell-widow-protocol-A-work/recalc-ast-audit.json, recalc-audit-census-check.json, source-bound textual inventories and consumer-audit-summary.json. Initial invalid0call traversal output is retained separately; its walker was corrected and independently checked before any completeness claim.

## Exact propagation and hazards

- TableRecalculate.js2304 uses exact NextPage equality in repeated headers;2427 ignores the header vertical-cell return;2923 uses CurPage/NextPage/End bit tests;3156 uses exact NextPage equality;3344 ignores the vertical-cell return. Every path must either consume the new status or be ineligible by a tested capability and reject an unexpected pending request.
- Table.Recalculate_Page calls private_RecalculatePage at58, then only returns early for element CurPage. Element PrevPage currently still commits positionY and section end. A replay must return before those commits. These wrapper lines are part of this audit.
- DocumentContent.js1285 receives ordinary paragraph/table/SDT element results. Current PrevPage propagation at1302 accepts body SDTs only. CurPage can recursively call Recalculate_Page at1318. A new cell request must escape before recursion or new bounds are accepted.
- BlockLevel.js150 calls its content, then commits section end before conversion; the default unknown-result path returns NextElement. Both are wrong for a pending new cell replay.
- Document.js3806 is the ordinary element scheduler entry; its existing PrevPage handling can move to the preceding document page/column. That is not automatically the right earliest shared-row page; payload mapping and row-state invalidation must establish it.
- Floating calls in Document.js4448/4486/4505 and DocumentContent.js833/857/871/880 also cache/override results. Initial eligibility excludes floating tables; do not silently reuse these paths.
- GraphicFrame.js409 and tableStylesPreviewGenerator.js168 ignore table results. The Word style-preview table has a detached CDocumentContent whose LogicDocument points at the real document. A LogicDocument/owner lookup alone is insufficient.
- RecalculateContent's loop advances until End. Header/footer and note controllers have exact-code loops too. A new status must never escape into those contexts without an explicit decoder.

## Transport selected after the audit

Propose content-domain result2_CellReplayRequested=0x08. Existing result2 low values are0..5;8 is distinct and has neither NextPage1 nor CurPage2 bits. Existing body PrevPage5 is unsuitable for blind table forwarding because5&1 is nonzero.

At paragraph/table/SDT element boundaries use the **existing element-domain PrevPage=0x0002** with a validated generation/owner request, preserving only the audited Column/Page flags. The domains differ: content8 numerically equals element NextPage8. Never forward a content status directly into an element bitmask decoder. New8 must be explicitly converted, and a request without valid ownership/generation/capability is a qualification failure.

The number is a transient layout result, not a saved property, history/collaboration flag or new OOXML setting. No constant or decoder has yet been added to the engine.

## Eligibility, lifecycle and cache preconditions

Require an active main-body layout-pass capability, not only a table's LogicDocument. Check exact live parent-content membership through transparent SDTs, inline table policy and owner/cell identity. Auxiliary/detached previews, shapes, notes and measurement calls cannot acquire it. Repeated-header clones and vertical passes require explicit tested exclusions or full support. Nested propagation needs checked ancestor mapping before it can be enabled.

Use one document generation/budget across recursive calls and callbacks. One cell may not consume a sibling's request; stale generations and repeated no-progress tuples must fail qualification. A budget limit is not a fallback that disables widow.

At the normal cell call, shared-row siblings may already have modified row bottoms, content bounds and page counts. The existing RecalcInfo.Recalc_AllCells method disables a reuse/shift path, but that alone is not proof that row geometry/prefix checkpoints are restored correctly. The prospective candidate must test this against the multi-cell references and a507, not simply set a broad dirty flag. Any table split/cache logic beyond the audited call sites requires the lead's explicit approval before editing.

## Tests-first checkpoint

The unchanged c138source was overlaid on the identical frozen published0.5build21 shell; actual exports for all23Word references completed through strict WASM. Allocation assertions: **11pass,12fail**; all widow-off controls pass, every observed widow-on case fails because TARGETLINE1 remains onpage1. This is the baseline to fix, not an accepted result or a test waiver. The missing24th HTTP404 remains unverified.

Actual-source VM boundary tests: **11pass,7fail**. Existing table/SDT conversions remain controls. Two table tests expose positionY/section-end commit on rewind; four new-status/flag cases expose SDT success fallthrough; one exposes its early section commit. Initial fixture setup errors are retained separately and do not count as engine proof.

Further protocol behavior tests still need to cover owner/capability/generation, nested translation, cancellation/consumption, repeated state and budget exhaustion. The candidate must fail on exhaustion rather than silently disable widow. No implementation, source build or integration has occurred at this checkpoint.

## Subsequent uncommitted experiment

The preceding sections describe the tests-first baseline. release review reference 454/456 subsequently authorized a staged candidate. [Review results and remaining mandatory failure](cell-widow-experiment-review.md):263source tests and31targeted native allocations pass, but frozen59 has a new a507 repeated-state qualification failure. HOLD; no commit/integration. The observed paragraph reset required explicit matched-cut acknowledgment before the legacy flag is cleared; no additional table split/cache mutation has been applied. The numeric transport was selected only after the recorded baseline audit.

The next uncommitted experiment preserves authenticated completed cuts across sibling retries. [Final v4 review evidence](cell-widow-prefix-cache-review.md):273source tests,138native models with18edit/Undo/save sequences,32targeted exports and57comparable frozen documents pass their recorded checks. The two original strict-WASM failures still keep the full59gate HOLD. No commit/integration is authorized. The first v4 editing repair uses the documented IsTableCellContent(true) overload; tests execute the real SDK methods. No additional Table split/row-height logic or protocol-bound relaxation was applied.
