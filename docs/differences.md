# ElixirOffice vs LibreOffice and OnlyOffice: key differences

Living document, kept up to date as features land (requested by the test user, 2026-10-05). Only list differences that a user would notice; each line links to the doc or test that backs it.

| Area | ElixirOffice | LibreOffice | OnlyOffice / upstream | Evidence |
|---|---|---|---|---|
| Formula wizard keyboard focus candidate | Functions without arguments start on the existing OK button; argument/range focus retained | Not assessed in this task | Observed inherited view had no initial target for a valid zero-argument function | docs/formula-wizard-focus.md; tests/formula-wizard/ |
| Security hardening candidate | Download token/trust checks, AI proxy origin/auth checks, escaped WOPI/formula text, plain-text base URL and validated cache hash | Not evaluated | Backported selected fixes plus local output validation | docs/security-phase1.md; tests/security/ |
| Desktop Save As (0.2.1 candidate) | Descriptive format dialog, native destination, source-format/folder defaults and explicit loss/overwrite consent in 45 UI languages | Native format and destination controls | Previous local format-button chooser | the accompanying release acceptance record |
| Browser-local Save As (0.2.1 candidate) | Descriptive format and copy-name dialog with keyboard, RTL, theme support and portable filename validation in45 UI languages | Native storage destination | Browser download of a converted copy | the accompanying release acceptance record |
| Local document encryption (H1 candidate) | Six Office/OpenDocument formats; masked open dialog, encrypted Save, explicit Keep/Change/Remove, session recovery disabled after protection; hosted unchanged | Independent encrypted-file interoperability not checked in this task | Local wasm workers previously lacked password options and offline protection UI was disabled | docs/local-passwords.md |
| UI model | Word-identical ribbon (tabs, groups, contextual tabs, KeyTips, backstage) | Own UI (menus/toolbars, optional "tabbed" UI) | Ribbon, but own structure and vocabulary | docs/ui.md |
| Familiar ground for Word users | Title bar with AutoSave switch (the real autosave setting), file name and Saved state, centred command search, Comments, Editing / Reviewing / Viewing and Share; mini toolbar in a table cell in Word's order (font, size, bullets, numbering, styles, bold, italic, underline, highlight, font colour, format painter, borders, shading, tall Insert, Delete, New comment); status bar "2 of 4,378 words" and Display Settings | Own layout, no mini toolbar in tables | Mini toolbar without table commands, no AutoSave switch | docs/ui.md (Familiar ground), tests/ribbon/familiar.mjs |
| Keyboard shortcuts | 201/201 Word shortcut keys the editor can support (Windows), 149/149 (macOS), including Repeat (F4, Ctrl+Y when nothing to redo: the last command, typing included, is applied again to the new selection, one undo step), F2/Shift+F2 move or copy to a place, Spike, Paste Special, edit-place history, AutoText (Alt+F3), double and words-only underline and hidden text (stored in .docx), print preview and comment list keys | Partial, own defaults | Partial (76/171 before our work) | docs/shortcuts.md |
| Browser-reserved shortcuts | Alternatives that reach the page (Ctrl+Alt+Shift+W/T/N/Tab; Ctrl+Alt+Page Down/Up for sheets), installable app (manifest, no tabs in its window), Keyboard Lock requested by the top-level page and applied in full screen, a one-time hint when a reserved key is detected afterwards, a dialog listing the keys and the alternatives, unsaved-changes guard on Ctrl+W | Desktop application: no such keys are taken | Same limits as any web editor; no documented alternatives | docs/shortcuts.md section 17, tests/browserkeys/ |
| AI | Ask from the search box, right click, mini toolbar or "/"; 35 structural tools (styles, lists, tables, TOC, pictures, page setup, header/footer, comments) with a planner and a verification step; results as tracked changes, one-step undo, clear "can't do this, try that" answers; local journal; provider-agnostic, optional | None built-in | Text-oriented AI plugin | docs/ai.md |
| Privacy | No data to the publisher; AI only if configured | No telemetry by default | Upstream has telemetry hooks (disabled in our main editors) | docs/branding.md |
| Local office conversion (W3) | Opt-in six-format browser open/edit/same-format download; explicit confirmation when conversion is unavailable; unsaved local replacement warning; static-only CSP and local media; pinned full runtime required; production packaging verified | Desktop local open/save | Hosted conversion by default | tests/local-mode; docs/wasm.md section 16 |
| AI configuration | Off by default; server variables (`ELIXIR_AI_BASE_URL`, model, key; any OpenAI-compatible endpoint, key never sent to the browser, `make ai-check`) or the user's own service in File > AI (key in the browser only, Ollama presets, "Your text is sent to ..." notice); no AI entry point is shown while off | No AI, or a vendor service chosen by the build | AI plugin with a provider list in the plugin settings (keys entered by the user) | `docs/ai.md` section 7 |
| Spelling correction | Word-like inline flow: right-click on the underlined word gives up to 5 suggestions in bold at the top (one click, one undo step), Ignore All, Add to Dictionary (user dictionary kept in the browser, applied to every document opened there), Language (language at the cursor, recent ones, Set Proofing Language... = the Language dialog), "No Spelling Suggestions" greyed; same menu in table cells and in Presentation text; F7 jumps to the next misspelling and opens it. | Suggestions in the context menu (more of them), Add to the user dictionary; desktop only | Three suggestions + "More variants", Ignore and Ignore all, Add to dictionary in the desktop app only, 250-entry Language submenu | docs/ui.md, `tests/spell/spell.mjs` |
| PDF export (Word) | Download as PDF and Print use the native PDF writer in a lazy WebAssembly worker with selected font files and a persistent server-font cache (3.13 MB brotli) from the editor's own drawing commands: original images, same fonts as the screen (local fonts included), selectable and searchable text, embedded font subsets, links and outline; neither the document nor the fonts go to the server; automatic JS then server fallback with an explicit server reason (form fields, restricted font licence…); PDF/A by the server | Desktop export (own layout engine) | The browser sends the document's drawing commands to the server, which writes the PDF with the server's fonts | docs/client-pdf.md, tests/client-pdf |
| Layout fidelity vs Word | Measured on a corpus; score C tracked in CI | Not measured publicly | upstream baseline C = 55.9 | docs/fidelity.md |
| Fonts of the user's computer | Chrome/Edge over HTTPS: with one click (consent) the editor lays the document out with the fonts installed on the computer (Calibri, Cambria, Wingdings, school fonts), nothing uploaded; PDF files are made in the browser with these fonts (other server-side conversions still use the server fonts) | Desktop app only | Server fonts only in the web editor | docs/localfonts.md, tests/localfonts |
| Language and Borders controls | Word-like Language dialog (Review tab and status bar): current language on top, recently used, search in native and English names, full list with a check on the current one, "Set As Default" (document default) and "Do not check spelling or grammar" (here the spell checking switch: the engine has no per-run no-proofing flag); drop-down with recent languages. Borders button and menu: ten glyphs where the active edges are solid and the others dotted (Bottom, Top, Left, Right, No, All, Outside, Inside, Inside horizontal and vertical), readable at 100% and 150%, light and dark | Language dialog (Tools > Language), borders in the toolbar | 250-entry combo box drawn wider than the window; Bottom, Top, Left and Right borders glyphs all alike | docs/ui.md (First tester feedback), tests/shortcuts/language-borders.mjs |
| Shapes in tables, page breaks at headings | Grouping floating shapes inside a table cell keeps the group in the cell (group, ungroup, undo, saved .docx); a page break before a heading is one "Page Break" paragraph, Backspace merges then removes it and the heading keeps its style and numbering | Group kept in the cell; page break is a paragraph attribute | Group drifted by the cell origin (once off the page); heading lost its style after Backspace | docs/backlog.md F8, F9; tests/layout/layout.mjs |
| Copy and paste of table cells | Cells pasted into cells of a table take the source cell formatting like Word (rotated text, shading, borders, margins, vertical alignment), the target keeps its merges and widths; pasted as a new table or into another document everything is kept, row height rule included; the HTML clipboard carries rotated text and vertical alignment to and from Word | Not checked | Overwrite Cells kept only the text; HTML lost the text direction | docs/backlog.md F11; tests/clipboard/cellpaste.mjs |
| Document views | Word's Read Mode (pages fitted to the window, page keys, Esc), Print Layout, Outline view (Outlining tab, collapse and expand by level, show level, text formatting toggle, a heading moved with its text) and Draft view, with Word's keys and KeyTips | Print, Web and outline (Navigator); no Read Mode | Print Layout and a read-only mode; no outline or draft view | docs/shortcuts.md section 13 |
| Field commands | Ctrl+F9 empty field with its code typed in place, F9 shows the result, Shift+F9 / Alt+F9 codes, Ctrl+F11 / Ctrl+Shift+F11 lock, undoable and saved in .docx (w:fldLock; locked fields of Word files stay locked) | Fields dialog | Field dialog and code toggle; no empty field or lock; w:fldLock dropped when a .docx is edited | docs/shortcuts.md sections 13 and 15 |
| Task panes | Reveal Formatting (Shift+F1), Selection pane (Alt+F10: select, rename, show / hide saved as hidden), offline Thesaurus (Shift+F7) in the language of the text, 17 languages (docs/thesaurus.md), read from the server's dictionary files | Sidebar (Properties, Navigator), thesaurus dialog | No Reveal Formatting or Selection pane; thesaurus as a plugin; hidden objects of a .docx dropped when the file is read | docs/shortcuts.md section 14 |
| Table cell colour | Table Design > Shading recolours the whole cell: paragraph or character shading that only repeated the old cell colour (common in files saved by LibreOffice) is removed with the cell change, in one undo step; other text colours and highlight stay. Word keeps such shading, so the old colour stays behind the text there | Cell background only; paragraph and character backgrounds stay | Cell fill only: the text keeps a band of the old colour | docs/backlog.md F10; tests/tableshade/tableshade.mjs |
| Selection on coloured cells | The selection stays visible on any cell fill: on dark or saturated colours (standard Blue, dark blue, black) the selected area turns lighter instead of the usual light blue tint | Translucent system highlight colour | Translucent blue tint, invisible on a standard Blue cell | docs/backlog.md F12; tests/tableshade/selection.mjs |
| Comments | Word-style balloons in the right margin next to their text (page shifted left, connector line to the selected comment, reply, resolve, edit, delete in the balloon), the Comments pane on demand | Comments in the margin (desktop app) | Comments pane or a floating bubble on the commented text | docs/ui.md (third pass), tests/comments/margin.mjs |
| Ribbon autonomy | Charts edited from the ribbon (Chart Design: styles, Edit Data, Change Chart Type; Format: arrange, size), tables, pictures, shapes, equations, headers and footers too; the properties panel only on "More options" | Sidebar decks | Right properties panel for most objects | docs/ui.md (third pass), tests/ribbon/chart-tabs.mjs |
| Design tab | Themes (color scheme + theme fonts), Style Set gallery, Colors, Fonts (theme font pairs, custom), Paragraph Spacing presets, Watermark, Page Color, Page Borders | Page and paragraph styles, limited document themes | Color schemes and watermark only | docs/ui.md (third pass), tests/ribbon/word-gaps.mjs |
| Insert and References | Cover pages, Quick Tables, live outline of the table while hovering the grid, header and footer galleries; citations and bibliography (APA, MLA, sources kept in the document), index (Mark Entry Alt+Shift+X, Insert Index) | Bibliography database and index (own UI) | Not available (no citations, no index) | docs/ui.md (third pass), tests/ribbon/word-gaps.mjs |
| AutoCorrect | Word's "Replace text as you type" (typo list per language: en, fr, de, es, it, editable, Ctrl+Z restores what was typed) plus capitals, (c), curly quotes | AutoCorrect replacement table | First letter, quotes, dashes; no typo list | docs/ui.md (third pass), tests/ribbon/word-gaps.mjs |
| Selection and windows | Block (column) selection like Word (Alt+drag, Ctrl+Shift+F8 and arrows: copy, cut, delete, character formatting of the block); split window (Ctrl+Alt+S, View > Split: second pane with its own scroll, live) | Block area selection (Edit > Selection Mode, Alt+drag), Window > New Window | No block selection, no split view | docs/shortcuts.md section 15 |
| Mail merge | Word's Mailings tab: recipients from a CSV or XLSX file, Insert Merge Field, Highlight, Preview Results with record navigation, Finish & Merge to one .docx, one PDF or one PDF per record; Alt+Shift+K/N/M/E/F | Mail Merge wizard and toolbar (database or spreadsheet) | Mail merge in the right panel (recipients from a spreadsheet file, URL or storage) | docs/shortcuts.md section 15 |
| Charts from other producers | Axis positions are normalised on import: vertical bars, lines and areas always get a horizontal category axis (openpyxl writes `axPos="l"` on both axes) | Same file draws like Excel | Same file draws like Excel | tests/beta-fixes/chart-axes.mjs |
| Multi-image layout stability | Priority work (see docs/images.md) | Known user pain point | Known user pain point | docs/images.md |
| Performance (Word editor) | 10-page doc editable 1.2 s, typing 27 ms p50 | Desktop app | upstream baseline 1.5 s, 43 ms | docs/perf.md |
| Storage and identity | Your own Nextcloud or Murena Workspace: from the start page (Login Flow v2, app password kept encrypted on the server, revocable; browse, recent, open, save with conflict copy, new, upload) or inside Nextcloud Files (rebranded app), always alongside the server's own storage (never required: New, templates, Open, upload work with no cloud; a location choice appears once connected); your real name on comments, tracked changes and co-editing presence | Local files; WebDAV via the file dialog | Nextcloud/ownCloud/Seafile connectors (inside the storage only); example app with fixed test users | docs/storage.md |
| Marelle school fonts | Ships the 8 national-education Marelle fonts (free, OFL) in the default pack, so teachers' Marelle documents render with the real font | Not shipped | Not shipped | docs/fonts.md § 10 |
| French school cursive fonts | Seyes-ruled school cursive ("Cursif & Lignes") drawn with free Playwrite FR derivatives that keep the original line height and ruled lines; cursive substitutes for script fonts | Own substitution tables (no school fonts) | Falls back to a sans-serif | docs/fonts.md § 9 |
| Spreadsheet keyboard | Every Excel shortcut the editor can serve works on Windows and macOS (152/152 / 169/169 key variants): Repeat (F4, Ctrl+Y), End mode, F8 / Shift+F8 Extend and Add modes, Ctrl+., Ctrl+Shift+*, Ctrl+' / Ctrl+Shift+", Point mode (F2), Function Arguments (Ctrl+A), Paste Special (Ctrl+Alt+V), macOS keys (Cmd+T, Cmd+;, Option+arrows...) | Own defaults, partial Excel keys | Partial (79/141 before our work), no Repeat, End or Extend modes | docs/shortcuts-excel.md section 6 |
| Flash Fill and Quick Analysis | Ctrl+E fills a column from one or two examples (words, initials, whole cells, case, literal text, header row detected, one undo); Quick Analysis button and Ctrl+Q (data bar, color scale, icon set, top 10 %, charts, totals below or to the right, table) | No Flash Fill, no Quick Analysis | None | tests/shortcuts-excel/features.mjs |
| Auto Fill Options | After a fill handle drag a button at the corner of the filled range offers Copy Cells, Fill Series, Fill Formatting Only, Fill Without Formatting and Flash Fill (one column); the fill is undone and redone with the new option, one undo step; no button for Ctrl+D / Ctrl+R or a right-button drag (those have their own menu) | The fill handle fills with the default and has no options button (only a right-button drag menu, without the two formatting options) | None | tests/shortcuts-excel/autofill.mjs |
| Chart galleries by type | Insert > Charts: six small gallery buttons (Column or Bar, Line or Area, Pie or Doughnut, Scatter, Stock or Radar, Combo) with the previews by sub-type (2-D and 3-D), All Charts... opens the full dialog; Recommended Charts and the all-in-one Chart button stay | One "Chart" button with a single long gallery | No bubble, hierarchy (treemap, sunburst), statistic (histogram, box) or waterfall charts in the engine, so no such buttons | tests/shortcuts-excel/chart-galleries.mjs |
| Selection pane (PowerPoint) | Alt+F10, Option+F10 on a Mac, Home > Arrange > Selection Pane...: objects of the slide front first, click (Ctrl adds) selects, the eye hides an object (saved as `hidden` and kept on opening, not drawn, not hit, not shown in the slide show), double click renames, Show All, Hide All, Bring Forward, Send Backward; one undo step each | No Selection pane | No drag and drop reordering in the list, objects inside a group are not listed one by one | tests/slide-views/selection-pane.mjs |
| Sections (PowerPoint) | Home > Slides > Section (Add, Rename, Remove, Remove All, Remove Section & Slides, Collapse All, Expand All); header rows with a collapse arrow in the thumbnails (left or right pane) and in the Slide Sorter; click selects the slides of a section, right click opens the section menu (also Move Section Up / Down); the first slide always starts a section ("Default Section"); deleting or moving the first slide of a section keeps the section with its remaining slides; saved as `p14:sectionLst` and read from PowerPoint files (ids with gaps included); one undo step per command | No sections: the slides are one list | Empty sections are dropped (a section without slides cannot be kept); no sections in the bottom thumbnails layout; the collapsed state is not saved in the file | tests/slide-views/sections.mjs |
| Slide Sorter and Presenter View | View > Slide Sorter: thumbnails grid with drag reorder, copy, multi-select, delete, open (one undo step); the Presenter View shows the next slide beside the notes | Impress has a Slide Sorter | Neither the sorter nor the next-slide preview | `tests/slide-views/run.mjs` |
| Presentation keyboard | PowerPoint keys in text (Ctrl+Up / Down, Ctrl+Shift+Up / Down, Alt+Shift+Up / Down), Ctrl+Alt+5, Regroup (Ctrl+Shift+J), Shift+F4, F6 pane cycling, pen / eraser / laser / hidden pointer and E during the show; tested on Windows and macOS | Own defaults | Missing (19 gaps before our work) | docs/ui.md, docs/shortcuts-powerpoint.csv |

