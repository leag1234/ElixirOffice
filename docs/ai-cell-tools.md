# Spreadsheet AI tools — held 0.4 design

Owner release review task 2, design written before implementation. Continue the AI series from task 1 product c68ff62 and web-apps 20ce0a5; sdkjs 10b729bd remains unchanged. No integration or product provider default; only the benchmark uses the explicitly approved existing managed configuration.

## Public adapter and consent

Register CellTools alongside WordTools and select the editor-specific factory in the common controller; reuse the existing command bar, planner/verification/repair, connector and native consent/encrypted storage. No new fetch, interpreter, model-supplied JavaScript or independent transport. Unconfigured spreadsheet Ask routes to the same task1 setup. Retain Word behavior with explicit regression coverage.

Run only static known command functions through api.callCommand, embedding validated arguments as escaped JSON as WordTools does. Bound the callback/idle wait; do not retry a mutation after an uncertain completion. Capture the originating worksheet and action scope, recheck identity before writes and never take a sheet/workbook identity from model arguments. Common StartAction/EndAction GroupActions exists for cell; actual single-Undo and cancellation behavior must be qualified, not assumed.

## Proposed tools and preconditions

| Tool | Contract |
| --- | --- |
| read_range | Read bounded selected/explicit active-sheet values, formulas and formats; describe headers/type facts without uploading a whole workbook. |
| explain_formula | Read formula and bounded referenced-cell facts; model explanation is grounded in these facts and performs no mutation. |
| write_formula | Write a validated formula to a bounded target, optionally translate relative references down a column; preserve absolute references. |
| clean_range | Trim/normalize whitespace, split a literal delimiter, stable dedupe, explicit date/number normalization; preflight full output before any write. |
| sort_range | Up to3 validated keys and explicit header flag through public SetSort; preserve complete rows/formulas. |
| filter_range | Bounded explicit criteria through public SetAutoFilter; verify actual filter/visible-row state. |
| create_chart | Validated source/type/headers and bounded output object; public AddChart only, no external data. |
| create_pivot | Unique nonempty headers, explicit row/value fields and aggregation; public InsertPivotNewWorksheet/AddFields/AddDataField, never overwrite existing output. |
| summarize_range | Bounded deterministic statistics and sample facts; plain-language answer, no edits. |

Reuse submit_plan/verify_result/ask_user/cannot_do and final-answer handling. Strict schemas reject unknown keys, non-finite values, malformed ranges and unsupported modes before command execution. Proposed limits: context2000 cells/64 KiB, command10000 cells, action20000 cells, each string4096 chars,32 columns in context,one operation per cleaning call; the implemented action budget is given below, bounded chart/pivot output. Probe the real API before freezing exact limits/semantics.

Formula grammar permits bounded A1 references on the captured sheet and an explicit safe function set; reject external/workbook references, whole rows/columns, dynamic/external functions (including INDIRECT, WEBSERVICE, RTD, HYPERLINK) and arbitrary names/code. Validate every translated formula before writing. Never turn a cleaned literal into a formula. Date formats and decimal/group separators are explicit, with no country guessing. Preserve formulas during value cleanup or refuse unsupported structural cases visibly; never silently flatten formulas. Reject or safely handle protected/merged/ambiguous data before any writes.

## Actual capability and failure gates

Primary source SDK public methods found: ApiRange.GetValue/SetValue/GetFormula, SetSort, SetAutoFilter, ClearContents; ApiWorksheet.GetUsedRange/GetSelection/GetRange/AddChart; Api.InsertPivotNewWorksheet and shared StartAction/EndAction GroupActions. The authored native probe and final qualification verify method signatures/return behavior, merge/user-protection refusal, date/formula semantics, native grouped Undo and actual Save/reopen. Qualification still does not extend to untested platforms or packages. Partial/uncertain writes fail visibly; preserve cancellation and no-success-on-error.

## Deterministic tests and30-task evaluation

