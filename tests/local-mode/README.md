<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Local conversion acceptance

Use an isolated instance and an explicit EO_BASE; these tests reject :8080.
Install the pinned full converter with
`python3 sdkjs/common/wasm-convert/install-runtime.py RELEASE_DIR` in the
DocumentServer worktree. The PDF-only runtime cannot handle office formats.
Deploy the new SDK directory and local Controller before testing.

Run with Node 22 and the existing /srv/elixiroffice/pw Playwright installation:

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


## D1–D2 offline review and pictures

Run python3 tests/local-mode/prepare-review-fixtures.py PUBLIC_TEMPLATES_DIR OUTPUT_DIR to generate fixtures from pristine public new.docx/new.xlsx/new.pptx templates. Use generated/public fixtures only: offline-review.docx with a comment by
Baseline Author and an Existing Reviewer tracked insertion, blank new.xlsx and
new.pptx, and image.png. D evidence uses the public fixtures in the task work
folder; no private corpus is required. The normal launcher needs the separately
owned A iframe-height correction; do not inject a viewport override for final
acceptance.

- EO_BASE=... EO_REVIEW_DOCX=... EO_REVIEW_OUT=... node tests/local-mode/review-browser.mjs
- EO_BASE=... EO_COMMENT_FIXTURES=... EO_COMMENT_OUT=... node tests/local-mode/comments-editors-browser.mjs
- EO_BASE=... EO_PICTURE_FIXTURES=... EO_PICTURE_OUT=... node tests/local-mode/clipboard-drop-browser.mjs
- EO_BASE=... EO_REVIEW_DOCX=... EO_PICTURE_OUT=... node tests/local-mode/picture-formats-browser.mjs
- EO_LOCAL_IMAGES_SOURCE=/absolute/path/to/web-apps/apps/common/main/lib/elixir-local/Images.js node --test tests/local-mode/images-boundary.test.mjs

Clipboard acceptance writes a generated PNG through the browser clipboard API,
then sends real Ctrl+V. File drop uses Chromium's trusted drag input with an
actual fixture file. The test waits for the paste action and image queue to
finish before the next gesture. It saves and reopens every editor in a fresh
context. Neither the document model nor image callbacks are replaced.

pictures-browser.mjs covers the SDK callbacks and URL failures. For its HTTP
matrix, expose only its public image fixture through a task-owned proxy below
/example/local-assets/web-apps/test-fixtures/http/; production CSP stays
unchanged. Set EO_IMAGE_HTTP_BIND to the private Docker bridge address,
EO_IMAGE_HTTP_PORT to an allocated task port and EO_IMAGE_HTTP_PREFIX to that
local-assets path, in addition to EO_BASE/EO_PICTURE_FIXTURES/EO_PICTURE_OUT.
The receiver checks omitted cookies/authorization/referrers, rejected redirects,
streamed byte limits and timeouts. Arbitrary external URL access is not claimed.

Linux desktop checks use the same production editor bundles in an owned
throwaway runtime, with EO_DESKTOP_ROOT and EO_DESKTOP_EXECUTABLE explicitly
set: node tests/desktop/native-review.cjs, native-pictures.cjs and
native-formats.cjs. native-pictures starts only its own Python GTK clipboard
provider (clipboard-fixture.py), writes a public PNG and stops that exact child.
Use owned TMPDIR/XDG/profile paths. These checks do not publish a package or
establish native Windows/macOS acceptance.

The packaged Word save-state regression is tests/desktop/odt-save-state.cjs. Run with EO_DESKTOP_ROOT, EO_PLAYWRIGHT and EO_PACKAGE_EXECUTABLE pointing at an owned packaged test export after its real six-format matrix has derived the public ODT fixture. It controls only the timing of actual conversion results and uses real SDK edit/undo/redo operations and saved XML checks; it does not substitute converter output.

The packaged odt-save-state suite now has eight cases: its real-Wasm paste case preserves a newer edit while saving an older snapshot; undo-to-saved performs no conversion or file rewrite; disposal checks the three exact callbacks against actual SDK dispatch with a positive control. Run against an explicit EO_PACKAGE_EXECUTABLE and isolated EO_DESKTOP_ROOT.
Mission F Session E acceptance (own EO_BASE is mandatory):