To fill in as work progresses: spreadsheet, presentation, fonts, desktop.

### WebAssembly build baseline (W0)

The experimental converter can now be rebuilt from the integrated core in a
cold build, with versioned artifacts and an input/checksum manifest. The public
38-file corpus matches retained native-exception output after documented
nondeterminism is normalized. This step changes build verification only; see
`docs/wasm.md` section 13 and `tools/wasm/bench/compare_builds.py`.

W1 review: browser PDF discovers the installed runtime once per editor session. Images without it use the JS writer directly; installed runtime versions are selected by an atomic current.json pointer, without editing the backend.

W5 image preparation: new builds install the checksum-pinned browser PDF runtime automatically and serve its 8.89 MB module as 3.13 MB Brotli (3.84 MB gzip), with correct MIME and immutable version caching. Runtime pointers are no-store. Prepared/tested on an own development host image; fresh build-host build and deployment remain lead acceptance. docs/wasm.md section 15.

W4 browser acceptance: public local saves and native PDF pass Chromium/Firefox/WebKit; WebKit local handoff uses file bytes in IndexedDB. Local Font Access is Chromium-only. The100-page native1 GiB profile fails with real OOM in Firefox/WebKit;2 GiB passes all. Native Mac Safari is prepared, not yet run. See docs/wasm.md section18 and tests/browsers/README.md.