Tests first for validation, formulas/injection, unchanged out-of-scope cells, types, blanks, non-ASCII headers, protected/merged data, duplicate headers, numeric/date ambiguity, chart/pivot fields, failure/rollback and originating-sheet ownership. Use authored fixtures only, then actual sandboxed Linux builder calls and edit/save/reopen/Undo checks.

Create roughly30 realistic FR/EN teacher/small-business tasks with input/selection/instruction and independent final-state criteria. Cover formula writing/explanation, all cleaning modes, sort/filter, charts/pivots and summaries; require one Undo for mutations and no console errors. Follow docs/ai.md6 for success counts, failures, median/p90 end-to-end latency, calls and unavailable results. A deterministic fixture model proves wiring/tools, not model quality; real-provider measurements remain unverified until an approved endpoint/model is identified through existing secured configuration. No secrets in results.

Also update the old hosted AI off-state regression to the task1 visible/setup contract without dropping its server proxy/CORS/key isolation checks; qualify on an owned instance, never:8080. Mac/Windows/package qualification remains separate.


## Implemented contracts and actual findings

The adapter uses the public builder APIs without an SDK patch. StartAction/EndAction GroupActions works in Cell, but Word's plugin Undo method is absent there: Cell uses the editor's public asc_Undo. The action group opens before context capture, locking the originating worksheet while the model runs; context failure/cancel disposes it. A read-only/no-op group is cancelled so it adds no native Undo point. Successful pivot insertion can move the original worksheet's index; its actual public index is returned and updated before subsequent ownership checks. User-protected sheets/ranges and merged cells are refused before writes.

A plan declares read_only. Explanations, questions and summaries must use a read-only plan, which is sticky and rejects editing calls or a later attempt to widen it. Editing requires a valid edit plan first. This enforces the chosen plan; natural-language intent classification still depends on the model and is included in independent evaluation, not assumed infallible. No scratch formulas are permitted by the prompt for read-only work. Every actual mutation is separately scored against expected workbook state.

Canonical English formulas are translated using captured public function-name, argument and decimal-separator metadata. The editor's locale is never changed. Formula readback must match; direct self-references, external/dynamic functions, unsafe names and out-of-scope references are refused. Numeric writes must be stored as real numbers. COUNT(single-cell) reliably identifies numeric cells in these probes; ISNUMBER(range) did not consistently classify off-axis ranges here. Literal cleanup uses an explicit text prefix, preserving formula-looking strings and leading zeros. Dedupe copies complete retained rows and clears only trailing contents, preserving cell types/formats and refusing formulas.

Limits:10000 cells per command,20000 per action,12 edit calls,2000 cells/64 KiB per context read,32 columns in automatic context,4096 characters per cell/formula. A larger selected scope is clipped explicitly and can be read in chunks. Empty adjacent outputs can extend32 columns right/one row below scope, but never overwrite existing outside data; exact successful outputs become readable. Filter preflight refuses other nonempty data/hidden rows and checks actual row visibility. Pivot cardinality is estimated before creating a sheet, capped at2000 output cells; duplicate/blank headers and existing target names are refused. Aggregation is checked with GetFunction, and the caption uses canonical function notation (for example AVERAGE(Score)) rather than retaining the SDK's misleading default Sum label.

Mutation commands are never automatically retried. A fresh read after the callback observes recalculated values. Uncertain/partial failure aborts and cancels the entire group. Cell review uses one native Undo only while history matches; after later user edits, Discard explains the situation and makes no changes. Word's existing tracked-change rejection remains unchanged.

## Qualification method

Deterministic tests cover strict schemas/unknown keys, canonical references/localization, literals, exact separators, calendar validation, pivot cardinality, early-group cleanup, stale Discard, no-op reporting, known planner namespace normalization, read-only fencing and Word fallback behavior. Actual sandboxed Linux source checks use only authored temporary XLSX files and the owner-pinned Electron44.9.1 helper; no sandbox bypass or real-document corpus. Native Save/reopen checks inspect actual formulas/results after reopening the saved file.

