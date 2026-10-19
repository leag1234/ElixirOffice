# Desktop system fonts — 0.2.2 S1/S2/S3 candidate

Every previously bundled font remains. Computer fonts are added locally, without contacting a font service or uploading font files. Unset desktop settings enable the option; explicit previous declines remain disabled. File > Options keeps the switch and native confirmation when re-enabling. Capture mode does not enumerate or read computer fonts. Server fonts and browser Local Font Access behavior remain unchanged.

The priority is a requested bundled document family or bundled metric substitute, then an eligible system family, then a small bundled fallback. Existing office layout therefore keeps its packaged fonts when the computer also has Arial or Calibri. Full CJK fonts are not added to packages. S3 adds only the small Arabic/Sinhala fallback set described below; six localized templates follow in S4.

This is a source/build/test review candidate, outside frozen 0.2.1. Actual Electron/editor/ASAR, Windows, macOS and Flatpak acceptance remains unverified.

## Private index and bounded reads

A Node worker scans approved system folders and packaged AllFonts metadata. It parses bounded SFNT/TTC names, cmap4/12/13 coverage and named-variable instances. AllFonts positional slots are converted to SDK style bits (bold=1, italic=2). Variant/full-name aliases and the actual style-slot choice follow the existing local loader. release review permits variable system fonts only at their default instance. Nondefault named/weight instances are filtered from both the resolver and actual Core registration; eligible static faces win equivalent slots. Known eligible physical styles precede synthetic fallback. Default named aliases normalize to the collection ordinal, avoiding the native high16 truncation problem.

The private directory has mode 0700; index-v3.json has mode 0600 and at most 32 MiB. It stores identity, hashes, face metadata and compact coverage, without persistent font bytes. The renderer receives opaque handles/content identities without paths. Realpath/root checks, no-follow opening, stat identity and SHA256 protect selected reads. Changed content rotates face handles, so an old frame cannot silently read a new same-size file with stale metadata. Disabling cancels pending work and invalidates handles/read epochs.

Limits are 128 MiB per physical file, 192 MiB per selected-byte cache or virtual-FS job, 2 GiB cumulative bytes read while indexing,5,000 system entries and 64 faces per collection. Pending reads reserve their budget. The worker has a 20-second deadline and 256 MiB JS heap limit. These are individual layer limits, not a process RSS guarantee: renderer/engine/Wasm buffers also consume memory. Oversized files are skipped; selected unreadable or unavailable faces follow normal font-error handling.

One collection shares a main-process read, frame byte promise, editor stream index and selected-Wasm FS file across its faces. No font bytes enter persistent CacheStorage on the local path. Engine data already loaded into a frame may remain until the frame closes. Opening a new frame refreshes the private metadata cache. Discovery failure or an SDK capability mismatch leaves a visible Computer fonts warning and permits packaged-font opening.

## Style, fallback and identity

Eligibility follows the engine-selected slot. If a family's real Oblique/Italic slot lacks an Arabic scalar, its covering Regular face cannot impersonate that slot. The family is rejected for that request; another covering R/B family may synthesize italic. release review explicitly approved correcting the former S1 pure assertion to this stronger engine-parity check.

The desktop adapter protects packaged/metric names, uses complete Unicode normalization, and registers actual system families before use. An optional desktop SDK policy preserves logical style even when a physical style is called Oblique. Glyph fallback caches include policy generation and style. Eligible static full-name variants retain a distinct registered identity through the manager, shaper family-name emission and later PDF lookup. The adapter requires DesktopFontPolicyVersion 1; old compiled SDK assets fail closed.

Character ranges are rebuilt atomically and all picker caches/counters reset. Cmap and script boundaries remain separate because getFontsByString can skip repeated calls inside its LastRange. A bounded set of regional Han choices is preloaded across styles before synchronous glyph lookup. PUA/symbol exclusions and disabled no-squares mode remain intact.

