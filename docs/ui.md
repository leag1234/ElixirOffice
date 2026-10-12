# Text editor interface: towards an Office look

Session of 2026-10-05. Goal: make the Word editor (`web-apps/apps/documenteditor/main`) look like Word for the web / Word 2024 and handle the same way, without touching the engine (sdkjs). Transformation of the existing interface, not a rewrite.

Branches: `elixir/ui` in web-apps (submodule of `DocumentServer`), `feat/ui` in this repository. Nothing is pushed.

## Before / after

| | Before | After |
|---|---|---|
| Home | screenshot `before-home.png` (not published) | screenshot `after-home.png` (not published) |
| Insert | screenshot `before-insert.png` (not published) | screenshot `after-insert.png` (not published) |
| Layout | screenshot `before-layout.png` (not published) | screenshot `after-layout.png` (not published) |
| Review | screenshot `before-review.png` (not published) (Collaboration) | screenshot `after-review.png` (not published) |
| File | screenshot `before-file.png` (not published) | screenshot `after-file.png` (not published) |

Other screenshots: `after-design.png`, `after-references.png`, `after-view.png`, `after-home-1280x720.png`, `after-home-dark.png`, `after-home-rtl-ar.png` (Arabic, right-to-left interface), `after-t04-home.png` (another corpus document). Document: `corpus/provisional/teachers/t01-fiche-fractions-cm1.docx`. Headless Chromium browser (Playwright), 1440x900 unless stated otherwise. The Segoe fonts do not exist on the capture machine, hence the fallback to Arial or DejaVu.

## What changed

### 1. General look (theme `elixiroffice`, `branding/web-apps/theme/elixiroffice/assets/less/overrides/office.less`)

