# Desktop Office differential diagnostics

This local Linux runner pairs an Office file with an independently supplied PDF
reference. It opens a temporary input copy in the packaged desktop, waits for
editor/font readiness and exports through the actual Wasm PDF writer. It uses
an owned display/profile, never a running desktop session or hosted instance.

The output is an exploratory diagnostic, **not a percentage of compatibility
with Microsoft Office**. Word desktop/web, Excel and PowerPoint PDF references
must be supplied separately with their application/build, font environment and
export settings recorded. An ElixirOffice or synthetic reference tests the
pipeline only. References are never generated or silently replaced by this tool.

## Dependencies and bounded execution

Use Node 22, a qualified Linux desktop package with its working sandbox,
Playwright, Xvfb, Poppler (pdftoppm), fontconfig (fc-list, system-font mode)
and Python 3.12 with requirements-differential.txt. Dependencies are task-local;
the harness neither installs them nor downloads an editor/runtime.

Invoke run-differential.sh, which requires a working delegated user systemd:
one sequential batch, 200% CPU quota, 4 GiB process-tree memory, zero swap,
256 tasks, three-hour wall limit and control-group cleanup. The batch verifies
and records the actual unit properties. No unbounded fallback exists.
The per-phase timeout defaults to 240 seconds, the PDF page cap to 300, the glyph
cap to one million per PDF, the raster cap to 16 million pixels per page, and the
output disk budget to 10 GiB. The live disk check may overshoot by the bytes a
child writes within its one-second polling interval. Set a smaller budget than
available space and the team's approved allocation. Limits can classify large
files as failed; failures are retained. Only owned child process groups are
terminated; PID/start-time identity guards cleanup of the detached app.

    export PYTHONPATH=/absolute/task/deps
    tools/fidelity/run-differential.sh \
      --manifest /absolute/public/pairs.jsonl --out /absolute/task/results \
      --executable /absolute/qualified-package/elixiroffice \
      --xvfb /absolute/Xvfb --playwright /absolute/node_modules/playwright \
      --font-mode bundled-only

Output must be empty or contain this harness's ownership marker. Keep sources,
references, packages and results outside Git. This public tool rejects resolved
paths under corpus-private or corpus-private; this guard is not a classifier of
arbitrary confidential content. Supply only reviewed public files.

## Pairing manifest and font modes

One JSON object per line; relative paths resolve from the manifest directory:

    {"id":"original-case-01","input":"files/example.docx","reference":"refs/original-case-01.pdf","reference_source":"word-desktop","reference_build":"actual build","reference_settings":"export and font settings","license":"source terms","source_url":"original public source"}

IDs are unique ASCII letters/digits/underscores/hyphens, starting with a letter
or digit, at most 96 characters. Keep stable IDs when pairing a collection's
source manifest with ID.pdf references. Preserve the source URL, license and
SHA in extra fields; all manifest metadata enters provenance. A missing
reference stays missing-reference; obtaining Word references is a separate
owner action. The manifest is pre-counted and then streamed; Office inputs are not loaded
into the batch controller as document bytes. Run only one batch per output directory.
DOCX/XLSX/PPTX, DOC/XLS/PPT, ODT/ODS/ODP, RTF and CSV are accepted for the desktop
to convert; support in the selected package is measured rather than assumed.

- **bundled-only** (default): seed only the owned profile with declined
  computer-font consent. No browser Local Font Access call is used.
- **system-allowed**: explicitly grant the owned profile consent to the
  existing desktop bridge's system-font folders. Wait for the bridge's index
  and normal font refresh before export. No owner profile or preferences change.
  This mode allows system faces; it does not promise that every requested face
  exists or that a given package prioritizes it. Actual PDF glyph fonts remain
  the evidence. A fontconfig inventory content hash enters the resume identity.

Record the reference machine's installed/used faces independently. A font label
in an Office UI is not proof of every face used by its PDF.

The --compare-only mode consumes an extra candidate PDF path per manifest entry,
without opening a desktop. Font mode in that case is a caller-supplied label;
PDF glyph evidence is the actual font evidence. This mode is useful for
deterministic tests and comparing retained exports, not a fresh desktop smoke.

