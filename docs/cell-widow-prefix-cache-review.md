# Cell-widow prefix cache: uncommitted experiment

REVIEW READY for the uncommitted v4 experiment. No commit or integration is
authorized. The full frozen59 gate remains HOLD for its two known unverified
strict-WASM exports. Target is0.7; the0.6 freeze remains unchanged.

## Why the first correction was insufficient

A bounded read-only trace of a507 stopped after six request/consume events.
One cell applied its current-page cut. A sibling then requested a current-page
retry, which revisited the first cell at exactly the same generation, document
page, table page, cell page and content rectangle. The first cell's ordinary
widow flag had been cleared after its earlier paragraph calculation, so it
requested the same rejected split again. The unchanged repeat guard correctly
failed qualification.

The experiment preserves the completed current cut as a private authenticated
outcome. A retry at the same position registers that known cut again without
creating a fresh request. The cache is keyed by generation, actual document/
table/cell page, fresh content-page rectangle and live table/paragraph identity.
A changed position or generation discards it. The ledger hook runs after
DocumentPage.Update_Limits, before paragraph calculation, so an old page object
cannot authorize reuse after Reset.

Only a completed next-page fragment can populate the cache. Reusing a cut must
acknowledge that exact paragraph/line under the active owner before the ordinary
paragraph reset; a missing cut or a fabricated flag fails qualification.
Exceptions invalidate the calculation. Work still accumulates on every entry:
the cache cannot reset or bypass the65536-step budget. Explicit duplicate fresh
requests still fail. No row-height rule or additional Table reset/split logic
was changed after the audited initial glue.

## API repair found by actual editing

Initial PDF exports did not exercise the whole-paragraph fast predicate.
The first full native editing run found that IsTableCellContent() returns a
boolean, whereas IsTableCellContent(true) returns the cell. The old fixture
incorrectly returned a cell for both overloads.

The fixture now respects the overload, and a regression test executes the real
Paragraph, DocumentContent and TableCell implementations. The production repair
is one argument. Its reconstructed old source reproduces the sealed v3 source
SHA. No other production change separates v4 from v3.

## Final v4 evidence

| Check | Result | Work-folder evidence |
| --- | --- | --- |
| Short source reproduction before cache |98pass /3fail, including actual duplicate request after sibling retry |cache-prefix-before.log |
| Source tests after cache and API repair |273pass /0fail /0skip |fast-cell-contract-after.log |
| Cached retry work exhaustion |same65536-step qualification failure, no new request/fallback |cache-prefix-after-bounds.log |
| Word compilation |PASS |build-word-candidate-v4.log |
| Actual native138 models/properties |138pass, zero editor errors |native138-v4-assertions.json |
| Actual edit/Undo, Redo/Undo, save/fresh reopen |18sequences pass; no forced full recalc before Undo |native138-v4-assertions.json |
| Actual final v4 strict-WASM exports |32/32compared, including a507 first |candidate32-v4.log |
| Observed single-cell Word allocations |23pass |candidate-v4-word23-assert.log |
| Observed shared-row Word allocations |8pass; all152 marker pages and Y baselines unchanged from c138 |candidate-v4-multicell8-assert.log |
| a507 complete token page distribution |all880token types /3897occurrences match Word;14pages |candidate-v4-a507-token-pages.json |
| a507 earlier shifted anchors |restored to Word pages4and7 |candidate-v4-a507-token-pages.json |
| Final v4 frozen59 |57compared, two known failures, no new failure/page regression; full gate HOLD |gate59-v4-summary.json |

The first v1 native attempt hit its work limit after repeating empty pages. The
v2 correction acknowledged matched cuts before the legacy reset but still lost
the completed cut when a sibling requested another retry. The v3 cache fixed
that import failure; v3's first editing attempt then exposed the API overload
bug. All failures and their source/compiled hashes are retained. They were not
waived or substituted.

