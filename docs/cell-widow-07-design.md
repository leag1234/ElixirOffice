# Cell widow/orphan replay: reference and design plan for 0.7

Status: design only, release review reference 452. Actual D Word geometry is now available for23/24cases (release review reference 453), independently replayed below. Engine implementation or integration still requires the lead go/no-go. The lead accepted the frozen59 gate and excluded both hideMark layout and its dependent whole-paragraph fast guard from0.6. Integrated property preservation remains in0.6.

## Evidence and mandatory public regression

The same-bundle frozen59 gate compares canonical SDKdc173b5fca with held candidatec1380f14fd. Fifty-six comparison objects are identical; the public a5077259 pair loses two correct unique-word page assignments: flagged4->3 and declaration7->6. Both arms have14pages, and lower union-weighted raster error conceals this pagination loss. Two strict CJK failures remain unverified in both arms. See [the gate and all59deltas](handoff/hide-mark-gate59.md).

The earlier public target paragraph135 is inside cell->SDT->paragraph, widow=true, four lines: current allocation1+3 versus Word0+4. A QA-only KeepLines experiment moved it but does not establish a generic fix or authorize KeepLines. The new design must preserve both public word positions as well as the actual table-row and complete line allocations, not optimize the two words alone.

## Reference cohort:24original inputs

[Generator](../tools/fidelity/cell_widow_controls.py) and [independent structural tests](../tools/fidelity/test_cell_widow_controls.py). The outside-Git D request is at /srv/elixiroffice/wt/cell-widow-design-A-work/word-reference-request24.jsonl, SHA2569837437fdbdc7b0506e2700bbe9a6f4819d8b4eb85e72ed35a1b266185943244.

| Factor | Values | Purpose |
| --- | --- | --- |
| Target lines, one paragraph | 2,3,4 | Distinguish minimum two-line boundaries from ordinary row splitting |
| Explicit widowControl | false,true | Counterfactual changes only that flag |
| Container | direct cell paragraph, cell->SDT->paragraph | Separate cell scheduling from transparent wrapper traversal |
| Explicit hideMark | false,true | Separate trailing empty marker height from paragraph widow behavior |

One inline fixed-width table/row/cell per file; no floating/nested/merged table or row-height constraint. Both containers end with the same required empty cell paragraph. Page360pt square,36pt margins,18fillerlines at exact15pt, Arial12, zero cell margins/borders/paragraph spacing. Nominal18pt remains before the table: one15pt target line fits; two do not. Soft text-wrapping breaks inside the target paragraph define the2/3/4lines without a manual page or paragraph break. Explicit keepNext/keepLines=false; CantSplit absent.

These are public original sources, not independent geometry oracles. Tests verify all24structures, factorial completeness, byte determinism, source hashes, absence of external assets and unintended forced-pagination controls. At request preparation, actual Word placement was unverified; the release review reference 453 section below supersedes that status for the23observed cases only. Word may move an entire row or apply compatibility behavior; do not tune inputs to a prediction.

D exports complete unchanged Word-web PDFs and records the source/PDF identities and warnings. From those raw PDFs, measure each TARGETLINE1..4 and AFTERTABLE page/baseline, visible first-page line count, and marker-height effects. Preserve blank pages. Borderless rows have no visible border to measure; do not invent one. Capture all pages, not only the expected first two. Word-web results do not qualify Word desktop.

The23observed results now establish widow-on movement in this one-cell context; they do not establish all merged, repeated-header or long-paragraph policies. A later two-line-space control could distinguish4-line2+2 behavior, but it is outside this24case request.

## Replay owner and transport decision

Retain optionB: **table-mediated parent rewind**, as the first design to evaluate. A cell-local rewind alone can leave later row/sibling/table/document geometry stale. A plain owner lookup is insufficient.

A paragraph inside transparent SDTs would resolve the nearest owning cell content, without changing current body-owner behavior or enabling headers, shapes or notes. Its transient request needs paragraph identity, requested cut line, cell-local page, owning cell/table identity and generation. Use the same owner for set/check/reset; one cell must never consume a sibling's request.