Explicit regional families guide JP/SC/TC/KR selection. With no run-language or regional family context, Han selection is deterministic and defaults to SC candidates. The global picker has no run-language input: mixed-language regional correctness is not certified. Selected native range records include only families actually supplied to the converter; this is not a proof of all contextual native fallback or rendered-thumbnail behavior.

## PDF and variable-instance boundary

The existing production selected-font service recomputes GetFontID after lazy loading, verifies permission/epoch after awaits, and supplies only selected bytes plus font_selection.bin to x2t.wasm. A shared validator separates the low16 collection face from the high16 named instance, bounds-checks tables and derives effective variable weight/style metadata.

Static collection faces and default variable instances are supported by the tested selective path. **Nondefault variable system instances are ineligible in both editor registration and resolution for 0.2.2 (release review).** The policy prefers an eligible static face of the same family/style; otherwise another eligible family or synthetic bold/italic is used. An unavailable named Medium alias resolves to its eligible base family. For Ubuntu Sans, Regular and Medium use default400 and Bold uses default400 with explicit synthetic bold. The editor and PDF therefore share the eligible physical face. Both PDF paths retain defensive rejection if an ineligible instance somehow reaches them. The pinned native and fontkit subsetters lose nondefault contours; fixing static instantiation is a [deferred core backlog item](wasm-production-plan.md), outside0.2.2.

## Evidence

The untouched S1 desktop baseline was 204 tests; S1 desktop regression was216/216; final S2 regression is217/217 with12 focused cases. Historical S1 independent FontTools comparison matched 496 physical cmaps with zero differences; 110 bundled style faces remain. Historical S1 indexing was 666.494ms first observed and 80.292ms cached with 478 hits/no font-byte reread; these are not S2 startup measurements.

S2 uses real installed public Noto Serif CJK 26,286,892-byte TTC, Noto Sans CJK 19,484,784-byte TTC, Ubuntu Sans variable and Arabic R/B fixtures outside git. The integration gate calls the actual renderer font setup before symbol scanning, then executes actual SDK font-info, lazy loader, manager, glyph-picker, shaper and asynchronous global-preloader code. Only native font opening is replaced at that source-test boundary. It verifies cold TC face 3, exclusion of named Bold458752/Medium327680, default-face0/synthetic-Bold policy, physical byte/stream sharing, static alias relookup, logical italic, both defensive variable-export guards and revocation. U+4DB6 is absent from the primary Sans collection and present in Serif; actual mixed Han/Hiragana preloading loads all required regional/style choices before glyph lookup.

The actual pinned PDF module 528e920e4f34-98ab90f5d735-st runs under Node with production-selected FS snapshots, not a full native font inventory. JP/TC outputs embed their correct regional faces, extract their text exactly and render nonblank. Arabic synthetic italic renders joined/slanted with no HarfBuzz .notdef, but Poppler extraction still fails. Independent FontTools comparison confirms the historical raw nondefault failure in both PDF backends. The release review production policy's Regular/Medium/Bold PDFs instead embed exact eligible default contours; Medium matches Regular pixels and Bold has explicit synthetic ink. No native editor screenshot or screen/export parity is inferred from these converter checks.

Gates and reproducible commands are in tests/fonts/README.md. External receipts are in /srv/elixiroffice/wt/system-fonts-Z-S2-work. The independent review receipt and final heads are recorded in the accompanying release acceptance record Installer/package-size deltas remain unmeasured; this slice adds no font payload. The owned Electron runtime still aborts No usable sandbox under normal user namespaces; no sudo, helper-permission change or bypass flag was used. Actual native GUI/ASAR, cross-platform, run-language, thumbnail and Arabic/Urdu extraction gates remain open.

## Small bundled desktop fallbacks — S3

S3 adds four static Regular/Bold files derived from pinned Noto Sans Arabic and Noto Sans Sinhala sources under OFL 1.1. The renamed families, Elixir Fallback Arabic and Elixir Fallback Sinhala, remain distinct from system Noto families so an installed eligible system face can take priority. The normalized fallback namespace is reserved against system aliases, preventing resolver/engine identity collisions. The resolver classifies these four packaged faces as fallback, preserving requested bundled document/metric > system > small fallback.

