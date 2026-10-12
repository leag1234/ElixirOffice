# Features and benefits

Kept up to date as features land. Each line says what you get; the linked document or test backs it. A detailed comparison with LibreOffice and ONLYOFFICE is in [differences.md](differences.md). Test paths are relative to the repository root.

### Local desktop preview

- **Linux desktop preview**: bundled editors, a standard free font set (metric-compatible, school and UI/symbol fonts) and WebAssembly conversion work locally without a document server. The reduced unsigned Linux preview includes native file dialogs, atomic saves and PDF export, with all active editor locales and offline help languages. The Windows x64 NSIS preview is integrated; native Windows acceptance awaits the owner PC or VM. The unsigned Apple Silicon preview provides standard macOS menus and explicit Office type associations; native owner acceptance remains on its manual checklist. Current conversion limitations and acceptance evidence are documented in [Desktop](desktop.md).

### AI only if you want it
- **AI is off by default and the editor is complete without it**: no AI button, menu or network call until a model is configured; the key you may add never reaches a publisher. [ai.md](ai.md) section 7, `tests/ai-config/config.mjs`
- **Bring your own model, or let your administrator set one up**: any OpenAI-compatible service (OpenAI, Mistral, Ollama on your own computer, vLLM, an internal gateway). An administrator sets three variables and checks them with `make ai-check`; otherwise each person connects their own service in File > AI, with the key kept in their browser, a Test connection button and a clear "Your text is sent to ..." notice. [ai.md](ai.md) section 7

### Working like Microsoft Word
- **Word keyboard shortcuts**: 228 of the Word shortcuts the editor can support work on Windows and 171 on macOS, including Repeat (F4, and Ctrl+Y when there is nothing to redo), F2/Shift+F2 move or copy, Spike, Paste Special (Ctrl+Alt+V), go back to the last edit (Shift+F5), AutoText (Alt+F3), double and words-only underline, hidden text. Muscle memory keeps working. [shortcuts.md](shortcuts.md)
- **Office keys the browser keeps, handled**: Ctrl+Alt+Shift+W/T/N/Tab (Word, PowerPoint, Excel) and Ctrl+Alt+Page Down/Up (Excel sheets) reach the editor in every browser; install ElixirOffice as an app (its window has no tabs) or use full screen (Keyboard Lock) to get the originals; a one-time hint and a "Keyboard shortcuts in the browser" dialog explain it. [shortcuts.md](shortcuts.md) section 17, `tests/browserkeys/`
- **Word-identical ribbon** with contextual tabs, KeyTips (Alt), screen tips, mini toolbar and quick access toolbar with a Repeat button. [ui.md](ui.md)
- **Familiar to a Word user at first sight**: AutoSave switch in the title bar, mini toolbar in a table cell with borders, shading, Insert, Delete and New comment, "2 of 4,378 words" in the status bar and a Display Settings menu, Word's group names in each language. [ui.md](ui.md) (Familiar ground), `tests/ribbon/familiar.mjs`
- **Document views like Word**: Read Mode, Print Layout, Outline view (collapse, expand, show levels, first line only, move a heading with its text) and Draft view; split window (Ctrl+Alt+S) to see two places of a document at once. [shortcuts.md](shortcuts.md) sections 13 and 15
- **Fields** typed in place (Ctrl+F9, F9 update, Shift+F9/Alt+F9 codes, Ctrl+F11 lock kept in the .docx). [shortcuts.md](shortcuts.md) section 13
- **Block selection**: Alt+drag or Ctrl+Shift+F8 selects a column of text to copy, delete or format. [shortcuts.md](shortcuts.md) section 15
- **Mail merge like Word**: Mailings tab, recipients from a CSV or Excel file, merge fields, preview record by record, one document, one PDF or one PDF per recipient. [shortcuts.md](shortcuts.md) section 15
- **The Word-like tabs speak your language**: the Mailings tab is translated in all 44 locales with Microsoft Word's own names (Publipostage, Sendungen, Correspondencia...), and the panes, views, Design, References and comment strings in the 11 main ones. Test: `tests/beta-fixes/i18n-coverage.mjs`.
- **Charts from other programs draw correctly**: a column, line or area chart written by openpyxl and similar libraries (wrong axis position) shows its bars and month labels like in Excel. Test: `tests/beta-fixes/chart-axes.mjs`.
- **Task panes**: Reveal Formatting (Shift+F1), Selection pane (Alt+F10: select, rename, hide objects; hidden objects of a .docx are kept), offline Thesaurus (Shift+F7) in 17 languages, chosen by the language of the text. [shortcuts.md](shortcuts.md) section 14, [thesaurus.md](thesaurus.md)
- **Comments in the margin like Word**: each comment is a balloon next to its text, with a connector line, reply, resolve, edit and delete in place; the Comments pane is still there. `tests/comments/margin.mjs`
- **Everything in the ribbon**: charts get Chart Design and Format tabs like pictures, shapes and tables; the side panel only opens for "More options". `tests/ribbon/chart-tabs.mjs`
- **Design, Insert and References like Word**: themes, style sets, theme fonts, paragraph spacing, page borders; cover pages, Quick Tables, a live preview of the table grid, header and footer galleries; citations and bibliography (APA, MLA) and an index (Mark Entry, Alt+Shift+X). `tests/ribbon/word-gaps.mjs`
- **AutoCorrect while typing**: common typos fixed as you type in English, French, German, Spanish and Italian, (c) to ©, curly quotes, capitals; Ctrl+Z restores what you typed; your own list in AutoCorrect Options. `tests/ribbon/word-gaps.mjs`
- **Inline spelling correction**: right-click a misspelled word for suggestions (one click, one undo step), Ignore All, Add to Dictionary (kept in your browser), Language. `tests/spell/spell.mjs`
- **Language dialog like Word**: current and recent languages first, search by native or English name. `tests/shortcuts/language-borders.mjs`
- **Readable border icons**: active edges solid, others dotted, at any zoom and in dark mode.

