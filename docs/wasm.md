# x2t WebAssembly runtime

The x2t WebAssembly runtime provides local document conversion for the desktop app and the browser's local mode. Hosted server mode continues to use DocumentServer conversion services. Local feature detection and runtime failures do not reroute hosted requests.

Detailed measurements, build chronology and superseded validation results through 2026-10-20 are archived in the runtime history. This document records the durable design, release inputs and safety boundaries.

## Runtime roles

ElixirOffice publishes two runtime variants from one patched core source:

- the full runtime opens and saves supported Office and OpenDocument formats and converts legacy files;
- the PDF-only runtime consumes the editor drawing stream and produces PDF for local export and Print.

The release manifests are [the full runtime](../tools/wasm/runtime-release.json) and [the PDF runtime](../tools/wasm/pdf-runtime-release.json). The browser and desktop verify declared files before use. [install-runtime.py](../tools/wasm/install-runtime.py) installs a release, and [manifest.py](../tools/wasm/manifest.py) produces deterministic metadata. Runtime binaries are generated artifacts and do not belong in source commits.

## Conversion model

Each conversion runs in an isolated worker with a fresh module filesystem. The caller writes the input, task XML, fonts and related media into that filesystem, invokes the converter, validates the output, and disposes of the instance. A conversion never reuses x2t global state from another document.

The worker API has bounded inputs, explicit operation identifiers, progress stages and cancellation. A cancelled or failed conversion is incomplete and cannot adopt its destination. The caller validates the expected container or PDF signature before exposing output.

Browser local mode uses this runtime for Open, Download as and Save As. Desktop mode uses the same conversion contract inside its registered document renderer. Each desktop tab owns its worker, document token, destination lease, recovery state and output. Moving a tab between windows keeps that ownership.

## Supported local behavior

The full runtime supports the release's current DOCX, XLSX, PPTX, ODT, ODS and ODP paths. Text and CSV parsing remain explicit UI choices because encoding and delimiter decisions require user input.

Legacy DOC, XLS and PPT files open as converted copies. The original legacy file is never overwritten by an implicit format upgrade. The converted document receives a modern-format name and requires an explicit destination on save.

Download as and Save As issue a destination ticket before conversion. The ticket binds the selected path, format, document and route. It is single-use and is revalidated before the atomic write. A destination already open or reserved by another document is refused.

## PDF export and Print

The PDF-only runtime receives the editor drawing stream plus its referenced images and fonts. Export and Print wait for pending pictures in the originating document before taking the stream snapshot. The resulting job remains attached to that document even if another tab becomes active.

Desktop Print first creates the local PDF, then submits one native print job at a time. The native parent window is captured from the originating document. Cancellation before submission is safe to retry; an uncertain submitted job is not retried automatically.

The app revokes temporary PDF object URLs promptly after the consumer has loaded them. Failed, cancelled and completed native print jobs remove their private temporary directories.

## Fonts and text

Runtime text paths use UTF-8 at the JavaScript boundary. The patch series covers supplementary Unicode in legacy RTF input and output and platforms where ICU wide characters are UTF-32. UTF-16 surrogate handling stays inside formats that define UTF-16 code units.

Bundled fonts are available offline. Optional computer fonts are indexed only after consent, and only readable font files are used. A conversion receives the font files and selection metadata it needs; it does not receive another document's font filesystem.

Missing fonts use the documented metric-compatible fallback set. Local font discovery failure does not disable saving or conversion.

## Build and patch set

[build.sh](../tools/wasm/build.sh) runs the reproducible Emscripten build in the pinned container, applies the ordered patches in [patches](../tools/wasm/patches), and emits JavaScript glue, the Wasm module and compressed variants. Use one work directory for a build series and run containers with the caller's UID and GID.

The patch order is part of the runtime identity. It includes single-module linker fixes, bounded legacy buffers, header static initialization fixes, PDF link UTF-8 handling, Unicode and RTF corrections, ICU wide-character handling, package-integrity rejection and PDF metadata preservation. A release builds the full and PDF-only variants from the same patched core checkout.

Typical commands:

```sh
tools/wasm/build.sh /srv/elixiroffice/build/wasm
python3 tools/wasm/manifest.py --help
python3 tools/wasm/install-runtime.py --help
python3 -m unittest tools/wasm/manifest.test.py tools/wasm/install-runtime.test.py
```

Build outputs, node_modules, container layers and extracted packages are deleted after the task is reported. Release manifests, logs and small verification receipts are retained.

## Output comparison

Container byte equality is not a universal fidelity test. ZIP entry order, generated identifiers and the core modification timestamp can differ without changing document content. Diagnostic comparison may normalize only a uniquely parsed core modification timestamp; it must report that normalization and must not claim raw-byte fidelity.