D4 Word opening: small measured gain of about 0.3 s on 97 pages; ten pages and typing unchanged. Measurement limits and remaining costs: docs/perf.md section 9.

Single-host server deployment: production image + HTTPS compose, optional AI, persistent state and stopped-volume backup/restore. Upstream packaging remains available. This is a review candidate; native DEB/RPM fresh-install acceptance and the public release source offer remain pending. See [install-server.md](install-server.md).
Linux second-review preview: build-time asset pruning preserves all active editor locales, offline help languages and licences, while static first frames replace 44 large help animations. AppImage 347841399 bytes; DEB 372535118 bytes. Shared ODS object/PDF failure, warm empty start 2.452 s vs 2.2 s target, unsigned packages and unverified installed associations remain disclosed in docs/desktop.md and the accompanying release acceptance record

Windows desktop preview: unsigned x64 NSIS cross-build using a digest-pinned isolated Wine builder. Installer payload/resources/PE/source checks run on Linux; native Windows installation, dialogs, associations and privacy remain unverified pending the owner host. See [Desktop](desktop.md).

Windows desktop guards overlong destination/temp/backup paths and gives recovery guidance for locked or inaccessible saves, retaining original/backup protection. Native owner acceptance remains pending.


macOS desktop preview: Apple Silicon DMG with the same verified standard fonts and reduced multilingual resources; explicit Electron/Chromium notices and isolated packaged test profiles. Actual image acceptance checks source, architecture, icon and complete bundle/resource equality. No Developer ID signature or notarization; Intel, downloaded Gatekeeper and installed associations remain unverified. See [Desktop](desktop.md).

Mac review adds standard native menus, nine Alternate-ranked Office associations with explicit UTIs, supported queued-path validation, removed unused Electron privacy/ATS declarations and disabled-by-default Developer ID/notarization configuration with two V8 entitlements. Quit when the last window closes remains the desktop convention. Temporary sample fixtures prevent tests from changing package inputs. The shared button safely accepts an absent tooltip, avoiding a PowerPoint initialization error without disabling SDK error protection.

Local ODS conversion now preserves both editable charts and their series through
edit/save/reopen, escaping the ampersand title and omitting the empty phantom
image. Private literal cache tables preserve worksheet-bound formulas.
Separate default-color initializations remove pre-existing DOCX nondeterminism;
three unchanged strict corpus runs pass, with only the approved ODS delta.
Desktop previews were rebuilt with the final528 runtime and passed the public ODS95-value/PDF/reopen checks on Linux and macOS. They are deferred to beta2; the first public beta ships the server only. See the accompanying release acceptance record

Beta Mac packaging explicitly signs native code and nested bundles in dependency order with an ad-hoc identity only when publisher identity is null. Both build-tree and DMG copies pass strict deep verification. No signing credentials, extra entitlements or notarization are used.

Desktop review revision: feature-detected preload font consent replaces Local Font Access calls on the desktop only; hosted browser behavior, including cross-origin PDF font permission checks, is unchanged. Shared web Home CSS/Fluent components/two template previews and45shell locales replace the extra toolbar. Native File actions, explicit translated Discard choices and guarded own-window capture mode were approved and integrated; desktop distribution is deferred to beta2.

Desktop Mailings limitation: Not yet available in the desktop app: mail merge (Mailings), available in the server version. The SDK can merge locally, but the desktop bridge does not implement recipient JSON conversion or merged-document output; the offline tab remains hidden.



Shared local D1–D2 review candidates enable single-user comments and Word tracked changes while collaboration/history remain disabled. Local picture clipboard/drop/file paths embed media; PNG/JPEG bytes remain intact and GIF/BMP/safe SVG/WebP become PNG. Arbitrary external URLs remain blocked with a clear message. The configured author setting is A6-owned; web PDF/Print/formats and protection/link work is E-owned. See desktop.md and the draft beta2 notes; no integration yet.
Desktop beta2 A1–A3 candidates add all supplied spelling/thesaurus/hyphenation data with HTTP Range support, separate periodic local recovery copies and next-start restore, and validated native web/mail hyperlink dispatch. Browser-local recovery is not implemented by this group. A1–A3 were approved and integrated; desktop distribution remains beta2. See desktop-beta2-release-notes.md.

Desktop beta2 A4–A6 review candidates add other-format export/copy imports, explicitly consented native AI with encrypted keys, localized offline Help/F1, author preferences, embedded local media and verified Word/PowerPoint chart data editing. Extra picture types share session D’s local pipeline. UTF-8 conversion requires the new private Wasm overlay/pin; no public runtime is replaced by this task. Source and package receipts are recorded in the accompanying release acceptance record No A4–A6 integration yet.


A4–A6 review fixes protect the configured AI model/conversation from extra parameters, verify encrypted key persistence and refuse plaintext storage, hide unsupported spreadsheet/presentation AI settings, and guard numeric Wasm UTF-8 conversion for null/empty input. All 45 shell locale names and new labels are checked against the editor inventory. Help platform evidence explicitly distinguishes all-platform menu units from Linux native acceptance. The guarded full runtime and Linux packages remain private review candidates; no integration yet.

Desktop release engineering: tools/release/desktop-beta.sh orchestrates isolated Linux/Windows/Mac candidate builds from explicit integrated revisions, independently verified full/PDF Wasm releases, artifact checksums and actual packaged test evidence. It adds no editor feature and does not publish. See desktop-release.md for unverified platform gates and machine boundaries.

Local Word/ODT saves distinguish actual history/actions from duplicate layout notifications. Concurrent typing and undo/redo remain unsaved until persisted, including undo back to the original state during the first save. The hosted server keeps its existing permissions and handlers. See desktop.md and tests/desktop/odt-save-state.cjs.

Desktop beta2 A1–A3 candidates add all supplied spelling/thesaurus/hyphenation data with HTTP Range support, separate periodic local recovery copies and next-start restore, and validated native web/mail hyperlink dispatch. Browser-local recovery is not implemented by this group. Further local features remain under the separate A4–A6/D missions; see desktop-beta2-release-notes.md. No integration yet.


### Local modes: Mission F E D3–D4 candidate

Web-local File downloads convert to supported Office/OpenDocument/text formats on this computer, with PDF/Print through the client bundle. Legacy and additional input formats open as modern converted copies; downloads preserve originals and unsaved state. Spreadsheet Protect Range works offline with XLSX permission persistence. Local Insert text from file/Edit Links controls are hidden; hosted behavior stays available. The newly exposed text conversions include a wasm-only ICU UTF-32 bridge so Unicode is preserved. These branches await review; acceptance and runtime pins: release maintainer handoff.

D3–D4 review follow-up: spreadsheet Protect Range is verified in browser local mode and the Linux package. Newly rebuilt native Windows/macOS D4 checks and physical printer dialogs remain unverified. In local Word, both the original text-file button and its visible Insert > Object menu are hidden. Hosted commands remain available.

