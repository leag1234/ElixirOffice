# Formula wizard initial keyboard focus

A valid function without arguments, such as NOW, now starts with its existing OK
button focused. Tab and Shift+Tab continue through OK and Cancel, and Enter accepts
the function. Argument functions retain their existing first-input focus and range
picker return path. Baseline Tab containment already worked; this candidate fixes
the missing initial target.

The only Web source change is five added lines in FormulaWizard.js: its standard
default-focus hook returns the existing first footer button only when the argument
list is empty. It adds no timer and changes no shared focus manager, formula,
calculation, range, history, translation or conversion code.

## Ordinary reproduction and checks

Tests open a public blank workbook through the real local renderer, current
production Spreadsheet/SDKcell and the pinned Wasm runtime. Native IPC is the only stubbed
boundary; all document data are public samples. They use fx or Shift+F3, localized search and ordinary keyboard or
pointer controls; they do not construct an SDK dialog directly.

Ordinary localized SUM/SOMME/SUMME focuses its first argument. Valid localized
NOW/MAINTENANT/JETZT leaves focus on BODY on the baseline. The earlier injected
English SUM in French/German produced an empty argument list and does not prove
an intermittent timing defect.

| Gate | Observed result |
| --- | --- |
| Current Product base | 33ad375fef2c5403f8f08ca4759aa4bc837b61f8, including lead release review |
| Strict desktop source regressions | 305/305, zero skips; one test process at a time, builder required |
| Actual AMD view contracts | Candidate 4/4; baseline 3 pass and 1 expected missing-target failure |
| Firefox 155 matrix | en/light, fr/light, de/dark, ar/dark; DPR1/2; 8 profiles x 18 checks = 144 pass |
| Actual Mac Chrome 155 matrix | Same 8 profiles, across three non-overlapping invocations; 144 pass |
| Stronger observer follow-up | en/light DPR1 Firefox 18 pass; actual-node observer used for all Chrome profiles |
| Final baseline controls | Both browsers: 3 expected focus failures, 15 other checks pass |
| Provenance | Per-run executed-driver, Product input and served-file hashes checked unchanged |

The Firefox matrix executed driver 457529b0. A subsequent observer-only correction
mapped the actual clicked window node to its CID and bounded the click timestamp.
Driver c5ee005d was then run on the Firefox follow-up and all Chrome profiles.
Actions, waits and behavioral checks are identical between these drivers. Earlier
Firefox click-CID metadata was inferred from the latest shown wizard; direct-node
proof comes from the follow-up and Chrome runs. These are separate exact run
bindings, not a claim that every profile executed the maintained driver.

The 18 checks cover initial and painted focus, a named dialog, forward/reverse Tab,
three reopens, repeated arguments, real range acceptance/cancellation returning to
argument 2 with values retained, SUM(2,A2)=5, modified-argument cancellation, one-step
SUM Undo/Redo, numeric NOW acceptance, approved NOW history, rapid Escape/Cancel,
another dialog and final grid typing. Painted primary-button shadow is compared
with the same button after real Tab; public en/light and ar/dark screenshots were
visually inspected.

Rapid cases prepare the ordinary localized chooser before confirmation, then use
real search Enter and keyboard/pointer input. They require a new wizard show,
matching close CID, elapsed 0 through less than 100 ms, no remaining dialog and the
typed model value. Cancel also identifies the clicked DOM window and bounds the
click between show/close in the maintained observer. No animation is disabled.

NOW creates two baseline history points: accepted index 3, first Undo to 2 retains NOW,
second Undo to 1 clears the cell, Redo to 2/3 restores/retains it. Volatile serials need not
be identical; each restored cell must retain the formula and a finite positive serial.
The original incorrect one-Undo assumption and failed logs are retained; lead
release review approved the observed trace. SUM retains its one-step Undo/Redo assertion.

## Source and qualification limits

Local reviewed Web commit: 28404fdeaa88a02f92199198f6bae4106033cd1a.
Local DocumentServer pointer commit: 303f5d7b44dc15b52fd3594cfed5d07565c5ff52.
SDK 9a06b24c33 and Integration 00962d45ee are unchanged. All 16,712 Web output files
have the same path set; only apps/spreadsheeteditor/main/code.js differs.
The current Product shell is refreshed separately and theme/SDK inputs are exact.

A retained QA scope label names app.js, and the build profile records its unchanged
hash. The actual changed payload is code.js. Exact file and served hashes bind the
executable bytes. The committed receipt carries the separate clarification;
frozen labels are preserved.

Historical unexercised editor/static seed files in the disposable QA fixture do
not qualify other editors or a new package.

Native OS focus, assistive technology, hosted editors, the complete shortcut
suite, packaged Electron and new release artifacts are unverified in this slice.
There is no integration, push, runtime-pin selection or publication by session Z.
Earlier setup, timing-precondition and animated-coordinate failures remain in
the task evidence and are not product regression claims.

The committed [receipt](../tests/desktop/receipts/formula-wizard-focus-Z9.json)
binds every run and the frozen external evidence. Source contracts are in
[default-focus.test.cjs](../tests/formula-wizard/default-focus.test.cjs); the real
UI regression is [formula-wizard-focus.cjs](../tests/desktop/formula-wizard-focus.cjs).

To run the source contracts, set EO_UPSTREAM to a matching DocumentServer checkout:

    EO_UPSTREAM=/path/to/DocumentServer node --test tests/formula-wizard/default-focus.test.cjs

The UI driver requires EO_DESKTOP_ASSETS and EO_FORMULA_OUT, and accepts a public
EO_FORMULA_FIXTURE, EO_PLAYWRIGHT_MODULE, EO_BROWSER, profile/DPR filters and an
optional owned BrowserServer endpoint. Use a disposable matching asset fixture,
one browser at a time and the recorded public sample. It is not a native-package
test.