### Working like Microsoft Excel and PowerPoint
- **Excel keyboard shortcuts**: every Excel shortcut the spreadsheet editor can serve works on Windows and macOS, including Repeat (F4, Ctrl+Y), End mode, Extend and Add to Selection (F8, Shift+F8), Point mode (F2), Function Arguments (Ctrl+A) and Paste Special (Ctrl+Alt+V). [shortcuts-excel.md](shortcuts-excel.md) section 6
- **Flash Fill** (Ctrl+E): type one or two examples next to your data and the column fills itself (first or last names, initials, combined columns, capitals), in one undo step. `tests/shortcuts-excel/features.mjs`
- **Quick Analysis**: a button at the corner of your data, or Ctrl+Q, for data bars, color scales, icon sets, top 10 %, charts, totals and tables in one click. `tests/shortcuts-excel/features.mjs`
- **Auto Fill Options**: after you drag the fill handle, a button at the corner of the filled range lets you switch to Copy Cells, Fill Series, Fill Formatting Only, Fill Without Formatting or Flash Fill, as in Excel; one undo reverts the whole fill. `tests/shortcuts-excel/autofill.mjs`
- **Chart galleries by type**: the Insert tab has Excel's six chart buttons (Column or Bar, Line or Area, Pie or Doughnut, Scatter, Stock or Radar, Combo), each with a gallery of previews by sub-type and an All Charts entry, next to Recommended Charts. `tests/shortcuts-excel/chart-galleries.mjs`
- **Selection pane in PowerPoint**: Alt+F10 (Option+F10 on a Mac, or Home > Arrange > Selection Pane) lists the objects of the slide, front first; select, hide with the eye (kept and saved as hidden, not drawn in the show), rename, bring forward or send backward. `tests/slide-views/selection-pane.mjs`
- **Sections in PowerPoint**: group your slides into named sections (Home > Section, or right click a section header): headers in the thumbnails and in the Slide Sorter with a collapse arrow, rename, remove, move up or down, and a deck that keeps its sections when you save as .pptx and open it again (including files from PowerPoint). `tests/slide-views/sections.mjs`
- **Slide Sorter**: View > Slide Sorter (or the status bar button) shows every slide as a thumbnail; drag to reorder (Ctrl copies), Shift or Ctrl to select several, Delete to remove, double-click to open a slide, all in one undo step. `tests/slide-views/run.mjs`
- **Presenter View with the next slide**: the presenter window shows the next slide beside your notes, so you always know what comes after. `tests/slide-views/run.mjs`
- **Charts in Word and PowerPoint can be edited again**: the Edit Data window opens, edits and undoes like in Excel (it failed to load before). `tests/chart-data/run.mjs`
- **PowerPoint keys**: paragraph navigation, selection and moves in text, Regroup, repeat Find, F6 between panes, and pen, eraser, laser pointer and hidden pointer during the slide show, on Windows and macOS. [ui.md](ui.md)