Desktop Help review candidate: File > Help bypasses the hosted Help panel through a desktop-only native action. All three shared menus guard absent Help panels in every mode; hosted Help permissions are unchanged. Help uses the selected editor UI language with English fallback, independently of document spelling or system locale. Desktop AI disclosure now describes operating-system encryption and never redisplaying the saved key, with45locale English fallbacks; browser localStorage disclosure remains unchanged. Recovery test cleanup checks signalCode before killing its own live child group.

Desktop capture startup rejects malformed requests without an uncaught main-process error dialog: the error is logged and the app exits 1 before an instance lock, browser window or document opens. Normal Mac test launches explicitly isolate user data; capture-only profiles stay inside the requested output folder. No debug or document argument was added to capture mode.

### Storage Rename and folder-aware Save As (review candidate)

Hosted This server and the Nextcloud/Murena connector now rename stored files, preserve their editing identity across callbacks and refuse collisions. Save As selects a destination folder and creates a separate copy, with permission and no-overwrite checks. Native Rename preserves pending edits and changes the subsequent save path; native Save As uses the OS dialog. Browser-local Rename explicitly names downloaded copies, preserving the original selected file. See storage.md section8 and tests/fileops/.

This server example storage uses client-IP/X-Forwarded-For addressing, including explicit useraddress download/history parameters; it does not provide authenticated per-user isolation. The Rename/copy grants preserve this pre-existing model. See storage.md section8.

## Local PDF preview (G1a, awaiting review)

Desktop and browser convert-locally mode can open PDF bytes directly in the bundled PDF editor. View, text search/select/copy, page navigation, ordinary AcroForm filling and comments/annotations operate locally. Original text editing, OCR and PDF-to-DOCX are not enabled. PDF document JavaScript and form URI actions are disabled locally; scripted calculations and validation therefore are not supported. Hosted PDF behavior remains unchanged.

This stage exports PDF copies and supports local printing, while Save to the original stays disabled pending G1b. The existing drawingfile SplitPages writer retains tested pages, basic form values and annotations, but drops document Title/Author/Subject and bookmarks; signatures are invalidated. Copy export asks for acknowledgement of these losses, defaults to a copy name on desktop and rejects the original path or hard-link identity. It never acknowledges the original as saved. The engine still emits upstream Creator/Producer metadata: this is an open G1b/release issue, not a branded writer acceptance. No newly built package is approved by this source-stage report.

Acceptance on public synthetic fixtures: 94 desktop units; real sandboxed Linux Electron source/dev runs with two pages, a text field filled through keyboard input, old/new annotations and author names retained after export/reopen, unchanged original bytes, visible native copy-loss warning cancelled, real native print dialog cancelled (no print); Firefox browser raw open, search two matches, copy both pages, page navigation, form UI input, comment, actual PDF download and fresh reopen, no Node, 170 static GETs and no upload/server fallback/external request. A 250-page 74,391-byte synthetic PDF reached SDK-ready in about 1.2 seconds on development host; this is not a large-image-PDF memory or first-paint benchmark. New native macOS/Windows PDF acceptance and encrypted/signed/XFA cases remain unverified and belong to subsequent gates.

## Initial G1b preservation candidate (superseded by the safety review below)

Local desktop PDFs now use a bounded incremental writer for original Save and Save As. The complete original byte sequence must remain the output prefix. Native Save clears the unsaved state only after atomic persistence acknowledges the unchanged edit history; browser-local Save downloads a copy and keeps the source unsaved state. Autosave remains disabled. Unsupported or protected PDFs are read-only for original saving; copy export retains the explicit protection/property loss warning. Hosted PDF editing is unchanged.

The parsed policy refuses encryption, signature markers (including compressed objects), XFA, non-text form fields, scripted actions, unsupported catalog/annotation structures and linearization markers. Bounds are 128 MiB input, 64 MiB changes, 256 MiB output, 2,000 pages, 200,000 objects, bounded traversal and a 60-second worker deadline. Producer and modification date change intentionally; original Creator, Title, Author, Subject and outline are retained in the public proof. This is a conservative supported subset, not unrestricted PDF editing.

Evidence: 15 actual browser policy cases; eight independent Poppler preservation outputs; classic/compressed object and xref streams; text/highlight/ink annotations and URI links; first/repeated/second-edit/Undo fresh reopen; 250-page public sample; 116 desktop units after the bd2b998 rebase; sandboxed Linux two atomic saves and fresh reopen. Both runtimes were rebuilt from recipe 8b15cde and core 528e920e4f34 with patches 0001–0011: full 528e920e4f34-b84bad726b86-st and PDF-only 528e920e4f34-7e3dabf57ea2-st. D's password integrity (3) and actual workers (12 groups) pass. Hosted smoke and Windows/Mac shortcut scopes pass with zero errors/failures.

Signature/XFA/linearization fixtures test presence refusal, not cryptographic signature validity or conformance. Image-heavy peak memory, original PDF saving on macOS/Windows, physical printing and new release packages are unverified. Native Linux Save As/print acceptance is recorded separately in the task checks. No integration or publication by session A.

## G1b safety review follow-up (2026-10-13)

Original PDF saving now requires both the complete original byte prefix and exact input/output page-count equality. A shared C++ validator is tested with a fault-injected writer that drops/duplicates pages. The native parser inspects stream dictionaries as well as plain dictionaries, and set AcroForm SigFlags cause a signature refusal. Policy remains writable=false before editing and on every failed branch, becoming true only after output parsing and preservation checks pass. Page-root identity is not separately compared.

Current matched runtimes, built from product recipe05d8f7f and core528e920e4f34 plus patches0001–0011:
- Full: **528e920e4f34-bd14d110aa08-st**, manifest SHA256 **0d97c1fcec3355ed9f5d43e52357d3dda197abe35d0ffc1a74c0a0cf17b73964**.
- PDF-only: **528e920e4f34-98ab90f5d735-st**, manifest SHA256 **d9f0109b81130dbadb9f1e8b99e0e024899844a0874784bfc1310bf8fd34d0c6**.
All12 artifact hashes and common source/patch/tool provenance match. The shared page-count guard header is recorded in both manifests. H1 and initial G1b runtime identifiers elsewhere are historical.

Refusal reasons come from the existing45locale catalogs with English fallback and French translations. Desktop and browser-local modes show the reason, original safety and copy offer; cancellation does not falsely label a writable document read-only. Unsupported named destinations, portfolios and automatic catalog actions are explicitly disclosed. The existing copy loss confirmation and original-path/hard-link refusal remain mandatory.

Acceptance:120desktop units;9password-state units;2legal-attribution units;1manifest test; fault-injected C++ guard;23actual native policy cases plus3failed-write false-policy cases; four first/repeated/second/Undo outputs and four classic/compressed annotation/link cases;8independent Poppler appearance/property/outline/order proofs; actual visible browser Save download keeps dirty state,200staticGET/0errors/250pages;3actual French read-only UI cases. D integrity3 and actual six-format web/desktop worker12groups pass on the final full runtime. Hosted own:32793 smoke0errors/fails and win228+14/mac171+13shortcut scopes pass.

Final matched pair in sandboxed Linux source/dev overlay: two atomic original saves/fresh reopen (7091/8681bytes, old/new annotations retained) and3actual native refusal/copy-offer cases pass without focused input. Fresh native SaveAs/print-dialog reruns are UNVERIFIED: test desktop relocked (LockedHint=yes), owner unlock requested; no focused native event sent. Their earlier G1b native results remain recorded as historical evidence, not a fresh-module pass. Existing Help3/fonts native consent/rename/protected-DOCX menu checks passed before this hardening; those hooks are unchanged.

Current development host assembly has18,393 exact hashed resources after removing only own inactive generated runtime versions; all four production editor bundles and45desktop catalogs are present. Linux evidence is a source/dev overlay, not a release package. macOS/Windows original PDF Save, physical printing, image-heavy peak memory and fresh release packages remain unverified. Signature/XFA/linearization samples are marker-presence fixtures, not cryptographic/conformance proofs. Startup deletion of stale .bak/.tmp is deferred: a backup may be the only recoverable original, and safe automatic cleanup requires a durable ownership/recovery ledger.

No integration, push, demo change or publication by session A. Task/checks/evidence: /srv/elixiroffice/wt/pdf-local-A-G1b-work.

- Desktop Close and Quit offer a native Cancel/Discard choice when busy or unresponsive; a confirmed Save/Discard finishes without a second browser unload veto. Unknown state preserves recovery. See docs/desktop.md.

- Home templates: four localized CC0 examples cover 39 font-covered editor languages, including content/previews and proofing tags; six other languages use the English template; English fallback, no French-only default. See docs/home.md.

RTL table visual direction: generated Arabic/Hebrew templates retain standards-correct
w:bidiVisual. The current editor/converter renders their table columns left to right,
where Word mirrors the visual columns. Paragraph/run direction, header anchors and
signature alignment are mirrored. No double-mirroring workaround is applied.
A focused SDK search found paragraph-level CTable.SetParagraphBidi only, with no
bidiVisual table property or obvious hosted setting; an engine investigation is
queued for the next release.

