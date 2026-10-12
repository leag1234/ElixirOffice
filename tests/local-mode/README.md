# Local conversion acceptance

Use an isolated instance and an explicit EO_BASE; these tests reject :8080.
Install the pinned full converter with
`python3 sdkjs/common/wasm-convert/install-runtime.py RELEASE_DIR` in the
DocumentServer worktree. The PDF-only runtime cannot handle office formats.
Deploy the new SDK directory and local Controller before testing.

Run with Node 22 and the existing $EO_WORK/pw Playwright installation:

- `EO_BASE=... EO_LOCAL_FIXTURES=... EO_LOCAL_OUT=... node tests/local-mode/convert-browser.mjs`
- `EO_BASE=... EO_LOCAL_FIXTURES=... EO_LOCAL_OUT=... node tests/local-mode/editor-browser.mjs`
- Add `EO_LOCAL_ALL=1` for every document in the fixture directory.
- Add `EO_LOCAL_PACKAGED=1` after deploying production bundles and removing the manually deployed raw Controller; any raw-module fallback fails the test.
- Add `EO_LOCAL_SERVER=1` to produce equivalent hosted editor reference saves.
- Add `EO_LOCAL_IMAGE=picture.png EO_LOCAL_REPLACEMENT=replacement.png` to exercise the real file picker, replacement, two saves, exact media bytes and image-reference counts.
- `EO_BASE=... EO_LOCAL_FILE=... node tests/local-mode/launch-browser.mjs`
- `EO_BASE=... EO_LOCAL_FILE=... node tests/local-mode/privacy-browser.mjs`
- `EO_BASE=... EO_LOCAL_FILE=... node tests/local-mode/cancel-browser.mjs`
- `EO_BASE=... EO_LOCAL_FIXTURES=... node tests/local-mode/unsaved-browser.mjs` (six-format clean, reject, save and discard cases)
- `EO_BASE=... EO_LOCAL_FILE=... EO_LOCAL_IMAGE=... node tests/local-mode/concurrent-browser.mjs` (edits during conversion and pending image disposal)
- `EO_BASE=... python3 tests/local-mode/http-runtime.py`
- `UPSTREAM=... python3 tests/local-mode/installer.test.py`

Local editing allows only same-origin static editor/font/runtime requests and
in-memory blob/data reads. The privacy probe intercepts potential escapes,
tests native image/frame/style loads and worker egress, and checks CSP headers.
No local document is uploaded by these tests except the separate server
reference/rendering stage, which must use public synthetic/generated fixtures.

For fidelity, render each saved public output with render-reference.mjs,
EO_LOCAL_INPUT and EO_LOCAL_OUT; add EO_LOCAL_ALL=1 for unique per-file IDs.
Compare the two PDF directories with tools/fidelity/compare.py and the matching
public manifest, using the normal C score and page-count thresholds.

The supplied nominal synth100.docx renders as 97 pages in this pinned editor.
Keep it unchanged and report that count. A separate exact-100-page benchmark
preserves its original XML/content and appends three explicit synthetic pages:

`python3 tests/local-mode/prepare-benchmark.py SOURCE.docx OUTPUT.docx`

Use EO_LOCAL_MIN_PAGES=100 to wait for the complete layout and assert the count.
The measured open time includes editor bootstrap and layout; save time includes
conversion and downloading the same format. Runtime statistics report linear
memory capacity, not whole-browser peak RSS. Results are individual runs,
not percentiles. The 2000-row spreadsheet is a separate benchmark.

Packaging: run the real SDK deploy-assets script after the pinned installer,
and the full production web-apps pipeline into separate output directories.
Run `python3 tests/local-mode/packaging.py SDK_OUTPUT WEBAPPS_OUTPUT` to check
all pinned artifact hashes and the Controller in each of the three bundles.
Deploy generated outputs only to the isolated instance before packaged browser tests.

Two-chart ODS regression (public sample-from-x2t.ods, SHA-256
e2ff465c4559f42e979859c68351b5972f328abfac3a09e0df0adb4dc228ec18):

- `EO_BASE=... EO_LOCAL_FILE=.../sample-from-x2t.ods EO_LOCAL_OUT=... node tests/local-mode/ods-objects-browser.mjs`
- On the real Linux desktop, with the production assets and pinned runtime:
  `EO_DESKTOP_ROOT=... node tests/desktop/ods-objects.cjs`

The web test edits, saves and reopens the ODS, checks both chart titles, types,
series, original numeric caches and retained colors, and rejects missing resources
or dynamic requests. The desktop test exercises native same-file save, preserves
file permissions, reopens the edit and exports PDF through the native dialog.
The original fixture has an empty image element with no source or inline bytes;
it must not become a phantom SDK image. The existing native object-loss guard
remains active for other documents the converter cannot preserve.