The table must explicitly decode a pending rewind before normal result flags and map the earliest affected cell page to row/table/parent page. Do not forward body PrevPage=5 blindly: the existing main-cell decoder tests NextPage=1 bitwise, so5&1 advances; exact-equality consumers ignore5. Recommended payload: an explicit transient cell-owner request, transported through a dedicated, non-overlapping replay status or an equivalent audited escape path. No numeric value or return-type change is selected before the complete consumer audit. The table/content boundary must intercept the request before ordinary result dispatch; a side-channel alone is insufficient if an inner content loop consumes CurPage before the table sees it.

### Current call-site audit, canonical SDKdc173b5fca

| TableRecalculate.js call | Current handling | Required design question |
| --- | --- | --- |
| 2304 | Repeated-header cell: exact NextPage equality | Can a temporary repeated header originate a request? Preserve its clone identity and existing header policy |
| 2427 | Repeated-header vertical-cell pass ignores return | Prove exclusion or handle explicitly; an unconsumed request cannot leak |
| 2923 | Ordinary cell: bitwise CurPage, NextPage, End | Decode rewind first; invalidate dependent row/cell state and propagate to parent |
| 3156 | Later cell/row pass: exact NextPage equality | Reuse the same request/generation protocol, not a second partial decoder |
| 3344 | Vertical-cell pass ignores return | Preserve vertical-text policy; prove exclusion or handle request explicitly |

Line numbers bind this audit to the named canonical head. This list concerns direct cell-content calls in that file; it is **not** a complete audit of nested table/content/SDT consumers throughout the engine. That wider audit is an implementation precondition.

## Checkpoint, invalidation and convergence

A successful rewind must restore a prefix checkpoint before the earliest affected row segment. Invalidate table page first/last row, split-row markers, row heights/bottoms, sibling cell page counts/content bounds, vertical-merge start dependencies, border data and subsequent flow bounds. The exact cache ownership list must be source-audited; this is not permission to clear everything indiscriminately.

Map page indices explicitly at each cell/table/parent boundary. SDTs are transparent for owner identity but still have their own layout pages. A zero-line placeholder is not a printed first line. Never decrement an empty/negative local page into NextPage or re-enter with stale parent bounds. Nested tables need translation through the outer cell/table; a local page number is not a document page.

A request remains owned by its generation until replay consumes the cut line. Reset on successful consumption, abort, new-generation calculation or Undo/Redo invalidation. Preserve existing main-body request resets. Repeated headers and temporary clones must not share mutable request identity with original cells.

Track a bounded tuple (generation, owner, paragraph, cut line, earliest replay page, relevant line allocation). A repeated tuple without progress is an invariant failure, with retained diagnostics, rather than a silent disabled widow rule or infinite replay. Establish the progress measure and bound in protocol tests before code. This is ephemeral layout state, not a serialized document property or collaboration/history flag.

Keep explicit/manual/section breaks, CantSplit, exact/min heights, keep-next/KeepLines and compatibility rules separate. Never patch a document-specific page break or globally force KeepLines.

## Staged implementation gates after Word references

1. Bind actual24Word results, including absent first-page lines and same-flag plain/SDT relationships. Determine whether the public four-line context needs additional row/sibling/merge probes before choosing the transport.
2. Source-audit all cell/table/SDT request consumers and cache owners. Write failing request/decode/replay tests, including the PrevPage5 collision, ignored-return passes, nested mapping and no-progress detection. No source patch before lead approves this protocol.
3. Implement in separately reviewed pieces: owner/request creation, table/parent transport and invalidation, then replay/reset. A change touching table split logic exceeds the earlier minimal-lookup scope and requires explicit approval; do not infer approval from this note.
4. Qualify plain/SDT/nested contexts; inherited/explicit widow on/off; first/last/multi-cell rows; auto/min/exact height; CantSplit; repeated headers; horizontal/vertical merges; nested tables; long paragraphs; explicit breaks; keep-next and footnote interactions. Preserve body/header/shape/note controls.
5. Actual edit/delete/Undo/Redo, full/incremental geometry parity and save/fresh reopen. Run the held marker layout with its separately tested fast guard together; never hide a first-Undo error with a test-forced recalculation.
6. Re-run exact frozen59 same-bundle gate with canonical as baseline, all failures retained. Require no per-pair page-allocation regression, including both a507flagged4 and declaration7 and all target line allocations, plus net raster/page-agreement improvement. Qualify coverage/denominator changes explicitly. NativeWindows/macOS and installer acceptance remain separate.