Narrow desktop PDF correction candidate: PDF AutoRecover disabled, detailed manual errors, desktop-only modern wheel scrolling and clear original-text-editing limits. Tagged browser/Word PDFs still require a copy when in-place preservation is refused. Hosted editing and converter/PDF pins are unchanged; see docs/desktop.md for evidence and remaining native checks.



Desktop releases from 0.2.1 identify the application version, unique build number and source revision in About on every platform; ordered candidate/final package metadata prevents ambiguous upgrades. See [desktop build identity](desktop-build-identity.md).

Document security review candidate: scheme checks across main/mobile/embed/forms/diagram hyperlink callbacks and escaped tracked font/style display. Scope, actual synthetic-document evidence and unresolved converter path findings: [security phase2](security-phase2.md).

Phase2 r2 hyperlink policy: www. targets become http:// before validation; unsupported scheme-less document paths show the invalid-link warning and are not opened. Existing anchors/internal slide dispatch remain. Forms integrator saveUrl/fullscreenUrl resolve relative to the page origin, then pass the scheme allowlist. Diagram mobile is included. See [security phase2 policy](security-phase2.md).

0.2.1 template review candidate: nine Arabic italic runs use upright bundled fonts; legacy symbols become ordinary Unicode. Styled-face coverage resolves inherited default/paragraph/character/table properties. The frozen0.2.0 package retains its disclosed Arabic italic limitation; no0.2 rebuild or integration is claimed.

G2 local PDF rotation candidate: the annotation-only local thumbnail menu gains quarter-turn rotation under the verified original-append policy, without activating original-text editing or destructive page management. Hosted viewer menus keep their existing Copy-only behavior. Public Linux browser tests exercise actual annotation controls, form typing, rotation/undo/redo, preserved downloads and fresh reopen in English/French. Independent Poppler checks retain title/author/subject/creator, outline, text, page count and original byte prefix, with consistent rotated appearance. No runtime or pin changes; fresh native platform/package acceptance remains separate.
- Desktop0.2.1 quit review candidate names the active document, uses localized Save / Don't Save / Cancel with explicit platform defaults, and retains conservative busy-close and recovery behavior. See verification scope.

## 2026-10-16 — System fonts S1–S4: isolated review addendum

This dated addendum records the isolated fonts review candidate. Earlier text remains the integrated baseline. Historical source/runtime evidence keeps its original profile; r1 validation and remaining gates are recorded separately. No integration, runtime pin, package or release is implied.