- Interface font: `"Segoe UI Variable", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`. The upstream's Arabic or Urdu font stays prioritized.
- Neutral gray chrome (#f3f3f3), canvas #ebebeb, rounded white ribbon, text #242424, hover and pressed states in rounded grays (4 px).
- A single accent color, `@elixir-accent` in `theme.less` (ElixirOffice blue #0082c9 for now). It is used for the active tab, focus, primary buttons, selections and the File menu. Word's blue and the Word logo are not reused.
- 36 px title bar (centered file name, quick access toolbar on the left with save, print, undo and redo) and 32 px tab row. web-apps read these heights hard-coded: an `[upstreamable]` fix now reads them from CSS variables.
- These settings only concern the "modern" themes (light `theme-white` by default, dark `theme-night`). The other themes keep the upstream's colors.

### 2. Fluent icons

- 248 Microsoft Fluent UI System Icons icons (MIT, npm version `@fluentui/svg-icons` 1.1.343). The `LICENSE` file is next to the icons in `branding/web-apps/theme/elixiroffice/assets/icons/toolbar/`.
- They cover the Home, Insert, Layout, References, Review, View and Draw tabs, the quick access toolbar, the left panel and the status bar.
- Sizes: the 20 px "regular" variant at 1:1 scale in the 24 px boxes, the 24 px "regular" variant in the big buttons (28 px). Strokes take the theme color, in light and dark.
- Mechanism: `web-apps/build/scripts/deploy-sprites.js` (`[upstreamable]` fix) accepts that the theme replaces or adds icons in the sprites (`theme/<THEME>/assets/icons/toolbar/<scope>/...`). Identifiers do not change, no JS or template change is needed. Since the sprites are regenerated at each build, this replacement survives builds.
- To regenerate: `node tools/fluent-icons/gen.mjs <package/icons>`. The mapping between a web-apps icon and a Fluent icon is in `tools/fluent-icons/map.json`.
- Still original: inner horizontal and vertical borders, stroke thicknesses, drop caps (no clean Fluent equivalent), wrapping icons of the menus, icons of the other editors.

### 3. Ribbon structured like Word (web-apps, `documenteditor`)

- Tabs in Word's order: File, Home, Insert, Draw, **Design** (new tab: document colors, watermark, page color, removed from Layout), Layout, References, **Review** (merge of Collaboration and Protection), View. If the integrator hides one of the two original tabs, protection gets its own tab back.
- Home: new Clipboard group (big Paste button, Cut, Copy, Format Painter). Before, these buttons were displayed on all tabs. The Font group puts "Clear Formatting" on the first row, the Paragraph group follows Word's layout. The Editing group contains Find, Replace and Select All, with their labels.
- Group labels under each group: Clipboard, Font, Paragraph, Styles, Editing, Pages, Tables, Illustrations, Comments, Links, Header & Footer, Text, Symbols, Controls, Page Setup, Arrange, Document Formatting, Page Background, Table of Contents, Footnotes, Captions, Tracking, Compare, Protect, Zoom, Appearance, etc.
  - They are drawn in CSS, which leaves the ribbon's overflow logic ("more" button) intact.
  - A group widens if its label is longer than it.
  - The feature is disabled by default and is activated by a theme CSS variable.
- Dialog launchers (arrow at the bottom right of the group): Font (paragraph settings, Font tab), Paragraph (paragraph settings), Page Setup (custom margins).
- Texts translated into en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja and zh. The other languages fall back to English, like any untranslated string. English remains the default language.

### 4. Status bar

- "Page X of Y" (already present).
- Live word count ("269 words"), recomputed when the document is idle, 1.5 s after the last cursor movement. The detailed statistics menu is kept.
- Language and spell checking (already present).
- View buttons (multiple pages, fit to page or width).
- **Zoom slider** in Word's manner: 10% to 100% on the left half, 100% to 500% on the right half, with a snap at 100%. The percentage is displayed on the right and still opens the menu of preset zooms.

### 5. File menu as a "backstage"

- Word's order: New, Recent, Info | Save, Save a Copy, Print, Share, Export (Download as) | Rename, Protect, Version History, Open File Location | Help, Options.
- The menu opens on Info, as in Word.
- 240 px navigation pane, 40 px rounded entries, accent bar on the active entry, 28 px titles. Works in light theme, dark theme and right-to-left.

## Checks done

- Shortcuts: Ctrl+B, Ctrl+I, Ctrl+E and Ctrl+Z tested on the keyboard (Playwright). The shortcuts live in sdkjs and in the controllers, which were not touched.
- Co-editing: two users on the same document, the text typed by A appears on B's side.
- Right-to-left interface (Arabic), dark theme, 1280x720 width (ribbon overflow).
- No console error on the text editor.
- Spreadsheet, presentation and PDF build and open without JS error. The PDF shows a network `ERR_CONNECTION_REFUSED` unrelated to these changes.

## What remains

- Ribbon finishing:
  - Paste: paste options menu.
  - Find: Go To and Replace menu.
  - Review: "Proofing" group with Spelling and Word Count.
  - View: "Views" group (Read, Print Layout, Web).
  - Mailings tab.
- Missing launchers (Styles → styles pane, Clipboard) and a real "Font" box (name, size, color, effects in a single box).
- Backstage:
  - "Home" page with recent documents;
  - "Export" presented as in Word ("Create PDF", "Change File Type");
  - Print with preview in the backstage.
- Remaining icons: see §2. Same changes to carry over to the spreadsheet, presentation and PDF.
- Dark themes other than `theme-night`: not touched.
- Translations of the new labels for the other languages.
- The screenshots do not have the real Segoe UI fonts: to re-verify on a Windows or macOS machine.

## Second pass: File menu, title bar and window frame

Session of 2026-10-05 (second pass, "chrome" part). Branches: `elixir/chrome` in web-apps, sdkjs, document-server-integration and the DocumentServer superproject; `feat/chrome` in this repository. Nothing is pushed. Working instance: `eo-chrome`, http://localhost:32770/example/ on <dev-host> (`./eo.sh up chrome`, sample launched from the sources by `make example CONTAINER=eo-chrome UPSTREAM=$EO_WORK/wt/chrome`).

The code lives in a separate module, `web-apps/apps/documenteditor/main/app/elixir-chrome/` (controller `DE.Controllers.ElixirChrome`), which extends the existing views (File menu, header, left menu) without rewriting them. The only hooks in the upstream's files: the controller declaration in `app.js` / `app_dev.js`, an `@import` in `app.less`, a line of `Main.js` (print preview on the web) and a line of `Themes.js` (`canvas-page-shadow` token).

### Before / after

| | Before | After (light) | After (dark) |
|---|---|---|---|
| Editor | screenshot `chrome-before-editor.png` (not published) | screenshot `chrome-after-editor.png` (not published) | screenshot `chrome-after-dark-editor.png` (not published) |
| File | screenshot `chrome-before-file.png` (not published) (Info) | screenshot `chrome-after-home.png` (not published) (Home) | screenshot `chrome-after-dark-home.png` (not published) |
| Ctrl+F | screenshot `chrome-before-ctrlf.png` (not published) | screenshot `chrome-after-nav-results.png` (not published) | screenshot `chrome-after-dark-nav-pages.png` (not published) (Pages) |
| Dark | screenshot `chrome-before-dark.png` (not published) | | screenshot `chrome-after-dark-search.png` (not published) (search) |

Other screenshots (`screenshots/ui2/chrome-after-*.png`): `open`, `info`, `saveas`, `print`, `share`, `export`, `export-type`, `search`, `flyout`, `nav-pages`, `comments`, `dark-comments`, `dark-info`, `dark-print`, `fr-home` (French interface), `rtl-ar-home` (Arabic, right-to-left), `1100x720` (narrow window). Document: `corpus/provisional/teachers/t01-fiche-fractions-cm1.docx`, headless Chromium (Playwright, `$EO_WORK/pw/chrome/shot.mjs`), 1440×900 unless stated otherwise.

### 1. File menu like Word's backstage

- Left pane in Word's order: Home, New, Open, Info | Save a Copy, Save As, Print, Share, Export, Close | About, Options (at the bottom). Fluent icons for all entries. The former entries Recent, Rename, Protect, Version History, Access Rights and "Go to Documents" joined the page that carries them in Word (Open, Save As, Info, Share, Close). "About" (legal notices) was in the left icon bar, removed: it moves to the bottom of the File menu.
- The menu opens on **Home**, like Microsoft 365: greeting by time of day, "New" thumbnails (blank document and start page templates, with their thumbnails), list of recent files (name, location, date). Esc and the Back arrow return to the document.
- **New**: large thumbnails (same list as the start page).
- **Open**: Recent with filter, "Browse" (upload a file from the device, opened in a new tab; formats to convert go through the start page) and "My files" (start page in a new tab).
- **Info**: tiles Protect Document (encrypt with password, restrict editing, signature when available), Inspect Document (comments, tracked changes, author; "Remove all" for comments), Version History; properties in a column on the right.
- **Save As**: Rename tile (if the host allows it) and the download formats as a list with description. **Export**: "Create PDF Document" (PDF, PDF/A) and "Change File Type" (document types, other types, images).
- **Share**: share with people (host's sharing settings), copy link, send link by email, send a copy; list of people with access when the host provides it.
- **Print**: the desktop application's preview page is enabled in the browser (`canPreviewPrint`, `[upstreamable]` fix). Settings column (range, pages, paper size, orientation, margins) and **live preview** on the right, Print button at the top as in Word. The printer, number of copies and duplex are chosen in the browser's print dialog (the printed PDF cannot carry them): these rows leave room for a note. "Pages per sheet" does not exist on the converter side: not offered. Ctrl+P and the quick access toolbar's Print button open this page, as in Word.
- Host data (sample application, `helpers/elixirHome.js`): `editorConfig.templates` (start page templates), `editorConfig.recent` and `editorConfig.elixir` (URL of the start page, upload, editor, share link, storage name). Another integrator can supply the same fields; without them, the corresponding pages are hidden.

### 2. Title bar like Word for the web

- File name without extension followed by the saving state: "Saved", "Saving…" (animated icon), "Not saved" if autosave is off, "Offline". It follows the editor's saving actions and the Save button state. When space is lacking, the name is shortened before the state.
- Click on the name: pane with the editable name (renaming by the host, same event as before), the location, "Open file location" and "Version History".
- Centered **"Search (Alt+Q)"** field; Alt+Q (Ctrl+Option+Q on macOS, the editor's convention for Alt shortcuts) puts the cursor there. It searches the **ribbon commands**: each button of the tabs and the items of their menus, with tab and group ("Insert › Tables"). The chosen command runs by switching to its tab and clicking the control: "table" opens the Insert > Table grid. Suggested actions when the field is empty; "Find" and "Replace" in the document at the end of the list. Arrows, Enter, Esc as in Word. Index: `CommandIndex.js` (buttons are remembered by `WeakRef` at creation).
- On the tab row, on the right: **Comments** button (opens or closes the pane), **Editing / Reviewing / Viewing** mode (upstream menu, restyled), **Share** button in the accent color (host sharing or the File menu's Share page), avatar to the right of the title bar. The upstream's magnifier and "Open file location" button disappear in favor of the search and the name pane.
- Alt+Q used to open the discussion: it remains accessible through Review > Chat.

### 3. Window frame

- **Page background and shadow** like Word: the page is drawn on a soft shadow, without a gray frame (`--canvas-page-border` very light, `--canvas-page-shadow`). On the sdkjs side, `PageShadow` wrapping color read from the theme token (`[upstreamable]` fix, inactive by default); the shadow comes from a rectangle under the page, not from the page image, to stay cheap.
- **Smooth zoom**: Ctrl+wheel and touchpad pinch vary the zoom continuously (10% per wheel notch) instead of jumping between steps.
- **No more icon bar on the left**, like Word: panels open on demand and the left column takes no space when they are closed.
- **Navigation pane** (Ctrl+F as in Word, or View > Navigation): Headings, Pages, Results tabs. Headings = the upstream's tree; Pages = page thumbnails, drawn with the print preview engine, click = go to the page; Results = the upstream's search panel, with the selected text.
- **Right panel** (properties) closed by default for a new user, opened on demand (View > Right panel), like Word's formatting panes.
- **Comments pane** anchored to the right of the page, like Word; the page recenters in the remaining width. Cards with rounded edges, active card underlined in the accent color.

### 4. Dark mode

- The default dark theme (`theme-night`) receives a neutral Office-style palette: title bar, tab row, File menu pane and status bar almost black (#1f1f1f), ribbon, panels and menus one tone above (#292929), dark canvas, gray hover and pressed state, stronger page shadow.
- The page stays **white**; it only turns dark with View > Dark document (upstream setting).
- Without a theme chosen by the user, the editor **follows the system setting** (upstream behavior, verified with `prefers-color-scheme: dark`).

### Languages

All the new strings are in the translation system (`DE.Views.ElixirBackstage.*`, `DE.Views.ElixirTitleBar.*`, `DE.Views.ElixirNavPane.*`): English by default, translated into fr, de, es, it, pt, pt-pt, nl, ru, pl, ja and zh; the other languages fall back to English. Start page labels: key `storage.name` (en, fr).

### Icons

Fluent UI System Icons (MIT), "regular" 20 and 24 px variants, inline and in `currentColor`: `web-apps/.../elixir-chrome/Icons.js`, generated by `node tools/fluent-icons/inline.mjs <package/icons> <output>` from the list `tools/fluent-icons/inline.json`.

### Checks done

- Each page of the File menu, command search ("table", "page", "comment" → Insert Comment), the name pane and renaming (tab title updated by the host), the saving state while typing, Ctrl+F and the three tabs of the navigation pane, the Comments pane on the right, wheel zoom (3 notches: 133%), Esc to leave the File menu.
- Light, dark (system in dark), French, Arabic (right-to-left), 1100×720 window.
- No console error on the text editor; spreadsheet, presentation and PDF open without JS error (the PDF keeps the network `ERR_CONNECTION_REFUSED` already noted).

### What remains different from Word

- Print: no number of copies nor duplex in the page (the browser asks for them), no "pages per sheet", no printing of the selection.
- ~~The comments are not aligned in the margin next to their text~~: done, see "UI gaps with Word, third pass" (balloons in the margin).
- Pages pane thumbnails redrawn at opening and when the page count changes, not at each keystroke; no filtering of pages by search result nor highlighting of the matching headings.
- Command search only covers the ribbon's buttons and menus (not dialogs, options nor help), without synonyms nor history of recent commands.
- No "Account" menu nor clickable avatar; no "AutoSave" toggle (saving is continuous in co-editing).
- Home / Open: no pinning, no "Shared with me", locations reduced to the host.
- Other editors (spreadsheet, presentation, PDF): not ported.

## Second pass: formatting (Home tab, dialog boxes, styles)

Session of 2026-10-05, "formatting" slice. Branches: `elixir/fmt` in web-apps, sdkjs and document-templates (submodules of `DocumentServer`, worktree `wt/fmt`), `feat/fmt` in this repository. Nothing is pushed. Test instance: `eo-fmt` (port 32771 on <dev-host>).

Screenshots: `screenshots/ui2/fmt-*.png` (before: `fmt-before-*`, after: `fmt-after-*`), headless Chromium, 1440x900, document `corpus/provisional/teachers/t01-fiche-fractions-cm1.docx` unless stated otherwise.

| | Before | After |
|---|---|---|
| Blank document | screenshot `fmt-before-blank.png` (not published) | screenshot `fmt-after-blank.png` (not published) |
| Style gallery | screenshot `fmt-before-styles.png` (not published) | screenshot `fmt-after-styles-gallery.png` (not published) |
| Font box | screenshot `fmt-before-font-dialog.png` (not published) | screenshot `fmt-after-font-dialog.png` (not published) |
| Paragraph box | screenshot `fmt-before-paragraph-dialog.png` (not published) | screenshot `fmt-after-paragraph-dialog.png` (not published) |
| Paste | screenshot `fmt-before-paste.png` (not published) | screenshot `fmt-after-paste-menu.png` (not published) |
| Font list | screenshot `fmt-before-fontname.png` (not published) | screenshot `fmt-after-fontlist.png` (not published) |
| Highlight | screenshot `fmt-before-highlight.png` (not published) | screenshot `fmt-after-highlight.png` (not published) |

Other screenshots: `fmt-after-style-live-preview.png` (preview on hover), `fmt-after-styles-pane-modify.png` (Styles pane and "Modify Style"), `fmt-after-apply-styles.png`, `fmt-after-font-dialog-advanced.png`, `fmt-after-font-dialog-fr.png` (French interface), `fmt-after-paragraph-dialog-breaks.png`, `fmt-after-tabs-dialog.png`, `fmt-after-paste-chip.png` (options button after paste), `fmt-after-paste-merge.png`, `fmt-after-linespace.png`, `fmt-after-borders.png`, `fmt-after-changecase.png`, `fmt-after-home.png`, `fmt-after-home-dark.png`.

### 1. Blank documents like Word

- The templates `document-templates/new/<language>/new.docx` (used by the server, the sample application and the connectors) start like a blank Word document: theme font (Calibri) 11 pt, 8 pt after, line spacing 1.08; Office theme (Calibri Light / Calibri, Word 2013 to 2021 palette, accent 1 = 4472C4); built-in styles written explicitly (Heading 1 to 9 in Calibri Light in Word 2016 colors, Title, Subtitle, Quote, Intense Quote, emphasis and reference styles, List Paragraph, No Spacing, Table Grid). The language, page size, margins and right-to-left paragraph of each language are kept.
- Generator: `tools/word-defaults/make_blank_docx.py document-templates/new`.
- sdkjs: the built-in heading styles (those applied to a document that does not define them) use the theme's heading font (+Headings) instead of fixed Arial, like Word's latent styles.
- Fonts: Calibri is not installed; it is rendered by **Carlito** (metrically compatible, OFL), already present in `core-fonts/crosextra` and already substituted by the engine. Nothing to embed. Carlito has no "Light" weight: Calibri Light displays as regular Carlito (titles a bit bolder than in Word).
- The sample application embeds its templates in its binary: the check was done by opening the uploaded new `new.docx`. The new templates reach the image at the next full build.

### 2. Styles

- **Gallery**: "AaBbCcDd" previews of 84x40 with the style name below, Word's list and order (Normal, No Spacing, Heading 1, Heading 2, Title, Subtitle, emphasis styles, Strong, Quote… ; Heading 3 and following when the level above is used; Caption, TOC Heading and hidden styles once used; custom styles at the end). The previews of character styles are now formatted (they were plain text) and the order of styles of the same priority was random (sort on a nonexistent field): fixed in sdkjs.
- **Live preview**: on hover (300 ms), the style applies to the selection and is undone when leaving the thumbnail. The application is done in a "grouped action" then undone: nothing is saved, sent to co-authors nor added to the undo history; the toolbar keeps the real formatting. sdkjs API `asc_StartStylePreview` / `asc_EndStylePreview`.
- **Expanded gallery**: "Create a Style", "Clear Formatting", "Apply Styles…". Context menu of a thumbnail: "Modify…" in addition.
- **Styles pane** (Ctrl+Alt+Shift+S and Styles group launcher): floating window on the right, "Clear All", list with the type (¶, a), current style boxed, per-style menu (Update to Match Selection, Modify…, Delete… or Revert to default), "Show Preview", New Style, Clear Formatting.
- **Apply Styles**: style name with completion, Reapply, Modify…, pane button.
- **Modify Style / Create Style from Formatting**: name, type, base style (no loop), next style, font, size, bold, italic, underline, color, alignment, line spacing, space before, indent, preview, "Add to Styles gallery", Format > Font…. sdkjs API `asc_GetStyleForModify` / `asc_ModifyStyle` (the style is not applied to the selection, a single undo).

### 3. Font and Paragraph boxes

- **Font** (Font group launcher, **Ctrl+D**): Font tab (font, style and size in a text field over a list, typing selects the first match; color; underline style and color; effects strikethrough, double strikethrough, superscript, subscript, small caps, all caps, hidden, mutually exclusive as in Word); Advanced tab (scale, normal/expanded/condensed spacing by n pt, normal/raised/lowered position by n pt, kerning, OpenType ligatures); preview rendered by the engine with the selected text. Only modified values apply, in a single undo (API `asc_GetFontDialogProps` / `asc_SetFontDialogProps` / `asc_DrawFontDialogPreview`).
- **Paragraph** (Paragraph group launcher, "Line Spacing Options…"): the existing paragraph settings box, laid out like Word: two tabs at the top, "Indents and Spacing" (General, Indentation, Spacing, Preview) and "Line and Page Breaks" (Pagination, Formatting exceptions, Preview), "Tabs…" button that applies the box then opens the tab stops alone in a "Tabs" box. All the logic stays in `ParagraphSettingsAdvanced`.

### 4. Pasting and format painting

- **Paste** becomes a split button: the top pastes, the arrow opens "Paste Options:" with Keep Source Formatting (K), Merge Formatting (M), Keep Text Only (T), Fluent icons. The button no longer shows the "copy, cut, paste" warning when the asynchronous Clipboard API does paste (it only displays if nothing is pasted after 1.5 s).
- **Options button after pasting**: Word's labels, keys and icons; "Merge Formatting" is offered after an internal paste (it was disabled in sdkjs) and follows Word: the pasted text takes the formatting of the destination paragraph and text and only keeps bold, italic, underline, strikethrough, superscript and subscript.
- **Format Painter**: verified, already like Word (one click: once; double click: until Esc or a new click). Unchanged.

### 5. Font and Paragraph controls

- Font list with Word's sections: "Theme Fonts" (Headings, Body; applied as theme references, +Headings/+Body, as in Word), "Recently Used Fonts", "All Fonts". `[upstreamable]` fix of `ComboBoxFonts`: visible previews are computed from their position when the list contains rows other than fonts.
- Word's sizes: 8, 9, 10, 10.5, 11, 12, 14 … 72.
- Highlight: Word's 15 colors in Word's order (5 x 3, no white), "No Color".
- Line spacing: "Line Spacing Options…" opens the Paragraph box; icons on Add/Remove Space Before/After.
- Borders: "Borders and Shading…" at the end of the menu (Borders and fill tab).
- Already conforming to Word, unchanged: Change Case (5 options), font color (theme colors, standard, more colors), libraries of bullets and numbers with previews.
- Shortcuts added: **Ctrl+Shift+>** / **Ctrl+Shift+<** (grow / shrink font, Cmd on macOS), which were not bound.

### Where the code is

- web-apps, controller `DE.Controllers.WordFormatting` (`apps/documenteditor/main/app/controller/WordFormatting.js`); views `view/StylesPane.js` (pane, Apply Styles, Modify Style), `view/FontDialog.js`, `view/WordParagraphDialog.js`; styles `resources/less/word-formatting.less`. Hooks in shared files: controller declaration (app.js, app_dev.js), less import, size and template of the gallery thumbnails and highlight palette (`view/Toolbar.js`), `split/menu` of the big Paste button, `data-launcher="styles"` (`Toolbar.template`), removal of the font/paragraph cases of the launcher (`controller/Toolbar.js`).
- sdkjs: `word/api.js` (gallery options, style preview, Font, style modification, theme fonts), `word/Drawing/stylespainter.js`, `word/Editor/Styles/default-styles.js`, `common/wordcopypaste.js`, `word/Editor/Shortcuts.js`. `[upstreamable]` commits, default behavior unchanged without the options.
- Fluent icons added to `tools/fluent-icons/map.json` (create/apply a style, pane, paragraph spacing, paste options).
- Strings in English and in fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh; the other languages fall back to English.

### Checks done

- No console error on t01, a06, s04, t05, a new fr-FR document, and when opening a spreadsheet and a presentation.
- Keyboard: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+E, Ctrl+Shift+>, Ctrl+Shift+<, Ctrl+Alt+1, Ctrl+Z, Ctrl+D (Font box), Ctrl+Alt+Shift+S (Styles pane), K/M/T in the paste options menu.
- Style preview: no history point created, document back identical.
- Font box: application in a single undo, Ctrl+Z undoes it.
- Dark theme (gallery names readable after fix), French interface.

### What remains different from Word

- Engine: only one underline type, no underline color, nor character scale, nor kerning, nor number forms and stylistic sets (shown grayed in the Font box). Adding them requires format changes in sdkjs and x2t (core).
- Theme fonts: uninstalled fonts (Calibri) are displayed as text in the list, not in their typeface; the font field shows "Calibri Light" and not "Calibri Light (Headings)".
- Gallery: only paragraph styles have a live preview visible without a selection (a character style only has an effect with a selection); no "Remove from Styles Gallery"; number of visible thumbnails limited by the group width.
- Styles pane: no Style Inspector, Manage Styles, nor Options; "Disable Linked Styles" absent; the Modify Style box does not have Format > Paragraph/Tabs/Border/Numbering.
- Paragraph box: no "Set As Default", "Mirror indents" nor "Collapsed by default"; preview drawn in HTML (approximate), not by the engine.
- Paste: no "Paste Special…" nor "Set Default Paste…"; the "Picture" option only appears when the clipboard contains an image; the options after an external (HTML) paste remain sdkjs's.
- Ctrl+Shift+S still opens "Save As" (in Word: Apply Styles); to be settled with the shortcuts slice.
- Calibri Light rendered as regular Carlito (no free light weight installed).

## Ribbon, second pass: contextual tabs and tab content

Session of 2026-10-05 (afternoon). Branches: `elixir/ribbon` in web-apps (submodule of `DocumentServer`, worktree `$EO_WORK/wt/ribbon`), `feat/ribbon` in this repository. Nothing is pushed. Test instance: `eo-ribbon`, port 8097 on <dev-host>.

Scope: all tabs except Home (another work item), plus the contextual tabs and ribbon behavior. The engine (sdkjs) is not modified.

### Mechanisms (to know for rebases)

- **No rewrite of `Toolbar.template` nor of the upstream views.** `DE.Controllers.RibbonTabs` reorganizes the template on the toolbar's `render:before` event, before the controls are injected, and reorganizes the Review and View tabs as soon as their controllers have built them. The only upstream files touched are `app.js` and `app_dev.js` (controller declaration) and `app.less` (import of `ribbon.less`).
- **`Common.UI.RibbonMirror`** (`apps/common/main/lib/component/RibbonMirror.js`): a "twin" button that follows the state of an existing button (disabled, pressed, tooltip) and sends clicks and menu clicks back to it. Office shows the same command in several places (Wrap Text in Layout and in Picture Format, Page Break in Insert and Breaks in Layout…): the command is not rewritten, its controllers, locks and shortcuts remain the upstream's. When Word presents a command differently, the original control stays in the template, hidden (class `elx-source`), and the visible twin follows it.
- **`DE.Controllers.ContextTabs`** and its view: the five contextual tabs. They listen to `asc_onFocusObject`. The API's insertion commands (`put_Table`, `asc_ConvertTextToTable`, `asc_addImage`, `AddImageUrl`, `StartAddShape`, `AddTextArt`, `asc_AddMath`) are wrapped once: an insertion, whatever its origin (ribbon, context menu, dialog box, AI), opens the corresponding tab.
- **`Common.UI.RibbonCollapse`** (`apps/common/main/lib/component/RibbonCollapse.js`): Office-style group collapsing (see below). It wraps the toolbar's `processPanelVisible`; Mixtbar's overflow (hidden labels then "More" button) remains the last resort.
- Icons: `tools/fluent-icons/map.json` (Fluent UI System Icons, MIT) and, when Fluent has no equivalent, `tools/fluent-icons/custom/` (drawn for ElixirOffice in the same style: position and margin presets, seven wrapping styles, drop caps, distribute rows/columns, inner borders). `gen.mjs` copies both. The Insert > Icons gallery comes from `tools/fluent-icons/gallery.json` via `gen-gallery.mjs` (169 icons, 12 categories, `assets/img/icons-gallery/icons.json`, 63 KB loaded at first use).
- Strings: en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh (keys `DE.Views.ContextTabs.*`, `DE.Views.RibbonTabs.*`, `DE.Views.IconsDialog.*`), Word's vocabulary in each language. The other languages fall back to English.

### Contextual tabs

They appear on the right of the tab row, label in the accent color, as in Word, and disappear with their context; if the active tab disappears, the ribbon goes back to the tab used before. The right panel remains available as a secondary surface.

| Tab | When | Content |
|---|---|---|
| Table Design / Layout | cursor in a table | Style options (header row, Total row, banded rows and columns, first and last column), table styles gallery in the ribbon (previews shared with the right panel), shading, pen thickness and color, borders (11 choices + Borders and Shading…); Select, View Gridlines, Properties, Draw Table, Eraser, Delete, Insert Above/Below/Left/Right, Merge/Split, AutoFit (contents, window, fixed width), height and width, distribute, 3 × 3 alignment grid, text direction, cell margins, repeat header rows, convert to text, formula |
| Picture Format | image selected | Transparency (presets), change picture (file, URL, storage), reset picture (and its size), border and effects (shadow), alt text, Position (Word's 9 presets + in line with text), wrapping, bring forward, send backward, align, group, rotate/flip, crop (fill, fit), height and width (proportions kept) |
| Shape Format | shape or text box selected, or its text being edited | Shapes (gallery), edit shape (change shape, edit points), text box, fill, outline (color, weight), effects (shadow), text direction and alignment, alt text, Arrange, size |
| Equation | cursor in an equation | New equation, Convert (professional/linear, Unicode/LaTeX), switch to Display/Inline mode, gallery of symbols and of the eleven structures (fractions, scripts, radicals, integrals…) |
| Header & Footer | editing a header or footer | ElixirOffice's existing tab, now presented as contextual |

Inserting a table, an image, a shape, a text box, Text Art or an equation opens the corresponding tab, like Word. The group launchers open the Table Properties boxes (Cell or Borders tab), Insert Cells, Layout (Size, Position, Rotation, Alt Text) and the Shape panel.

screenshot `ribbon-ctx-all.png` (not published)

### Classic tabs

- **Insert**: Pages (Blank Page, Page Break); Tables (10 × 8 grid, Insert Table…, draw, eraser, Convert Text to Table…, spreadsheet); Illustrations (Pictures, Shapes with Word's categories and order, **Icons**, SmartArt, Chart); Comments; Links (Link, Bookmark, Cross-reference); Header & Footer (Header, Footer, Page Number); Text (Text Box, QuickPart > Field…, Text Art, Drop Cap, Date & Time, Object > text from a file, a URL or storage); Symbols; Controls.
- **Icons**: "Insert Icons" box (categories, search on English names, color, several icons at once). Each icon is inserted as an image drawn at print resolution and set to 2.54 cm, as in Word.
- **Layout**: Margins gallery with Word's presets and an icon each (Last Custom Setting, Normal — 2.5 cm, 1 inch in the US and Canada —, Narrow, Moderate, Wide, Mirrored with mirror margins, Office 2003 Default, Custom Margins…); Orientation, Size, Columns, then Breaks, Line Numbers and Hyphenation as small buttons; Breaks menu like Word (Page, Column; Next Page, Continuous, Even Page, Odd Page, each with Word's description); Indent and Spacing titled; Arrange: Position, Wrap Text, Bring Forward, Send Backward, Align, Group, Rotate, Combine Shapes.
- **Design**: Watermark gallery with Word's presets (CONFIDENTIAL, DO NOT COPY, DRAFT, SAMPLE, URGENT, ASAP — shown in the interface language, e.g. French "CONFIDENTIEL, NE PAS COPIER, BROUILLON, EXEMPLE, URGENT, DÈS QUE POSSIBLE"), custom watermark, removal.
- **References**: Table of Contents; Footnotes (Insert Footnote, Insert Endnote, Next/Previous Footnote, launcher to the settings); Captions (Insert Caption, then Table of Figures, Update, Cross-reference). Link and Bookmark leave References: they are in Insert, as in Word.
- **Review**: Proofing (Spelling while typing, Statistics: pages, words, characters with and without spaces, paragraphs); Language (drop-down with the current and recent languages, then Set Proofing Language… = the Language dialog, see "First tester feedback" below); Comments (+ Previous, Next, Show Comments); Tracking (Track Changes with "For Everyone" / "Only for Me", display All Markup / Simple Markup / No Markup / Original, the button shows the current choice); Changes (Accept, Reject, Previous, Next); Compare; Protect; then Collaboration, Chat, History and Mailings, which do not exist in Word.
- **View**: Views (Read Mode = the title bar's read-only mode, Page = Editing); Show (Ruler, Navigation Pane as checkboxes); Zoom (zoom, 100%, One Page, Multiple Pages, Page Width); Appearance; Interface (toolbar, status bar, panels); Macros.
- Fluent icons for the upstream icons that remained (vertical alignment, border style, combine, fragment, linear/professional equation, previous/next item, read mode, text direction…) and ElixirOffice drawings for those without a Fluent equivalent. Still original: the stroke thicknesses of the border lists and the users' avatar.

| | Before (elixir/dev) | After |
|---|---|---|
| All tabs | screenshot `ribbon-before-all.png` (not published) | screenshot `ribbon-after-all.png` (not published) |

Per-tab screenshots: `ribbon-before-<tab>.png`, `ribbon-after-<tab>.png` (1440 px), `ribbon-1280-*.png`, `ribbon-1920-*.png`, contextual `ribbon-ctx-*.png` (and `ribbon-1280-ctx-*`, `ribbon-1920-ctx-*`), menus and boxes `ribbon-menu-margins|breaks|wraptext|shapes|watermark.png`, `ribbon-dialog-wordcount.png`, `ribbon-dialog-icons.png`, behavior `ribbon-1280-collapsed-group.png`, `ribbon-folded-pinnable.png`. Document: `corpus/provisional/teachers/t01-fiche-fractions-cm1.docx` (and `t03` for shapes).

### Ribbon behavior

- **Office-style group collapsing**: when the tab does not fit, its groups collapse from right to left into a button bearing the group name; a click opens the group's controls in a pop-up window (a launched command closes it). Groups come back from left to right when room returns; a large collapsed group does not prevent smaller ones from coming back. Controls are moved, not copied: state, locks and shortcuts are kept. At 1280 px, Insert collapses Text, Symbols and Controls, Review collapses Changes and Protect, Layout collapses Data; at 1440 and 1920 px everything is expanded.
- **Collapse / pin the ribbon**: button at the bottom right of the ribbon ("Collapse the Ribbon", then "Pin the Ribbon" when it displays over the document), Ctrl+F1, double click on a tab (already present).
- Simplified ribbon: not done (it would require a second layout of each group; not "cheap").

### Checks

- Playwright on `t01` at 1280, 1440 and 1920 px, in English and French: each tab, opening then closing each visible menu, table, image, equation, header context; `t03`, `s07`, `a06`, `t07` at 1440 px. **No console error.**
- Functions verified through the API after a ribbon click: Narrow then Mirrored margins (margins and mirror applied), Page Break, Bookmark, Behind Text wrapping and rotation from Shape Format, Only for Me for tracking, DRAFT watermark, Read mode then Page, table and equation insertion (tab opened), image insertion by data URL (tab opened), two icons (2.54 cm each), statistics.
- Everything that was accessible stays so: the moved controls have a twin, or are elsewhere as in Word (Link and Bookmark in Insert, column and section break in Layout > Breaks, complete footnote menu under Insert Footnote, tracking "for everyone" can be disabled from the status bar).

### What remains different from Word

Absent from the engine (not simulated):
- Insert: Cover Page, Quick Tables, live table preview in the document while hovering the grid, 3D Models, Screenshot, Online Video, Signature Line (outside desktop), Document Properties in QuickPart, preset header and footer galleries.
- Design: Themes, Style Sets, Theme Fonts, Paragraph Spacing, Effects, Page Borders (only the colors and the watermark exist).
- Tables: Split Table, Sort, Border Styles and Border Painter.
- Pictures: Remove Background, Corrections, Color, Artistic Effects, Compress, picture styles gallery, Picture Layout; the icons are images, not recolorable SVGs.
- Shapes: shape styles gallery, WordArt styles on the text of an existing shape.
- Layout: text wrapping break, Selection pane.
- References: Citations and bibliography, Index, Table of Authorities.
- Review: Spelling and Grammar pane (only spell checking while typing exists), Reviewing pane, "Show Markup" filters; Previous/Next for comments follows the order of comments in the document, not the cursor position.
- View: real Read layout (ElixirOffice's Read mode is the read-only view), Web, Outline, Draft, Focus, Immersive Reader, Page Movement, Gridlines, Window group.

Not done for lack of time: simplified ribbon; Navigation group of the Header & Footer tab (Go to Header, Previous, Next); icon search in the interface language (Fluent names are in English).

Upstream incident noted: "Bring Forward" on the star of `t03` placed behind the text raises `this.Parent.GetTopElement is not a function` in sdkjs, also with the original Layout button (pre-existing bug, not fixed here).

## Interaction polish and keyboard parity (2nd pass)

Branches `elixir/interact` (web-apps, sdkjs) and `feat/interact` (this repository), instance `eo-interact` (port 8095). Detail, results and gaps: [`docs/shortcuts.md`](shortcuts.md).
- **Word shortcuts**: matrix `docs/shortcuts-word.csv` (308 shortcuts from Microsoft's page, Windows and macOS), Playwright suite `tests/shortcuts/`. "Editor" scope: 76/171 → 172/172 with Windows keys, 60/126 → 128/128 with the Mac's.
- **KeyTips**: Word's letters (Alt, H, 1 = bold; Alt, N, T = table…), F10, Alt+H held, keyboard navigation in the ribbon, Office-style labels.
- **Mini toolbar** on mouse selection and above the context menu, fade according to the distance from the pointer.
- **Context menus** in Word's order, with labels, Fluent icons and shortcuts on the right; spelling suggestions first, in bold.
- **ScreenTips**: title and shortcut in bold, one description line, Office's delay; common focus ring; tab change with a fade; no layout jump.
Screenshots: `screenshots/ui2/interact-*.png`.

## Spreadsheet

Session of 2026-10-05, "spreadsheet" slice. Goal: make the workbook editor (`web-apps/apps/spreadsheeteditor/main`) look like Excel for the web / Excel 2024 and handle the same way, at the level already reached by the text editor. Branches: `elixir/cell` in web-apps and sdkjs (worktree `$EO_WORK/wt/cell`), `feat/cell` in this repository. Nothing is pushed. Test instance: `eo-cell`, port **8099** on <dev-host> (`./eo.sh up cell 8099`, build by `$EO_WORK/wt/cell-work/build.sh`).

Test workbooks: `tests/fixtures/xlsx/` (generated by `tools/xlsx-fixtures/make_fixtures.py`, sent to the instance by `tools/xlsx-fixtures/upload.sh`): sales report (table, formulas, charts, conditional formatting, four colored sheets), grade book, budget, small workbook for shortcuts, data for a pivot table. Screenshots: headless Chromium (Playwright, `$EO_WORK/pw/cell/shot.mjs`), 1440×900 unless stated otherwise, `c01-sales-report.xlsx`.

### Before / after

| | Before | After |
|---|---|---|
| Home | screenshot `before-c01.png` (not published) | screenshot `after-home.png` (not published) |
| Insert | screenshot `before-c01-insert.png` (not published) | screenshot `after-ins.png` (not published) |
| Formulas | screenshot `before-c01-formula.png` (not published) | screenshot `after-formula.png` (not published) |
| Data | screenshot `before-c01-data.png` (not published) | screenshot `after-data.png` (not published) |
| File | screenshot `before-c01-file.png` (not published) | screenshot `after-file-home.png` (not published) |

Other screenshots (`screenshots/cell/after-*.png`): `layout`, `review`, `view`, `draw`, `numfmt` (format list), `condformat` and `condformat-rule`, `formatastable`, `contextmenu`, `minitoolbar`, `tabmenu`, `chartdesign`, `chartformat`, `keytips` (Alt, H), `search` (Alt+Q), `file-info`, `file-print`, `file-export`, `file-saveas`, `insert-function`, `formula-autocomplete`, `function-tooltip`, `autofill`, `dark`, `dark-file`, `dark-chart`, `fr`, `fr-file` (French interface), `1280` (1280×800 window). Icon board: not redone (see "Icons").

### 1. What is shared with the text editor

The generic parts of the Word work were moved out of `documenteditor` into `apps/common/main/lib/...`; Word uses the same modules (verified: title bar, search, backstage, KeyTips, group labels, no console error).

| Common module | Role | Subclasses |
|---|---|---|
| `elixir-chrome/TitleBar.js` (`Common.Views.ElixirTitleBar`) | file name and saving state, name pane, "Search (Alt+Q)" search | `DE.Views.ElixirTitleBar`, `SSE.Views.ElixirTitleBar` |
| `elixir-chrome/Backstage.js` (`Common.Views.ElixirBackstage`) | Office-style File menu | `DE.Views.ElixirBackstage`, `SSE.Views.ElixirBackstage` |
| `elixir-chrome/CommandIndex.js`, `Icons.js` | ribbon command index, inline Fluent icons | — |
| `component/RibbonGroupLabels.js` | group labels and dialog launchers (before: in `DE.Views.Toolbar`) | mixed into both ribbons |
| `controller/ElixirKeyTips.js` | KeyTips, level-0 filter, Alt+letter chords, keyboard navigation in the ribbon | `DE.Controllers.WordKeyTips`, `SSE.Controllers.ExcelKeyTips` |
| `controller/ElixirScreenTips.js` | ScreenTips (delay, one-line description) | `DE.Controllers.ScreenTips`, `SSE.Controllers.ExcelScreenTips` |
| `resources/less/elixir-chrome.less`, `elixir-ribbon.less` | styles of the backstage, title bar, labels, contextual tabs, group collapsing | imported by both editors |

The subclasses keep their translation keys (`DE.Views.*` for Word): no Word translation moved. `Common.UI.RibbonCollapse` learns `data-collapse-first` (a wide gallery, like Cell Styles, collapses before the groups to its right, as in Excel).

### 2. Excel's ribbon

- Excel's tabs and KeyTips: File (F), Home (H), Insert (N), Draw (JI), Page Layout (P), Formulas (M), Data (A), Review (R), View (W). "Collaboration" and "Protection" now form a single Review tab, as in Excel (groups Comments, Protect, then Collaboration, Chat, History which Excel does not have). View follows Excel's order (Sheet View, Workbook Views, Show, Zoom, Window).
- **Home**: Clipboard (big Paste button, Cut, Copy, Format Painter); Font (font, size, grow, shrink / bold, italic, underline, borders, fill, font color); Alignment (top, middle, bottom, orientation / left, center, right, **decrease and increase indent** (new) / Wrap Text, Merge & Center); Number (format list in Excel's order with the active cell's preview, accounting, percent, thousands, decimals); Styles (Conditional Formatting, Format as Table, Cell Styles); Cells (Insert, Delete, Format); Editing (AutoSum, Fill, Clear, **Sort & Filter**, **Find & Select**). Strikethrough, subscript/superscript, Change Case, Justify and Text Direction are not in Excel's ribbon: their buttons stay in the template, hidden: their shortcuts (Ctrl+5 for strikethrough) and locks work.
- **Insert**: Tables, Illustrations, Charts (launcher: Recommended Charts), Sparklines, Filters, Links, Comments, Text, Symbols, Cell Controls.
- **Page Layout**: Themes, Page Setup (launcher: File menu's Print page), Scale to Fit, Sheet Options, Arrange. **Formulas**: Function Library, Defined Names, Formula Auditing, Calculation. **Data**: Get & Transform, Queries & Connections, Sort & Filter (with Filter and Clear labels), Data Tools, Forecast, Outline, Analysis.
- **Galleries and menus**: Conditional Formatting like Excel (Highlight Cells Rules, Top/Bottom Rules, Data Bars, Color Scales, Icon Sets, New Rule, Clear Rules, Manage Rules, with icons; the other rule types stay in New Rule); Format as Table (Light, Medium, Dark, previews); Cell Styles (gallery, collapsed into a button at 1440 px like Excel); number format list (General, Number, Currency, Accounting, Short Date, Long Date, Time, Percentage, Fraction, Scientific, Text, More Formats, each with the active cell's value).
- **Contextual tabs** (on the right, accent color): Table Design and PivotTable (the upstream's, presented as contextual), and new: **Chart Design** (Change Chart Type, Switch Row/Column, Select Data) and **Format** (Format pane, Arrange) for a chart, **Shape Format** (Shapes, Text Box, Format pane, Arrange), **Picture Format** (Format pane, Arrange). Inserting a chart opens Chart Design, like Excel.
- Launchers: Font and Alignment (Cell panel), Number (Format Number box), Charts (Recommended Charts), Page Setup (Print page).
- Office-style group collapsing, pin / collapse the ribbon, Ctrl+F1 (taken from Word).

### 3. Grid frame

- Formula bar: Name box, then **Cancel (✕) and Enter (✓)** like Excel (active while typing), fx, expand chevron.
- Light row and column headers; selection headers and selection outline in the **accent color** (not Excel's green): two optional theme tokens read by sdkjs (`canvas-cell-selection-border`, `canvas-cell-title-text-selected`, `[upstreamable]` fix, no effect without them), set in `office.less`, in light and dark.
- Sheet tabs on their own row above the status bar ("uncombined" layout now the default), with arrows, + button, sheet list, tab colors (upstream). Tab context menu in Excel's order: Insert, Delete, Rename, Move or Copy, Protect, Tab Color, Hide, Unhide, Select All Sheets.
- Status bar: **Average, Count, Sum** by default (Min and Max are added through right click, remembered choice), **Normal / Page Break Preview** buttons, **zoom slider** (10 to 100% on the left half, 100 to 400% on the right, snap at 100%) and percentage.
- File menu like Excel's backstage: Home, New, Open, Info (Protect Workbook: encrypt, **Protect Current Sheet**, **Protect Workbook Structure**, signature; Inspect Workbook; Version History), Save a Copy, Save As (Excel's formats), Print (the upstream's live preview), Share, Export (PDF, PDF/A; types: xlsx, xlsm, xlsb, xltx, ods, ots, csv, images), Close, About, Options. It opens on Home.

### 4. Interaction

- **Shortcuts**: matrix based on Microsoft's public page "Keyboard shortcuts in Excel" (Windows and macOS tabs, <https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f>, accessed on 2026-10-05) in `docs/shortcuts-excel.csv`, Playwright suite `tests/shortcuts-excel/`, detail and results in `docs/shortcuts-excel.md`. `editor` scope: **79 → 124 out of 141** shortcuts with Windows keys, **68 → 117 out of 134** with macOS's (`SSE.Controllers.ExcelShortcuts`: Ctrl+O, F12, Ctrl+Shift+U, F6, F5 / Ctrl+G, Ctrl+D / R, Ctrl+9 / 0, Alt+Shift+arrows, Shift+F11, Alt+F1, Ctrl+T, F7, Shift+F2, Ctrl+-, Ctrl+2 / 3 / 4, borders, Ctrl+Alt+F9, access keys of Paste Special, macOS variants). The remaining gaps are in the engine (End mode, F8, F4, Ctrl+', Ctrl+A in a function…), listed in `docs/shortcuts-excel.md`.
- **Context menus** of cells, rows and columns in Excel's order (Cut, Copy, Paste | Insert, Delete, Clear | Filter, Sort | New Comment | Format Cells…, Pick From Drop-down List…, Define Name…, Link | Row Height, Column Width, Hide, Unhide | Freeze Panes), Excel's words, shortcuts on the right. The upstream addresses some items by their number: only the order on the page changes.
- **Mini toolbar** on right click, above the menu, like Excel: font, size, grow, shrink, accounting, percent, thousands, format painter / bold, italic, center, fill and font color (with palettes), borders, decimals, merge and center.
- **Excel's KeyTips** (Microsoft 365, en-US) on all tabs and the backstage; Excel's **ScreenTips** on the ribbon commands.

### 5. Formulas and fill

- Argument tooltip while typing (current argument in bold) and autocomplete list of functions with their description: already like Excel in the upstream, verified.
- **Insert Function** box with Excel's words ("Search for a function", "Or select a category", "Most Recently Used", syntax in bold); the upstream's **Function Arguments** box is already Excel's.
- Fill handle: verified (1, 2 dragged over four cells give 3, 4, 5, 6); right-click drag offers the upstream's fill menu.

### Languages

Strings in English (default language) and in fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh, with Excel's vocabulary of each language (keys `SSE.Views.ElixirTitleBar.*`, `SSE.Views.ElixirBackstage.*`, `SSE.Views.RibbonTabs.*`, `SSE.Controllers.Excel*.*`, `SSE.Views.Toolbar.txtElx*`); the strings common to Word's backstage and title bar and identical ScreenTips reuse the text editor's translations. The other languages fall back to English.

### Icons

Fluent UI System Icons (MIT) for all the spreadsheet's own icons (128 `spreadsheeteditor/*` and `common/*` entries added to `tools/fluent-icons/map.json`, including charts, sorts, filters, number formats, functions, pivot tables, protection, and the new ribbon commands); one drawn icon (percent, `tools/fluent-icons/custom/spreadsheeteditor/`). Still original: the icons of the detailed chart types in the galleries, the previews of data bars, color scales and icon sets (these are previews, not icons).

### What remains different from Excel

- Engine (not simulated): **Flash Fill** (Ctrl+E; the type exists in sdkjs but is not implemented), **Quick Analysis** (button under the selection: no recommendation engine; to be done as a small palette of existing commands, conditional formatting, charts, totals, tables), **Auto Fill Options** button after a drag (only the right-click drag menu exists), Get Data (Power Query), Forecast, What-If Analysis except Goal Seek, Custom Views.
- Ribbon: no chart galleries by type in Insert (a Chart button with a menu), no Quick Layout, chart styles and colors in Chart Design (they are in the right panel), no Size and WordArt Styles groups in the Format tabs, no Automate nor Help tab (deliberately omitted).
- Status bar: no Page Layout mode; no "Numerical Count".
- Mini toolbar: only on right click on cells (not on objects).
- KeyTips: English Excel's letters for all languages (Excel localizes its KeyTips).
- The Segoe UI fonts are not on the capture machine.

## Presentation

Session of 2026-10-05/06. Goal: make the presentation editor (`web-apps/apps/presentationeditor/main`) look like PowerPoint for the web / PowerPoint 2024 and handle the same way. Branches: `elixir/slide` in web-apps and the DocumentServer superproject (sdkjs unmodified, up to date with `elixir/dev`), `feat/slide` in this repository. Nothing is pushed. Working instance: `eo-slide`, http://localhost:32773/example/ on <dev-host> (`./eo.sh up slide`, start page from the sources through `make example CONTAINER=eo-slide UPSTREAM=$EO_WORK/wt/slide`).

Test documents: `tests/fixtures/pptx/` (python-pptx generator `make_fixtures.py`): `p01-cours-photosynthese.pptx` (8 slides: title, bullets, image, chart, table, two contents, section header, presenter notes, transitions) and `p02-blank-16x9.pptx` (3 slides, shortcut tests). Screenshots: `screenshots/slide/` (headless Chromium, 1440x900, p01).

### Before / after

| | Before (elixir/dev) | After |
|---|---|---|
| Home | screenshot `before-home.png` (not published) | screenshot `after-home.png` (not published) |
| Insert | screenshot `before-insert.png` (not published) | screenshot `after-insert.png` (not published) |
| Design | screenshot `before-design.png` (not published) | screenshot `after-design.png` (not published) |
| Transitions | screenshot `before-transitions.png` (not published) | screenshot `after-transitions.png` (not published) |
| Animations | screenshot `before-animations.png` (not published) | screenshot `after-animations.png` (not published) |
| View | screenshot `before-view.png` (not published) | screenshot `after-view.png` (not published) |
| File | screenshot `before-file.png` (not published) | screenshot `after-file.png` (not published) (Home) |
| Status bar | screenshot `before-statusbar.png` (not published) | screenshot `after-statusbar.png` (not published) |
| Presenter view | screenshot `before-presenter.png` (not published) | screenshot `after-presenter.png` (not published) |

Other screenshots: `after-slideshow.png` (Slide Show tab), `after-review.png`, `after-ctx-shape.png`, `after-ctx-picture.png`, `after-ctx-tabledesign.png`, `after-ctx-tablelayout.png` (contextual tabs), `after-print.png` (Print with preview), `after-export.png`, `after-saveas.png`, `after-comments-pane.png` (Comments pane on the right, thumbnails kept), `after-keytips.png` (Alt, H then Alt, S), `after-dark.png` (dark theme), `after-fr-insert.png` (French interface), `after-1280-insert.png` (1280 px window), `after-editor.png`.

### 1. Window frame (shared modules)

- Title bar, command search (Alt+Q), backstage File menu and Fluent icons come from the shared modules `apps/common/main/lib/elixir-chrome/` (extracted by the Spreadsheet work). The presentation editor subclasses them: `PE.Views.ElixirBackstage` (PowerPoint's formats: pptx, pptm, potx, ppsx, odp, otp, PDF, PDF/A, images of one slide per file; "New Presentation"; no "Restrict editing"), `PE.Views.ElixirTitleBar` (suggested commands: New Slide, Table, Pictures, Text Box, Chart, Slide Size). Controller: `PE.Controllers.ElixirChrome` (`app/elixir-slide/Controller.js`).
- Additions to the shared modules: PowerPoint's order in the File pane when the editor's template differs from Word's (Info in the first block, Options last); `elixir-chrome/SidePanels.js` and `resources/less/elixir-side-panels.less` (no more icon bar on the left, Comments pane anchored to the right, for any editor); slide, notes, views, slide show and presenter icons in `elixir-chrome/Icons.js`; Export buttons that keep their label.
- **Print**: live preview in the backstage also in the browser (`canPreviewPrint`, `[upstreamable]` fix), Ctrl+P leads to it. **Export**: "Create PDF Document" (PDF, PDF/A) and "Change File Type".
- Opening the Comments pane (title bar, status bar) keeps the slide thumbnails, like PowerPoint (the upstream hid them).
- Dark mode: the upstream's `theme-night` theme restyled by the ElixirOffice theme, like the text editor; verified without error.

### 2. PowerPoint ribbon

`PE.Controllers.SlideRibbon` (`app/elixir-slide/Ribbon.js`, view `RibbonView.js`) reorganizes the ribbon template at `render:before`, without rewriting `Toolbar.template` nor the upstream views; the original controls that PowerPoint shows elsewhere stay in the template, hidden (`elx-source`).

- Tabs in PowerPoint's order: File, Home, Insert, Draw, Design, Transitions, Animations, **Slide Show** (new), Review (ex-Collaboration), View; Slide Master only in master mode, as in the upstream.
- **Home**: Clipboard (big Paste, Cut, Copy, Format Painter) | Slides (New Slide with the layout gallery as thumbnails, Layout, Reset) | Font | Paragraph | Drawing (shape gallery, Arrange, Align, Merge Shapes) | Editing (Find, Replace, Select All). Undo/Redo are in the quick access toolbar.
- **Insert**: Slides | Tables | Images | Illustrations (shapes, SmartArt, Chart) | Links | Comments | Text (Text Box, Header & Footer, WordArt, Date & Time, Slide Number) | Symbols | Media (Video, Audio, depending on the configuration).
- **Design**: Themes (gallery) | Variants (colors) | Customize (Slide Size, **Format Background**, which opens the slide pane).
- **Transitions**: Preview | Transition to This Slide (gallery, Effect Options) | Timing. **Animations**: Preview | Animation (gallery, Effect Options) | Advanced Animation (Add Animation, Animation Pane, Trigger) | Timing.
- **Slide Show**: From Beginning, From Current Slide, Presenter View | Set Up Slide Show, Hide Slide | Use Presenter View.
- **View**: Presentation Views (Normal) | Master Views (Slide Master) | Show (Notes, Rulers, Guides, Gridlines) | Zoom | Appearance | Window | Macros.
- Group labels and launchers (Font, Paragraph → Paragraph box; Drawing → Shape pane; Animation → Animation pane) through `Common.UI.RibbonGroupLabels`, group collapsing through `Common.UI.RibbonCollapse`, Collapse/Pin ribbon button.
- **Contextual tabs** (`PE.Controllers.SlideContextTabs`, `ContextTabs.js`), to the right of the tabs in accent color, opened when an object is inserted: Shape Format (fill, outline, Format pane, Arrange, size), Picture Format (change, reset picture, border, Arrange, crop/fill/fit, size), Table Design (style options, shading), Layout (select, delete, insert above/below/left/right, merge, split, distribute, vertical alignment), Chart Design (change type, edit data). Same API calls as the right panel, which remains the "Format" pane.
- PowerPoint **KeyTips** (`PE.Controllers.PowerPointKeyTips`, on `Common.Controllers.ElixirKeyTips`): tabs F, H, N, JI, G, K, A, S, R, W, contextual JD, JP, JT, JL, JC; commands (Paste V, New Slide I, Layout L, Bold 1, Find FD, From Beginning B…) and backstage. **Tooltips** (`PE.Controllers.PowerPointScreenTips`): name, shortcut and one sentence on what the command does.
- Fluent icons for the presentation's own icons (`tools/fluent-icons/map.json`, scope `presentationeditor`); the thumbnails of the transitions and animations gallery remain the upstream's.

### 3. Panes and status bar

- Thumbnails: numbers, transition/animation star, drag to reorder (engine, unchanged). Context menu of a slide: "Format Background..." instead of "Slide Settings".
- **Status bar** (`PE.Controllers.SlideStatusbar`): Slide X of Y, language, **Notes** (presenter notes pane; PowerPoint in French also says "Commentaires", kept "Notes" so as not to confuse it with the next pane), **Comments** (pane), Normal / Reading View / Slide Show, zoom out, **zoom slider** (10-100% on the left, 100-400% on the right, snap at 100%), zoom in, percentage (zoom menu), Fit slide to window.

### 4. Slide show and Presenter view

- F5: from the beginning, **full screen**; Shift+F5: from the current slide; Alt+F5: Presenter view (separate window: slides, notes, timer). Reading View plays the slide show in the window.
- Fix: requesting full screen in the same turn as the start left the editor's keyboard commands inactive after the slide show; the request is now made once the slide show has started.
- During the slide show: N / P / Backspace, B or period (black screen), W or comma (white screen), number + Enter (go to the slide), in addition to the upstream's keys.
- Presenter view: bigger timer, clock, "End Slide Show" button in the accent color (`index.reporter.html`); the layout drawn by the engine is unchanged.

### 5. Keyboard shortcuts

- Matrix `docs/shortcuts-powerpoint.csv` (124 rows) taken from Microsoft's public pages "Keyboard shortcuts in PowerPoint" (https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-powerpoint-ebb3d20e-dcd4-444f-a38e-bb5c5ed180f4) and "Use keyboard shortcuts to deliver PowerPoint presentations" (https://support.microsoft.com/en-us/office/use-keyboard-shortcuts-to-deliver-powerpoint-presentations-1524ffce-bd2a-45f4-9a7f-f18b992b93a0), accessed on 2026-10-05; generated by `docs/make_shortcuts_csv.py`. Summary: 58 already present, 40 fixed, 19 missing, 4 held by the browser, 3 not applicable.
- Added (`PE.Controllers.SlideShortcuts`, capture-phase listener, the upstream's shortcuts kept): F5, Shift+F5, Alt+F5; Ctrl+= / Ctrl+Shift++ (subscript, superscript in text, zoom elsewhere); Ctrl+Shift+> / <; Ctrl+Shift+C / V (format painter); Ctrl+Shift+F (Font box); Shift+F3 (case); Alt+Shift+Left/Right (demote, promote); Ctrl+Shift+D (duplicate slide); Ctrl+Alt+M (comment); Ctrl+Shift+[ / ]; Alt+Left/Right (15° rotation); Alt+= (equation); Ctrl+Alt+O (fit); Alt+F9 / Shift+F9 (guides, gridlines); Ctrl+F (Find pane with the selection); Ctrl+K; Ctrl+F1; numeric keypad + / - (zoom); PowerPoint KeyTips. Common `[upstreamable]` fix: a numeric KeyTip ("1") crashed the hint handler.
- Held by the browser: Ctrl+N, Ctrl+T, Ctrl+O, Ctrl+Tab.
- Added 2026-10-08 (`elixir/xlppt`): in a text box Ctrl+Up / Down (start of the current, previous or next paragraph), Ctrl+Shift+Up / Down (select to the start / end of the paragraph), Alt+Shift+Up / Down (move the selected paragraphs; Ctrl+Shift+Up / Down on macOS), Ctrl+Alt+5 (first floating object), Ctrl+Shift+J (regroup the last ungrouped group), Shift+F4 (repeat the last Find) in sdkjs `slide/Editor/elixir-keys.js`; F6 / Shift+F6 (slide, thumbnails, ribbon, status bar; `asc_GetPaneFocus` / `asc_SetPaneFocus`) and, during the slide show, Ctrl+P (pen), Ctrl+E (eraser), Ctrl+A (arrow), Ctrl+L (laser pointer), Ctrl+H (hide the pointer; Control+H on macOS, where Cmd+H hides the application), E (erase the drawings of the slide) in `PE.Controllers.SlideShortcuts`. The matrix has a `macos_keys` column: the keys the suite plays on macOS. Ctrl+Up / Down on a thumbnail already moved the slide (row corrected).
- Missing: animation painter (Alt+Shift+C / V), Paste Special dialog (Ctrl+Alt+V), media play / pause (Ctrl+Space), Outline view (Ctrl+Shift+Tab), Selection pane (Alt+F10), All Slides dialog in the show (Ctrl+S).
- Tests: `tests/shortcuts-pptx/` (`node tests/shortcuts-pptx/run.mjs http://localhost:32773 [--platform win|mac]`): **60 cases out of 60 passed** on eo-slide (2026-10-08 on eo-xlppt: 78/78 Windows, 76/76 macOS; the macOS pass plays Cmd for Ctrl unless a case gives its own keys), each verified by the editor state (API, toolbar state, visible panes). `probe.mjs` helps with diagnosis, `presenter-shot.mjs` captures the Presenter view.

### Languages

New strings in English (default), fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh, with PowerPoint's vocabulary in each language: `PE.Views.SlideRibbon.*`, `PE.Views.SlideContextTabs.*`, `PE.Views.SlideStatusbar.*`, `PE.Views.ElixirBackstage.*`, `PE.Views.ElixirTitleBar.*`, `PE.Controllers.PowerPointScreenTips.*`. Source: `tools/slide-i18n/src/*.txt`, written into the language files by `python3 tools/slide-i18n/apply.py <web-apps>` (idempotent, keeps the files' format and line endings; reuses the translations of Word's backstage and title bar). The other languages fall back to English.

### Checks done

- Each tab, each contextual tab (shape, image, table, chart), the backstage (Home, Info, Print with preview, Export, Save As), Alt+Q, the status bar (Notes, Comments, zoom slider), F5 / Esc, Presenter view, KeyTips, dark theme, French interface, 1280 px window.
- No console error when opening the presentation editor, the text editor and the spreadsheet on eo-slide after merging `elixir/dev` and `elixir/cell`.

### What remains different from PowerPoint

- Slide Sorter (added 2026-10-08, `elixir-slide/Sorter.js`, View tab and status bar buttons) and the next-slide preview of the Presenter View (sdkjs `slide/Drawing/HtmlPage.js`, both on the engine call `asc_getSlideImage`); tests `tests/slide-views/`.
- Engine: no sections, no Selection pane (Reading view is the slide show in the window), no Outline mode, no video export nor handouts, no animation painter, no Selection pane, no Designer.
- Presenter view: no preview of the next slide beside the current slide (the thumbnails stand in), nor zoom on the slide; light background.
- Ribbon: no quick shape styles nor picture styles galleries, no table styles gallery in the Table Design tab (in the right panel), no Video/Audio tabs, no Icons nor 3D Models in Insert, Transitions Preview as a small button.
- Context menu of the thumbnails: the upstream's order (the item indexes are used by its code), without Cut/Copy nor Add Section.
- Print: no "Comments pages", "Handouts" nor "Outline"; printer and copies in the browser's box.
- Smart guides: the upstream's look.

## Polish from real use (Firefox on macOS, murena.io)

Session of 2026-10-06. Branches `elixir/polish` (web-apps, document-server-integration), `feat/polish` here. Before / after screenshots: `screenshots/polish/` (`before-<browser>-*.png`, `after-<browser>-*.png`, Chromium, Firefox, WebKit, 1440x900 at 2x scale like a Retina screen). Test: `tests/polish/ui-polish.mjs` (see below).

### Fixes

- **Start page left bar**: 84 px column, labels under the icon that wrap (never cut, hyphenation possible), `overflow-wrap: anywhere` for a too-long word. The class that truncated the connector's label is removed.
- **Avatar** (start page and title bar of the three editors): fixed 40 px slot (28 px circle), non-shrinkable, inside the window edge, full opacity for a photo. The start page keeps its 4 px margin around the button.
- **Connector name**: "Murena Workspace / Nextcloud" in boxes, buttons and menus (12 start page languages, all editor languages). The left bar displays the friendly name of the connected server: "Murena Workspace" for murena.io and its subdomains, "Nextcloud" for the others (`elixir.nextcloud.serverNames` adds or replaces names). It is also the root of the breadcrumb.
- **Folder icon**: filled Fluent "folder" in two Office yellow tones (tab #e8a317, body #ffc83d) in the `i-folder` symbol (`tools/fluent-sprite.mjs`, `TONES` table), 24 px like the file type icons.
- **Ribbon group labels**: 16 px label row 2 px from the edge, baseline 6 px above the border (Office: 4 to 6 px), descenders at 3 px or more. Three theme variables: `--toolbar-group-label-line`, `--toolbar-ribbon-padding-bottom`, `--toolbar-group-label-font-size`. Dialog launchers are centered on the label row. Style gallery (Word) centered on the controls and not on controls + label. Word's Zoom group no longer has an empty fourth row. Finding before the fix: in Firefox and WebKit the baseline touched the border (0 to 0.5 px), in Chromium too.

### Look closer to Office

References: Word, Excel, PowerPoint for the web **and** desktop Office (Windows and Mac, 2021, 2024, 365). When the two differ, we take the desktop one if it is richer and more familiar to a Word user: classic ribbon with two rows of controls with group labels and launchers, multicolor icons, title bar with quick access, backstage. No Microsoft logo nor blue; the accent stays `@elixir-accent`.

| Measure | Value retained | Reference |
|---|---|---|
| Title bar | 36 px | desktop 32 to 36 px, web 48 px |
| Tab row | 32 px, 13 px, active 600 + 3 px accent line | desktop ~ 30 px, 12 to 13 px |
| Ribbon (controls) | 88 px: 6 + 60 (two rows) + 4 + 16 (label) + 2 | desktop 91 to 96 px depending on scale |
| Group label | 11 px, gray #616161, centered, baseline 6 px from the border | desktop 11 px |
| Ribbon panel | white, 8 px radius, soft shadow, separators #e1e1e1 | web: 4 to 8 px radius |
| Hover / pressed | neutral grays #ebebeb / #e0e0e0 (checked #e0e0e0, checked + hover #d6d6d6) | desktop and web: neutral grays |
| Button radius | 4 px, menus 8 px | |
| Interface font | Segoe UI Variable Text, Segoe UI, `-apple-system`, `BlinkMacSystemFont`, `system-ui` | Windows: Segoe UI; Mac: SF |

Font under Firefox on macOS: `-apple-system` resolves there to San Francisco (same stack as Safari), so the editor and the start page take the Mac's system font there, like Office for Mac. The upstream's theme set `"Segoe UI"` alone in `:root .theme-white`, more specific than our setting: the variable is now set in the `body.theme-white` and `body.theme-night` blocks. On the capture machines (Linux) we fall back to the system font.

### Color icons (Fluent "Color" style)

- `tools/fluent-icons/map.json` accepts `{ "name": "<icon>", "color": true }` (or the name of a different colored icon); `gen.mjs` then takes `<name>_<size>_color.svg` keeping its fills and gradients (identifiers made unique per symbol, the sprite being inline). Without a color variant at this size, the "regular" icon stays (list displayed at generation).
- 34 color icons among the most visible: Picture, Table, Chart, Link, Comments, Date & Time, Bookmark, Table of Contents, Controls, Review, Protect, History, Chat, Mailings, Read mode, Macros, Modules, line charts, workbook protection, etc. Fluent has no color variant for the format painter, font color, highlight, shapes, Paste: Paste is drawn for ElixirOffice in the same style (`tools/fluent-icons/custom/common/btn-paste.svg` and `big/btn-big-paste.svg`: clipboard of the color variant and sheet); the monochrome icons keep their accents (yellow highlight, font color).
- Same mechanism for Word, Excel and PowerPoint (a single table).

### Tests

```bash
EO_BASE=http://localhost:8080 node tests/polish/ui-polish.mjs [--shots dir --tag after]   # BROWSERS=chromium,firefox,webkit NC=0 to skip the connected checks
```

Chromium, Firefox, WebKit at 1440x900, 2x scale: no left-bar text overflows its box nor the bar (en, fr, de, connected or not), avatar of the start page and of the three editors fully visible (initials and Nextcloud photo), group labels (all pages of the three editors): baseline at 4 px or more from the border, descenders at 2 px or more, launchers on the label row. WebKit on Linux requires `libevent-2.1`, `libgav1`, `libyuv` and a few GStreamer libraries (copied into `~/.cache/ms-playwright/webkit-*/minibrowser-wpe/lib` without root rights).

### What remains different from Office

- No real Segoe UI nor SF on the capture machines; to re-verify on a Mac and a Windows machine.
- Color icons: only those that Fluent provides in color (plus Paste). Format painter, font color, highlight, shapes keep monochrome icons.


## First tester feedback: Language control and Borders icons (2026-10-07)

Branches `elixir/fb13` (web-apps) and `feat/fb13` (this repository). Screenshots: `screenshots/fb13/` (`before-*`, `after-*`, and the test captures `fb13-*`). Test: `tests/shortcuts/language-borders.mjs` (51 checks).

### F1. Language

- Cause: the Review tab Language button opened a dialog with a combo box of 250 languages whose drop-down was drawn wider than the window, with some rows 180 px high (empty indicator svg without a size) and the list scrolled to the checked row, leaving a blank area (`before-language-dialog.png`). The status bar menu had the same defect (`before-statusbar-language-menu.png`).
- Language dialog (`Common.Views.LanguageDialog`, web-apps `apps/common`): title "Language", "Mark selected text as:", search field (focused; matches native name, English name and code), one list with the sections Current language, Recently used (same `app-settings-recent-langs` list as before, 5 entries) and All languages, native name with the English name beside it, a check on the current language, the dictionary indicator, then "Do not check spelling or grammar" and the buttons Set As Default, OK, Cancel. 400 px wide, list 264 px high: no scroll of the page. Up/Down in the search field move through the results, Enter and double click apply.
- Behaviour: OK sets the language of the selection (or of the cursor) with `put_TextPrLang`. Set As Default sets the document default language (`asc_setDefaultLanguage`) and the selection. Before, OK set only the document default. "Current language" is the language at the cursor (`asc_onTextLanguage`), like the status bar; with no information it is the document default.
- "Do not check spelling or grammar": Word marks the selected text as no-proofing. The engine has no per-run flag (a language with no dictionary cannot be saved in .docx: the writer emits `w:lang w:val="undefined"` for an unknown code), so the option reflects and sets the spell checking switch (Review > Spelling, File > Advanced Settings), for the whole editor. Listed in docs/differences.md.
- Review > Language drop-down: current and recent languages (one click, checked current) above "Set Proofing Language...".
- Status bar: the language caption opens the same dialog (it was a 250 entry menu); the Set Document Language icon next to it opens it too.
- Dark theme and French strings checked; strings in en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh (Word and PowerPoint locales).

### F3. Borders

- Cause: Fluent's `border_*` icons are rounded outlines in which the active edge cannot be told from the dashed ones at 20 px: Bottom, Top, Left, Right and No borders looked identical (`before-borders-menu-2x-light.png`).
- New glyphs drawn by `tools/fluent-icons/gen-borders.mjs` (writes `custom/common/` and the theme icons; the nine `map.json` entries were removed): a 16 px square, the edges that are on solid and 2 px thick, the edges that are off 1 px dots (45% of the icon colour), same square for the ten variants, everything on whole pixels (crisp at 100%, readable at 150% and 200%). Home > Borders button (default Outside borders), its menu (Bottom, Top, Left, Right, No, All, Outside, Inside, Inside horizontal, Inside vertical), Table Design > Borders (big, All borders) and the spreadsheet editor menus share them. Fill only (`icon-fill-gray-primary`), so the theme colours them in light and dark.
- Checked in the test at 100% and 150% in the light theme and 100% in the dark theme: ten distinct renderings, glyph size, contrast of the solid edges (>= 7:1) and of the dots (>= 2:1), Bottom borders applies the bottom border only.
- Unchanged: Border style, Border color (swatch of the current colour) and Borders and Shading... icons.

## Inline spelling correction (F2, 2026-10-07)

Branches `elixir/spell` (sdkjs, web-apps) and `feat/spell` (this repository). Test: `tests/spell/spell.mjs` (Word and Presentation, 33 checks) and the `misspelled*` scenarios of `tests/ctxmenu/sweep-word.mjs`. Screenshots: `screenshots/spell/before-spelling-menu.png`, `after-spelling-menu.png`.

- Before: the menu on a misspelled word already listed the engine's suggestions, but only three (the others behind "More variants..."), with Ignore and Ignore all, "Select language" (a 250 entry list), and "Add to dictionary" only in the desktop app (the browser had no user dictionary).
- Now (Word's design): up to five suggestions in bold at the top (the engine's best first; no sub-menu), separator, **Ignore All**, **Add to Dictionary**, **Language**, then the usual items. Picking a suggestion replaces the word in one undo step (`asc_replaceMisspelledWord`, one `StartAction`). When the engine has none: a greyed "No Spelling Suggestions" entry (the other commands stay). Ignore (once) is not offered, as in Word's context menu.
- **Language** (consistent with the Language dialog of F1): the language at the cursor (checked), the recently used ones (the list of the Review tab drop-down and the dialog), then **Set Proofing Language...** that opens the Language dialog; the 250 entry search menu is gone. A language picked from the menu is remembered in the recent list (the Review tab drop-down did not remember it: fixed too).
- **Add to Dictionary** in the browser: sdkjs `asc_spellCheckAddToDictionary` stores the word in the browser's `localStorage` (`elixir-user-dictionary`, nothing leaves the computer; a lower-case word is also accepted capitalized) and ignores it at once in the open document; `CDocumentSpellChecker` loads the list when a document opens, so it applies to every document opened in that browser (not to other browsers or computers; `asc_spellCheckClearDictionary` empties it). Ignore All stays per open document, as in Word. The desktop editors keep their own system dictionary path.
- Same menu in **table cells** (it was a "Spellcheck" sub-menu) and in **Presentation** text boxes (tables of slides keep the sub-menu: the item indexes of that menu are used elsewhere).
- F7 (next misspelling, opens its suggestions: no Editor pane here) and Review > Spelling (switch of the checking, then the menu has no spelling item) are unchanged and tested.
- Spreadsheet: unchanged (the Spellcheck panel of that editor; no underline in cells).
- Strings: en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh (Word and PowerPoint locales).
- Dictionaries: the dev container ships 49 Hunspell dictionaries (`$EO_ROOT/dictionaries`, `/<version>/dictionaries/<lang>/<lang>.dic`, 200 for en_US and fr_FR) and the engine (`sdkjs/common/spell/spell/spell.wasm`). In the production image they come from the `dictionaries` submodule of DocumentServer through `COPY dictionaries` of `build/.docker/bundle.bake.Dockerfile` (nothing in our brand HCL, Dockerfile.fonts or the entrypoint removes them); `tools/image/validate.sh` now checks them (folder count and HTTP 200 on en_US, fr_FR, the engine). Not run against the demo image from <dev-host> (<build-host> untouched): see docs/install-server.md.
- Not done: AutoCorrect of common typos while typing; grammar (the engine only checks spelling).
- Test harness note: the engine stops checking a document that `setDoc` rebuilt several times (also on the unmodified build; fixing eight words in a normal document works), and text put by the builder (cells, replaced paragraphs) is only checked once edited. The tests build the misspelled text once and retype a character before each opening.

## UI gaps with Word, third pass (2026-10-08)

Branches `elixir/uigaps` (sdkjs, web-apps) and `feat/uigaps` (this repository). Tests: `tests/comments/margin.mjs`, `tests/ribbon/chart-tabs.mjs`, `tests/ribbon/word-gaps.mjs`. Screenshots: `screenshots/uigaps/` (our editor; the side-by-side with Word on a real Windows or macOS machine is still to do, see "What remains").

Each addition is a separate web-apps module, loaded by `app.js` / `app_dev.js` and styled by an `@import` in `app.less`; the engine side is a small set of `asc_Elixir*` API methods in `sdkjs/word/api.js`.

### 1. Comments in the margin, like Word

- Every comment is a **balloon in the right margin**, next to the line of its anchor (`apps/documenteditor/main/app/elixir-comments/Margin.js`). The page and the markup area are centered together: the engine keeps a markup area on the right of the pages (`asc_ElixirSetMarkupWidth`, `HtmlPage.ElixirMarkupWidth`: page centering, document width, horizontal scroll and Fit Width account for it). The area is 296 px wide, narrower (down to 216 px) in a narrow window.
- Balloon: initials avatar in the author's color, name, date, text (three lines when not selected), reply count. Selecting a comment (click on the balloon, or the cursor in its text) aligns its balloon with the text, moves the others aside, draws a **connector line** from the anchor to the balloon, shows the replies and a **Reply** box (Ctrl+Enter or Post, Esc cancels). **Resolve** (check mark) and **More thread actions** (Edit comment, Resolve/Reopen thread, Delete thread) on each balloon.
- Positions follow scrolling, zooming and typing (`asc_ElixirGetCommentAnchors`, event `asc_onElixirCommentAnchorsChanged` sent after each page placement and recalculation). The mouse wheel over the balloons scrolls the document.
- The upstream floating popover is no longer opened on commented text while the balloons are shown (the Comments controller's `onApiShowComment` and `onApiUpdateCommentPosition` are wrapped); it is still used to type a **new** comment (Ctrl+Alt+M, Insert > Comment, Review > New Comment): it opens in the margin, then the comment gets its balloon.
- The **Comments pane** stays available (Comments button of the title bar, Review > Comments): while it is open the balloons hide and the page recenters (Word's "List" view). Review > Show Comments off, no comment, or only resolved comments (when resolved comments are hidden): no markup area, the page is centered as before. Multiple pages view: no balloons.

| All comments | Selected comment | Comments pane |
|---|---|---|
| screenshot `margin-all.png` (not published) | screenshot `margin-selected.png` (not published) | screenshot `margin-pane.png` (not published) |

### 2. Ribbon autonomy: the right panel only for "More Options"

Inventory of what still depended on the right panel (properties pane) in the Word editor, and what was done:

| Object | Before | Now |
|---|---|---|
| Table | Table Design / Layout tabs | unchanged (done in the ribbon pass) |
| Picture, shape, text box, equation | Picture Format, Shape Format, Equation tabs | unchanged |
| **Chart** | **only the right panel** (type, style, data, wrapping, size) | **Chart Design** tab (Chart Styles gallery with the engine's previews, Edit Data, Change Chart Type) and **Format** tab (Alt Text, Position, Wrap Text, Bring Forward, Send Backward, Align, Group, Height, Width); the Chart Styles launcher is the "More Options" that opens the right panel (3-D rotation, linked data source) |
| Paragraph | Home and Layout (spacing, indents, borders and shading, Paragraph dialog) | unchanged |
| Header and footer (distance from top/bottom, different first page, odd and even, link to previous, page numbering) | Header & Footer tab | unchanged |
| Text Art (transform, text fill and outline) | right panel | not done: Shape Format has fill, outline and effects of the shape, not of its text |
| Mail merge, signature, form fields | right panel | not done (not Word features of the ribbon in the same form) |

The right panel is closed by default and opens only on demand (View > Right panel, a group launcher such as Chart Styles, Shape Styles, Picture Styles). Inserting a chart opens Chart Design, like Word.

### 3. Design tab

Document Formatting: **Themes** | **Style Set** gallery | Colors | **Fonts** | **Paragraph Spacing**; Page Background: Watermark, Page Color, **Page Borders** (`elixir-design/`).

- **Themes**: 22 themes built on the color schemes the engine ships: Office (Aptos Display / Aptos), Office 2013 - 2022, Office 2007 - 2010, and Aspect, Median, Paper, Marquee, Slipstream with Word's fonts for those themes; the other color schemes (Blue, Blue II, Blue Warm, Blue Green, Green, Green Yellow, Yellow, Yellow Orange, Orange, Orange Red, Red, Red Violet, Violet, Grayscale) are paired with a font pair and keep their color scheme name. A tile shows "Aa" in the heading font and six accent colors; a theme applies its color scheme and its theme fonts.
- **Fonts**: 17 theme font pairs (Office = Aptos Display / Aptos, Office 2013 - 2022 = Calibri Light / Calibri, ..., Liberation) and Customize Fonts... (heading and body font). New engine method `asc_ElixirSetThemeFonts(major, minor)`: changes the theme font scheme (one undo step), loads the fonts first, recalculates; text set to the heading or body theme font follows, like Word.
- **Style Set**: nine sets (Basic (Simple), Basic (Elegant), Basic (Stylish), Casual, Centered, Lines (Simple), Lines (Distinctive), Shaded, Minimalist) rewriting Title, Heading 1 and Heading 2 (size, bold, italic, capitals, theme accent or fixed color, alignment, spacing, bottom border, shading); the fonts stay the theme fonts. One undo step (builder API).
- **Paragraph Spacing**: Word's presets on the Normal style: Default (after 8 pt, 1.08), No Paragraph Space, Compact, Tight, Open, Relaxed, Double.
- **Page Borders**: dialog Setting (None, Box), color, width, measured from the text or the edge of the page; applied to every section (`asc_ElixirSetPageBorders`, stored in the section properties and saved in .docx). Single lines only for now (no art borders, double lines or shadow).

### 4. Insert tab

- **Cover Page** (Pages group, first like Word): four covers (Simple, Banded, Centered, Lines) with the document title (core properties), subtitle, abstract, author (the user's name) and date placeholders, inserted at the start of the document in a content control on its own page; picking another cover replaces it, **Remove Current Cover Page**.
- **Quick Tables** in the Table menu: Calendar (current month, weekday names in the interface language), Double Table, Matrix, Tabular List, With Subheads, with table styles.
- **Live table preview**: while the mouse moves over the Insert Table grid, an outline of the table (columns over the text width, one row per line) is drawn at the insertion point; nothing is written in the document until the click.
- **Header and Footer galleries**: Built-in presets above Edit / Remove: Blank, Blank (Three Columns), Title, Title and Date (header); Blank, Blank (Three Columns), Page X of Y, Page Number (Right) (footer). The Page Number menu (top or bottom of page, left, center, right, current position) is the existing one.

### 5. References tab

- **Citations & Bibliography** (before Captions, like Word): Insert Citation (sources of the document, Add New Source...), Manage Sources (Source Manager: list, preview in the current style, New, Edit, Delete), Style (APA 7th, MLA 9th), Bibliography (Insert Bibliography, Update Citations and Bibliography). Source types: book, journal article, web site (authors "Last, First; Last, First", title, year, publisher or journal or site, volume, pages, URL).
- A citation is an inline content control "(Hansen & Sato, 2006)" (APA) or "(Hansen and Sato)" (MLA); the bibliography is a block content control headed "References" or "Works Cited", sorted by author, hanging indent. Changing the style rewrites every citation and the bibliography. The sources are saved in the document (custom property `ElixirSources`), so they travel with the file.
- **Index**: Mark Entry (**Alt+Shift+X**: main entry from the selection, subentry) inserts an XE field like Word, invisible in the text and kept in .docx (`asc_ElixirMarkIndexEntry`); Insert Index builds the index from the XE fields with their pages (`asc_ElixirGetIndexEntries`): letter headings, entries and subentries with their page numbers; Update Index rewrites it.
- Differences with Word: the citations and the bibliography are content controls, not CITATION / BIBLIOGRAPHY fields, and the sources are not in Word's `customXml` source list (Word shows the text but not the sources); the index is a content control, not an INDEX field; no Chicago, IEEE or Harvard styles yet.

### 6. Real user identity

Already delivered by the Nextcloud connector work (`docs/storage.md` section 3): no fixed upstream sample user, local profile ("Me" by default, Change name, initials avatar) or Nextcloud identity, Office-style account menu on the start page and in the title bar, correct names on comments, revisions and co-editing (`tests/nextcloud/connector.mjs`). Checked again here: the comment balloons show the user's name and initials.

### 7. AutoCorrect while typing

- **Replace text as you type** (new): common typos per language (en, fr, de, es, it: "teh" -> "the", "recieve" -> "receive", "i" -> "I", "dont" -> "don’t", "apercu" -> "aperçu", "coeur" -> "cœur"...) corrected when a space, a punctuation mark or Enter follows the word, keeping the case typed ("Teh" -> "The"). Engine: new autocorrection `AUTOCORRECT_FLAGS_TEXT_REPLACE` in `CRunAutoCorrect` (sdkjs `RunAutoCorrect.js`), list given by the interface (`asc_ElixirSetTextAutoCorrect`).
- **Ctrl+Z right after a correction restores what was typed** (each correction is its own undo step), like Word.
- Already in the engine and on by default: capital at the start of a sentence (with the engine's list of abbreviations, such as "sat."), (c) (r) (tm) (e) -> © ® ™ €, straight to curly quotes, hyphens to dashes, automatic lists.
- **AutoCorrect Options** (File > Options > Proofing > AutoCorrect Options): new **Replace Text** page: "Replace text as you type" switch, language, Replace / With fields, the list (filtered while typing), Add, Delete, Reset. The user's entries stay in the browser.

### Checks

On eo-uigaps (port 8107), elixir/uigaps rebased on elixir/dev of 2026-10-08 (cpdf, parity2 wave 1, cellpaste, tableshade): `tests/comments/margin.mjs` 31/31, `tests/ribbon/chart-tabs.mjs` 16/16, `tests/ribbon/word-gaps.mjs` 45/45. No regression: smoke 0 failed checks (5 console errors, all the 404 of `elixir-ai/config.json`: no AI proxy on a test instance), shortcuts 219/219 (Windows) and 167/167 (macOS), mini toolbar 18/18, context menus 15/15, language and borders 51/51, spelling 33/33, layout 24/24, ctxmenu sweeps Word 407/408 (one "menu did not reopen", a different item on each run, also on the reference gate), Spreadsheet 427/427, Presentation 149/149. `make rebrand-check`: 0.

Screenshots (`screenshots/uigaps/`): `margin-all`, `margin-selected`, `margin-pane`, `margin-new`, `ribbon-ctx-chartdesign`, `ribbon-ctx-chartformat`, `ribbon-design`, `ribbon-design-themes`, `ribbon-design-borders`, `ribbon-insert-cover`, `ribbon-insert-table-preview`, `ribbon-references`, `refs-create-source`, `refs-bibliography-mla`, `autocorrect-dialog` (1440x900, headless Chromium).

### What remains different from Word

- Chart: Edit Data opens the chart editor, whose embedded spreadsheet fails to load three scripts (404 on `spreadsheeteditor/main/{api,jquery,sdk}.js`, also on elixir/dev before this work); to fix separately.
- Comments: no "Simple Markup" balloons-only-icon mode, no "@mention" in the balloon reply box (the pane and the popover keep it), new comments are typed in the popover (in the margin) rather than in a new balloon; balloons are not printed (Word prints the markup area on demand).
- Design: Effects and Set as Default; real .thmx themes (the themes are color scheme + fonts); style sets do not change list or table styles.
- Insert: cover pages are simpler than Word's (no shapes or pictures); the table preview is an outline, not the real table.
- References: Chicago, IEEE, Harvard; Word-compatible CITATION, BIBLIOGRAPHY and INDEX fields; Table of Authorities.
- AutoCorrect: no AutoCorrect Options button under a corrected word (Word's lightning bolt), the list is shorter than Word's.
- Side-by-side screenshots with Word on a real Windows or macOS machine.

## Familiar ground for Word users (2026-10-09)

Branches `elixir/familiar` (web-apps) and `feat/familiar` (this repository). Goal from the owner: no pixel copy, but a Word user finds the same places, order, names and behaviours. Method: screenshots of our editor at 1930x1040 and 120% (en and fr, `tests/ribbon/familiar-shots.mjs`) compared with private references of Word 365 for Windows (French UI, not in the repository). Before and after: `screenshots/familiar/` (`before-*`, `after-*`).

### Already like Word (nothing to do)

Title bar with quick access toolbar, file name and Saved state with its pane (rename, location, version history), command search in the middle, avatar; Comments, Editing / Reviewing / Viewing and Share to the right of the tabs; Home groups Clipboard, Font, Paragraph, Styles (gallery), Editing; vertical ruler; "Page X of Y", language, proofing, view buttons, zoom slider and percentage.

### Added

- **AutoSave switch** at the left of the title bar ("Enregistrement automatique" in French). It is the autosave setting of File > Options (`de-settings-autosave`, `asc_setAutoSaveGap`): off means the Save button decides and the state reads "Not saved" until saved. While several people co-edit the setting is fixed on; the switch is then disabled with a tip. Shared title bar module, enabled by the document editor only (`autosaveToggle`).
- **Mini toolbar in a table cell** (right click): row 1 font, size, grow, shrink, bullets, numbering, Styles; row 2 bold, italic, underline, highlight, font colour, format painter, borders, shading; on the right the tall **Insert** (above, below, left, right), **Delete** (cells, columns, rows, table) and **New comment** buttons. Same commands as the Table Design and Layout tabs. In text the previous layout is kept.
- **Status bar**: with a selection the word count reads "2 of 4,378 words" (counted on the selected text, 200 ms after the selection settles); **Display Settings** menu (Ruler, Navigation Pane, same commands as the View tab).
- French group name "Édition" (was "Modification") as in Word.
- Strings in en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh.

### Tests

`EO_BASE=... node tests/ribbon/familiar.mjs` (en and fr, 41 checks): mini toolbar layout and order in a cell, Insert below and Delete rows change the table, shading sets the cell fill, borders menu, New comment, text layout unchanged; word count with and without a selection; Display Settings toggles the ruler; AutoSave switch toggles the setting and is labelled; French group name; no page error.

### What remains different (backlog row of 2026-10-09)

Undo dropdown with the list of steps, Dictate, Add-ins and the Editor group, Focus mode, Accessibility check, larger Styles previews, account menu.

## Sections in the presentation editor (`elixir/xlppt2`, 2026-10-09)

Branches `elixir/xlppt2` (sdkjs, web-apps, core), `feat/xlppt2` here. A section is a group of consecutive slides with a name; PowerPoint writes it as `p14:sectionLst` in `presentation.xml`.

- **Model** (`sdkjs/slide/Editor/sections.js`): the first slide of a section carries the header (`slide.sectionId`, `slide.sectionName`, two history items so undo, redo and co-editing work); the other slides belong by position. So the ordinary commands keep sections right without special cases: deleting or moving away the first slide of a section hands the header to the next slide of the section (`removeSlideByObject`), a slide put in front of the first section joins it (`insertSlide`), a section without slides disappears, and the first slide always has a header once there is one ("Default Section", created by Add Section on a later slide, as PowerPoint does). API: `asc_GetSections`, `asc_AddSection`, `asc_RenameSection`, `asc_RemoveSection`, `asc_RemoveSectionAndSlides`, `asc_RemoveAllSections`, `asc_MoveSection`, `asc_SetSectionCollapsed`, `asc_SelectSection`; event `asc_onSectionsChanged`; `asc_onSectionContextMenu` for a right click on a header.
- **File**: read in `common/Drawings/Format/Format.js` (`CPres`, record 7 of the presentation), written by `common/Shapes/SerializeWriter.js`. The converter already knew the section list but kept the ids of the slides of the original file, which the editor does not keep: core `PPTX::Presentation::toPPTY` now writes the slides of a section as their positions in the list of slides, and `PPTXWriter.cpp` turns the positions into the ids it gives the slides (256 + position). This is a **core (x2t) change**: the converter must be rebuilt (`docs/dev.md`, "x2t of a work item"; branch `elixir/xlppt2` of core, built here in the existing parity2 build folders: `rsync` the worktree's core into `dev-build-cache/core-parity2` and run `cmake --build .` in the `eo` container, 18 min for the first full rebuild because the copy changes every file time stamp).
- **Interface**: Home > Slides > Section (`PE.Controllers.SlideSections`, `presentationeditor/main/app/elixir-slide/Sections.js`); Add Section opens the name box at once. Thumbnails (`sdkjs/slide/Drawing/DrawingDocument.js`, `CThumbnailsManager`): a header row of 24 px above the first slide of each section with an arrow, the name and the slide count; a click on the arrow collapses (the slides take no room and no scroll length; going to one of them expands the section), a click on the name selects the slides of the section, a right click opens the section menu (Rename, Remove, Remove All, Remove Section & Slides, Move Up / Down, Collapse All, Expand All). Slide Sorter (`Sorter.js`): the same headers as full-width rows. Only the left and right thumbnail layouts have headers.
- **Tests**: `tests/slide-views/sections.mjs http://localhost:8121 [mac]` (44 checks on each platform: menu, undo, delete, move, new slide, remove, move section, thumbnails, sorter, save as .pptx and reopen, and `tests/fixtures/pptx/sections.pptx` made by `tests/slide-views/make_sections_fixture.py`, a deck with gaps in the slide ids and three sections as another application writes them).