Release qualification compares:

- conversion success and structural validity;
- document parts after narrowly documented normalization;
- page count, font use and rendered output where applicable;
- save and reopen behavior;
- cancellation and destination safety;
- the unchanged hosted path.

Private documents are checked only through the anonymized aggregate gate. Their names and contents are never copied into logs or source worktrees.

## Converter hardening validation

The converter rejects external XML entities and network resources at product XML reader and canonicalization entry points. The WebAssembly build has no HTTP or FTP conversion backend.

SVG input accepts embedded PNG/JPEG data and same-document references. External file, use, paint and style references are omitted. Archive extraction enforces member-count, per-member, total-size and compression-ratio budgets before allocation. CRC failure aborts extraction and removes incomplete output.

EPUB and package paths reject traversal, device namespaces, empty invalid resources and malformed spines. Optional remote EPUB manifest items are skipped because local conversion cannot fetch them. These checks protect both runtime variants and must be re-run when core archive, XML or SVG code changes.

The PDF page-reorder build guard verifies the original-page identity lookup in the exact core source. Source changes invalidate the guard until the expected implementation is reviewed again.

## Worksheet-bound ODS chart caches

The ODF converter can derive a missing chart cache from a typed worksheet range while retaining the original worksheet formula and ordinary parent link. Generated cache table names avoid worksheet identities case-insensitively, including worksheet sources whose cache is rejected. Literal scatter and bubble domains follow a generated cache table rename.

All series, labels, categories and domains in a chart share one bounded entry budget charged before allocation. Shared domains and categories are charged for each retained OOXML series copy. Oversized worksheet caches keep their source formula; oversized cache-only references are omitted so output has no dangling cache table. An exhausted pivot cache is omitted as a whole.

Source-level and synthetic package evidence lives in the ODS chart packet. A matched WebAssembly release, office-suite reopen and packaged editor remain separate acceptance gates.

## ODF CBC aligned-block padding

ODF password export retains the mandatory full W3C padding block when compressed plaintext is already aligned to the CBC block size. This is a writer correction; it does not change the reader, algorithm selection or password UI.

The source and synthetic encrypted-part evidence is in the CBC packet. A source result does not qualify a runtime manifest: the matched full runtime must pass password save and reopen before release.

## Desktop document contexts

Desktop tabs isolate runtime requests, output, recovery, password state and destinations by registered document identity. PDF export and Print use the originating document after pending pictures settle. A tab move reparents the live editor instead of creating a new runtime or serializing the document.

The shared test harness observes the shell and every registered document view. Capture diagnostics compose the 44-pixel tab strip with the active view and fail if ownership, geometry, scale, opacity or locale changes during capture. Native OS frames are outside those images.

See [desktop tab behavior](desktop-tabs.md) for lifecycle, close and quit, detach, and platform acceptance boundaries.

## Release acceptance

A runtime release is acceptable only when all required gates refer to the same manifest and patched core:

1. build the full and PDF-only variants from the same checkout;
2. verify manifest hashes and loader integrity checks;
3. run public corpus conversion and save/reopen checks;
4. run PDF structure, page and pending-picture checks;
5. run local desktop/browser suites and hosted regression suites;
6. record physical-platform or printer checks separately from synthetic coverage;
7. remove generated build outputs after the report.

A passing source test does not qualify a stale runtime. A passing runtime does not qualify an installer or native package built from different assets.

## 0.3.0 matched runtime qualification

The qualified pair uses core b21f0935c1d733bcdb040d9a80c244ca7e29cd5e and build tools da66e5f4ec49345dd5dfbc8ca8cd7432c3919b42. These immutable build origins remain unchanged when consumer selectors are committed.

| Module | Artifact version | Manifest SHA-256 |
| --- | --- | --- |
| Full | b21f0935c1d7-15333a7f58e5-st | 1775c0b076f51884bbe2295a91a1cc27412bdb607ced33b9ef29476d49669200 |
| PDF | b21f0935c1d7-ece3775f84d9-st | 1387b64c02f3b5808a6a2b897a70616fb94d391d86f3541fe58c94e9087dd0c7 |

Full Wasm is 54,061,087 bytes (Brotli 8,851,442), respectively +0.0531% and +0.0700% against the accepted 0.2.2 baseline. PDF Wasm is 8,898,583 bytes (Brotli 3,147,088), unchanged. All twelve artifacts meet the 2% growth budget.

Actual-runtime checks pass for 30 public baseline conversions, twelve password groups, three integrity controls, eleven RTL fixtures, eight SVG cases and 36 PDF policy controls. Three public ODS chart controls preserve ordered chart values and worksheet identities through plain and protected save/reopen; 24 public encrypted parts pass independent CBC padding, checksum, decompression and XML checks.