| Area | ElixirOffice | LibreOffice | OnlyOffice / upstream | Evidence |
|---|---|---|---|---|
| Desktop system fonts (0.2.2 S1/S2 candidate) | Private local index; prior declines/bundled metrics preserved; style-aware fallback and selected static-TTC PDF; variable system fonts default-only with static/synthetic alternatives; native acceptance pending; no font upload | Not evaluated in this slice | Previous desktop path opt-in and local exact names could override metric aliases | docs/desktop-system-fonts.md; tests/desktop/system-fonts.test.cjs |
| Desktop Home locales (0.2.2 S4 candidate) | Four examples add six locales with matching native-rendered previews; consent/coverage-gated CJK and offline Sinhala/Urdu; safe English fallback; shared server39 unchanged | Not evaluated in this slice | Earlier desktop templates use the shared39-language offer | docs/desktop-system-fonts.md; branding/desktop-templates |
| Small desktop font fallbacks (0.2.2 S3 candidate) | Arabic/Urdu and Sinhala coverage with system fonts disabled; 882,628 font bytes; all existing fonts retained; synthetic italic; text extraction limits retained | Not evaluated in this slice | Existing desktop bundle lacked complete Arabic italic/Urdu and Sinhala coverage | docs/desktop-system-fonts.md; tests/fonts/bundled-fallbacks.mjs |
| Security hardening candidate | Download token/trust checks, AI proxy origin/auth checks, escaped WOPI/formula text, plain-text base URL and validated cache hash | Not evaluated | Backported selected fixes plus local output validation | docs/security-phase1.md; tests/security/ |
| Desktop Save As (0.2.1 candidate) | Descriptive format dialog, native destination, source-format/folder defaults and explicit loss/overwrite consent in 45 UI languages | Native format and destination controls | Previous local format-button chooser | the accompanying release acceptance record |
| Browser-local Save As (0.2.1 candidate) | Descriptive format and copy-name dialog with keyboard, RTL, theme support and portable filename validation in45 UI languages | Native storage destination | Browser download of a converted copy | the accompanying release acceptance record |
| Local document encryption (H1 candidate) | Six Office/OpenDocument formats; masked open dialog, encrypted Save, explicit Keep/Change/Remove, session recovery disabled after protection; hosted unchanged | Independent encrypted-file interoperability not checked in this task | Local wasm workers previously lacked password options and offline protection UI was disabled | docs/local-passwords.md |
| UI model | Word-identical ribbon (tabs, groups, contextual tabs, KeyTips, backstage) | Own UI (menus/toolbars, optional "tabbed" UI) | Ribbon, but own structure and vocabulary | docs/ui.md |
| Familiar ground for Word users | Title bar with AutoSave switch (the real autosave setting), file name and Saved state, centred command search, Comments, Editing / Reviewing / Viewing and Share; mini toolbar in a table cell in Word's order (font, size, bullets, numbering, styles, bold, italic, underline, highlight, font colour, format painter, borders, shading, tall Insert, Delete, New comment); status bar "2 of 4,378 words" and Display Settings | Own layout, no mini toolbar in tables | Mini toolbar without table commands, no AutoSave switch | docs/ui.md (Familiar ground), tests/ribbon/familiar.mjs |
| Keyboard shortcuts | 201/201 Word shortcut keys the editor can support (Windows), 149/149 (macOS), including Repeat (F4, Ctrl+Y when nothing to redo: the last command, typing included, is applied again to the new selection, one undo step), F2/Shift+F2 move or copy to a place, Spike, Paste Special, edit-place history, AutoText (Alt+F3), double and words-only underline and hidden text (stored in .docx), print preview and comment list keys | Partial, own defaults | Partial (76/171 before our work) | docs/shortcuts.md |
| Browser-reserved shortcuts | Alternatives that reach the page (Ctrl+Alt+Shift+W/T/N/Tab; Ctrl+Alt+Page Down/Up for sheets), installable app (manifest, no tabs in its window), Keyboard Lock requested by the top-level page and applied in full screen, a one-time hint when a reserved key is detected afterwards, a dialog listing the keys and the alternatives, unsaved-changes guard on Ctrl+W | Desktop application: no such keys are taken | Same limits as any web editor; no documented alternatives | docs/shortcuts.md section 17, tests/browserkeys/ |
| AI | Ask from the search box, right click, mini toolbar or "/"; 35 structural tools (styles, lists, tables, TOC, pictures, page setup, header/footer, comments) with a planner and a verification step; results as tracked changes, one-step undo, clear "can't do this, try that" answers; local journal; provider-agnostic, optional | None built-in | Text-oriented AI plugin | docs/ai.md |
| Privacy | No data to the publisher; AI only if configured | No telemetry by default | Upstream has telemetry hooks (disabled in our main editors) | docs/branding.md |
| Local office conversion (W3) | Opt-in six-format browser open/edit/same-format download; explicit confirmation when conversion is unavailable; unsaved local replacement warning; static-only CSP and local media; pinned full runtime required; production packaging verified | Desktop local open/save | Hosted conversion by default | tests/local-mode; docs/wasm.md section 16 |
| AI configuration | Off by default; server variables (`ELIXIR_AI_BASE_URL`, model, key; any OpenAI-compatible endpoint, key never sent to the browser, `make ai-check`) or the user's own service in File > AI (key in the browser only, Ollama presets, "Your text is sent to ..." notice); no AI entry point is shown while off | No AI, or a vendor service chosen by the build | AI plugin with a provider list in the plugin settings (keys entered by the user) | `docs/ai.md` section 7 |
| Spelling correction | Word-like inline flow: right-click on the underlined word gives up to 5 suggestions in bold at the top (one click, one undo step), Ignore All, Add to Dictionary (user dictionary kept in the browser, applied to every document opened there), Language (language at the cursor, recent ones, Set Proofing Language... = the Language dialog), "No Spelling Suggestions" greyed; same menu in table cells and in Presentation text; F7 jumps to the next misspelling and opens it. | Suggestions in the context menu (more of them), Add to the user dictionary; desktop only | Three suggestions + "More variants", Ignore and Ignore all, Add to dictionary in the desktop app only, 250-entry Language submenu | docs/ui.md, `tests/spell/spell.mjs` |
| PDF export (Word) | Download as PDF and Print use the native PDF writer in a lazy WebAssembly worker with selected font files and a persistent server-font cache (3.13 MB brotli) from the editor's own drawing commands: original images, same fonts as the screen (local fonts included), selectable and searchable text, embedded font subsets, links and outline; neither the document nor the fonts go to the server; automatic JS then server fallback with an explicit server reason (form fields, restricted font licence…); PDF/A by the server | Desktop export (own layout engine) | The browser sends the document's drawing commands to the server, which writes the PDF with the server's fonts | docs/client-pdf.md, tests/client-pdf |
| Layout fidelity vs Word | Measured on a corpus; score C tracked in CI | Not measured publicly | upstream baseline C = 55.9 | docs/fidelity.md |
| Fonts of the user's computer | Chrome/Edge over HTTPS: with one click (consent) the editor lays the document out with the fonts installed on the computer (Calibri, Cambria, Wingdings, school fonts), nothing uploaded; PDF files are made in the browser with these fonts (other server-side conversions still use the server fonts) | Desktop app only | Server fonts only in the web editor | docs/localfonts.md, tests/localfonts |
| Language and Borders controls | Word-like Language dialog (Review tab and status bar): current language on top, recently used, search in native and English names, full list with a check on the current one, "Set As Default" (document default) and "Do not check spelling or grammar" (here the spell checking switch: the engine has no per-run no-proofing flag); drop-down with recent languages. Borders button and menu: ten glyphs where the active edges are solid and the others dotted (Bottom, Top, Left, Right, No, All, Outside, Inside, Inside horizontal and vertical), readable at 100% and 150%, light and dark | Language dialog (Tools > Language), borders in the toolbar | 250-entry combo box drawn wider than the window; Bottom, Top, Left and Right borders glyphs all alike | docs/ui.md (First tester feedback), tests/shortcuts/language-borders.mjs |
| Shapes in tables, page breaks at headings | Grouping floating shapes inside a table cell keeps the group in the cell (group, ungroup, undo, saved .docx); a page break before a heading is one "Page Break" paragraph, Backspace merges then removes it and the heading keeps its style and numbering | Group kept in the cell; page break is a paragraph attribute | Group drifted by the cell origin (once off the page); heading lost its style after Backspace | docs/backlog.md F8, F9; tests/layout/layout.mjs |
| Copy and paste of table cells | Cells pasted into cells of a table take the source cell formatting like Word (rotated text, shading, borders, margins, vertical alignment), the target keeps its merges and widths; pasted as a new table or into another document everything is kept, row height rule included; the HTML clipboard carries rotated text and vertical alignment to and from Word | Not checked | Overwrite Cells kept only the text; HTML lost the text direction | docs/backlog.md F11; tests/clipboard/cellpaste.mjs |
| Document views | Word's Read Mode (pages fitted to the window, page keys, Esc), Print Layout, Outline view (Outlining tab, collapse and expand by level, show level, text formatting toggle, a heading moved with its text) and Draft view, with Word's keys and KeyTips | Print, Web and outline (Navigator); no Read Mode | Print Layout and a read-only mode; no outline or draft view | docs/shortcuts.md section 13 |
| Field commands | Ctrl+F9 empty field with its code typed in place, F9 shows the result, Shift+F9 / Alt+F9 codes, Ctrl+F11 / Ctrl+Shift+F11 lock, undoable and saved in .docx (w:fldLock; locked fields of Word files stay locked) | Fields dialog | Field dialog and code toggle; no empty field or lock; w:fldLock dropped when a .docx is edited | docs/shortcuts.md sections 13 and 15 |
| Task panes | Reveal Formatting (Shift+F1), Selection pane (Alt+F10: select, rename, show / hide saved as hidden), offline Thesaurus (Shift+F7) in the language of the text, 17 languages (docs/thesaurus.md), read from the server's dictionary files | Sidebar (Properties, Navigator), thesaurus dialog | No Reveal Formatting or Selection pane; thesaurus as a plugin; hidden objects of a .docx dropped when the file is read | docs/shortcuts.md section 14 |
| Table cell colour | Table Design > Shading recolours the whole cell: paragraph or character shading that only repeated the old cell colour (common in files saved by LibreOffice) is removed with the cell change, in one undo step; other text colours and highlight stay. Word keeps such shading, so the old colour stays behind the text there | Cell background only; paragraph and character backgrounds stay | Cell fill only: the text keeps a band of the old colour | docs/backlog.md F10; tests/tableshade/tableshade.mjs |
| Selection on coloured cells | The selection stays visible on any cell fill: on dark or saturated colours (standard Blue, dark blue, black) the selected area turns lighter instead of the usual light blue tint | Translucent system highlight colour | Translucent blue tint, invisible on a standard Blue cell | docs/backlog.md F12; tests/tableshade/selection.mjs |
| Comments | Word-style balloons in the right margin next to their text (page shifted left, connector line to the selected comment, reply, resolve, edit, delete in the balloon), the Comments pane on demand | Comments in the margin (desktop app) | Comments pane or a floating bubble on the commented text | docs/ui.md (third pass), tests/comments/margin.mjs |
| Ribbon autonomy | Charts edited from the ribbon (Chart Design: styles, Edit Data, Change Chart Type; Format: arrange, size), tables, pictures, shapes, equations, headers and footers too; the properties panel only on "More options" | Sidebar decks | Right properties panel for most objects | docs/ui.md (third pass), tests/ribbon/chart-tabs.mjs |
| Design tab | Themes (color scheme + theme fonts), Style Set gallery, Colors, Fonts (theme font pairs, custom), Paragraph Spacing presets, Watermark, Page Color, Page Borders | Page and paragraph styles, limited document themes | Color schemes and watermark only | docs/ui.md (third pass), tests/ribbon/word-gaps.mjs |
| Insert and References | Cover pages, Quick Tables, live outline of the table while hovering the grid, header and footer galleries; citations and bibliography (APA, MLA, sources kept in the document), index (Mark Entry Alt+Shift+X, Insert Index) | Bibliography database and index (own UI) | Not available (no citations, no index) | docs/ui.md (third pass), tests/ribbon/word-gaps.mjs |
| AutoCorrect | Word's "Replace text as you type" (typo list per language: en, fr, de, es, it, editable, Ctrl+Z restores what was typed) plus capitals, (c), curly quotes | AutoCorrect replacement table | First letter, quotes, dashes; no typo list | docs/ui.md (third pass), tests/ribbon/word-gaps.mjs |
| Selection and windows | Block (column) selection like Word (Alt+drag, Ctrl+Shift+F8 and arrows: copy, cut, delete, character formatting of the block); split window (Ctrl+Alt+S, View > Split: second pane with its own scroll, live) | Block area selection (Edit > Selection Mode, Alt+drag), Window > New Window | No block selection, no split view | docs/shortcuts.md section 15 |
| Mail merge | Word's Mailings tab: recipients from a CSV or XLSX file, Insert Merge Field, Highlight, Preview Results with record navigation, Finish & Merge to one .docx, one PDF or one PDF per record; Alt+Shift+K/N/M/E/F | Mail Merge wizard and toolbar (database or spreadsheet) | Mail merge in the right panel (recipients from a spreadsheet file, URL or storage) | docs/shortcuts.md section 15 |
| Charts from other producers | Axis positions are normalised on import: vertical bars, lines and areas always get a horizontal category axis (openpyxl writes `axPos="l"` on both axes) | Same file draws like Excel | Same file draws like Excel | tests/beta-fixes/chart-axes.mjs |
| Multi-image layout stability | Priority work (see docs/images.md) | Known user pain point | Known user pain point | docs/images.md |
| Performance (Word editor) | 10-page doc editable 1.2 s, typing 27 ms p50 | Desktop app | upstream baseline 1.5 s, 43 ms | docs/perf.md |
| Storage and identity | Your own Nextcloud or Murena Workspace: from the start page (Login Flow v2, app password kept encrypted on the server, revocable; browse, recent, open, save with conflict copy, new, upload) or inside Nextcloud Files (rebranded app), always alongside the server's own storage (never required: New, templates, Open, upload work with no cloud; a location choice appears once connected); your real name on comments, tracked changes and co-editing presence | Local files; WebDAV via the file dialog | Nextcloud/ownCloud/Seafile connectors (inside the storage only); example app with fixed test users | docs/storage.md |
| Marelle school fonts | Ships the 8 national-education Marelle fonts (free, OFL) in the default pack, so teachers' Marelle documents render with the real font | Not shipped | Not shipped | docs/fonts.md § 10 |
| French school cursive fonts | Seyes-ruled school cursive ("Cursif & Lignes") drawn with free Playwrite FR derivatives that keep the original line height and ruled lines; cursive substitutes for script fonts | Own substitution tables (no school fonts) | Falls back to a sans-serif | docs/fonts.md § 9 |
| Spreadsheet keyboard | Every Excel shortcut the editor can serve works on Windows and macOS (152/152 / 169/169 key variants): Repeat (F4, Ctrl+Y), End mode, F8 / Shift+F8 Extend and Add modes, Ctrl+., Ctrl+Shift+*, Ctrl+' / Ctrl+Shift+", Point mode (F2), Function Arguments (Ctrl+A), Paste Special (Ctrl+Alt+V), macOS keys (Cmd+T, Cmd+;, Option+arrows...) | Own defaults, partial Excel keys | Partial (79/141 before our work), no Repeat, End or Extend modes | docs/shortcuts-excel.md section 6 |
| Flash Fill and Quick Analysis | Ctrl+E fills a column from one or two examples (words, initials, whole cells, case, literal text, header row detected, one undo); Quick Analysis button and Ctrl+Q (data bar, color scale, icon set, top 10 %, charts, totals below or to the right, table) | No Flash Fill, no Quick Analysis | None | tests/shortcuts-excel/features.mjs |
| Auto Fill Options | After a fill handle drag a button at the corner of the filled range offers Copy Cells, Fill Series, Fill Formatting Only, Fill Without Formatting and Flash Fill (one column); the fill is undone and redone with the new option, one undo step; no button for Ctrl+D / Ctrl+R or a right-button drag (those have their own menu) | The fill handle fills with the default and has no options button (only a right-button drag menu, without the two formatting options) | None | tests/shortcuts-excel/autofill.mjs |
| Chart galleries by type | Insert > Charts: six small gallery buttons (Column or Bar, Line or Area, Pie or Doughnut, Scatter, Stock or Radar, Combo) with the previews by sub-type (2-D and 3-D), All Charts... opens the full dialog; Recommended Charts and the all-in-one Chart button stay | One "Chart" button with a single long gallery | No bubble, hierarchy (treemap, sunburst), statistic (histogram, box) or waterfall charts in the engine, so no such buttons | tests/shortcuts-excel/chart-galleries.mjs |
| Selection pane (PowerPoint) | Alt+F10, Option+F10 on a Mac, Home > Arrange > Selection Pane...: objects of the slide front first, click (Ctrl adds) selects, the eye hides an object (saved as `hidden` and kept on opening, not drawn, not hit, not shown in the slide show), double click renames, Show All, Hide All, Bring Forward, Send Backward; one undo step each | No Selection pane | No drag and drop reordering in the list, objects inside a group are not listed one by one | tests/slide-views/selection-pane.mjs |
| Sections (PowerPoint) | Home > Slides > Section (Add, Rename, Remove, Remove All, Remove Section & Slides, Collapse All, Expand All); header rows with a collapse arrow in the thumbnails (left or right pane) and in the Slide Sorter; click selects the slides of a section, right click opens the section menu (also Move Section Up / Down); the first slide always starts a section ("Default Section"); deleting or moving the first slide of a section keeps the section with its remaining slides; saved as `p14:sectionLst` and read from PowerPoint files (ids with gaps included); one undo step per command | No sections: the slides are one list | Empty sections are dropped (a section without slides cannot be kept); no sections in the bottom thumbnails layout; the collapsed state is not saved in the file | tests/slide-views/sections.mjs |
| Slide Sorter and Presenter View | View > Slide Sorter: thumbnails grid with drag reorder, copy, multi-select, delete, open (one undo step); the Presenter View shows the next slide beside the notes | Impress has a Slide Sorter | Neither the sorter nor the next-slide preview | `tests/slide-views/run.mjs` |
| Presentation keyboard | PowerPoint keys in text (Ctrl+Up / Down, Ctrl+Shift+Up / Down, Alt+Shift+Up / Down), Ctrl+Alt+5, Regroup (Ctrl+Shift+J), Shift+F4, F6 pane cycling, pen / eraser / laser / hidden pointer and E during the show; tested on Windows and macOS | Own defaults | Missing (19 gaps before our work) | docs/ui.md, docs/shortcuts-powerpoint.csv |

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/desktop-system-fonts.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.