- exports-browser.mjs: real edits, File cards, every supported copy format/PDF, Print iframe bytes, retained dirty state, hidden local commands and request boundary.
- imports-browser.mjs: RTF/TXT/CSV/templates/macro-enabled/PPSX/legacy converted copies, original checksums and fresh reopen. EO_EXPORT_OUT points to the exports test's seed outputs.
- csv-ui-browser.mjs: real File CSV warning/settings, UTF-8 and semicolon selection, retained dirty state and interaction mask release; EO_LOCAL_FILE is required.
- unicode-browser.mjs: strict UTF-8 TXT/CSV imports/exports and RTF export/open/re-export containing Latin, Greek, Arabic, CJK and supplementary scalars; EO_LOCAL_OUT is required.
- export-media-browser.mjs: pending real image chooser bytes in the input editor office format, downloaded PDF and actual dispatched Print PDF pixels (run Word, sheet and slide fixtures), cancellation, dirty state and privacy; EO_LOCAL_FILE and EO_LOCAL_IMAGE are required.
- protect-range-browser.mjs: the actual Review tab's manager/New dialog, local user/range metadata and XLSX save/reopen; EO_LOCAL_FILE is required.

The media pixel check requires Poppler pdftoppm and Python Pillow; text export checks use pdftotext. The Print assertion verifies real PDF bytes and dispatch to the browser print iframe. Physical OS printer dialogs require separate acceptance.

Desktop: tests/desktop/protect-range.cjs uses the normal sandboxed CDP harness and temporary public fixture copies. EO_DESKTOP_RANGE_FILE is required; EO_DESKTOP_WORD_FILE adds Word's hidden Insert text check. EO_PACKAGE_EXECUTABLE selects a package; EO_DESKTOP_DISPLAY optionally selects an isolated display without changing the existing :0 default. Native OS print acceptance is separate.

The review media test starts PDF and Print in fresh documents while the real D image queue is pending. Visibility checks cover the Insert > Object mirror as well as the hidden source button. packaging.py verifies product/SDK full-selector equality, the separate explicit PDF pin, all artifact hashes and identical nine-patch build inputs. http-runtime.py reads the actual deployed pin/manifest rather than a historical version/size.

The Linux review runs use a newly assembled AppImage with production bundles and a normal sandbox on an owned Xvfb display. A local-unicode.cjs and local-formats.cjs also run on that package; EO_CONVERT_ONLY reports actual conversion/roundtrip/converted-copy opens and does not replace native-dialog acceptance.

## Local passwords

Use Node22, an explicit own EO_BASE (never8080), EO_X2T_RELEASE pointing at the verified full runtime, EO_UPSTREAM at the owned DocumentServer checkout, and EO_PASSWORD_FIXTURES at pristine public new.docx/new.xlsx/new.pptx templates.

- `node tests/local-mode/password-integrity.cjs`: actual encrypted Office HMAC mutation rejection; resets Emscripten's intentional rejected-job exit code only after every assertion succeeds.
- `node tests/local-mode/password-worker.cjs`: actual web and desktop worker conversion for all six formats and native structural validation.
- `node --test tests/local-mode/password-state.test.cjs`: local/hosted permissions, transactional state, Save As copy intent and after-conversion failure/abort cleanup.
- `NODE_PATH=PLAYWRIGHT_NODE_MODULES node tests/local-mode/password-browser.cjs`: production browser wrong retry/open/edit/encrypted Save/reopen with no uploads/external requests.
- `NODE_PATH=PLAYWRIGHT_NODE_MODULES node tests/local-mode/password-ui.cjs`: common real Keep/Change/Remove, normal Protect and unprotected PDF refusal dialogs.
- `EO_DESKTOP_ROOT=OWN_TEST_ROOT EO_PACKAGE_EXECUTABLE=PACKAGED_EXECUTABLE EO_PLAYWRIGHT=PLAYWRIGHT_CORE node tests/desktop/password-native.cjs`: actual packaged six-format flow, Cancel/Home cleanup, native Save As choices, PDF refusal and password profile scan; needs an unlocked display and the existing PID-scoped native-input helper.

Synthetic random passwords stay in process memory and are not written as test fixtures, logs or command-line arguments. Native fixtures are generated encrypted within the own test root; Remove deliberately writes an unprotected copy. Passwords and contents are never included in failure metadata. See docs/local-passwords.md for recovery, integrity and platform limits.