### Your documents look right
- **Fidelity to Word measured** on a test corpus, tracked release after release. [fidelity.md](fidelity.md)
- **Free metric-compatible fonts** (Carlito, Caladea, Liberation and others) so Word documents keep their line and page breaks without Microsoft fonts. [fonts.md](fonts.md)
- **Your computer's fonts**: in Chrome or Edge, one click lets the editor use the fonts installed on your computer (Calibri, Cambria, school fonts…), with nothing uploaded. [localfonts.md](localfonts.md)
- **School fonts**: the free Marelle fonts and Seyes-ruled cursive substitutes. [fonts.md](fonts.md)
- **Pictures that stay in place**: several images in a document keep a stable layout, with Word's default behaviours and Layout Options. [images.md](images.md)
- **Tables behave**: shapes grouped in a cell stay in the cell; copied cells keep rotated text, shading, borders and alignment; a heading after a page break keeps its style; changing a cell colour recolours the whole cell, text area included, even in files made with LibreOffice; the selection stays visible on dark or saturated cell colours. `tests/layout`, `tests/clipboard`, `tests/tableshade`

### Private by design, on your own server
- **Faster Word opening**: a small engine improvement, about 0.3 s on the measured 97-page document; ten-page opening and typing are unchanged. See [the measurements and limits](perf.md).
- **Install on your own server**: a single-host production compose with HTTPS, optional AI, persistent storage and backup/rollback. [install guide](install-server.md).
- **Local office conversion**: opt in to open, edit and download DOCX/XLSX/PPTX/ODT/ODS/ODP without uploading the document; server mode stays the default. When the server is unavailable, local opening requires explicit confirmation; replacing a local document with unsaved changes requires a discard warning. Static editor assets must be available. Requires the pinned full runtime installed before the SDK asset build; the SDK deployment and three production editor bundles are verified. [wasm.md](wasm.md) section 16, `tests/local-mode/README.md`
- **Local ODS chart fidelity**: the converter preserves both embedded charts and their data through editing, saving and reopening, and removes the phantom missing-image request. Three strict corpus runs pass; published desktop packages still require a runtime rebuild.
- **Local opening across browser engines**: Chromium, Firefox and WebKit retain the selected document locally, with explicit consent when the hosted server is unavailable. WebKit uses a byte record for the local handoff. Public 100-page trials complete with a 2 GiB browser budget; Firefox/WebKit exceed 1 GiB. Real Mac Safari acceptance is pending. [wasm.md](wasm.md) section 18, `tests/browsers/README.md`
- **PDF made in your browser**: Download as PDF and Print use the native PDF writer in a lazy WebAssembly worker, with the same fonts as on screen (including local fonts) and original images. Public-corpus PDFs match the server's text and page counts, with nearly identical size; a session presence check uses JS directly when the module is absent, and automatic JS then server fallback preserves export on runtime failures. The worker receives only used font files; server fonts are cached between sessions and local fonts require existing consent. New image builds include the validated runtime and serve its module compressed (3.13 MB Brotli). [client-pdf.md](client-pdf.md), [wasm.md](wasm.md) section 15
- **No telemetry to the publisher**; AI is off unless configured. [branding.md](branding.md)
- **Your own storage**: open and save in your Nextcloud or Murena Workspace, or use the server's own storage; your real name on comments and tracked changes. [storage.md](storage.md)

### AI built in, optional
- **Ask from anywhere**: the search box, right-click, the mini toolbar or "/" in the text.
- **Acts on structure, not just text**: styles, lists, tables, table of contents, pictures, page setup, headers and footers, comments, with a planner and a verification step.
- **Safe results**: changes arrive as tracked changes, undo in one step, and a clear answer when something cannot be done.
- **Any provider**: any OpenAI-compatible endpoint, managed server-side so keys never reach the browser. [ai.md](ai.md)