## 2026-10-16 — System fonts r2 candidate

Desktop computer-font discovery retains budget-limited partial results, validates
and checkpoints its private cache, accepts canonical symlink roots, and uses
one cold deadline plus session failure suppression. Home/document opening does
not await pending discovery. See docs/desktop-system-fonts.md for measured font
sets, test profiles and unchanged F4/native/runtime qualifications. No integration.


### Local PDF page-order review candidate
Existing pages can be moved using thumbnail drag, including multiple selected pages and the end boundary, in one undoable action. This is enabled only for a verified writable local PDF while no open/save operation is active. It retains page count and source bytes through incremental saving; page insertion/deletion and original-text editing remain unavailable. Hosted thumbnail behavior is unchanged.
The synthetic public five-page classic/compressed regression covers distinct page identities, MediaBox/CropBox, nested outlines, internal destinations, raster images, text-field values, annotations, XMP and document information, actual English/French gestures, grouped Undo/Redo, repeated save and fresh reopen. Independent Poppler rendering compares every reordered page to its source identity. This does not qualify arbitrary PDF structure or native platform packaging.


### 2026-10-16: page-order baseline blocked by inherited attributes
The expanded baseline fixtures exposed a writer limitation: a grouped move
through a nested Pages tree can retain the original byte prefix and page order
while losing the moved page's inherited MediaBox and Rotate. In the synthetic
case, logical page 4 becomes output page 3 with 652-by-872 instead of 642-by-852
and zero instead of 270-degree rotation. Poppler and pypdf independently confirm
the mismatch. The moved text widget's page reference remains correct, but that
does not make the output safe. That baseline candidate was blocked pending a writer repair or safe structural
refusal.
At that baseline, named-destination PDFs were refused by the
unsupported-catalog policy. The required positive test could not pass; the guard
was retained during diagnosis. Flat classic/compressed tests and Undo/Redo
after actual Save pass. Nested single-move inheritance and widget binding pass;
the full nested/group/repeated baseline qualification did not pass.
The independent structure check uses pypdf==5.9.0, pinned in
tests/pdf-local/requirements.txt; install it in the test environment used by
EO_PDF_STRUCTURE_PYTHON (default python3). Production browser tests retain the
positive assertions for all required structures. Native packages and a runtime
change are outside this review correction.


### 2026-10-16: inherited page-order source repair qualified separately
Core branch elixir/pdf-page-order-core-A (39ca5772b4) resolves the original page
by its stable object reference before copying inherited attributes. With the
separate c81d qualification module, all six classic/compressed/Pages-inherited/
named-destination inputs pass actual single, group and end moves, Undo/Redo after
Save, repeated incremental saves and fresh SDK reopen in English at DPR2 and
French. Independent pypdf verifies every page's Resources, MediaBox, CropBox,
Rotate and unchanged object identity, plus named targets and widget /P binding.
The 90 Poppler page comparisons per language have zero mean pixel difference.
All 278 units and 33 native inspect/edit policy fixtures plus three malformed
jobs pass. Signed/encrypted/XFA/scripted/tagged and malformed Names trees remain
refused. Hosted smoke has no errors; the one previously paired Windows
navigation failure remains, with other Windows and Mac shortcuts passing.
The published runtime pins remain unchanged. Old runtimes lack reorderSafe and
the new local gate denies reordering; the actual six-input old-runtime browser
gate preserves order/history. D must build and qualify one combined 0.2.2
runtime pair with security and RTL changes. This isolated binary is never a
release pin. The neutral source patch and regression recipe are in
tools/wasm/review-patches/; integration remains with the lead.

## 2026-10-16 — RTL tables slices 1–2: isolated review addendum

This dated addendum records the isolated rtl review candidate. Earlier text remains the integrated baseline. Historical source/runtime evidence keeps its original profile; r1 validation and remaining gates are recorded separately. No integration, runtime pin, package or release is implied.

RTL table visual direction: the unintegrated candidate preserves the SDK table
property and mirrors inline cells, anchors and borders while retaining logical
XML order. Its interaction extension adds physical RTL column/ruler dragging,
southwest outline resizing, leading selection zones, scoped arrow/Shift behavior
and inline/floating movement with exact Undo/Redo controls. Pencil/eraser grid
mutations remain blocked. The old full-Wasm converter still fails explicit-false
style overrides and ODT preservation. Scoped native conversion/graphics and
maintained regressions pass; overflowing clipped-text selection, general
hierarchies, Word/full schema and rebuilt browser-Wasm gates remain pending.
The frozen Arabic/Hebrew template overlay is unchanged. See [scope and evidence](rtl-tables.md).

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/rtl-tables.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.

## 2026-10-16 — RTL tables r2 review candidate

RTL interaction fixes now explicitly preserve LTR navigation/bounds/anchors and
gate physical intent on RTL table-stack context. Pointer validation uses revision/
fixed-field checks instead of whole-table JSON. Effective-default direction updates
are history-neutral. Separate core0011 has explicit LTR alignment/ODT indentation
output changes and requires D's0.2.2 rebuild plus corpus roundtrip; current core528
and runtime pins remain. Details and qualifications: docs/rtl-tables.md.

