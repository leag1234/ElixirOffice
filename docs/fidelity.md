# Layout fidelity: harness and choice of the metric

State as of 2026-10-05. Harness: `tools/fidelity/` (user guide: `tools/fidelity/README.md`).
Decision expected from the test user: **choose the metric (A, B or C below)**, then we freeze it.

> **Warning.** There is still no Word reference. The figures in this document
> compare ElixirOffice to **LibreOffice 25.2 (NOT a fidelity reference)**: they serve
> only to show how each metric reacts to real layout gaps. They say
> nothing about our fidelity to Word. Provisional corpus (no real teacher worksheet).

## 1. What is measured

For each corpus document: reference rendering (`refs/<source>/<id>.pdf`, source recorded
at each run: `word-web`, `word-desktop`…) against ElixirOffice rendering (PDF export through the DocumentServer's
conversion API), rasterized at 120 dpi. Page i compared to page i:

| Measure | Definition |
|---|---|
| page count | gap Δ = pages(us) − pages(ref.); missing or extra pages = pages at 0 |
| SSIM | structural similarity, grayscale, Gaussian window σ = 1.5 |
| ink diff | share of the inked area (union of both renderings) that differs beyond a tolerance of 64 gray levels and 1 px |
| moved ink | share of the reference page's ink located in blocks shifted vertically by more than 1 mm, moved to another page or not found |
| shift | median / maximum vertical shift of the blocks (mm and px) |
| text flow | to which page(s) on our side the text of each reference page went |

## 2. Three candidate metrics

