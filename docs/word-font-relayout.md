# Reading position during Word font refresh

## Behavior and scope

The 0.4 source candidate keeps the reading position when late computer fonts
cause Word to lay out an open document again. An untouched initial caret or an
offscreen clicked caret must not pull the reader back to its position.
Selections are restored synchronously; an anchor in document coordinates remains
available while pagination completes. Later wheel or held-scrollbar input updates
that anchor, while explicit editing or navigation takes priority.

This preserves the real font load, paragraph invalidation, raster/page cache
invalidation and full layout. It does not disable computer fonts, move the font
timer, alter conversion, or promise a shorter CPU pause. Ordinary callers of
one-argument `RecalculateFromStart` retain their behavior. The opt-in is the
second, strict-true argument supplied by the Word local-font module.

## Cause

The public 0.3.3 Windows installer reproduced issue #37 on a public two-page legacy
DOC: scrolling without clicking left the initial caret above the viewport, then
the view returned toward it around the late font refresh. Clicking first moved
the eventual target to the clicked heading; it was not a general workaround.

The desktop font bridge schedules computer-font activation after its startup
delay. The font loader's completion calls `LF.relayout`, which previously used
`RecalculateFromStart(true)`. That path follows the caret. The source change
uses existing document-state save/restore and `ViewPosition` machinery, with a
separate identity for an anchor owned by this optional font refresh. It preserves
unrelated anchors and restores the previous scroll lock even if selection UI
throws. The final selection UI and its deferred drawing target also need the
temporary lock after a synchronous anchor has been consumed.

The converter Wasm instance is a different phase. No C++, Wasm binary, runtime
selector, dependency pin, font-consent policy or security boundary changes here.

## Source and packaging contract

- SDK `elixir/font-scroll37-D`: `605245b3b547db6555d8e41bbd000537d833e0e8`,
  rebased onto `b4bf012e5fc3d0a03085b4791f30b6ea2952eec1`.
- Web `elixir/font-scroll37-D`: `fa1821ce88ed12906434b1921e1b1a1cf30e695d`,
  based on `c6591195a046a131954e3425064686569022ba44`.
- Product branch `codex/font-scroll37-D` is based on
  `4f35c21733d47c2c2898ae1eaaf65f73e8355c4d`; it supplies regression tests and
  this handoff. The lead owns integration and any new release build.

Word executes the local-font module compiled inside
`web-apps/apps/documenteditor/main/app.js`. Replacing the standalone
`desktop-home/localfonts-Core.js` copy alone does not change this call.
The production compile already rebuilds Web apps; the private QA preparation
originally missed this input. Both failed private preparations and their native
observations are retained. They did not execute the new opt-in contract and
cannot qualify or refute it.

The regression executes both the actual source AMD/font-completion path and the
`LF.relayout` function extracted from the actual compiled Word bundle. The
compiled check first failed against the stale bundle and passed after the official
Word build. No production release-driver change or handwritten bundle edit was
needed.

## Qualification

| Check | Actual result |
| --- | --- |
| SDK Word Node tests | 60 PASS, including 23 new viewport/selection/input/async cases |
| SDK lint and three source branding checks | PASS; branding reports zero findings |
| Full desktop suite with coherent generated assets | 1353 PASS, zero failures/skips |
| Actual source and compiled font contract | 4 PASS; stale compiled input previously 3 PASS / 1 FAIL |
| Windows no-click reading view | Stable in all sampled frames from 1 s to 15 s |
| Windows clicked offscreen caret | Stable view over 15 s; later Left explicitly reveals the heading caret |
| Native noncollapsed selection | QA4 visible heading selection retained after the sampled 15 s interval and wheel-only return |
| Cell/Slide same Word-specific mechanism | Absent by source inspection; other native font-refresh behavior unverified |

Native observations use a private copy of the public 0.3.3 Windows app, with the
reviewed SDK and compiled font module, on Windows 10 build 19045, Core i3-4000M,
8 GiB RAM. The unchanged executable and ASAR, all five private override sizes and
hashes, and the actual two-argument compiled call were checked before GUI use.
The public installer, release folder and canonical branches were not changed.

For the three QA3 viewport cohorts, content-free diagnostics record actual
successful font discovery taking 5735/3270/3346 ms. The diagnostics buffer records,
so these durations do not independently timestamp the exact relayout overlap.
The enqueue guards observed first-paint file ages of 138/320/297 ms; they are not
wheel-onset times. One-second screenshots establish sampled view stability,
not micro-freeze duration, CPU improvement or uninterrupted responsiveness.

The initial native selection attempt did not establish a visible selected range.
A settled post-font End/ShiftHome control also inserted text before the heading
rather than replacing a selection. Independent review found a missing extended-key
flag in the private native input helper. This is a harness correction, not proof
of a new editor selection defect. No native selection PASS is inferred from
successful input acknowledgments.

The corrected helper sends the navigation-cluster extended-key flag on both
press and release and waits 200 ms before capturing the initial selection. The
selection-only QA4 case visibly highlights HEADING TEXT before scrolling. Its
reading view remains stable in frames 1 through 15; a wheel-only return shows the
same heading still selected. The application payload is unchanged from QA3.
Content-free diagnostics record successful font discovery taking 3202 ms. Normal
File > Quit closes both windows; the controller completes with task Ready, result0
and zero known native app processes. The same sampling/timestamp limits apply.
The exact inputs, captures and content-free font diagnostic are bound in
`native-qa-r4/native-selection-qualified-result.json`.

Async pagination, selection endpoints, later input, foreign anchors and unchanged
dirty/history state have source regression coverage. Native Windows racing input
during asynchronous pagination, macOS/Linux behavior, larger documents and broad
performance improvement remain unverified for this candidate.

## Evidence and reproduction

Task evidence is retained outside Git under
`/srv/elixiroffice/wt/font-scroll37-D-work/`:

- `rebased-gates-result.json` and `actual-artifact-suite-result.json`;
- `private-qa-compiled-core-input-mismatch.json`,
  `compiled-core-build-result.json` and `compiled-word-qa-input.json`;
- `native-qa-r3/native-three-cohort-observation.json`, hash-bound input plans,
  native captures and copied content-free font diagnostics;
- `native-qa-r4/native-selection-qualified-result.json`, with corrected
  native navigation input and visibly established selection;
- `cell-slide-source-assessment.json` and independent review receipts.

The public fixture is Apache POI's two-page header/footer sample DOC,
SHA256 `081c946c701a3061c32c41bef5235f518465a6a62b1250f6834b01ac6bbebbfe`.
Only public or owned QA documents are used. Normal File > Quit closes every owned
app window; controller completion requires zero known native app processes.
No forced application cleanup or new Mac window is part of this task.