The final v4 frozen run independently completed57comparable documents without
page regression or new failure. All57comparison JSONs match v3;56also match the
canonical baseline exactly. a507 improves weighted ink difference from35.7690%
to27.4380%, and mean per-page difference from28.2862% to22.4276%. Its14pages and
all880token types /3897occurrence-page distributions match Word. The prior
shifted anchors are on pages4and7, as in Word.

The two remaining failures,41726aae and b4f13572, have render logs byte-identical
to the canonical strict-WASM rejections (JavaScript fallback was rejected).
They remain unverified: no failed case is counted as a pass or replaced.
The aggregate decision therefore remains HOLD despite no new relative regression.

## Limits and next review decision

Marker-page allocation is verified. Measured Y-baseline residuals against Word
reach0.437020pt for target/side text; full line/cell rectangles and line heights
are not proven identical. No geometry tolerance or acceptance assertion was changed. The eight shared-row cases retain their original marker pages and Y baselines.
The missing24th single-cell Word export remains HTTP404/unverified.

The historical138 model comparison uses a different frozen shell:114objects
match exactly, while24split-case objects differ. It is informational rather than
a matched control or Word fidelity proof. Those split probes do not have
qualified Word references. Current full/incremental/Undo/save checks compare
the same v4 artifact.

Initial activation remains limited to live Word body cells in inline single
column tables, through transparent controls. Floating/nested/drawing/header/
note/preview roots, repeated headers, vertical cells, exact-height rows and
vertical-merge continuations retain the previous behavior. A separate qualified
native Word cohort for the previous-page/last-orphan path is not established by
the current first-orphan probes. Full74, hosted/shared-editor smoke and full
integration checks remain unverified.

release review reference 458 accepts the v4 result and authorizes own review-branch commits. SDK
4c37b38e3e83fadf90dbe9c1001d22c026e83c3c seals the exact tested source.
Conditional0.6 eligibility requires full74, hosted smoke/shortcuts and D independent
adversarial review without blockers by Sun1Nov evening; otherwise0.6.1.
No release qualification or
integration is implied by passing a subset. Source, original Word references,
actual PDFs/vector evidence, logs, saved DOCX outputs and compact rollback pairs
remain until review/approved replacement qualification. Exact inactive QA,
build/cache/profile/temp intermediates are removed with receipts. Regenerable
PNGs are cleaned except for critical final diagnostics, so these evidence
folders are not complete cache-resume inputs.

Final cleanup: cleanup-gate59-v4-final.json records exact inactive paths and allocated/free bytes before deletion; all owned test/build units are terminal with zero PIDs/empty groups. Frozen source-package and candidate source hashes are unchanged. Sealed final source/compiled hashes, actual PDFs/vector evidence, native138 observations and18 saved outputs, original Word references and diagnostic rollback pairs are kept until lead review/approved replacement. No Mac, Hardy, demo, release or remote push was involved.


### release review reference 459 B1 typed failure lifecycle (source follow-up)

SDK5a5412053572e4d0a9df3e45c01ad5a367ff640a adds a private failed-layout
state, actual sync/timer cleanup, queued print/loading action cancellation and
output refusal. Failure remains across new generations until full-success
completion. Only the exact recorded typed failure uses the existing noncritical
error notice; unrelated global errors retain their previous handling. Main and
selection-print exclusions prevent temporary documents entering the protocol.
Client PDF preflight and rejection hooks prevent JS/server fallback after a
recorded layout failure; the tracked-deletion buildOnce area is unchanged.

Tests first exposed all initial22 cases, then two actual client-PDF fallback
failures. Final23 focused plus273 existing source tests pass (296, zero skips).
The tests execute actual scheduler, global handler and export functions with
controlled callees. Native injected failure, real editing/Undo, collaboration,
compiled output and remaining gates are not yet qualified on this follow-up.
B3 destination and B2 budget corrections still follow before D delta review.
No canonical integration, row-height change or guard-budget change.


### release review reference 459 B3 pending destination binding (source follow-up)