Lead-run LibreOffice 24.8.2.1 loads and exports all three public fixtures to XLSX with their ordered chart values and worksheet identities preserved: PASS_WITH_DISCLOSED_DEVIATIONS. An existing owner GUI required a temporary application copy, removed afterwards; the owner instance was untouched. The sandbox prevented startup, so the successful run used no sandbox, a fresh profile and loopback UNO; network isolation is unverified. Endpoint polling increased from 150 to 900 without changing assertions. The revised future runner records this mode and changes only timing in the checker; D did not rerun it natively.

Strict ODF 1.3 schema checks fail on all 27 tested XML parts in both accepted 0.2.2 and new complete exports, which declare ODF 1.2. No regression is shown by this comparison; normative ODF 1.2 validity remains unmeasured. Source-fixture extended-schema checks cover a narrower scope. Raw ingestion results remain 15/18 (three path members ignored with unchanged sentinels); late-archive results remain 9/11, with DOCX/DOCM late CRC acceptance retained for lead review.

PDF browser checks pass six positive variants and three negative controls in each of English and French, with zero page errors. Independent comparison of 180 reordered pages has maximum pixel mean difference 0.0. Actual DPR was 1 in both runs. These PDF checks used retained consumer assets with candidate runtime mapping; the separate rebuilt-SDK gate below verifies the production default.

The actual consumer rebuild passes five SDK and 23 web production tasks, under two CPUs, 4 GiB RAM and a 2048 MiB Node heap. Actual packaging validates both deployed manifests, all twelve artifact hashes, helpers and four editor bundles. A browser using the rebuilt SDK API, shared font service and worker converts DOCX, XLSX and PPTX through the new default runtime with three-argument API calls, no runtime override and no HTTP code rewrite. The four selectors are coherent. Packaging now checks the actual ten-overlay inventory (numbering skips 0003), with regression controls accepting ten and rejecting nine or eleven. Parent gitlinks, desktop packaging and integration remain lead-owned.

## Current limitations

- Browser memory is bounded by the WebAssembly address space and the host's per-tab limits.
- Headless SDK-in-x2t paths, macros and server batch rendering remain hosted features.
- Physical Windows, macOS, Wayland and printer behavior require their own release checks.
- Exact raw bytes are not promised when semantically irrelevant package metadata differs.
- New converter patches require fresh full and PDF-only builds; manifests must never point to mixed core revisions.

### 2026-10-22 — Desktop navigation source candidate

The 0.3.1 shell navigation foundation changes window ownership and optional tabs without changing conversion runtime pins or document serialization. Default A, optional B/C, safe last-close Home and current-family New use the existing opaque document handles, recovery and global cap16. Source tests and private Linux checks are tracked separately from release/package acceptance in [desktop navigation](desktop-tabs.md).

### 2026-10-22 — Equation toolbar SVG source correction

The shared web-apps button templates recognize the existing legacy SVG equation category IDs. No wasm, SDK, font or conversion pin changes are needed;112source template cases pass after104baseline failures. Fresh assembled web assets/packages remain a separate acceptance step. See [equation icons](equation-icons.md).

### Desktop File-menu source candidate (2026-10-22)

The Office-order Backstage slice changes only desktop presentation and native-action dispatch. Existing runtime pins, conversion formats and save/export acknowledgement rules remain unchanged. The private Linux source test verifies Info title persistence in actual DOCX/XLSX/PPTX core XML and cancellation of the shared native-backed Export chooser. This is source-UI evidence, not a new runtime build or package qualification. [Behavior](desktop.md#031-file-backstage-candidate).
### 2026-10-22 — Desktop window state and feedback source slice

Persisted normal window bounds, accessible file-type tabs and quiet successful-open feedback use the existing desktop document ownership and conversion runtime. No wasm/SDK pin or serialization change is made. Source/runtime qualification is recorded in [desktop windows](desktop-tabs.md#window-placement-and-tab-state-031-source-candidate); native/platform and fresh-package gates remain separate.

### Shared desktop start-page source checks (2026-10-22)

The start-page/application-rail slice reuses the existing template/recent renderer and changes no runtime pin, worker lifetime, conversion or save format. Its strict source-capture fix accounts for the trusted0px or44px chrome offset; only visible surfaces are captured, retaining ownership, stable geometry, alpha and scale validation. Actual Linux Home checks and EN/FR capture exit are source evidence, separate from rebuilt packages and physical platform qualification. [Behavior](desktop.md#031-shared-start-page-follow-up).