E tracked-deletion tests receive an independent source review when E posts REVIEW READY. They are a separate task and must not be silently incorporated into this cell-widow protocol.


## release review reference 453: actual Word geometry and acceptance behavior

D's qualified handoff732b3c7b573939c44290fbc98cd3f952b2bec852c4cf93a5f4aaa5890429de7d binds pairlist714523ade071002f0cf5a6887750cf6d227bf8dbb28bd233c158e2e8c22c3bca, independently approved reviewaba28cfd6bc8b0bac526fb1f0cfcbe08a80a076c6ab018133b636a0d53aa326d and geometry16c02d9360c8203e181a0730ddc0ffdbd725b0d900e899923e7b85ed51f53500. There are23raw Word-web PDFs,46pages,829,910bytes. A revalidated all24original joins/hashes and the23PDF identities, and independently re-extracted **92marker baselines** using pdfminer LTChar text matrices. Every page/baseline agrees with D within1e-8pt arithmetic comparison; this is a measurement replay check, not a new fidelity tolerance. Raw PDF hashes/size/mtime/inodes remain unchanged. Both existing contact sheets covering46pages were inspected at contact resolution.

[All24case statuses and23observed geometries](handoff/cell-widow-word23-geometry.csv). The missing source is d4410eef7bb8bbfdcdb931ed0c9f1c7a78eeb4e3fb5093dcbb511c01453de403, cw-n3-widow0-sdt1-hide1: actual Word HTTP404, no PDF, no retry and no inferred result. Word product build is not exposed; no Word-desktop or native qualification.

| Target lines | Observed widow-off page sequence | Observed widow-on page sequence |
| --- | --- | --- |
| 2 | 1,2 | 2,2 |
| 3 | 1,2,2 | 2,2,2 |
| 4 | 1,2,2,2 | 2,2,2,2 |

This table describes the **11observed off and12observed on** cases, with the missing3-line SDT/hide-on/off-widow case excluded. All23PDFs have2pages; AFTERTABLE is always onpage2.

The implementation must reproduce:

- When only one line fits on the first page, explicit widow=false permits the1+(N-1) split. Explicit widow=true produces zero printed target lines onpage1 and all2/3/4lines onpage2 in this cohort. A placeholder layout page must not be counted as a printed line.
- Eleven available plain/SDT pairs have exactly equal target **and AFTERTABLE** marker geometry. Container traversal must be transparent, not a special-case KeepLines rule.
- Eleven available hideMark false/true pairs preserve every target line's page/baseline. True advances AFTERTABLE by14.99–15.03pt, approximately one15pt empty line. Marker collapse affects remaining row/document height; it must not substitute for widow replay or change the target's split rule.
- Observed first target baselines are318.225pt onpage1 when widow is off, and48.02pt onpage2 when on. The remaining lines continue near15pt intervals. These establish measured reference positions; they are not permission to add per-document offsets.
- Borderless row bounds and nonprinting empty-paragraph geometry are still unmeasured. Do not report a measured border/marker rectangle merely because the following text shifts.

For completeness, the public a507source has three relevant inline five-row tables with multiple sibling cells, one gridSpan each and8SDTs each; no nested table, vertical/horizontal merge, repeated-header or CantSplit in those tables. Two have row-height values410/650 with the rule omitted. Thus the real regression gate requires coherent multi-cell/shared-row and row-height behavior as well as this deliberately simpler24input cohort. It cannot be qualified by one-cell probes alone.

