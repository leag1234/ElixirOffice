# Browser-side PDF export

**Requirement: PDF export happens in the browser, with the same fonts as on screen, including fonts that only exist on the user's computer (Local Font Access API), without sending either the document or the fonts to the server.**

- **W1 (2026-10-09)** replaces the default writer with native PdfWriter in a lazy wasm worker; JS remains the local fallback. Current architecture, installation and measured gate: `docs/wasm.md` section 14. The sections below retain the earlier JS baseline.
- Part A (§ 0, 2026-10-08): step 1 delivered, Word editor. Code: `sdkjs/common/clientpdf/` and `web-apps/apps/common/main/lib/elixir-clientpdf/` (branches `elixir/cpdf`), tools `tools/client-pdf/`, tests `tests/client-pdf/`.
- Part B (§ 1 to 7, 2026-10-07): the feasibility study and design choice (design A), kept as written, with the prototype paths updated.

## 0. Step 1: what is delivered (Word)

### What the user gets

- **File > Download as > PDF**, the backstage export and **Print** (File > Print, Ctrl+P, quick print) create the PDF **in the browser**. The file uses the fonts of the screen, including the fonts of the computer when "Use my fonts" is on (`docs/localfonts.md`). No request carries the document or a font: the only requests are the two library files (first export only) and the document images, read back from the browser cache (GET).
- Long documents: the "Downloading…" mask shows "Creating the PDF… page n of N"; the work yields to the browser between pages (the interface keeps painting; editing is blocked during the export, as before).
- When something cannot be reproduced in the browser, the server creates the PDF instead (the previous behaviour) and a non-blocking message says why: form fields, a font whose licence forbids embedding (`fsType` restricted or bitmap-only), a font that could not be read or subset, an image that could not be read, more than 3,000 pages, any unknown command of the stream. Never a broken or silently degraded file.
- **File > Options**, group "PDF": switch "Create PDF files in the browser" (default on; off: the server creates every PDF; stored per browser, `localStorage` key `elixir.clientpdf`).
- Unchanged, still on the server: **PDF/A** (Download as > PDF/A: the server's writer is the only one producing PDF/A), "Save copy as" into the storage, downloads requested by the host application (`downloadAs` of the integration API: the host needs a server URL), mail merge, documents in the forms format, the desktop app (its own native writer).

### How it works

| Piece | Where | Role |
|---|---|---|
| Hook | `sdkjs/word/api.js` `_downloadAs` (4 lines) | for a PDF, asks `AscCommon.ClientPdf.canHandle`; if yes, `run` and return |
| Capture | `sdkjs/common/clientpdf/clientpdf.js` (in the Word bundle, ~290 lines) | same steps as the server path (`ToRendererPart`): `CDocumentRenderer`, `DocInfo`, `DrawPage` per page, watermark, headings; page ranges and selection of the print dialog; each page's command bytes go to the writer at once (memory bounded by one page), yield every 40 ms; fonts: `AscFonts.g_fonts_streams` (the bytes the screen uses; a font file not loaded yet is loaded the way the screen does); images: `fetch` of the image URL the screen already loaded (browser cache), JPEG kept as is, other formats decoded by the browser (PNG with alpha, GIF, BMP, WebP), SVG rasterized at 300 dpi of their size on the page; download with `DownloadFileFromBytes`, print through the existing `asc_onPrintUrl` with a `blob:` URL; on an `EOPdf.Unsupported` error the server path is started again with the same options |
| Writer | `sdkjs/common/clientpdf/eo-pdf.js` (~830 lines, loaded on first export) | decoder of the stream (`MetafileToRenderer.cpp` semantics: page state reset per page as sdkjs does, persistent brush state, length-prefixed commands skipped), PDF 1.7 writer: text **by glyph identifier** (the stream carries the glyph ids of the editor's shaper: ligatures, Wingdings/Symbol bullets, complex scripts), `Type0`/`Identity-H` fonts, TrueType subsets (`CIDFontType2`) and CFF subsets (`CIDFontType0C`), TTC faces, variable fonts (named instance), `ToUnicode` from the code points of each glyph (text selectable and searchable), runs of glyphs written as `TJ` with exact positions, synthetic bold (fill and stroke) and italic (shear) as on screen, paths, dashes, joins, clips, opacity, linear and radial gradients, image fills, images with soft masks, URI links, internal links, outline from the document headings, Title/Producer "ElixirOffice", `/Lang`, Flate compression of every stream (`CompressionStream`) |
| fontkit | `sdkjs/common/clientpdf/vendor/fontkit/` | `@pdf-lib/fontkit` 1.1.1, MIT, unmodified, with licence and the list of bundled packages (MIT, BSD-3-Clause, zlib). The UMD build is loaded with the interface's AMD loader hidden. Work-around in the writer: fontkit writes an invalid CFF header `offSize` (11), which poppler rejects; it is set to 4 |
| Interface | `web-apps/apps/common/main/lib/elixir-clientpdf/` (Word) | progress, fallback message, Options switch; strings in 12 languages |

pdf-lib is not used any more (the prototype needed it; it cannot draw by glyph id).

### Results (provisional corpus, 30 documents, 74 pages, 2026-10-08, instance `eo-cpdf` on <dev-host>)

Reference: the PDF the same editor gets from the server for the same command (client path switched off), so the comparison isolates the writer. `tools/client-pdf/bench.mjs` then `tools/client-pdf/gate.sh` (SSIM with `tools/fidelity/compare.py`, 120 dpi).

| Gate | Target | Result |
|---|---|---|
| Mean SSIM client vs server | >= 0.99 | **0.9942** (pages below 0.97: 3, see below) |
| Page-count differences | 0 | **0** |
| Text extractable | `pdftotext` per page gives every character of the server's page | **30/30** documents (99.9% of the words identical; the rest are word cuts and one bullet the server's text lacks) |
| Fonts embedded | all | **all** (22 families: Carlito, Caladea, Liberation, DejaVu, Open Sans, Symbola, OpenSymbol, Asana Math…), all with `ToUnicode` |
| File size | <= 1.3 x server | **0.37 x** overall, at most 0.73 x |
| Requests carrying data during the export | 0 | **0** (the server path sends the command stream: 46 KB for a03) |
| Fallbacks | | 0 |

Times (Chromium, <dev-host>): writer 20 to 333 ms per document (median 57 ms, ~28 ms per page), stream capture 3 to 25 ms, click-to-file 100 to 408 ms (median 135 ms) against 89 to 730 ms (median 117 ms) for the server path on the same machine (no network latency here; through a real network the server path adds the upload of the stream and the download of the PDF). First export: +0.8 MB of libraries (fontkit 0.76 MB minified, writer 30 KB), cached afterwards.

The three pages below 0.97 are differences of the server, not of the browser file:
- `t02` p.2 (0.956): rows of leader dots. The server writes glyph widths truncated to the unit (277 instead of 277.83) and ignores the small position corrections of the stream, so its dots drift (1.7 pt over a line); the browser file keeps the positions of the stream, which are the screen's.
- `a08` p.1 and p.4 (0.963, 0.941): EMF pictures. The server draws the original EMF; the browser has only the SVG conversion the screen shows, rasterized at 300 dpi; text inside these pictures differs slightly in spacing. The browser file matches the screen.

Tests:
- `tests/client-pdf/run.mjs` (Playwright, HTTPS front + plain HTTP address): 29 checks, 0 failed: libraries not loaded at startup; File > Download as > PDF from the menus makes the PDF in the browser; the local test font (Fira Sans, "Use my fonts" on) is the font embedded in the PDF; pdf.js opens it and extracts the text, pdftoppm renders every page, pdftotext gives the text; no request with a body, no request or WebSocket frame carrying document text or font bytes, no request off the origin; corpus document with image, Wingdings bullets and links; Print receives a `blob:` PDF made in the browser; fallback (an image made unreadable) gives a server PDF, the reason `image` and the message; Options switch off gives a server PDF; plain HTTP (not a secure context) still makes the PDF in the browser.
- `tests/client-pdf/writer.test.mjs` (Node, no editor): TrueType, OpenType CFF (`CID Type 0C`), second face of a TTC (Noto Sans CJK), symbol drawn by glyph id and searchable, ligatures (`office`, `ffl`) extracted as letters, gradient, dashes, clip, links, outline, portrait and landscape pages, poppler renders without error; form fields and a missing font raise the expected error codes. 16 checks, 0 failed.
- Startup: see "Startup cost" below.

### Startup cost

A/B on the same instance (`tools/perf/bench.mjs --scenarios load --runs 5 --throttle 1`, 10-page document, <dev-host> under a machine load of ~8 from other builds), branch vs the same commits without the change:

| Median "editable" (ms) | without | with |
|---|---|---|
| cold cache | 1619 | 1608 |
| warm HTTP cache | 1263 | 1289 |
| warm HTTP + code cache | 1156 | 1189 |
| bytes on the wire, cold | 12,225 KB | 12,234 KB |

Differences are within the run-to-run noise (±3% under this load); the startup cost is +9 KB (the capture code in the Word bundle and the interface controller); the writer and fontkit (0.8 MB) load on the first export only.

### Design choice: JS writer (A) or the server's PdfWriter in WebAssembly (B) — decision pending

A parallel study compiles x2t to WebAssembly (lead decision, 2026-10-08). If it works, the browser
export can reuse the server's own C++ `PdfWriter` (option B of § 5) instead of the JS writer. Until
the result, the JS writer is frozen at its current state (no further work on it or on fontkit
subsetting); what is delivered is designed for both:

| Part | Shared by A and B | State |
|---|---|---|
| Routing: Download as PDF, Print, lazy load, progress, errors, server fallback with the reason, Options switch | yes | done (`clientpdf.js`, `elixir-clientpdf`) |
| Capture of the drawing-command stream, page by page, non-blocking | yes: it is exactly the input of `MetafileToRenderer.cpp` | done |
| Font source `ClientPdf.fonts.get(name, style)`: bytes of the screen's font file (server font or local font), face index, synthetic bold/italic flags | yes: B feeds them to `SetFontBinary` of the wasm font manager (§ 3) | done |
| Images (`ClientPdf.getImage`: browser cache, decoded by the browser) | A uses them; B would need the original bytes (same fetch, before decoding) | done for A |
| `PdfBackend` interface (`load`, `create(env)` -> `feed(stream)`, `finish()` -> bytes; `eoUnsupported` errors -> fallback) | yes: B is a second backend, `ClientPdf.registerBackend({id: "wasm", ...})`, `setBackend("wasm")` | done; "js" is the only backend |
| Quality gate (`tools/client-pdf/bench.mjs`, `gate.sh`) and tests (`tests/client-pdf/`) | yes: backend-independent (they look at the downloaded PDF) | done |

Criteria for the decision, to measure on B with this gate: SSIM against the server (B should be ~1.0
by construction), wasm download size (the shipped `drawingfile.wasm` is 10 MB: a writer-only target
could be smaller), export time per page, memory on 100-page documents, and maintenance (A: an
in-house writer that follows the stream format; B: the upstream code, rebuilt with the core). A
already passes the gate on the provisional corpus (above), so B is not needed for the MVP; it would
bring PDF/A, form fields and EMF/WMF in vector form without new code.

### Reproduce

```sh
# instance with the branches (eo.sh up cpdf 8084), HTTPS front for the local-font case:
docker run -d --name eo-cpdf-https --network host caddy:2 caddy reverse-proxy --from https://localhost:8446 --to localhost:8084 --internal-certs
node tools/client-pdf/bench.mjs /tmp/cpdf-bench corpus/provisional      # IDS=a03,t02 to restrict
tools/client-pdf/gate.sh /tmp/cpdf-bench                                 # summary, gate.json, exit 1 on failure
EO_BASE=https://localhost:8446 EO_HTTP_BASE=http://$HOST:8084 node tests/client-pdf/run.mjs
SDKJS=$EO_WORK/wt/cpdf/sdkjs node tests/client-pdf/writer.test.mjs
```

Private real corpus: run the bench and `GATE_FLAGS=--aggregate-only tools/client-pdf/gate.sh` on <build-host> only (outputs stay in `$EO_WORK/fidelity/runs-real`, `chmod go-rwx`). Not run yet: the lead runs it with the next <build-host> deployment (agents do not touch <build-host>).

### Next steps (frozen for A until the wasm study concludes; most apply to either backend)

1. **Real corpus** on <build-host> (aggregate scores only), then the Word reference (`--ref word-desktop`) on the client PDF.
2. **Fonts**: CFF subsets work (the `offSize` work-around should go to fontkit upstream); CFF2 variable fonts fall back to the server; a variable TrueType font uses its named instance (fontkit applies the variation when subsetting: to verify with Ubuntu Sans and a real variable font of a teacher); TTC faces work (face index from the engine); OTF collections of CJK size (20 MB) are read fully by fontkit before subsetting: measure memory. `fsType` "restricted" fonts fall back to the server today: offer instead "embed anyway (your document)" or a substitute, as Word does.
3. **Content**: tiled image fills are drawn stretched (33 occurrences in the corpus, no visible gap; a tiling pattern is the exact form), linear gradients with varying alpha (soft-mask shading), EMF/WMF in vector form (today: the SVG of the screen rasterized at 300 dpi; SVG to PDF paths would keep them vector), form fields (command 162: write AcroForm widgets, today server fallback), comments/annotations and tracked changes in "markup" print mode are drawn as the stream gives them.
4. **Other editors**: PowerPoint and Excel have the same `CDocumentRenderer` stream (`asc_nativeGetPDF` in `slide/api.js`, `cell/api.js`): same writer, a `canHandle` per editor; Excel needs the print-area / scaling options of its print dialog in the capture.
5. **PDF/A**: PDF/A-1b/2b from the same writer (XMP metadata, output intent with an sRGB ICC profile, no transparency for 1b, embedded fonts already complete): then "PDF/A" no longer needs the server.
6. Perf: move the writer to a Worker (font subsetting and Flate are the cost: transferable bytes, the capture stays on the main thread); stream the PDF to the download for very long documents.
7. Maintenance: the stream format is internal to sdkjs; the bench and gate must run at every upstream rebase (docs/upstream.md).

## Private corpus: anonymous ids (rule)

`bench.mjs` and `gate.sh` follow the rule of the fidelity harness (docs/fidelity.md). On a private corpus (`--private`, `EO_PRIVATE_CORPUS=1`, or a path containing `corpus-private`) bench ids are `doc-<hash>`, uploads are named by id, and no file name or title is printed or stored; errors are scrubbed. Shared helper: `tools/client-pdf/anon.mjs`. Test: `node --test tools/client-pdf/test-anon.mjs`. Exported PDFs keep the document's own metadata.

## 1. Summary (study, 2026-10-07)

- **It is feasible, and the hardest part already exists.** The JavaScript engine (sdkjs) can produce, page by page, the document's "stream of drawing commands" (`asc_nativeGetPDF`). Today this stream is replayed by C++ (the server, or the desktop app) to write the PDF. Nothing requires the PDF writer to be C++: a JavaScript writer, or the same C++ compiled to WebAssembly, can replace it.
- **Prototype built** (design A, ~210 lines, pdf-lib library): on 10 documents of the provisional corpus (19 pages in all), PDF produced **in the browser** from the editor's command stream, compared to the server's PDF with `tools/fidelity/compare.py`: **mean SSIM 0.9952, 100% of pages "ok"**, no page-count gap, selectable text, TrueType fonts embedded as subsets. Stream capture: 4 to 14 ms per document; PDF construction: 76 to 147 ms; PDF of 44 to 96 KB (the server: 80 to 86 KB for the same tests).
- **Recommendation: A for the first version** (thin JavaScript writer, driven by the glyph identifiers that sdkjs already provides), with **B (the server's C++ writer compiled to WebAssembly)** as an option if exact parity is wanted on rare cases (PDF/A, encryption, complex gradients/patterns, EMF/WMF). C (browser printing) is only suitable as a fallback. D (sending the drawing stream to the server) **does not meet the requirement**: fallback only.
- Estimated cost: **Word MVP 7 to 9 days**, fonts (including local) 3 to 4 days, other editors and finishing 5 to 8 days. Detail in §6.

## 2. How the PDF is produced today (server)

| Step | Where | Evidence |
|---|---|---|
| The browser requests "Download as PDF" or "Print" | JS | `sdkjs/common/apiBase.js:3103` (`asc_Print` sets `fileType = PDF` then `downloadAs`); printing then opens the server's PDF in an iframe (`web-apps/apps/documenteditor/main/app/controller/Main.js:3100-3121`, `onPrintUrl`) |
| x2t converts the .docx into the internal format ("bin") then calls the PDF rendering | C++ | `core/X2tConverter/src/ASCConverters.cpp:241` (`CPdfFile pdfWriter(pApplicationFonts)`), `:258` (`OnlineWordToPdfFromBinary`) |
| doctrenderer launches **sdkjs in V8**, reopens the document and calls `asc_nativeGetPDF` | C++ + **JS** | `core/DesktopEditor/doctrenderer/doctrenderer.cpp:438` |
| `asc_nativeGetPDF` creates an `AscCommon.CDocumentRenderer`, loops over the pages (`asc_nativePrint` → `DrawPage`) and returns `Memory.data`, the binary command stream | **JS** | `sdkjs/word/api.js:13684` (`asc_nativePrint`), `:13752-13804` (`asc_nativeGetPDF`, `Save_End` at `:13802`); `sdkjs/common/Drawings/Metafile.js:3105` (`CDocumentRenderer`) |
| The C++ rereads the stream command by command and calls `CPdfFile` (`PdfWriter` + `SrcWriter/`) | C++ | `core/DesktopEditor/graphics/MetafileToRenderer.cpp:327` (`ConvertBufferToRenderer`, big `switch`), `core/PdfFile/OnlineOfficeBinToPdf.cpp:~40` |
| Fonts: the writer finds the font file by its **name** in the native font manager (server font folders) | C++ | `core/PdfFile/PdfWriter.cpp:3704-3738` (`GetFontInfoByParams`, `LoadFontFromFile`) |

Breakdown: **layout and stream generation are in JS** (the same engine as the screen), only the **PDF writing** is native. Direct consequence for the requirement: on the server side, the PDF uses the **server's** fonts (and the re-layout happens on the server), so it cannot know the user's local fonts; on the browser side, the stream is the screen's.

### The command stream (format)

Little-endian bytes; a "double" is a 32-bit integer divided by 100,000. Definitions: `sdkjs/common/Drawings/Metafile.js:1622-1745` (`CCommandsType`); reference reader: `MetafileToRenderer.cpp:327-1100`. Commands emitted for our documents: page (200-203), pen (1-4, 7), brush (21-25, 27-32), font (41 name, 42 size, 43 style), text (80 UTF-16 string, **83 text by glyph identifier with its code points**), paths (91-100), image (111, relative path `media/…`), transform (130), clip (121/122 with `0x20`, reset `0x40`), hyperlink (160), internal link (161), information (163), plus (169 bookmarks/headings, 162-166 forms, 204-208 editing) not encountered in the prototype.

Important point: **fonts travel by their name** (`CMetafile.SetFont`, `Metafile.js:2515-2560`, name obtained by `g_fontApplication.GetFontInfo`, hence **the substitute font actually displayed on screen**), and text is drawn glyph by glyph with the glyph identifier computed by HarfBuzz in the editor (`tg`, `Metafile.js:2587`, command 83). In our documents, 1,500 to 4,500 command-83s for 20 to 260 command-80s. The stream therefore already contains the result of "shaping" (ligatures, Arabic, Indic…), which settles Unicode/RTL without a shaping library.

## 3. What already exists in the browser

- **No browser-side PDF writer is shipped in the Word editor.** `asc_Print`/`asc_DownloadAs` go through the server (§2). sdkjs has no SVG rendering of pages (no occurrence of `SvgGraphics`/`SvgWriter`), the screen is a canvas.
- **The `asc_nativeGetPDF` API is already complete in the JS of all editors**: Word (`word/api.js:13752`), Cell (`cell/api.js:10490`), Slide (`slide/api.js:9084`), Visio (`visio/api.js:642`). The writer is therefore reusable for the three suites (excluding the PDF viewer).
- **The shipped WebAssembly already contains the C++ PDF writer.** `sdkjs/pdf/src/engine/drawingfile.wasm` (10 MB, PDF editor/viewer, built by the `core-wasm` target: `build/docker-bake.hcl:135`, `core/.docker/core-wasm.bake.Dockerfile`, emsdk 5.0.4) compiles `PdfFile.cpp`, `PdfWriter.cpp`, `PdfEditor.cpp`, `OnlineOfficeBinToPdf.cpp`, all of `PdfFile/SrcWriter/*` and `MetafileToRenderer.cpp` (`core/DesktopEditor/graphics/pro/js/drawingfile.json:195-203`, `CMakeLists.txt:~475-500`); the strings `CIDToGIDMap`, `FontFile2`, `Identity-H`, `ToUnicode` can be found in it. But **the only exported functions** are reading, forms/annotations (AP), `SplitPages`, `MergePages`, `RedactPage` (`drawingfile.json`, `drawingfile.cpp:17-226`). `SplitPages` returns an in-memory PDF (`CPdfWriter::SaveToMemory`, `PdfWriter.h:66`): **in-memory writing already works in the wasm**. Only an exported "command stream → PDF" function is missing (§5 B).
- **The wasm already knows how to receive fonts in memory**: `SetFontBinary(path, bytes)` (`drawingfile.cpp:49`) feeds the memory storage that the font manager consults before the disk (`core/DesktopEditor/fontengine/FontManager.cpp:121`). The font files of the **screen's fonts** are already in memory in the wasm font engine (`AscFonts.g_fonts_streams[i]`, `data` = pointer into the wasm heap, `AscFonts.GetUint8ArrayFromPointer`, `core/DesktopEditor/fontengine/js/engine/module_js.js:80`, `module.js:85`). **A local font loaded for the screen is in the same place: the export rereads it without sending anything.**
- "Canvas to PDF" printing: the browser would only produce one image per page (non-selectable text, big files): excluded.

## 4. Prototype (design A)

Files (removed with step 1, see git history of `tools/client-pdf/`): `eo-client-pdf.js` (stream decoder + pdf-lib writer, ran in the editor's page) and `proto.mjs` (bench: Playwright opened a .docx in the dev editor, called `asc_nativeGetPDF`, built the PDF in the page, requested the server's PDF via `/converter`). Dev dependencies then: `pdf-lib` (MIT) and `@pdf-lib/fontkit` (MIT).

What the prototype does: decodes the stream; one PDF page per page; paths (lines, curves, closing, fill/stroke, even-odd), colors and opacity, dashes, clipping, transforms (rotation included), text by embedded subset font (bytes taken from `AscFonts` as above), PNG/JPEG images fetched via `fetch` from the document's URL, texture fill (logos), hyperlinks, document title.

Results (dev editor on <dev-host>, 10 documents: administrative a01 a03 a05, association s01 s02 s03 s04 s06 s08, teacher t04; rendering `pdftoppm -r 120`; comparison **client PDF against server PDF** with `tools/fidelity/compare.py` run in a tools container):

| Measure | Result |
|---|---|
| Mean SSIM / "ok" pages / page-count gaps | **0.9952 / 100% / 0** |
| SSIM per document | 0.9929 (a01, a03), 0.9954 (a05), 0.9975 (s01), 0.9966 (s02), 0.9960 (s03), 0.9942 (s04), 0.9957 (s06), 0.9953 (s08), 0.9956 (t04) |
| Stream capture (layout already computed) | 4 to 14 ms |
| PDF construction in the page | 76 to 147 ms (pages 1 to 4) |
| Reference server conversion (x2t) | ~2 s per document (download + conversion) |
| Raw stream size | 20 to 100 KB |
| PDF size | 44 to 96 KB (server 80 to 86 KB on 3 documents measured) |
| Text | selectable (`pdftotext` gives the text), `CID TrueType Identity-H` fonts with ToUnicode |

What this **proves**: the command stream comes out whole from the editor without a server; the necessary font bytes are already in the browser; a short JS writer reaches visual parity on real documents. What it **does not prove**: the cases of §5 marked "to do" (gradients, ligatures by glyph identifier, symbols, EMF/WMF, bookmarks, forms, very large documents, OpenType CFF fonts, TTC, real local fonts: the Local Font Access API is not yet merged, the path to the bytes is the same as for the screen's fonts, see §3).

Gaps found: (1) Wingdings bullets absent in a03 (replaced by the internal symbol font; the text is drawn by code point whereas the stream gives the **glyph identifier**: pdf-lib cannot draw by identifier, an in-house writer can); (2) prototype bug fixed during the study (the texture stayed active for a stroke alone, a05's page frame was missing, 0.955 then 0.9954): the stream keeps a persistent brush state, like the C++ reader, it must be tracked identically.

## 5. Candidate designs

| | A. Drawing stream + JS writer | B. C++ `PdfFile` compiled to WebAssembly | C. Browser printing (SVG/HTML + "Save as PDF") | D. Hybrid: drawing stream sent to the server |
|---|---|---|---|---|
| Meets "browser only, nothing to the server" | **yes** | **yes** | yes (but see limits) | **no** (the stream contains the document text; local fonts would have to be sent too) |
| Feasibility | **proven (prototype)** | probable: the code is already in `drawingfile.wasm`, the emsdk chain exists; only `CPdfWriter` must read images/fonts in memory | partial | immediate |
| Effort | Word MVP 7-9 d; fonts 3-4 d | 12-18 d (new dedicated wasm target, or export in `drawingfile`, in-memory images, tests) | 6-10 d (page SVG engine to write) | 3-5 d |
| Selectable text, embedded fonts | yes, subset via `fontkit` | yes, proven code (TrueType/OpenType/CFF subset via `FontTT*`/`FontOTWriter`) | yes (Chromium); **Safari/Firefox: variable** | yes |
| Vector paths, gradients, clips | yes (gradients to write: 1-2 d) | yes, all | yes | yes |
| Images | PNG/JPEG direct; SVG/EMF/WMF: to convert (the engine already renders them to PNG for the screen) | all native core formats | yes | yes |
| Fonts: TrueType, CFF (OTF), TTC, local | TrueType and CFF via `fontkit` (to test); TTC via `faceIndex`; local: same bytes as the screen | all (already written); local via `SetFontBinary` | via `@font-face` + `blob:`; TTC not handled by `@font-face` without slicing | local fonts to send |
| Unicode / RTL / ligatures | **solved**: the stream carries glyph identifiers | same | to redo (CSS) | same |
| Links, bookmarks, metadata | links yes (prototype), bookmarks/headings to do (command 169) | yes | links yes, bookmarks no | yes |
| Page sizes | exact (size of each page) | exact | `@page`: one size per document, mixed pages (portrait/landscape) fragile | exact |
| Downloaded weight | 0.5 to 1 MB of libraries (or ~100 KB with an in-house writer + `fontkit` subset) | +3 to 5 MB of wasm (estimate: `drawingfile.wasm` is 10 MB with the reader) | 0 | 0 |
| Speed | ~100 ms/page-document | close to native ×1.5 to 3 (to measure) | depends on the browser | fast + network |
| License | MIT (pdf-lib, fontkit, PDFKit); in-house code AGPL of the project | AGPL (the upstream project's code, already in the tree) | n/a | n/a |
| Main risk | fidelity of rare cases (gradients, symbols, EMF) | wasm tuning (FS disabled, 32-bit: very large documents) | control of pagination and headers; no programmatically produced file | violates the requirement |

Why C is ruled out as the main route: sdkjs does not produce DOM/SVG; a page SVG rendering engine would first have to be written (A's stream decoder would be its basis, so one might as well write the PDF). Chromium's printing (Skia PDF) does embed text and web fonts, but: a single `@page size` per document, browser margins and headers to remove, no metadata nor bookmarks, the bytes are **not retrieved** (the dialog decides), and Safari/Firefox produce different PDFs. Usable only as a last-resort fallback ("Print").

Why D is listed: it is the fastest to do (the server writer exists) but it sends the document's content to the server and requires local fonts on the server side: **does not meet the requirement**. To be kept only as an explicit backup path for unhandled cases (PDF/A, encryption), with displayed consent.

## 6. Recommendation and step-by-step plan

**Retained: A (JavaScript writer driven by the command stream), B as an option.** Reasons: proven, delivers fast, light, no build chain, direct access to the font bytes already in memory, glyph identifiers already computed (hence Unicode/RTL without shaping). B remains the path to total parity: it reuses the code that produces the server's PDF, but costs more and weighs more.

Writer: start from the prototype; replace pdf-lib with a thin in-house writer (~1,500 lines) on `fontkit` (subset, `layout` unnecessary) and the browser's compression (`CompressionStream`, or `fflate`), to draw **by glyph identifier**, control the `ToUnicode` and keep the weight low. Alternative to settle in a day of testing: PDFKit (MIT, maintained: 0.20.2 in 2026-09) for ready-made gradients/bookmarks/links.

| Step | Content | Days |
|---|---|---|
| 0. Integration | API `asc_ClientPdfExport(options)` in `sdkjs/word/api.js` (calls the code of `asc_nativeGetPDF`, returns the bytes), File > Export as PDF button and Print wired to it (replaces `onPrintUrl`), chosen pages (`nativeOptions.pages`), server fallback | 1.5 |
| 1. Word MVP | complete decoder (all commands, skip unknown ones cleanly, rather than raise an error), text by glyph identifier, paragraphs/tables/borders/shading, PNG/JPEG images, shapes (paths, clips, rotations, opacity), links, metadata, watermark | 5 |
| 2. Fonts | TrueType and CFF subsets, TTC (`faceIndex`), per-character fallback fonts, symbols (Wingdings/Symbol via glyph identifiers), **local fonts** (bytes read from `AscFonts` as for the screen), the font's `fsType` flag (refuse embedding "installable: no" fonts, warn) | 3 |
| 3. The rest | linear/radial gradients, patterns, tiled textures, SVG/EMF/WMF (render to PNG through the existing image engine), bookmarks/headings (command 169), index/notes, very large documents (per-page splitting, memory), simple PDF/A-1b | 4-6 |
| 4. Other editors | Cell, Slide: same decoder, existing `asc_nativeGetPDF` entries; spreadsheet pagination (print options) | 3-4 |
| 5. (option) B | dedicated `pdfwriter` wasm target: export `ConvertToPdf(stream)` and `SetImageBinary`; if A's gaps justify it | 12-18 |

### Tests

1. Bench `tools/client-pdf/proto.mjs` generalized as a harness mode: `tools/fidelity/run.sh --cand client` produces the candidate PDFs through Playwright and compares them to the **server PDF** then, as today, to the Word reference. Target: mean client/server SSIM ≥ 0.99, no page < 0.97, same page counts; no SSIM regression against the Word reference.
2. Corpus: full provisional (t01-t10, s01-s09, a01-a05), then real corpus (<build-host> `corpus-private/`, never in git).
3. Automatic checks on each PDF: `pdffonts` (all fonts embedded), `pdftotext` (the expected text is there), `qpdf --check`, opening by pdf.js and by `pdftoppm`, link extraction.
4. Font cases: Carlito/Liberation (on the server), a local font added by hand, TTC, OpenType CFF, font with restricted `fsType`, absent font (fallback).
5. Performance: documents of 50 and 200 pages, memory and duration (budget: < 2 s for 20 pages; no interface blocking: spread over pages or in a worker).

### Risks

- **Rare stream cases**: gradients, tiled textures, EMF, forms (162-166), unknown command: the prototype stops on an unknown command, the final version must ignore it and report it.
- **Local font rights**: `fsType` (OS/2) can forbid embedding; a user's local font is their business, but the PDF may circulate: warn and offer replacement.
- **Variable fonts / TTC / WOFF**: Local Font Access returns sfnt (TTF/OTF/TTC), not WOFF; variable fonts require freezing the instance used.
- **Browser memory** on very large documents; pdf-lib has not been maintained since 2022 (the fork `@cantoo/pdf-lib` is), hence the in-house writer.
- **PDF/A parity, encryption, signatures**: not covered by A; keep the server path for these options (and tell the user).
- **Dependency on sdkjs's internal stream**: the upstream may change the format; the decoder must be tested at each upstream update (non-regression test on the corpus), in addition to the usual rebase rule (`docs/upstream.md`).
- Out of scope here: the "local fonts" agent (Local Font Access API) is not merged; the path to the bytes described in §3 is the screen's and must remain true when it is.

## 7. Reproducing

See § 0 "Reproduce" (the prototype commands are superseded).

Runtime availability is discovered once per editor session through runtime/current.json and the selected PDF manifest. Without a runtime, exports use JS directly; no worker failure is needed. The installer updates the pointer after validating the complete release.
