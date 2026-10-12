# Shortcut and feature parity roadmap (Word, then Excel and PowerPoint)

Goal (owner, 2026-10-07): be very close to Microsoft Office, so every shortcut of the Microsoft lists must work, which means building the features behind the 72 Word shortcuts the editor cannot serve yet (rows with scope `absent` in `docs/shortcuts-word.csv`). Excel (about 17 gaps, `docs/shortcuts-excel.csv`) and PowerPoint (about 19 gaps, `docs/shortcuts-powerpoint.csv`) follow the same method.

Effort scale: S = hours to 1 day of agent work, M = 2-4 days, L = 1-2 weeks, XL = more (engine feature).

## Word: the 72 absent shortcuts grouped by the feature they need

| Phase | Feature (shortcuts) | Needs | Effort |
|---|---|---|---|
| 1 | **Repeat** (F4, Ctrl+Y fallback) | record the last command, replay it on the selection | M (in progress) |
| 1 | Move / copy to a place (F2, Shift+F2) | a "pick destination" mode | S (done) |
| 1 | **Spike** (Ctrl+F3, Ctrl+Shift+F3) | internal clipboard that accumulates cuts | S (done) |
| 1 | Paste Special dialog (Ctrl+Alt+V) | dialog over existing paste options | S (done) |
| 1 | Edit locations (Shift+F5, Ctrl+Alt+Z) | history of the last edit positions | S (done) |
| 1 | Double underline (Ctrl+Shift+D), words-only underline (Ctrl+Shift+W) | text properties in the engine | M (engine, done) |
| 1 | Hidden text (Ctrl+Shift+H), show/hide formatting marks (numpad /) | hidden-text property + display toggle | M (engine; Ctrl+Shift+H done, numpad / is Outline view only) |
| 1 | Preview/zoom navigation in print preview (arrows, PgUp/PgDn, Ctrl+Home/End) | our own print preview in the backstage | S (done) |
| 2 | **AutoText / Quick Parts** (Alt+F3, name + Enter) | named reusable blocks, stored per user | M (starter done: localStorage, whole name + Enter; gallery and Normal.dotm to do) |
| 2 | **Outline view and heading collapse** (Ctrl+Alt+O, Alt+Shift++/-/A/L/1..9) | outline view, collapsible headings (also "collapse heading" in Print Layout) | L (done in the Outline view, Alt+Shift+L included; collapse in Print Layout to do) |
| 2 | **Read Mode** (Alt+W,F; Home/End/page number/Esc) | a real reading layout, not only read-only | M (done) |
| 2 | Draft view (Ctrl+Alt+N) | a view without page chrome | M (done) |
| 2 | Split window (Ctrl+Alt+S, Alt+Shift+C) | two synchronized views of one document | L (done: the second pane is a live view drawn by the engine, editing in the upper pane) |
| 2 | Selection pane (Alt+F10) | list of objects on the page with show/hide/reorder | M (done) |
| 2 | Reveal Formatting pane (Shift+F1) | formatting inspector | M (done) |
| 3 | **Fields**: empty field (Ctrl+F9), LISTNUM (Ctrl+Alt+L), lock/unlock (Ctrl+F11, Ctrl+Shift+F11), update source (Ctrl+Shift+F7), GOTOBUTTON/MACROBUTTON | field codes in the document model | L (Ctrl+F9 and lock/unlock done, the lock saved in .docx; LISTNUM, links, buttons to do) |
| 3 | **Mark entries**: TOC (Alt+Shift+O), index (Alt+Shift+X), table of authorities (Alt+Shift+I); citations options | TC / XE / TA fields, index and authorities tables | L |
| 3 | **Mail merge** (Alt+Shift+K/N/M/E/F, Mailings tab) | data sources, merge fields, preview, result generation | XL (done on the engine's mail merge: CSV / XLSX, preview, .docx, PDF, PDF per record) |
| 3 | Block selection (Ctrl+Shift+F8 then arrows), non-adjacent selection | multi-range selection model | L (block selection done; non-adjacent selection to do) |
| 3 | Thesaurus (Shift+F7), Translator (Alt+Shift+F7), Dictionary, proofing language dialogs (Alt+R,U,L / Alt+R,L) | dictionaries and translation service (local or consented API) | M-L (thesaurus done for 17 languages with bundled offline files, docs/thesaurus.md) |
| 3 | Comments list navigation (Alt,R,P,1,L and begin/end) | pane keyboard model | S (done: Alt, R, P and Cmd/Ctrl+Home/End) |
| 3 | AutoFormat toggle (Ctrl+Alt+K), copy previous section header/footer (Alt+Shift+R) | engine options | S-M (Alt+Shift+R done, AutoFormat to do) |
| 3 | Developer / Mailings tabs (Alt,L / Alt,M: Mailings done), Help box (Alt,F1), Object dialog (Alt,N,J,J), Office Clipboard task pane (Alt,H,F,O), AutoSave toggle (Alt+Z,A), Alt+F6 (done) | tabs and panes that do not exist | M each |
| 3 | Drawing mode toggle | Draw tab pen mode | M |

## Method for each phase

1. Take the rows from the matrix, build the feature (engine in sdkjs when needed, upstreamable), bind the shortcut exactly as Word does (Windows and macOS columns), add the Playwright case, move the row to scope `editor`.
2. Never fake a shortcut: if the feature does not exist, the row stays `absent` with an accurate note.
3. Keep `docs/shortcuts-word.csv` the single source of truth; the pass rate is reported per release.
4. Same for Excel (End mode, F8/Shift+F8 extend mode, F4 repeat, Ctrl+' and Ctrl+Shift+", Point mode, Alt+PageUp/PageDown, Ctrl+Shift+*, Flash Fill) and PowerPoint (F6 pane cycling, Shift+F4, Ctrl+Up/Down, pen/laser keys during the show, sections, Slide Sorter, Reading View).

## Order of work

Phase 1 now (repeat and the small, high-use items), phase 2 next (views, AutoText, outline, panes), phase 3 later (fields, indexes, mail merge, proofing tools): each phase ends with the matrix re-run and an updated `docs/differences.md`.

## Progress

- 2026-10-07 (keys2): phase 1 except Repeat (done separately) is complete, with the phase 2 AutoText starter, Alt+F6, Alt+Shift+R and the comment list keys: 31 matrix rows moved from `absent` to `editor`, `browser` or `keytips` (details and limits: docs/shortcuts.md section 11). The engine now stores double and words-only underline and applies and hides hidden text; both round-trip through .docx.
- 2026-10-08 (parity2): Outline view with the Outlining tab and its keys, Draft view, Read Mode with its keys, Ctrl+F9 empty field, Ctrl+F11 / Ctrl+Shift+F11 field lock: 16 matrix rows moved from `absent` to `editor` or `keytips` (docs/shortcuts.md section 13).
- 2026-10-08 (parity2, second part): Reveal Formatting (Shift+F1), Selection pane (Alt+F10, hidden objects now kept when a file is read), Thesaurus (Shift+F7, offline MyThes files: English, Arabic, Ukrainian): 3 more rows moved to `editor`, 30 rows still `absent`.
- 2026-10-08 (parity2, wave 2): block selection (Ctrl+Shift+F8, Alt+drag), split window (Ctrl+Alt+S, Alt+Shift+C), Show First Line Only (Alt+Shift+L), field lock saved in .docx (x2t change in core), Mailings tab with Alt+Shift+K/N/M/E/F and Alt, M; Thesaurus in 17 languages: 10 rows moved from `absent`, 20 left (docs/shortcuts.md section 15).
- 2026-10-08 (xlppt, 2nd pass): PowerPoint Slide Sorter and Presenter View next-slide preview done; chart Edit Data bug in Word and PowerPoint fixed (index_internal.html.deploy lacked the require config); sections remain absent (no section model in the engine nor in x2t).
- 2026-10-08 (xlppt): Excel: Repeat (F4, Ctrl+Y), F4 / Cmd+T reference cycling, End mode, F8 / Shift+F8, the other failing `editor` keys (Ctrl+., Ctrl+Shift+*, Alt+PgDn / PgUp, Ctrl+' / Ctrl+Shift+", Ctrl+Del, Point mode, Ctrl+A Function Arguments, Ctrl+Alt+5, Ctrl+Alt+V, Alt+Shift+F10, macOS keys), Flash Fill (Ctrl+E, basic patterns) and Quick Analysis (button and Ctrl+Q: formatting, charts, totals, tables): all `editor` rows pass on Windows and macOS, `absent` 67 -> 65. PowerPoint: Ctrl+Up / Down and Ctrl+Shift+Up / Down in text, Alt+Shift+Up / Down, Ctrl+Alt+5, Ctrl+Shift+J, Shift+F4, F6 / Shift+F6, pen / eraser / arrow / laser / hide pointer and E during the show: `gap` 19 -> 7, macOS column and macOS pass. Not done yet from the same request: Auto Fill Options button, chart galleries by type and Quick Layout / chart styles in the ribbon, Page Layout view, localized KeyTips (Excel); sections, Slide Sorter, Reading view, presenter view next-slide preview / timer / notes, shape / picture / table style galleries, thumbnail menu order (PowerPoint).
- 2026-10-09 (xlppt2): Excel: Auto Fill Options button (Copy Cells, Fill Series, Fill Formatting Only, Fill Without Formatting, Flash Fill; one undo step) and chart galleries by type in the Insert tab (Column or Bar, Line or Area, Pie or Doughnut, Scatter, Stock or Radar, Combo; Recommended Charts was already there). PowerPoint: Selection pane (Alt+F10, Option+F10 on macOS, Home > Arrange; hidden objects kept and saved), sections (model, p14:sectionLst round trip with a core change, Home > Section, headers in the thumbnails and the Slide Sorter). `gap` 7 -> 6 in `docs/shortcuts-powerpoint.csv`. Not done: Page Layout view (the sheet engine draws one continuous grid; it needs a page-by-page renderer with in-place header and footer editing and rulers), animation painter and media keys (no engine support in the browser), Quick Layout / chart styles in the ribbon.