## Is a bounded0.7protocol possible?

**Yes, as an explicit table-mediated replay protocol with a finite operational budget; not yet a proven implementation or a guaranteed shipping result.** Recommend GO for protocol tests and a staged candidate only after the lead approves. Keep layout+fast guard held until the whole set qualifies. A local-owner lookup alone is a no-go.

A concrete state machine is: Idle -> Requested -> Mapped -> Replaying -> Consumed, with terminal Cancelled/Invalid states. A generation-stamped request records paragraph/cut-line/owner and the earliest affected cell row/page. Each table/content boundary either consumes a valid request exactly once or translates it once to its parent. It must not reuse a stale ordinary NextPage result or consume a sibling/temporary-header request. Nested translation has a checked decreasing ancestor depth; local indices are explicitly mapped.

For these small single-cell cases, a valid protocol should need **at most one backward replay**: the first pass discovers the invalid one-line fragment; the replay suppresses that rejected split; forward layout onpage2 consumes all target lines and clears the request. This is a protocol-test target, **not an observed engine count**. Widow-off needs no new request. HideMark changes the following empty-line reservation after the target split is settled.

For general paragraphs, preserve the paragraph engine's actual widow cut-line choice. Do not convert widow into KeepLines: a future4-line/two-line-space control must permit2+2 when Word does, and a paragraph taller than a full page cannot be moved intact forever.

Boundedness has three parts:

1. A per-generation set of rejected (owner, paragraph, cut-line, local-page/row checkpoint) states prevents retrying an identical invalid split. A consumed request cannot reappear from a stale descendant cache.
2. A monotone replay frontier/constraint within an otherwise fixed layout generation prevents oscillation between accepted and rejected split states. Fonts/available-width/shape changes start a new generation; the existing proof must be discarded, not reused. The exact frontier invariant and all affected caches must be established by tests/source audit before code.
3. An explicit document-pass rewind/work budget and ancestor-depth bound enforce termination even if the proposed monotonicity invariant is wrong. No arbitrary numeric limit is claimed sufficient here: select and qualify it using observed line/row/translation work, including adversarial long/nested cases. A repeated state or exhausted budget is an invariant failure with evidence and disqualifies the candidate; it must not silently disable widow, accept stale geometry or insert a hard page break. A finite cap proves termination, **not successful layout correctness**.

The five-call-site audit remains incomplete for the whole engine, so the first GO milestone must audit the content/SDT escape path and ensure every table consumer handles the replay request before committing row geometry. The ignored-return vertical/header passes need an explicit supported policy or a proven exclusion with tests. A one-cell prototype must not accidentally enable unsupported merged/nested contexts.

Recommended milestones are (A) failing bounded-protocol/translation/reset tests and audited transport/cache contract, (B) separately reviewed engine candidate, (C) actual23Word allocations plus the one unverified case retained as missing, multi-cell/height controls, existing body scopes and edit/Undo/save tests, (D) full frozen59 no-regression gate and both a507word positions/complete target-line allocation. Failure of any milestone keeps the entire layout/fast stack held. No date or eligibility promise overrides those gates.

Required retained inputs: D's23raw PDFs/source join/geometry and the original24DOCX are0.7regression inputs even after collection acceptance. They must remain available until an explicitly approved replacement or0.7qualification; compacting redundant screenshots requires D's own exact cleanup protocol and must retain sufficient source/export proof.

## release review reference 454 audited transport and baseline checkpoint

The [complete static consumer audit](cell-widow-consumer-audit.md) classifies121calls in48productionfiles, independently checked against129exact-name tokens. It selects contentstatus8 only after that audit and requires explicit conversion to existing elementPrevPage2. Actual23reference exports give11allocationPASS/12FAIL before implementation; actual-source boundary tests11PASS/7FAIL. Ownership/budget/nested tests and staged implementation remain pending; no new status is in the engine yet. The8source multi-cell request is validation reference 541, with Word geometry still pending.