These fonts remain available with Computer fonts disabled, after revocation and in deterministic capture mode. The real offline AllFonts generator creates Arabic/Urdu and Sinhala character ranges for them. Regular/Bold are physical static faces; Italic/Bold Italic use those same covering faces with the SDK's explicit synthesis. No pre-slanted font file or nondefault variable instance is shipped. Existing 49 families/110 physical files become 51 families/114 files; every one of the 110 existing encoded font-file SHA256 values is retained unchanged.

The build-only helper tools/desktop/fallback-fonts.py uses the release driver's existing FontTools 4.58.0 pin. Source URLs, input/OFL hashes, output font hashes and NOTICE hashes are in tools/desktop/fallback-fonts.json. It downloads only during an explicit build, supports verified offline-cache rebuilding and refuses an existing output directory. fonts.sh and themes.sh verify all four fonts, the manifest, OFL and notices before generating output; unexpected font payload also fails. The release driver builds the fallbacks before fonts, mounts the same source for themes and copies their notices through resources.py. The server font-pack specification is untouched. Exact upstream notices and derivative descriptions are also tracked under tools/desktop/licenses/elixir-fallback-{arabic,sinhala}/.

The four font files total **882,628 bytes**. Controlled font-resource comparisons include the generated AllFonts/selection metadata, previews and new licence notices: raw +1,022,525 bytes; tar+gzip9 +402,284; tar+xz6 +224,888; ZIP deflate9 +406,576; gzip SquashFS +376,832. These are actual resource archive measurements, **not complete installer deltas**. AppImage/deb/NSIS/dmg installers were not built for S3; their exact size deltas remain unverified. Initial 4.54.1 study derivatives have different serialized head/GPOS/GSUB bytes from 4.58.0; every glyph contour, cmap and advance matches. Final evidence and pins use 4.58.0 and repeated offline builds match exactly.

Baseline 217/217 desktop tests passes before S3; current 218/218 and 13 focused cases pass. The actual generated AllFonts, SDK lazy packaged loader, asynchronous preloader and production selected-FS gate passes without system consent/private bridge calls, then verifies eligible Noto system priority, normalized-name collision rejection and restoration after revocation. Seven actual pinned PDF-Wasm jobs use only production-selected files. All samples shape with zero HarfBuzz .notdef; every emitted embedded glyph contour matches its selected static source. Actual italic PDF matrices shear by 0.26 and rendered italic/regular samples differ visibly; the public proof sheet was inspected without visible missing-glyph boxes. This is converter/sample evidence, not a native-editor screen or thumbnail certification.

Arabic/Urdu text extraction remains FAIL. Sinhala sample extraction also FAILS because Poppler inserts spaces inside shaped clusters. These failures remain separate from coverage, visual joining and style proofs. Native GUI/ASAR, Windows/macOS/Flatpak and complete installer deltas remain unverified. Reproducible gates are in tests/fonts/README.md; external evidence is in /srv/elixiroffice/wt/system-fonts-Z-S3-work.

## Desktop Home localization — S4

The 0.2.2 candidate adds a separate branding/desktop-templates overlay: four examples each in Japanese, simplified/traditional Chinese, Korean, Sinhala and Urdu, with 24 DOCX and 24 real native-rendered first-page previews. Shared server availability remains 39 languages; all 316 existing shared template/catalog/provenance files are byte-identical to S3. Desktop assembly merges the overlay into four 45-language catalogs and 360 source/preview provenance records.

Sinhala and Urdu remain available with Computer fonts disabled through the S3 small fallback pack. CJK variants require consent and eligible local fonts covering every requested scalar at the actual engine-selected style. Home and opening use the same check; absent coverage, declined consent, capture mode or an index failure retains English fallback. Consent is rechecked after discovery. Named regional Noto requests can use existing regional OS alternatives, retaining bundled/metric priority, static/default-only variable eligibility and covering-face synthesis.

