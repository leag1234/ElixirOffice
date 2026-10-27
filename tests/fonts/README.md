# System-font integration gates

These explicit gates require public fonts installed on the test host and an owned output directory. No fonts or generated PDFs are committed. They supplement the regular desktop unit suite and existing client-PDF tests; they do not certify native Electron or other operating systems.

Example on development host, from the product worktree:

```sh
export EO_SDKJS=/srv/elixiroffice/wt/system-fonts-Z/sdkjs
export EO_FONT_WORK=/srv/elixiroffice/wt/system-fonts-Z-S2-work
export EO_FONT_TTC=/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc
export EO_FONT_CJK_PRIMARY=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
export EO_FONT_STATIC_VARIANT=/usr/share/fonts/opentype/urw-base35/URWGothic-Book.otf
export EO_FONT_VARIABLE='/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf'
export EO_FONT_ARABIC_REGULAR=/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf
export EO_FONT_ARABIC_BOLD=/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf
node tests/fonts/system-fonts-s2.mjs
node tests/fonts/service-boundaries.mjs
```

system-fonts-s2.mjs uses actual SDK source and the existing desktop Core loader. Its only font-engine replacement is the native-open boundary used to observe manager/shaper/glyph-picker identity; it does not rasterize editor text. The asynchronous global font loader, lazy real-file reads, private index, production selected-font service, FS selection and revocation remain real. The gate requires all fixtures; missing fixtures fail. service-boundaries.mjs verifies the repeated-style selected-budget regression, an epoch change during a read, and sparse129 MiB rejection.

The integration gate writes accepted production-selected snapshots under EO_FONT_WORK/wasm-input. shape-selected.py needs FontTools and uharfbuzz and uses the exact selected collection/instance/axes to generate glyph commands without .notdef:

```sh
python3 tests/fonts/shape-selected.py "$EO_FONT_WORK/wasm-input"
node tests/fonts/wasm-selected.mjs /absolute/path/to/pinned/pdf/runtime "$EO_FONT_WORK/wasm-input/cjk-tc"
pdffonts "$EO_FONT_WORK/wasm-input/cjk-tc/output.pdf"
pdftotext "$EO_FONT_WORK/wasm-input/cjk-tc/output.pdf" -
```

Run each Wasm job in a fresh Node process, as production creates a fresh module. The runner loads only the snapshot's selected font files and native selection/range records. Inspect embedded regional identity, Unicode extraction and rendered output; exit 0 alone is insufficient.

Historical pre-guard nondefault-variable snapshots and js-variable.mjs demonstrate the subset defect. They are negative diagnostics, not supported export paths. verify-variable-outline.py compares the first emitted glyph with an independent FontTools static instance and returns 1 when parity fails. For the pinned native and fontkit writers, Medium/Bold are known FAIL; the production desktop paths now reject those cases. release review excludes nondefault variable system instances from actual registration and resolution; the normal gate checks default/synthetic alternatives, then injects an otherwise unreachable state to verify both defensive export guards. The historical raw negative diagnostics do not use the production eligibility policy. verify-default-policy.py verifies exact embedded default contours and the explicit synthetic-Bold result in the new production snapshots. Do not remove the guard on metadata or visual-name evidence alone.

Arabic/Urdu text extraction remains an open failure. Regional run-language fallback, generated thumbnails and native GUI/ASAR remain unverified even when these gates pass.

After shaping/converting/rendering all release review policy snapshots, run python3 tests/fonts/verify-default-policy.py "$EO_FONT_WORK/wasm-input". The required positive result is exact default contours for Regular/Medium/Bold, identical Medium/Regular pixels and explicit synthetic-Bold ink. The default-only policy is not support for true named-instance instantiation.

## Small bundled fallback gate (S3)

Build with the release driver's existing FontTools4.58.0 pin:

```sh
python3 tools/desktop/fallback-fonts.py --out /owned/fallbacks --cache /owned/font-downloads
python3 tools/desktop/fallback-fonts.py --verify /owned/fallbacks
# Add --offline to rebuild solely from the verified SHA-addressed cache.
```

Set DESKTOP_FALLBACKS to that output for tools/desktop/fonts.sh and themes.sh. The release driver creates it before font generation and resources.py copies its OFL/NOTICE files via --font-source. The generated AllFonts.js and fonts must be exposed together as EO_FONT_ASSETS/{sdkjs/common/AllFonts.js,fonts/}. Existing bundled files must remain unchanged; the production standard set still includes all previous metric/school/UI fonts.

```sh
export EO_SDKJS=/absolute/owned/sdkjs
export EO_FONT_WORK=/absolute/owned/s3-proof
export EO_FONT_ASSETS=/absolute/owned/generated-assets
export EO_FONT_SYSTEM_DIRECTORY=/absolute/owned/public-noto-static-fixtures
node tests/fonts/bundled-fallbacks.mjs
python3 tests/fonts/shape-selected.py "$EO_FONT_WORK/wasm-input"
# For every snapshot directory, use an ABSOLUTE runtime path:
node tests/fonts/wasm-selected.mjs /absolute/pinned/pdf/runtime "$EO_FONT_WORK/wasm-input/arabic-italic"
pdftoppm -png -r 144 -singlefile "$EO_FONT_WORK/wasm-input/arabic-italic/output.pdf" "$EO_FONT_WORK/wasm-input/arabic-italic/render"
# Convert/rasterize all seven cases before this oracle:
python3 tests/fonts/verify-bundled-fallbacks.py "$EO_FONT_WORK/wasm-input"
```

