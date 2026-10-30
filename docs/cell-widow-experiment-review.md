# Cell-widow replay experiment: release review reference 456 review

Historical v2 checkpoint: [current v4 cache review](cell-widow-prefix-cache-review.md). The a507 failure described below was corrected by the later uncommitted experiment; this document preserves the earlier review evidence.

Status: **REVIEW READY as an uncommitted experiment; HOLD, not release-qualified.**
Product base c2e9a0241155f26915dee0b53d87aa06d84cb127; SDK base
c1380f14fdbf614ad4f3f7062776f145f845407b. No commit or integration.

## Observed failure and narrow correction

The first compiled candidate passed the four initial widow-off probes, then
repeated empty pages in the first widow-on probe. Its work budget failed at
65536 steps. A pending count of zero after abort did not prove consumption;
validation reference 546 corrects the earlier inference in validation reference 544.

Read-only Debugger pauses captured the first nine table call boundaries, stopping
observations at table page3: the first current-page request left an empty paragraph
fragment; following placements repeatedly calculated cell page0. The trace
expression used direct scalar reads with throwOnSideEffect enabled. The first
instrumentation attempt failed value evaluation. The second captured valid values
but its teardown reached the90second unit timeout. Neither is native acceptance.

The actual Paragraph.Recalculate_Page clears its parent's legacy widow reset
flag before returning to the content/table delegate. The first controller tried
to acknowledge a matched cut later, after that flag was gone. Its pending request
was therefore rehydrated on the next placement.

Two short regression tests execute the actual Paragraph methods and actual
CDocumentRecalcInfo reset methods. Before the correction, pending remained1
after the real reset and the next call returned65544 instead of ordinary
NextElement1. They fail without generating thousands of pages.

The experiment acknowledges the matched cut inside private_RecalculateLineWidow,
before the existing paragraph reset. The controller authenticates the active owner,
generation, request identity, replay status, paragraph, cut line and legacy flag.
A flag alone cannot consume a request. No further Table, row-height, split or
cache mutation was needed for this correction. Protocol bounds remain enforced.

## Results

| Check | Actual result | Evidence in work folder |
| --- | --- | --- |
| Static consumer audit before numeric choice |121calls /129references, independent census agrees | consumer-audit-summary.json |
| Source and controlled-callee tests |263PASS,0FAIL,0skip | all-source-units.log |
| Actual paragraph reset regressions, before fix |2FAIL | controller-real-reset-before.log |
| Word compilation |2chunks PASS | build-word-candidate-v2.log |
| Actual single-cell reference allocation |23PASS versus baseline11PASS/12FAIL | candidate-v2-word23-assert.log |
| Shared-row allocation |8PASS before and after candidate | candidate-v2-multicell8-assert.log |
| Strict WASM native batch |31/31compared, exit0 | candidate31-v2.log |
| Frozen59 gate |56compared,3failed; HOLD | gate59-v2-summary.json |
| Surviving56 comparison JSONs versus canonical baseline |56exactly identical | gate59-v2-comparison-identity.json |
| New mandatory a507 regression |qualification error: rejected split state repeated without progress; no accepted PDF | gate59-v2-results/a5077259565043a943f47112de7e0da1a7ddede0e3dee7f5db5a93e92da7d020/render.log |
| Existing two frozen runtime failures |41726aae and b4f13572 remain failed, not passes | gate59-v2-summary.json |
| Rebranding |product check0; candidate SDK scan0 including new files | rebrand-candidate-v2.log / rebrand-sdk-candidate-v2.log |
| Diff whitespace |PASS | git diff --check |

The a507 failure blocks qualification. Its flagged page4 and declaration page7
cannot be claimed fixed because the candidate export was rejected. The56 surviving
pairs show zero net page/raster change, not a successful59-pair gate. No bounds
were relaxed and no failed export was substituted.

The missing24th single-cell Word reference remains HTTP404/unverified. The138case
incremental/Undo/save suite, full74 gate, shared-editor compiled smoke and full
integration checks have not been rerun on this candidate. The138 public sources
were regenerated and their hashes verified against the previous qualified run,
but this is not execution evidence.

## Next review decision and retention

Review the lifecycle experiment and the remaining a507 repeated-state failure
before any commit. Further investigation must stay within replayed-cell
page-reset/cache scope; no row-height rule changes. The next useful evidence is a
bounded read-only trace of the repeated authenticated request in a507, followed
by a failing short source regression before another experiment.

Work folder: /srv/elixiroffice/wt/cell-widow-protocol-A-work.
All Word original sources/raw PDFs, baseline/candidate actual PDFs, source and
compiled hashes, bounded trace logs, failed attempts and rollback compiled pairs
are retained until review/approved replacement qualification. Exact inactive QA,
build/cache/profile/temp/PNG intermediates were removed with pre-deletion receipts.
Global free-space deltas are not claimed as exclusive task savings.