The30 task benchmark is balanced15 English/15 French, spanning teachers and small businesses. Fixtures are authored directly as typed OOXML (canonical formulas, explicit text/numeric cell types), independently of the adapter, so a localized fixture setter cannot invalidate the input. Final-state criteria are independent of the tool argument choices: values/formulas/types, row visibility, chart/pivot output, unchanged read-only workbooks and oneUndo snapshot restoration. Plain-language answer checks are limited factual checks, not a general linguistic-quality score. Action time includes managed settings load and the orchestrator, including verification; upload/editor startup is excluded and total harness time is retained separately. No real-provider headers or keys are read or logged.

Earlier failures are retained: the first90 diagnostic cases yielded71/90; after locale/ownership/read-only corrections the independent90 case run yielded84/90, median2.819 s,p903.598 s. Its6 failures were exact-space hallucinations and misleading native pivot captions. After targeted corrections, those6 cases passed at all3 repetitions (median3.369 s,p903.854 s). These mixed-source receipts are NOT called a single90/90 run. The final frozen-contract measurement is 88/90, median 2.911 s and p90 3.673 s; see docs/ai.md section 6.7 and its sealed per-case receipt.

Held0.4 only: no integration, package/release/deployment, Windows/macOS or rendered45-locale qualification. The 19 new English UI strings are frozen for Z in the accompanying release acceptance record Hosted configuration tests use only the labeled private mock container; they must refuse main/demo before any configuration write.


## Failure acknowledgement and reproduction

A missing native commit/cancel acknowledgement is not proof of rollback. Cell marks the result/journal as cancellation-unverified and conservatively possibly changed; the UI does not claim reverted or unchanged, even after Stop. The Cell adapter explicitly opts into catching a failed final commit callback and attempting cancellation. Word retains its existing finalization rejection boundary. This safety-only follow-up preserves the exact model-visible contracts measured above. Tests inject both missing acknowledgements; actual compiled Linux qualification deliberately delivers the native commit while losing its callback, confirms that changed values remain, and checks the explicit warning.

The committed tests/ai-cell/native.cjs and ui-native.cjs require an explicitly owned EO_DESKTOP_ROOT/private Xvfb and the owner-approved, exact root-owned Electron44.9.1 sandbox helper. The ordinary harness guards, actual native consent and process ownership checks remain. Do not use a personal display or add a sandbox bypass. EO_WEB_APPS selects the candidate source for native.cjs. Unit tests use the same explicit candidate EO_WEB_APPS.

The real-model harness tests/ai-cell/eval.mjs deliberately requires EO_BASE=http://127.0.0.1:8080 and EO_CELL_MANAGED_EVAL=release review, the approved existing development host proxy, plus EO_WEB_APPS and an owned EO_CELL_RESULTS. It uploads uniquely named authored fixtures with a fresh test UID, verifies the existing public gpt-4.1-mini configuration, and never calls the key-loading helper. A normal invocation runs30 tasks x3; smoke/pilot/affected invocations are separate diagnostics and never counted as a full run.

tests/ai-config/config.mjs is a different mock-only test that changes its private container's configuration. It must use the explicit labeled eo-ai-cell-A instance at 127.0.0.1:18368 and refuses main/demo before any mutation. The cached image required narrow editor/SDK mounts, public common icon assets, matching example/server JWT test flags, and a private mock DNS alias with a verified public test CA. No certificate-verification switch was relaxed. Those setup corrections and original failures are retained outside git with the SHA receipts.

The model benchmark loads candidate AMD modules into each owned browser frame, leaving server source/proxy files unchanged; compiled/native and private hosted UI qualification are separate.

Final review qualification: 1,634 required-builder strict tests with zero skips; 10 compiled Linux UI checks plus 20 actual native tool checks; 45 private hosted configuration checks and four compiled hosted spreadsheet checks. Original failures remain retained. No integration or package qualification.