## Pan-CJK packaged fallback gate

Use generated assets that contain the pinned Noto Sans CJK Regular/Bold OTCs and a public system Noto directory. The test fails rather than skipping when required inputs are absent:

```sh
export EO_SDKJS=/absolute/owned/sdkjs
export EO_FONT_WORK=/absolute/owned/cjk-proof
export EO_FONT_ASSETS=/absolute/owned/generated-assets
export EO_FONT_SYSTEM_DIRECTORY=/usr/share/fonts/opentype/noto
node tests/fonts/cjk-fallbacks.mjs
SDKJS="$EO_SDKJS" FONT_TTC=/absolute/pinned/NotoSansCJK-Regular.ttc \
  node tests/client-pdf/writer.test.mjs
```

The first gate runs the real common SDK metadata/picker/preloader used by Word, Sheet and Slides. It requires zero initial CJK transport, exactly one same-origin lazy read of each shared Regular/Bold collection, cache reuse, correct JP/SC/TC/KR ordinals, system-font priority, revocation fallback and selected-font PDF inputs. The writer test embeds an actual collection face, extracts its CJK text and renders both pages with Poppler. Native packaged reopen/layout parity and full installer-size measurements are separate gates.

Public fixtures must include real static Noto Sans Arabic and Sinhala Regular/Bold files. The gate executes the real generated AllFonts, SDK packaged loader/asynchronous preloader/selected service and desktop policy. Only same-origin packaged HTTP transport is mapped to local generated files; external URLs fail. It proves no private bridge reads while consent is off, system priority after enabling, reserved normalized-name collision exclusion and fallback restoration on revocation. Actual PDF-Wasm runs use only production-selected files. The oracle checks every emitted glyph's static contours and actual italic text matrices, nonblank/distinct rendered output, and separately records Unicode extraction.

All seven current Arabic/Urdu/Sinhala exact text-extraction samples FAIL; do not treat conversion/contour/style PASS as extraction acceptance. Native editor/ASAR/other OS/thumbnail and whole-installer sizes remain unverified. Size evidence compares controlled font resources including metadata/previews/notices; codec archive growth is not an installer delta.

## S4 desktop Home overlay

Generate into a fresh owned folder, then compare DOCX with branding/desktop-templates.
The overlay is separate from the unchanged shared server template source:

```sh
python3 tools/desktop/desktop_templates.py --out /absolute/owned/fresh-templates
EO_SDKJS=/absolute/owned/sdkjs node tests/fonts/font-slots.mjs
export EO_DESKTOP_TEMPLATES=/absolute/product/branding/desktop-templates
export EO_FONT_SYSTEM_DIRECTORY=/absolute/owned/public-static-cjk-ttc-fixtures
# Keep EO_SDKJS/EO_FONT_ASSETS and a fresh EO_FONT_WORK as described above:
node tests/fonts/template-coverage.mjs
node --test tests/desktop/desktop-template-overlay.test.cjs tests/desktop/template-system-policy.test.cjs
python3 tests/release/desktop-beta.test.py
```

The classifier gate executes the actual SDK FontClassification.js and CTextPr.GetFontInfo;
it compares every Unicode table value plus hint/language/CS/RTL and independent-CS-style vectors.
The coverage gate uses real indexed static Noto Sans CJK Regular/Bold regional TTC faces,
the actual generated packaged inventory, actual glyph picker and physical style policy.
It verifies24localized profiles, eight off-mode si/ur variants and16safeEnglishCJKfallbacks.
No CJK system font bytes are added to the shipped overlay.

Previews in the overlay were rendered by the actual pinned native converter using that explicit public
font profile; all36pages were visually reviewed and expectedfontfamilies checked in everyPDF.
The exact converter image/profile is in template-sources.json. External reproducible scripts,
PDFs, contact sheets, source/archive checks, size data and independent receipts are under
/srv/elixiroffice/wt/system-fonts-Z-S4-work. Initial failed input/layout attempts are retained.
This is prebuilt native-converter preview evidence; runtime Electron thumbnails, OS/editor fidelity
and general run-language fallback remain unverified. Prior exactscript extraction failures remain open.

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/desktop-system-fonts.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.

## release review r2 resilience and strict bundled inspection — 2026-10-16

Run desktop units with the actual assembled114 assets; the same strict shared
110-payload oracle remains mandatory on both delivery114 and reference110.
font-index-resilience.test.cjs covers real cache prefix/resume and deterministic
changed-file boundaries plus controlled worker deadlines/session failures.
template-system-policy.test.cjs exercises registered main IPC and renderer
pending/ready refresh behavior; system-fonts.test.cjs covers actual installFonts.

index-limits.mjs requires fresh EO_FONT_WORK and public EO_VARIABLE_FONT, and
proves real variable aliases do not consume the eligible budget. bundled-inspection.mjs
requires EO_SDKJS plus a profile JSON path as argv[2] and an output JSON path as argv[3],
checks every declared/physical face with the actual SDK inspectFace and requires
a truncated-font rejection control. External evidence records exact source,
font-tool image, argv/mounts and each standard/raw/full generated asset profile.
Initial harness/tool-image failures remain retained beside corrected fresh runs.