The coverage oracle now matches the actual SDK GetFontSlot rather than a script heuristic: Sinhala normally uses HAnsi, Arabic uses CS only with the actual CS/RTL conditions, and EastAsia hints/PUA/supplementary cases retain SDK precedence. The generated 9KB range table is pinned to its source SHA256. Full Unicode comparison in three modes, 3,144 Python property vectors and 144 actual CTextPr.GetFontInfo vectors pass. Complex-script bold/italic defaults are independent of Latin flags. Strict primary-face missing diagnostics remain enabled; rendered coverage explicitly uses the generated character picker and its selected physical style. Known French/Armenian primary misses remain tested separately; no existing template bytes were changed to make the checks pass.

Real FontTools-indexed static CJK TTC regional faces plus the current 114-file bundled inventory cover all 24 manifests without missing glyphs. With system fonts off, all eight Sinhala/Urdu profiles remain covered and all 16 CJK choices select English. The S2 actual engine and S3 actual packaged-loader/selected-FS gates still pass after the named-family change. Full desktop regression:222/222; release-driver:25/25, including exact overlay artifacts in both resource/test archives.

Pinned native x2t previews embed each expected regional CJK or renamed Arabic/Sinhala family. Their 36 pages were inspected: letterheads/resumes one page, worksheets/assessments two. Only new variants adjust letterhead line spacing, Urdu decorative anchors/address-frame line spacing, and mandatory end markers; tables, text and images remain. A small reduction of the new resume minimum outer-row height leaves room for its end marker. Provenance records the actual converter image and test-only CJK font profile; no CJK font payload is bundled.

The 24 DOCX total 560,898 bytes and the PNG previews total 725,306 bytes. Including the catalogs, provenance and README, the overlay is 1,403,111 raw bytes; controlled tar-gzip9 is 1,256,256, tar-xz6 901,024 and ZIP-deflate9 1,258,741 bytes. Exact measurements, reproducible commands and receipts are in /srv/elixiroffice/wt/system-fonts-Z-S4-work and tests/fonts/README.md. These are source/preview resource measurements, not whole-installer deltas. This slice does not certify native Electron/ASAR, Windows/macOS/Flatpak, runtime thumbnails, run-language contextual fallback or exact Unicode extraction. S2/S3 Arabic/Urdu/Sinhala extraction failures remain open. No SDK/core/runtime or server font inventory change, integration, package or publication is claimed.

## release review r1 scope — 2026-10-16
This candidate replays the eight qualified S1–S4 product commits onto integrated
product41e4fa6f96. SDK50f1cfdea79d17788160262d991e6938f2981fbc already has
integrated46dfd9b4dc as its direct parent; its seven files are unchanged.
The integrated host-JSON VM fix and five release identity/hook/audit files are
preserved. Documentation retains every integrated main line, with candidate
evidence appended. Earlier checkpoint receipts above remain historical.

Fresh evidence is in review-rebase-Z-work on development host. Desktop units pass224/224
on the actual matched114-font desktop assets, with no profile environment
override, and separately224/224 on the shared110 reference (baseline206/206).
Review found and corrected two test oracles that had assumed the110 reference
even after production assembly of114. A pinned30KB metadata fixture binds all
110 physical payload hashes,49 families,110 physical style slots and583 picker ranges.
Both asset profiles reconstruct the exact shared oracle by physical hash,
preserving all39 shared positives and six negative locales; current delivery
coverage is checked separately. The metadata test retains all110 slots and
allows only the complete four-face fallback extension with pinned output
hashes, physical styles and face ordinals. Changed/missing shared payloads
are explicitly tested and fail closed. These are source/build-unit results,
not packaged desktop acceptance. Runtime source remains unchanged by this fix.
Actual S2/service/S3/S4 gates use the matched114-font desktop profile:
all110 original physical payloads and family/style/face bindings are preserved,
with a recorded numeric-index permutation, plus four fallback faces.
The shared39-template coverage oracle is separately run on its110-font reference.
S4 passes24 physical face profiles, eight off-mode Sinhala/Urdu controls and
sixteen CJK safe-English controls. Classifier3144 boundary and144 actual SDK
vectors, release-driver25 tests, overlay48 hashes and reproducible assembly pass.