SDKab3d3a718fdc5cda0e0c2e90529b90db23551b5a binds pending requests to the mapped document/table/cell pages, generation, live owner/root and row. Validate before legacy cut rehydration and again before consumption, including actual table absolute-page mapping and every inner content-control membership under the existing depth bound. Current and previous paths retain distinct authenticated mappings; completed-cut caching is unchanged. Eleven wrong-placement/late-mutation source tests failed first; a further detached inner-control test failed before its guard. Final308source tests pass0skip. No row-height, Table scheduler or budget-policy change; native/Word/hosted qualification and D delta review pending.


### release review reference 459 B2 productive admission and finite retry accounting

SDKf204d8e3506c331482b3fb395ad196bc1f40b9cb preserves65536retry steps,1024requests,32depth, duplicate-state checks and same-generation counters. The controller supplies a validated logical cell-page admission. Only an owner first advancing its numeric page high-water, without pending/cached repair, may visit each distinct actual content once without retry charge. Repeated/backward pages, repeated content, pending/cached frames and unclassified low-level work remain charged; a request makes the current frame retry-only. No progress refunds spent work. Cached re-entry is conservatively charged before fresh geometry may discard its cache. Metadata uses weak owner high-water and frame-local weak content identities, not growing page-key lists.

New16source cases expose15failures first; final324tests pass0skip. All preceding308tests/assertions are unchanged, including recursive unknown/no-progress bounds and the40000cached-loop failure at exactly65536. Controlled32769distinct ordinary cells with/without SDTs no longer exhaust retry work. These are source/controlled-callee checks, not actual large DOCX/native performance qualification. B1/B3/B2 native138+18, target32, candidate74, hosted smoke/shortcuts and independent D delta review remain required. No integration.


### B1 actual UI and action-consumer corrections before native qualification

SDK857b092cc7 changes only the recorded failure notice to the existing localized Unknown/noncritical message. Actual Main.onError dismissal proved EditingError still disables editing independently of the global handler; a new source regression fails before this correction. Generic unrelated error policy stays unchanged. No dedicated translated recovery message is introduced.

SDK81eba23fe15f53fc83fe4ea897f37cf11155825a additionally releases typed-failed edit/Undo/Redo action bookkeeping without deleting/repeating history, updates dirty/Undo UI, and balances end events. Typed collaboration failure finishes ApplyChanges and restores chart selection after collaborative Undo before rethrowing the original error. Five actual consumer source regressions fail on the exact857baseline (26pass/5fail); unrelated exceptions retain their prior policy. The first edit fixture missed one recalculation method and failed for setup, so it was corrected before accepting that red proof. Final332source tests pass0skip.

The v5 compilation passed, but native138 was intentionally interrupted after6reported rows when the UI callback gap was found. SIGTERM/unit success is not suite success. No native/full-gate qualification is claimed for these newer heads. Rebuildv6, injected native failure/alert dismissal/edit+Undo recovery first, then138+18, target32, candidate74, hosted gates and D delta review remain required. Sealedv5 rollback and compact partial diagnostics are retained; inactive intermediates are cleaned with exact receipts.


### release review reference 459 v6 qualification and review handoff

The final engine source is SDK
81eba23fe15f53fc83fe4ea897f37cf11155825a. Product test source
104b279fca556099faa1dc096fbf01c135a1df78 supplies332 passing source tests,
zero failures and zero skips. The remaining product follow-up records these
results only; it does not change the tested code.