## Measures and outputs

Each case contains result.json, escaped script-free index.html,
comparison.json, glyphs.json.gz, paired page PNGs and white-on-black
difference masks. Desktop runs retain render/candidate.pdf, render.json
(consent/mode, Wasm stats, errors/network observations) and bounded-run logs.
Finished profiles and temporary input copies are removed. Reports may include
document text; keep them in the same approved public-data boundary as inputs.

- PDF page count and exact media-box equality.
- NFKC/case-folded word tokens, excluding soft hyphens. Only words occurring
  exactly once in **each** whole PDF are matched. Per reference page, report
  matched count, same-page agreement and coverage against its globally unique
  reference tokens. Repeated words and unmatched tokens are not agreements.
- First supported page-allocation mismatch in reference physical page/line
  coordinates, and first wrapping mismatch between adjacent matched tokens in
  reference extraction order. Include the supporting words, complete lines,
  glyph fonts, advances and boxes. Columns/RTL and skipped repeated words make
  this a heuristic, not original Office paragraph ownership or reading-order proof.
- Every extracted glyph's font, size, advance, box, page and text, plus font
  glyph totals. Outlined/image-only text cannot supply word evidence.
- Fixed-DPI grayscale raster ink boxes (threshold 245) in pixels/mm, and
  symmetric tolerant difference: gray values outside the other page's 3x3
  neighborhood min/max envelope by more than 64, divided by union ink pixels.
  Page origins stay aligned; no resizing/registration conceals shifts.
  Missing pages have difference 1; media-box deltas are retained exactly,
  while the score tolerates at most 0.1 point of decimal serialization noise.
  Larger media-box differences receive zero raster similarity. Rotated, cropped and non-zero-origin PDFs fail
  explicitly pending coordinate support.

The versioned **exploratory-v1** score is
100 * (0.30 * page-count ratio + 0.40 * matched-word same-page agreement +
0.30 * mean raster similarity). It is null without matched-word evidence.
It deliberately stays separate from coverage; low coverage limits interpretation.
Weights are a review proposal, not an owner-approved fidelity gate.

On completion, aggregate CSV and JSON include every valid manifest entry, including errors,
unsupported/missing files, missing references and timeouts. The mean of available
scores and a separate conservative all-case index (missing scores contribute
zero) are labelled distinctly. CSV formula-like metadata is escaped.
A batch with any non-compared entry exits 2; an empty/invalid manifest or setup
error exits nonzero. A compared case may have a low or null score: a diagnostic
comparison is not an assertion that its content matches.

Resume requires input/reference/candidate bytes, renderer and harness sources,
all package-resource bytes, dependency/Poppler versions, mode/font inventory
and comparison configuration to match. Stored report/artifact hashes must also
match. Failed/missing-reference cases retry when rerun; reports are atomic. Aggregate runState/processed/pending fields distinguish
initializing/running/complete/manifest-changed states. Pending cases stay in the
conservative denominator. Complete means all entries were processed, not that
all comparisons succeeded. A killed batch never writes complete. During a
partial run the CSV lists attempted cases; aggregate JSON also counts pending cases.
Do not modify tools or package resources during a qualifying batch.

## Tests

    PYTHONPATH=/absolute/task/deps:tools/fidelity \
      python3 -m unittest discover -s tools/fidelity -p 'test_differential.py' -v

Tests create original public PDFs and cover identity, changed page/wrap,
repeated/missing tokens, extra/blank pages, raster shifts, unsupported rotation,
HTML/CSV escaping, resume/config/font-mode invalidation, real child timeout/disk
cleanup, atomic-rename census races, pending-case accounting, PDF-box decimal
precision and private-path refusal. The floating-table micro-corpus supplies
actual packaged Word-editor smoke cases. A baseline from the same ElixirOffice
package validates plumbing/determinism only; independent Word exports and a
diverse full corpus remain necessary for Office fidelity conclusions.