All go from "bad" to "identical" (1 or 100); the overall score is the mean of the
documents (B: share of the corpus's pages).

- **A. Mean SSIM**: mean of the page SSIMs, divided by max(ref. pages, our pages).
  Standard, simple. Flaw: dominated by the white background and very sensitive to character smoothing
  (two renderings of identical layout give ~0.96); hard to read (0.77 or 0.85,
  what does that mean?).
- **B. % of pages with SSIM ≥ 0.98**: share of "almost identical" pages. Readable
  ("20 pages out of 30 identical"), close to the gate 2 criterion. Flaw: binary, and with another
  rendering engine the 0.98 threshold is almost never reached (glyph smoothing): it
  will have to be recalibrated on the first Word references, or the condition replaced by
  "ink diff < 2% and no moved block".
- **C. Penalty score, /100**: per page, `1 − ½·min(1, ink diff) − ½·moved ink`;
  averaged over max(ref. pages, our pages) (missing pages = 0); then **−25 points per page
  of pagination gap**; bounded to [0, 100]. Measures what a user sees (text that moves,
  pagination that changes), ignores smoothing, heavily penalizes a different page count.
  Flaw: arbitrary weights (½, ½, 25), to be validated on the Word references.

## 3. Three examples (ElixirOffice against LibreOffice, NOT a fidelity measure)

Run `20261005T093928Z-libreoffice` on build-host (`/srv/elixiroffice/fidelity/runs/`).

| Document | What we see | Pages | A mean SSIM | B % pages ≥ 0.98 | C penalties |
|---|---|---|---|---|---|
| **t09** class project (public, Les Lilas) | Identical layout (same Carlito font, no moved block, ink diff 0.02%); only glyph smoothing differs | 1 → 1 | 0.959 | 0% | **100.0** |
| **t01** CM1 fractions worksheet | Different substitute fonts (title "Cursive standard", Andika), blocks shifted by 1.7 to 3.4 mm on page 1, bottom table shifted by ~10 mm on page 2; on our side the Wingdings smileys display as "J K L" | 2 → 2 | 0.745 | 0% | **59.8** |
| **t06** conjugation on Seyès | Different pagination: 3 pages in LibreOffice, 2 on our side; the text of reference page 3 is entirely found on our page 2 | 3 → 2 | 0.425 | 0% | **26.6** |

Detail of the C computation:
t01 = 100 × ((1 − ½·0.551 − ½·0.623) + (1 − ½·0.321 − ½·0.112)) / 2 = 59.8;
t06 = 100 × (0.912 + 0.636 + 0) / 3 − 25 × 1 = 26.6.

Overall scores of this run (30 documents): A = 0.767; B = 1.4%; C = 58.9; 5 documents with a
different page count (t06, s02, a06, a09, a10).

Reading:
- A ranks t09 (0.96) barely above really different documents, and does not show
  that it is perfect; the t01 / t06 gap comes mostly from the missing page.
- B is 0 for the three: it distinguishes nothing between two different engines as long as the threshold
  is not recalibrated.
- C clearly separates "identical" (100), "same pages but text that moves" (60) and
  "broken pagination" (27), and its components (ink diff, moved ink, Δ pages) say
  what to fix.

## 4. Proposal

Adopt **C as the reference score** (baseline and non-regression), display A for
information, keep the number of documents with different pagination as a separate indicator, and
recalibrate B (or its "ink diff < 2% and no moved block" variant) for gate 2 as soon
as the first Word references exist. C's weights (½, ½, 25) will be reviewed
on these references before being frozen. Current non-regression tolerances: C −0.5 point,
A −0.002, B 0 pages, per document.

## 5. Harness validation

- **Determinism** (`run.sh --ref self`: two successive conversions of the corpus, three times,
  one of them after recreating the container; plus comparison of the renderings between the two
  containers): 30/30 documents identical to the pixel at 120 dpi in all cases; the PDFs only differ by
  timestamps (`CreationDate`, `ModDate`, XMP): 30/30 identical once these dates
  are neutralized. A = 1, B = 100%, C = 100.
- **Non-regression**: a second run against LibreOffice with `--baseline` gives scores
  identical to the first (PASS); a document score degraded by hand in a copy of the
  baseline is indeed detected (code 1); a baseline of another source is rejected (code 3).
- Duration on build-host for 30 documents (70 pages on our side): ~60 to 90 s with the server already running
  (conversion ~25 s, comparison ~30 s), ~3 min 10 s cold (DocumentServer startup and
  font generation ~110 s).

## 6. What the test user needs to move on to real measurements

The PDFs exported from **Word for the web**, one per document, named `<id>.pdf` (`t01.pdf` …
`a10.pdf`, column `id` of `corpus/provisional/manifest.csv`), in
`/srv/elixiroffice/fidelity/refs/word-web/`, with a `SOURCE.json` (date, Microsoft 365
edition, settings). Export settings: see `tools/fidelity/README.md`, section
"Exporting the Word for the web references" (file uploaded as is, fields not updated,
revisions as "No Markup", comments hidden, "Download as PDF", not the browser's
printing). Then `tools/fidelity/run.sh --ref word-web --save-baseline`: this is the upstream
baseline.

## Private corpus: anonymous ids (rule)

The real teacher corpus (`corpus-private`, private) is never named in output. When a corpus is private (`--private`, `EO_PRIVATE_CORPUS=1`, or a path containing `corpus-private`), every id a tool prints or writes is `doc-<hash>` (sha256 of a fixed salt, a NUL byte and the path relative to the corpus root; see `tools/fidelity/corpus_anon.py`). No file name or document title reaches stdout, stderr, `results.json`, the HTML report or the run files, and errors and tracebacks are scrubbed before printing. Tests with a fake private corpus: `tools/fidelity/test_private_anon.py` (in the tools image, see its header) and `tools/client-pdf/test-anon.mjs`. References for a private corpus are keyed by the anonymous id. The rule covers what the tools print and write; exported PDFs keep the document's own metadata.

## Upstream baseline (2026-10-05)

Reference: Word for the web (free Microsoft account), export "Download as PDF file"; a01 and a04 in "Simple Markup". Image rendered: `ghcr.io/euro-office/documentserver:latest` built on build-host (unmodified upstream, 9.x). **Provisional** corpus. File: `fidelity/baselines/word-web.json` (copy of `build-host:/srv/elixiroffice/fidelity/baselines/word-web.json`).

| Indicator | Value |
|---|---|
| A — mean SSIM | 0.743 |
| B — % pages SSIM ≥ 0.98 | 1.3% |
| C — penalty score /100 (proposed as the main score) | **55.9** |
| Documents with a different page count | 7 / 30 (s06, s07, s08, a08, a10, t05, t06) |
| Conversion failures | 0 |

Worst documents (C): s06 0, s07 0, t05 0, t06 8.7, s08 10.1, a09 18.1, a01 26.8, t01 28.6. Best: a07 99.8, t09 99.3, a02 97.5, t07 97.3, s09 96.1.

**Decision (the test user, 2026-10-05)**: the C score (penalties) is the main fidelity score; A is displayed for information; C's weights (½, ½, 25) will be recalibrated on the Word references.

## Fonts and pagination (2026-10-05, branches `feat/fonts` / `elixir/fonts`)

Font details: `docs/fonts.md`. Image measured: `elixiroffice/documentserver:fonts-6` on build-host =
upstream image + font pack (group `metric`, `make fonts-image`, private Script École metrics supplied by `FONT_METRICS_EXTRA`) + sdkjs `elixir/fonts` + x2t
`elixir/fonts` (core rebuilt on build-host with the `eo` builder: 209 s incremental).

### Causes of the 7 pagination gaps

| Doc. | Word → us (before) | Cause | Fix | After |
|---|---|---|---|---|
| s07 | 6 → 4 | Even/odd headers (`evenAndOddHeaders`) and numbering restarted at 1 (cover p. 1 → table of contents "i" → body "1"): when printing and exporting to PDF, Word inserts a blank page to keep odd numbers on the right (which a06 confirms, same structure without even/odd headers: no blank page). sdkjs only renumbered. | sdkjs `fix(word): export the blank pages Word prints before odd/even sections` (rule also for "odd page / even page" breaks) | 6 → 6 |
| s08 | 2 → 1 | The body ends with a table (generated file): Word adds the mandatory final paragraph, which no longer fits under the full-height table row and creates page 2. sdkjs kept the table as the last element. | sdkjs `fix(word): add the final paragraph Word adds after a trailing table` | 2 → 2 |
| t05 | 3 → 2 | Fonts: Andika and OpenDyslexic absent from Word for the web, rendered in Calibri; us in Liberation Sans (narrower, lower line spacing), hence a shorter 2-column section and the final box moved up to page 2. | sdkjs `feat(libfont): substitute missing fonts the way Word does` (unknown font → Calibri → Carlito) | 3 → 3 |
| t06 | 3 → 2 | Fonts (Belle Allure CM, Cursive standard → Calibri in Word, Liberation Sans on our side): Liberation Sans's line height moves the "Je m'entraîne" paragraph up; in Word the bubble (`wrapSquare`, anchored to this paragraph) then overlaps the last row of the conjugation table which goes under it, not on our side. | same (Carlito) | 3 → 3 |
| a10 | 5 → 4 | `w:altName`: the Marianne font (absent) has Times New Roman as its replacement name, which Word uses; we took Liberation Sans then Carlito. The docx's font table did not reach sdkjs. | core `feat(x2t): pass the document font table to the editor` + sdkjs `feat(word): use the alternate font names of the document` | 4 → 5: score 38.1 → 54.3, Word's page 5 (final paragraph alone) is not yet reproduced (residual height gap of the table rows) |
| s06 | 1 → 2 | Recipient frame (`framePr`, page position) followed by the date with a space before of 46 mm: Word places the date at the top of the text area (space before not applied after frame paragraphs at the top of the page) and makes "Objet…" flow to the left of the frame; we apply the space before, everything goes down by ~45 mm. A single example in the corpus: rule to confirm on a dedicated Word file before fixing. | open | 1 → 2 |
| a08 | 6 → 7 | Page 5: ~25 empty paragraphs between two anchored charts (`wrapSquare`, 147 mm wide, overflowing the 160 mm column); in Word they fit on the page (band of 21 to 24 mm next to the chart), on our side they overflow onto page 6 and push away the title and the following charts. sdkjs does accept bands ≥ 6.35 mm: exact cause not isolated (layout trace needed). | open | 6 → 7 |

### Measurements

Provisional corpus (30 documents, Word for the web), C score /100, mean SSIM, documents with a different
page count:

| Step | C | SSIM | Pagination ≠ |
|---|---|---|---|
| Upstream baseline | 55.9 | 0.743 | 7 |
| + font pack only (without sdkjs fix) | 55.5 | 0.740 | 8 |
| + substitution "like Word" and symbols (Symbola) | 60.9 | 0.759 | 7 |
| + Elixir Symbols (Wingdings metrics) | 64.5 | 0.769 | 7 |
| + blank pages, final paragraph, measured school fonts | 75.0 | 0.820 | 3 |
| + `w:altName` (x2t + sdkjs) — **new baseline** | **75.7** | **0.822** | **3** (s06, a08, a10) |

With the real school fonts installed on the server (group `school`): t01 and t05 follow these
fonts and move away from Word for the web (which does not have them): C 69.7 instead of 75.0 (`docs/fonts.md` § 6).

Private real corpus (4 teacher documents with a Word desktop reference, school fonts installed
on the rendering machine; no file nor derivative outside `build-host:/srv/elixiroffice/corpus-private`
and `fidelity/runs-real`): C 18.2 → **76.0**, SSIM 0.639 → **0.842**, documents with a different page count 2 → **1**.
The substitution of Script École (URW Gothic Ecole Metric), KG Primary Penmanship and Comic Sans MS
makes up most of the gain; the 69-page document remains one page off. A first version of
the use of `w:altName` (follow the altName even if absent) cost one document 7 points (font
replaced by an altName that is itself absent): the altName is only retained if it is installed or has an
installed replacement.

Baselines: `build-host:/srv/elixiroffice/fidelity/baselines/word-web.json` (new,
`fonts-6`); the old one (upstream) is kept under `word-web.upstream-2026-10-05.json`; real corpus:
`fidelity/runs-real/baselines/word-desktop.json` (new, `fonts-6`) and `word-desktop.upstream-2026-10-05.json` (upstream). Copy of the provisional baseline in this repository: `fidelity/baselines/word-web.json` (and `word-web.upstream-2026-10-05.json`).

Harness: `run.sh` accepts `--refs-dir`, `--runs-dir`, `--baselines-dir` (private corpus outside the
default tree) and also converts `.odt` files (file type from the extension).