| Check | Observed result | Scope or remaining limit |
| --- | --- | --- |
| Real Linux fault recovery | Three edit/Undo/Redo cases and one actual SDK timer case pass; real Main alert dismissal retains editing; incomplete output is refused; a successful new full generation recovers | Controlled one-shot fault injection; no native OS print-dialog claim |
| Unchanged native138 runner |138 cases pass, with18 actual edit/Undo/Redo/Undo/save-fresh-reopen cycles; no forced full recalc before Undo | Model/property checks, not Word equivalence |
| Word target32 |23 single-cell references,8 shared-row references and a507 all compare; page/text/raster/font/glyph/score metrics are identical to v4 | Missing24th single-cell export remains HTTP404/unverified; previous Y-baseline residual limits remain |
| a507 occurrence pages |14 pages,419 unique words,880 token types and3897 occurrences; every occurrence-page distribution matches Word | Full line/cell rectangle equality is not established |
| Hosted opening and coauthoring | DOCX/XLSX/PPTX open; two real Chromium clients replicate a shared table/text; remote layout fault, alert, output refusal and local fresh-generation recovery pass; three markers apply exactly once to each peer | Own isolated loopback container; slow paths forced only for fault injection |
| Hosted shortcuts | All518 baseline keys/statuses are identical; Win editor228 and Mac mappings171 pass; browser14/13 pass; no failures |8 skips,70 not-applicable rows and14 browser-reserved untested rows remain; no real Windows/Mac execution |
| Full74 comparison |72 compare, two known strict-WASM failures remain; no new failure or page-allocation regression;70 comparison JSON files are byte-identical to baseline, two improve | Global verdict HOLD;66 scored, six compared cases have null scores, two failed cases are unverified |

The full74 batch completed in6min34.325s and returned exit2 because of its two
failed cases. Both failure render logs are byte-identical to the fresh canonical
baseline. No JavaScript fallback output was accepted or substituted. The
integrated scorer and six driver hashes match across all180 baseline/candidate/
target results.

The two improvements are a507 (weighted ink difference35.7690% to27.4380%)
and15b8acf3 (39.4351% to28.3883%). The latter retains four pages and192/192
matched unique words, improving page agreement from188/192 to192/192.
Across the72 comparable documents, the mean weighted ink-difference delta is
-0.269136 percentage points and the common-word page-placement net gain is four.
These are measured diagnostics; they are not a full Office fidelity certification.

The first hosted opening run failed for all three formats because the converter
could not create its temporary directory in the task-owned bind mount
(root0755). Its EACCES logs and failed results are retained. Changing only that
owned scratch directory to converter uid105/gid107 and mode0700 fixed the setup.
No production code or acceptance assertion changed for that failure.

Final source, three compiled overlay files and all18852 original package file
hashes were verified unchanged. All other QA package paths shared their original
inodes. Active unit receipts prove2CPU/4GiB/zero-swap limits; post-GC defaults and
small parent-process memory figures are not used as aggregate peak claims.

Exact inactive build/cache/profile/temp/PNG paths and the isolated container have
been removed with allocated/free receipts. The regenerable QA clone is removed;
the frozen original and sealed three-file overlay allow reconstruction by
detaching each replacement before writing. Retained evidence includes actual
PDFs/vector data, native saved DOCX files, critical PNGs, source/compiled bindings,
raw logs and compact rollback inputs. Source worktrees were retained after
automatic review rejected their forced removal because of modified/untracked
files; their generated diff and scheduler are archived for review. No original,
protected image, release folder, public demo or personal-machine data was removed.

D delta review and lead disposition of the two known failures are pending.
Canonical refs and gitlinks remain unchanged. No push, deployment or integration
is authorized by this report.


### Independent approval and separate release disposition

D validation reference 1281 approves the exact SDK81eba23fe1/product399c13a3 delta with no
new concrete blocker. The review and independent verdict hashes are
4cbed155f4272b7390567341bf8e9db2dc1bf4e82a68134d866d05c392aa2541 and
c2775fe86b1e728d1f269dea4e58fc83620ae841762db12982a3916d29db4d40;
all cited bindings were verified before preparing integration.

Lead release review reference 460 accepts the two byte-identical pre-existing strict-WASM failures as
known and disclosed for the conditional0.6 gate, with native CJK work deferred
to0.6.1. They remain failed/unverified tests; the measured full74 exit2/HOLD and
six null-score comparisons have not been rewritten. The separate release
condition is now D APPROVE plus no other regression, both evidenced above.
SDK -> DocumentServer gitlink -> product fast-forwards are authorized.
No new heavy job or additional runtime qualification is implied.