## 2026-10-16 — RTL r3 style compatibility

Resetting default table properties restores an absent direction, including on a
reused object. This avoids exporting a manufactured false through compiled
clipboard styles. Explicit false remains distinct from absence because it can
override inherited RTL. Exact LTR save/clipboard style records and DOCX styles
are compared against SDK50f1; maintained paste tests also require table growth
and style reuse. The full DocumentServer test images serve the local product
route with exact production bundles; this is not backend editing qualification.
Native false-output controls on the existing image still require separate
core0011 and D's rebuilt runtime. See docs/rtl-tables.md.

### release review current-base qualification
The combined unintegrated RTL r2/r3 patch is replayed above Product2b5ec81d37/
SDK9ed10d8f1f/DS c7cd5d0bdb with webapps8aa91ce518 intact. Pre-release review profiles
remain historical checkpoints; current acceptance uses rebuilt desktop sources
and new owned server images. Core528/integration5d02 and runtime gates stay put.

Dialog accessibility 0.2.2 slice 1 review candidate associates shared editor windows and desktop Recovery/Options with visible headings, and supplies real labels for sheet destinations, image dimensions and formula arguments. See verification and platform limits.

### Home language/direction review candidate (0.2.2)

Home adds complete Arabic/Hebrew/Urdu UI catalogs and RTL placement for the start/account/cloud/error flow. Existing English/French geometry/colors and form values are paired against the baseline; mixed filenames and protocol text stay readable without changing stored identities. The native Home component shares logical alignment and BDI name rendering. Evidence is scoped to actual browser-rendered components and public intercepted HTTP fixtures, not live cloud/native/package acceptance. Dark appearance is a separate change. See [Home](home.md) and [tests](../tests/home-ui/README.md).


### Home appearance review candidate (0.2.2)

The Home/start page follows system or app UI light/dark preferences and live changes through shared desktop/web assets. Existing Home tokens provide dark surfaces and readable forms, menus, errors and keyboard focus; document preview images retain their original bytes. Paired geometry/text/data checks preserve item6 language/direction behavior. Browser component evidence covers actual rendered styles and public fixture handlers, with no native/cloud/backend/package acceptance. See [Home](home.md#home-appearance-review-candidate-022).


release review light-appearance clarification: this candidate also improves contrast on the hosted start page and the shared desktop light Home. The light `--border-strong` changes from `#c9c9cf` to `#85858d`, and `--text-3` from `#85858d` to `#6b6b73`. Primary buttons and selected location options now use `--accent-fill` (and its border/hover tokens) rather than the previous direct accent fill. These are visible accessibility contrast improvements to the light appearance as well as support for dark surfaces.

## 2026-10-16 — Hosted PDF wheel candidate

The shared PDF viewer gains modern hosted vertical/Shift-horizontal wheel and
accumulated Ctrl/Meta zoom with desktop thresholds. Actual Chrome/Firefox tests
correct missing scrolling and legacy axis/zoom behavior. Offline binding and
desktop source remain unchanged; no runtime pin/package/release change.
[Qualification and limits](pdf-wheel.md).

## 2026-10-16 — Z6 server template verification

A's Arabic-script upright rule already applies to the shared server template
set. Four DOCX/four native PNG regenerate byte-identically; all156 offered
templates have zero missing characters with the actual mapped server fonts.
The coverage helper now follows declared filenames rather than assuming numeric
index order. No template/font/runtime/release data changes; existing layout
limits remain. [Qualification](server-template-coverage.md).

Desktop opening now isolates unreadable recent-file metadata, retries transient EBUSY once, and uses45-language OPEN guidance with path-free local error codes. Issue4 scope and checks.

## Desktop feedback review candidate (2026-10-16)

Cancelled Save/PDF operations clear transient feedback while preserving warnings
and real errors. Word reserves its theme-sized zoom track width. See
[scope and tests](desktop-status-feedback.md).

Desktop0.2.1-rc.5 review candidate: Office-compatible native file shortcuts reach their desktop commands from a focused editor iframe, and desktop/browser-local mode suppresses browser-reserved-key advice. Hosted behavior is unchanged. Linux routing evidence and native/platform limitations: [Desktop](desktop.md).

Windows follow-up isolates failed recent preference writes from document operations, tolerates unreadable computer font entries, and brands native consent without moving user data. UNC aliases retain the existing identity policy. Validation.

Desktop notification/menu follow-up: Windows/Linux hide the duplicate native menu bar without dropping menu accelerators; macOS keeps its app menu. Informational toasts dismiss after eight seconds, pause on hover/focus, and retain accessible announcements. Errors, warnings and backstage operation details persist. See [desktop behavior](desktop.md#desktop-menu-and-notification-behavior).


Desktop File > Close adds the named Save / Don't Save / Cancel flow, including ticketed Save As for untitled documents and a fresh state check before Home. The entire desktop Open zone is a labeled keyboard button with CSS width/focus and preserved dropping. Evidence

## Picture Layout Options keyboard review candidate (2026-10-16)

F6 reaches the selected picture's Layout Options button. The shared Word
flyout retains focus across wrapping and radio changes, while Escape returns
to the document. The SDK/runtime and existing selection/edit predicates are
unchanged. [Qualification and inherited Arabic menu limit](image-layout-keyboard.md).

## Desktop Options focus

Options focuses its first recovery control before delayed preferences finish
loading. Escape, Cancel and Save return focus to the existing document input;
a newer dialog, control or document keeps focus. [Behavior and scope](options-keyboard.md).


Windows desktop saves use bounded retries and a guarded backup/in-place fallback for persistent replacement refusals. A retained original backup supports recovery when restoration cannot be confirmed; the fallback has a documented non-atomic crash window. Computer font discovery keeps readable system, per-user and locally registered faces available when individual files fail. See [Windows file access](windows-file-access.md).

Repeated Windows saves no longer flush their backup through a read-only handle. A genuine backup-flush failure still stops before changing the original; Linux/macOS behavior remains equivalent. [Details](windows-file-access.md).

Windows retry cancellation now reaches native writes and forced close waits for cleanup or restoration. Verified rollback removes the backup; uncertain restoration names only the retained backup and requires a close acknowledgement. Font indexing can fall back to bounded current-user and machine registry queries when PowerShell is unavailable. Linux/macOS save and font behavior remains equivalent. [Details](windows-file-access.md).


## Translated local password confirmations

Local password choices and the warnings before exporting an unprotected copy or removing protection follow the editor language, with English fallback. No or Cancel preserves protection and stops the operation. Existing conversion, recovery and save safeguards remain in place. [Behavior](local-passwords.md).

Guided feature tips defer while editor modal dialogs or AI panels are open, preserving normal dismissal and warning messages. Optional tip titles no longer display an absent value or accumulate New labels. [Behavior](guided-tips.md).

### Desktop vector printing correction

The desktop print path uses a hidden, file-backed PDF viewer with an explicit document-ready check before the operating system's print dialog. This preserves vector text and shapes without a full-page raster conversion. Cancellation, timeouts and helper failures remove temporary document files and leave the editor open. Linux native Print to File output is checked for complete selectable text, page geometry and matching rendered pixels on Office output, a 300-page report and rotated pages. Native macOS, Windows and physical-printer checks remain pending; this correction is not a release acceptance claim.

Converter hardening candidate: product XML readers and canonicalization disable external entity and network loading; SVG images accept embedded PNG/JPEG and references stay within the same SVG. Archive decompression has count, size and ratio budgets with fatal CRC errors, while optional remote EPUB manifest entries are skipped. Native synthetic controls pass, including local text-path objects, empty-spine rejection and cleanup of CRC-failed output. Extended local drive roots normalize while UNC/device namespaces fail closed; native Windows long-path I/O remains unqualified. Final full/PDF WebAssembly and corpus gates are pending. See [converter validation](wasm.md#converter-hardening-validation).

### Quick Access icon contrast

Header buttons give monochrome Fluent icon paths the theme header color, including Classic Light and dark themes. Ribbon and colored icons keep their own color roles. Disabled controls remain disabled and visually distinct. [Behavior and checks](quick-access-contrast.md).

### Stable document-page shadows

Word page shadows retain their translucent CSS color through theme changes and draw against a fresh canvas background. Repeated document repaints no longer accumulate a darker margin. Themes without a shadow keep their existing appearance; document layout and exported output are unchanged. [Behavior and regression](page-shadows.md).

### Native print choice feedback

The desktop hides its floating status panel while the system print dialog owns the choice, preserving the accessible announcement and restoring submission, cancellation or error feedback. Other file-choice feedback is unchanged. [Behavior](desktop.md#native-print-choice-feedback).

Desktop Windows saves retry scanner-held original/backup operations within one budget; verified replacement succeeds even if backup cleanup must wait. Local allowlisted diagnostics can be copied explicitly, and 45 locales explain how to preserve edits with Save As under a new name. See [Windows file access](windows-file-access.md).
