# ElixirOffice desktop beta 2 — draft
The first public beta ships the server version only. This is a development/review draft for the desktop app; do not publish it as a release announcement.

## Candidate improvements: A1–A6

- Offline spell check, supplied thesauri and hyphenation data; dictionaries and their licences are included. Thesaurus coverage follows the 17 available families.
- Periodic local AutoRecover copies, separate from your original file, with interval settings in Options and a restore choice on the next start. Recovered files require an explicit Save to a chosen destination.
- Ctrl+click on validated http/https/mailto links dispatches to the operating system. Unsupported/unsafe URL schemes are blocked.

## Integrated source improvements: D1–D2
- Single-user comments in local documents, spreadsheets and presentations; Word Track Changes with accept/reject. Untouched imported authors remain intact; edited/new comments and new revisions use the configured current editor identity. The desktop name setting is supplied by A6.
- Picture file insertion, clipboard paste and page drop use embedded local resources and wait before Save or AutoRecover snapshots. PNG/JPEG are preserved; GIF/BMP/SVG/WebP are rasterized to PNG, so GIF animation and SVG vector editing are not retained. SVGs with linked resources, active content, filters or excessive complexity must be exported as PNG first.
- Pictures have a 20 MiB byte limit, a decode limit of 16 mebipixels or 32,768 pixels per dimension, and a timeout. External URL requests remain blocked by the existing local CSP; the app explains how to insert the downloaded picture from a file. Permitted local asset URLs can be embedded.
- D1–D2 source is integrated. These features do not enable co-editing, chat, server history, compare/combine, plugins or macros.
- Additional Save As formats: DOCX/ODT/RTF/TXT/PDF, XLSX/ODS/CSV and PPTX/ODP/PDF. Other-format exports preserve the active original and its unsaved changes. CSV exports the active sheet as UTF-8 comma-delimited text.
- Open RTF/TXT/CSV, Office templates, DOCM/XLSM and PPSX as converted modern-format copies. Macros remain disabled.
- Optional desktop AI through an explicitly approved local or HTTPS service, with a native consent dialog and OS-encrypted key storage. AI actions stay hidden until configured; nothing is sent by default.
- Localized offline Help on every OS, author-name settings in Options, embedded local slide media and chart Edit Data in Word/PowerPoint.
- GIF/BMP/SVG/WebP picture support follows the reviewed shared pipeline from session D.

## Candidate improvements: E D3–D4

- Web “convert locally”: PDF export and Print use the client PDF bundle. Word downloads DOCX/ODT/RTF/TXT/PDF, sheets XLSX/ODS/CSV/PDF, slides PPTX/ODP/PDF; office conversions use bundled x2t.wasm. Copy exports preserve unsaved state and the editing format.
- Web local Open also accepts RTF/TXT/CSV, DOTX/XLTX/POTX/DOCM/XLSM/PPSX, and legacy DOC/XLS/PPT as converted DOCX/XLSX/PPTX copies. Downloads identify these copies; the selected source is never overwritten. Macro-enabled documents open as static copies; macros do not run. HTML/XLSB and PDF open/edit remain unavailable.
- Protect Range is available offline in the spreadsheet Review tab in both web local mode and desktop. XLSX save/reopen preserves range and local-user permissions.
- Insert text from file and Edit Links are hidden in local modes; their server-dependent actions remain unavailable. Existing external link refresh stays outside beta 2.
- A wasm-only ICU wide-string fix preserves Unicode in newly enabled TXT/CSV conversions, including supplementary characters. The shared wasm RTF surrogate correction also preserves emoji through export/reopen. Runtime identities and acceptance are recorded in the Session E handoff.

## Server upgrade note

The Rename/storage-copy update changes document keys for This server storage once during upgrade. Documents from This server that are open at deployment lose co-editing continuity; reopen them after deployment before continuing shared editing. Nextcloud keys retain their existing file-id/ETag model.

## Not yet available or still under development

- Not yet available in the desktop app: mail merge (Mailings), available in the server version.
- Compare/combine, version history, password-protected files, plugins/macros, digital signatures, PDF open/edit, external-workbook-link refresh and co-editing are outside the beta2 scope.
- A4–A6 source/package acceptance and the shared D picture/comment/review integration must be reviewed before desktop release.

- Comments, Track Changes and local picture paste/drop (D1–D2) are integrated source changes.
- A4–A6 source is integrated: additional-format Save As/open, consent-gated Word AI, localized Help, embedded slide media, author settings and chart Edit Data are included in private beta2 candidates. Distribution and remaining OS checks still await lead review.
- Browser-local IndexedDB recovery is not implemented by A1–A3.

Packages remain unsigned; macOS arm64 only. Native Windows acceptance and macOS Print/installed association checks remain separate manual tasks. Recovery cannot guarantee edits made after the latest completed checkpoint; the first checkpoint is periodic, not instantaneous. A 512 MiB store limit reports an error rather than deleting older unsaved copies. Keep ordinary manual saves and backups. Existing conversion limitations and the historical 2.45-second warm-start measurement still apply.

Text/CSV imports and exports use UTF-8; alternate text encodings and import delimiter selection are not provided by this candidate. Lossy text/CSV formats cannot preserve Office formatting, other sheets, or embedded objects. Picture types requiring raster conversion become static PNGs. Local AI uses an OpenAI-compatible loopback endpoint such as Ollama; remote AI requires HTTPS and explicit consent. API keys require working OS-encrypted storage; no plaintext fallback is enabled. Model quality and inference performance depend on the selected service.

Desktop AI configuration and tools currently apply to the Word editor. Spreadsheet and presentation editors do not yet load an AI toolset; their AI actions and configuration button remain unavailable.

D3–D4 follow-up uses a common nine-patch core for full/PDF-only runtime builds. Local Word's visible Insert > Object text-file menu is hidden; exports and Print wait for queued pictures. Fresh Linux review AppImage/deb and actual3editor smoke/D4/Unicode pass. New Windows/macOS D4, native Save As/Print chooser and physical printer checks are not claimed; current receipts describe the exact coverage.

PDF limitations: original text editing is not available yet; supported local work is annotations, comments and ordinary form filling, subject to the preservation policy. Tagged PDFs (including browser print and Word export) cannot yet be saved in place; use Save a copy with its preservation warning. PDF AutoRecover is unavailable; save manually. A policy extension is planned with a newly verified runtime.