Thirteen fresh production-selected selective-Wasm PDFs and rasters pass emitted
contours/style oracles: six S2 defaults/regions and seven S3 fallback selections.
Shaping has zero .notdef for these samples. Default and Medium use the same
eligible variable default; Bold is explicitly synthetic. Five representative
rasters were visually inspected. Exact extraction still FAILS for all seven
Arabic/Urdu/Sinhala S3 samples; S2 Arabic italic also fails exact extraction.
The five CJK/Latin samples extract exactly. These selective-PDF-Wasm results use the
recorded528e920e4f34-98ab90f5d735-st runtime, not a rebuilt full browser converter.
Native desktop, OS consent, installer/ASAR and general script acceptance remain
open. Failed asset-profile/harness/dependency attempts remain retained and
distinguished from corrected fresh runs. No integration, runtime pin or release.

## release review r2 review fixes — 2026-10-16

This candidate follows reviewed r1 without changing SDK font-selection policy,
bundled font bytes, runtime pins or the default-instance-only variable policy.
Computer-font discovery now retains a usable indexed prefix when its 2 GiB
actual-read, 5,000 eligible-face or 32 MiB cache-metadata budget is reached.
Ineligible named variable instances remain available only as safe aliases and
do not consume the eligible-face budget. Partial caches remain marked incomplete.

The worker atomically checkpoints validated records after its first accepted
file and then at bounded file/time intervals. Cold discovery gets one 120-second
deadline per application session; warm/subsequent discovery gets 20 seconds.
A deadline requests cooperative checkpoint/partial completion, with a two-second
termination grace if the worker is unresponsive. A failed discovery stays failed
for the session, including after consent revocation, preventing frame/Home retry
loops. A completed partial catalogue stays usable without automatic rescanning.
Hard termination may lose work since the last checkpoint; a later application
session can reuse the validated persisted prefix.

Home returns the English CJK fallback immediately while discovery is pending
and refreshes its current Home view when the index is ready. Default document
opening continues immediately with packaged fonts; it does not reflow an open
document when discovery completes. Explicit Computer fonts enable can await
discovery. Generation checks prevent stale notifications after revocation and
allow observers to restart after a successful index is invalidated.

Optional caches have a strict record/coverage/type/index schema, bounded
stable-descriptor loading and atomic private 0600 replacement; malformed
optional data rebuilds from fonts. Private cache-directory symlinks remain
rejected. Font roots themselves may be symlinks: discovery canonicalizes them
first, and selected reads require membership in both the indexed and current
canonical root. Outside-target file links and retargeted roots are rejected.
Font reads are bounded, account actual bytes, and reject changing descriptors.

Focused resilience, real registered-main IPC and renderer tests cover prefix
retention/resume, eligible counts, growth/truncation, malformed caches, deadlines,
session failure, pending/null opening and Home refresh/revocation. The public
Ubuntu Sans variable proof retains17 raw faces with2 eligible defaults and15
safe aliases; a cap of2 truncates normally and the next process resumes to3
eligible faces after adding a static face.

Strict SDK inspectFace accepts every tested bundled face without relaxation:
standard desktop114/114 and server110/110 files/faces; public core raw189/195;
standard/school raw110/110; freshly generated full server247/253 and full desktop
251/257. Both generated full sets use the product-pinned font-tool image
88c561d6fb2bb8529df467fc0543becc6323e58d18734136e2396c683afeef96;
a retained first attempt used the native converter image at an unavailable tool
path and failed127. The strict truncated-font negative control still rejects.

F4 and prior qualifications remain: per-run language/context fallback, native
Electron/OS inventories, full browser converter, ASAR/installer and general script
acceptance are unverified. The earlier five exact versus eight failed PDF text
extractions retain their r1 attribution; this resilience fix does not claim new
PDF or native-runtime acceptance. Independent receipts and exact local heads are
in the external system-fonts-fixes-Z-work evidence and the Z bus report.
