# Keyboard shortcuts (spreadsheet)

Session of 2026-10-05. Branch `feat/cell` of this repository (worktree `/srv/elixiroffice/wt/cell-repo`). Test instance: container `eo-cell`, port **8099** on development host. "Before" column: elixir/dev without fixes; "After" column: branch `elixir/cell` (web-apps), `SSE.Controllers.ExcelShortcuts`. Nothing is pushed.

## 1. Source and matrix

- Source: Microsoft Support, "Keyboard shortcuts in Excel", Windows and macOS tabs, <https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f>, accessed on **2026-10-05**.
- `docs/shortcuts-excel.csv`: 287 rows, same columns as the Word matrix (`id, category, action, windows, macos, ms_section, scope, alternative, notes`). Keys are written as on the page; an empty cell means the page gives nothing for the platform. A few keys that the page draws as images (forward Delete) are written out; a few shortcuts that Excel binds without the page's Windows tab citing them (Ctrl+P, Ctrl+G, Ctrl+R, Ctrl+Shift+9, Ctrl+Shift+Enter, Alt+Shift+→/← to group) are added and flagged in `notes`.
- `tools/shortcuts/extract_excel.py` reads the page (471 rows: 226 Windows, 245 macOS); `tools/shortcuts/matrix_excel.py` writes the CSV and checks (`--check`) that each of the 471 rows is covered by a row of the matrix.
- Scope (`scope`), as for Word:

| Scope | Rows | Meaning |
|---|---|---|
| `editor` | 165 | the function exists in the editor: the shortcut must work (Playwright test) |
| `absent` | 67 | nonexistent function: Power Pivot (27 rows), Copilot (9), Flash Fill, Power Query, Quick Analysis, Go To Special (visible cells, precedents, dependents), chart sheets, thesaurus, full screen, display of outline symbols (Ctrl+8)… |
| `keytips` | 14 | ribbon access keys (Alt, then letters) |
| `browser` | 12 | held by the browser (Ctrl+W, Ctrl+N, Ctrl+F4, Ctrl+F5, Ctrl+F6, Ctrl+Tab, Ctrl+PgDn/PgUp…) |
| `os` | 10 | held by the system (Alt+F4, Cmd+Q, Cmd+Tab, Cmd+H, workbook windows Ctrl+F7 to F10…) |
| `ribbon` | 10 | keyboard navigation in the ribbon and menus |
| `mouse` | 5 | mouse gesture (wheel, drag with Shift) |
| `native` | 4 | native dialog controls (Tab, Enter, Space) |

## 2. Results

Playwright suite `tests/shortcuts-excel/run.mjs`: each shortcut is played on the keyboard in the grid, then its effect is read through the API (`Asc.editor`: model cells and formulas, selection and active cell, cell format, zoom, active sheet, drawn objects) or in the DOM (`.asc-window` boxes, backstage, search bar, Name box, formula bar, comment bubble). Two passes: Windows/Linux conventions, and macOS (the editor believes it runs on a Mac: user agent, `navigator.platform`, Cmd/Option/Control keys). Each browser opens its own new workbook (no co-editing with another session), writes into it the data of `c04-blank-ish.xlsx` (A1:A5 numbers, B1:B5 text, A6 `=SUM(A1:A5)`) plus an empty Sheet2, and each test starts again from that state by undoing (`resetBook`, checked before each test).

| | Before | After |
|---|---|---|
| `editor` scope, Windows keys | **79/141** | **124/141** |
| `editor` scope, macOS keys | **68/134** | **117/134** |
| `browser` scope (when the page receives the key) | 2/4 Windows, 0/2 macOS | unchanged |
| Controls (`--control`) | 39/39 Windows, 39/39 macOS | |

A shortcut counts as passed when all its key variants pass. Bench reliability: each variant was played twice (`--repeat 2`) on two complete campaigns, identical results, no unstable case or bench error. For 39 cases, `--control` produces the same effect through the interface or the API (button, menu, method) and the check passes: a failure of these cases is therefore indeed a missing shortcut, not a blind check. Accepted measurement gaps: F1 is "skipped" (help disabled in this deployment); on emulated macOS, Cmd+X/C/V do not trigger the native clipboard of Linux Chromium (skipped, the Windows variant passes).

Per-shortcut detail: `tests/shortcuts-excel/results.md`; raw results `tests/shortcuts-excel/results/{win,mac,control}.json`.

## 3. Gaps (`editor` scope), what happens instead

Windows (62 shortcuts):

- **File, interface**: Ctrl+O and F12 do not open the backstage; Ctrl+Shift+U does not expand the formula bar; F6 / Shift+F6 leave the focus in the grid; Ctrl+Alt+= / Ctrl+Alt+- do not zoom (the editor zooms on Ctrl+= / Ctrl+-); Alt+Shift+F10 does not open the paste options menu.
- **Navigation**: End then arrow is not an End mode (End goes to the end of the row, the arrow then moves one cell); Alt+PgDn / Alt+PgUp change sheet instead of scrolling one screen right/left; Ctrl+Alt+5 does not select any shape; F5 and Ctrl+G: neither a Go To box nor the Name box activated.
- **Selection**: Ctrl+Shift+Space selects the whole sheet right away (Ctrl+A does region then sheet) and does not select objects when a shape is selected; F8 (Extend mode), Shift+F8 (Add mode), Ctrl+Shift+* (current region) and Ctrl+. (next corner): nothing.
- **Editing**: Ctrl+Alt+V (Paste Special), F4 (repeat), Ctrl+D, Ctrl+R (fill), Ctrl+9 / Ctrl+Shift+9 (hide/unhide rows), Alt+Shift+→ / ← (group/ungroup: Shift+→ extends the selection), Shift+F11 and Alt+Shift+F1 (new sheet), Alt+F1 (chart), Ctrl+T (table; Ctrl+L works), F7 (spelling), Shift+F2 and Ctrl+Shift+F2 (comment), Alt+F8 and Alt+F11 (macros): nothing. Ctrl+- zooms out instead of opening Delete cells (the editor opens it on Ctrl+Shift+-); Ctrl+0 is zoom 100% instead of hiding columns.
- **Entry**: Ctrl+F2 (edit in the formula bar), Ctrl+' and Ctrl+Shift+" (copy formula / value from above), F3 (Paste Name): nothing; Ctrl+Del deletes the next word instead of the end of the line.
- **Formulas**: Ctrl+Alt+F9 and Ctrl+Alt+Shift+F9 do not recalculate; Ctrl+A after a function name selects the text instead of opening Function Arguments; F2 while entering a formula does not switch to Point mode.
- **Formatting**: Ctrl+2 / 3 / 4 (bold, italic, underline; Ctrl+B/I/U work), Ctrl+Shift+& (outside border): nothing; Ctrl+Shift+_ opens Delete cells instead of removing borders.
- **Paste Special**: the box exists (paste options menu > Paste Special) but its options have no access keys (A, F, V, T, C, X, W, R, U: 9 rows).

macOS (66 shortcuts): the same families (Cmd+O, Cmd+F12, Cmd+Shift+P, F12, Option+F2; F6; Option+Shift+F10; Option+PgDn/PgUp; Ctrl+G and F5; F8, Shift+F8, Ctrl+.; Cmd+Ctrl+V; Cmd+D, Cmd+R; Ctrl+9, Ctrl+0, Cmd+( / Cmd+) and their inverses; Cmd+Shift+K / J; Shift+F11; Cmd+T; F7; Shift+F2, Cmd+Shift+F2, Cmd+Return; Option+F8 / F11; Ctrl+' and Ctrl+Shift+"; Ctrl+Option+F9; Ctrl+A; borders), plus what is specific to the Mac:

- Cmd+Option+R does not collapse the ribbon; Shift+F5 and Ctrl+F5 do not open search; Cmd+Shift+H does not open Replace; Cmd+Shift+Space selects nothing; Shift+Backspace does not reduce the selection to the active cell; Cmd+Shift+Z does not redo; Backspace (Mac "Delete") on a range only clears the active cell and switches to entry; Cmd+- / Ctrl+- do not open Delete cells.
- Cmd+Shift+R (Sort), Cmd+Shift+F (filter; Ctrl+Shift+L works), Ctrl+L (Define Name: opens Create Table), Cmd+F3: wrong box; Ctrl+U does not switch to editing; Cmd+; inserts the date instead of the time; Cmd+= does not recalculate; Cmd+Shift+T (AutoSum) and Cmd+T (absolute references) do nothing.
- Formatting: Cmd+Shift+X (strikethrough), Cmd+Shift+> / < (size), Cmd+E (center), Cmd+L (align left), Cmd+Option+0 / arrows / - (borders): nothing.

## 4. Shortcuts held by the browser (and alternative)

| id | Windows | macOS | In the browser | Alternative |
|---|---|---|---|---|
| file.close, file.close.ctrl-f4 | Ctrl+W, Ctrl+F4 | Cmd+W, Cmd+F4 | closes the tab | close the tab |
| file.new | — | Cmd+N | new window | File > New |
| window.next-window, all-windows | Ctrl+F6, Ctrl+Shift+F6 | — | tabs | one workbook per tab |
| window.restore, edit.refresh | Ctrl+F5 | — | reloads without cache | Data > Refresh |
| nav.next-sheet / prev-sheet | Ctrl+PgDn/PgUp (✅ if the page receives the key) | Ctrl+PgDn/PgUp (✅), Option+→/← (❌) | next/previous tab | the editor's Alt+PgDn/PgUp (opposite of Excel, see §3) |
| sel.next-sheet / prev-sheet | Ctrl+Shift+PgDn/PgUp (❌) | — | moves the tab | Ctrl+click on the sheet tab |
| dialog.next-tab | Ctrl+Tab | — | next tab | click on the dialog tab |

## 5. Running

```bash
cd /srv/elixiroffice/wt/cell-repo
python3 tools/shortcuts/extract_excel.py > /tmp/rows.json                        # reads the page (or a saved HTML file)
python3 tools/shortcuts/matrix_excel.py && python3 tools/shortcuts/matrix_excel.py --check /tmp/rows.json
EO_BASE=http://localhost:8099 node tests/shortcuts-excel/run.mjs --platform win --repeat 2 --out tests/shortcuts-excel/results/win.json
EO_BASE=http://localhost:8099 node tests/shortcuts-excel/run.mjs --platform mac --repeat 2 --out tests/shortcuts-excel/results/mac.json
node tests/shortcuts-excel/run.mjs --platform both --control --out tests/shortcuts-excel/results/control.json   # controls
node tests/shortcuts-excel/report.mjs tests/shortcuts-excel/results/win.json tests/shortcuts-excel/results/mac.json --md
```

A complete campaign takes about 2 minutes per platform (4 to 5 with `--repeat 2`). If the instance is rebuilding, `openEditor` retries every 20 s (8 times). To fill the "After" column: first copy `results/win.json` and `results/mac.json` (before state), rerun the two passes after the fixes, then `report.mjs results/win.json results/mac.json --compare before-win.json,before-mac.json`.

## 5. Fixes (`elixir/cell`, `SSE.Controllers.ExcelShortcuts`)

Keys are caught on the window, in the capture phase, before the editor's handlers: Excel's meaning wins where the editor had another one (Ctrl+0, Ctrl+-, Ctrl+Shift+_, Alt+Shift+arrows). Each command goes through the existing API or controller (same locks, same undo).

- File and interface: Ctrl+O, Ctrl+F12 (Open), F12 (Save As), Ctrl+Shift+U (formula bar), F6 / Shift+F6 (grid, ribbon, sheet tabs), Ctrl+Alt+= / - (zoom); macOS: Ctrl+O, Cmd+Shift+P, Option+F2, Ctrl+Shift+U, Cmd+Option+R.
- Navigation: F5 and Ctrl+G put the reference in the Name box (Excel opens the Go To box, which the Name box stands in for); Ctrl+F2 (formula bar).
- Selection: Ctrl+Shift+Space like Ctrl+A (region, then sheet).
- Editing: Ctrl+D / Ctrl+R (fill), Ctrl+9 / Ctrl+Shift+9 / Ctrl+0 / Ctrl+Shift+0 (hide, unhide), Alt+Shift+→ / ← (group, ungroup), Shift+F11 and Alt+Shift+F1 (new sheet), Alt+F1 (chart), Ctrl+T (table), F7 (spelling), Shift+F2 and Ctrl+Shift+F2 (comment), Ctrl+- (Delete cells), F3 (Paste Name), Alt+F8 / Alt+F11 (macros), access keys of the Paste Special box (A, F, V, T, C, X, W, R, U); macOS: Cmd+D / R, Cmd+( and Cmd+), Cmd+Shift+K / J, Cmd+T, Cmd+Shift+Z, Shift+F5 / Ctrl+F5, Cmd+Shift+H, Cmd+Shift+F, Cmd+Shift+R, Cmd+Shift+T, Ctrl+L and Cmd+F3 (Define Name).
- Formulas: Ctrl+Alt+F9 and Ctrl+Alt+Shift+F9 (recalculation); macOS: Cmd+=.
- Formatting: Ctrl+2 / 3 / 4, Ctrl+Shift+& (outside border), Ctrl+Shift+_ (no border); macOS: Cmd+Shift+X, Cmd+E, Cmd+L, Cmd+Shift+> / <, Cmd+Option+0 / - / arrows.

Still failing (17 Windows, 17 macOS), all in the engine (sdkjs): End mode (End then arrow), Alt+PgDn / PgUp (horizontal scrolling), Ctrl+Alt+5 (shapes), Ctrl+Shift+PgDn / PgUp (sheet group), F8 and Shift+F8 (Extend and Add modes), Ctrl+Shift+* (current region), Ctrl+. (next corner), Ctrl+Shift+Space on a shape, Ctrl+Alt+V (Paste Special only exists after a paste), F4 (repeat), Ctrl+Del (end of line), Ctrl+' and Ctrl+Shift+" (copy from above), Ctrl+A after a function name, F2 in Point mode, Alt+Shift+F10; macOS in addition: Option+arrows (sheets), Shift+Backspace, Backspace on a range, Cmd+Return, Ctrl+U, Cmd+; (time), Cmd+T while entering (absolute references). Detail: `tests/shortcuts-excel/results-after.md`, raw results `tests/shortcuts-excel/results/after.json`.

## 6. Keys and features added by `elixir/xlppt` (2026-10-08)

Branches `elixir/xlppt` (sdkjs, web-apps), `feat/xlppt` here; test instance `eo-xlppt`, port 8109 on development host. Every `editor` row of the matrix now passes: **152/152 key variants on Windows, 169/169 on macOS** (`tests/shortcuts-excel/run.mjs`, before: 131/149 and 146/165). Two rows moved from `absent` to `editor`: Ctrl+E (Flash Fill) and Ctrl+Q (Quick Analysis).

Engine (sdkjs, `[upstreamable]`):

- `cell/view/elixir-keys.js` wraps the keyboard handlers of the grid and of the cell editor:
  - **Repeat**: F4 outside the cell editor, and Ctrl+Y (Cmd+Y) when there is nothing to redo, applies the last formatting, insert, delete, row height or column width command to the current selection. It is recorded at `WorksheetView.setSelectionInfo` / `changeWorksheet` with the value applied, so a repeat of Ctrl+B sets bold instead of toggling it; one undo step. F4 inside a formula still cycles the reference type (Cmd+T as well on macOS).
  - **End mode** (End, then an arrow key, Shift+arrow or Home), **Extend Selection** (F8), **Add to Selection** (Shift+F8), Esc leaves them; event `asc_onKeyboardSelectionMode` ("end", "extend", "add", "").
  - Ctrl+Period (next corner), Ctrl+Shift+* (current region, the active cell stays), Shift+Backspace (active cell only), Alt+Page Down / Page Up (one screen right / left), Ctrl+' and Ctrl+Shift+" (formula / value of the cell above, in the grid and while editing), Ctrl+Alt+5 (first floating object, then Tab).
  - Cell editor: F2 switches between Enter (point) and Edit mode, Ctrl+Delete deletes to the end of the line, Ctrl+A right of a function name opens Function Arguments.
  - macOS: Option+Right / Left (next / previous sheet), Delete on a range clears it, Ctrl+U edits the active cell, Cmd+; enters the time and Ctrl+; the date (`cell/model/Shortcuts.js`).
- `cell/model/flash-fill.js`: **Flash Fill** (Ctrl+E, `asc_FlashFill`): from one or more examples typed next to the data, a program made of literal text, whole cells, words (from the start or the end), initials and case changes is searched; it must rebuild every example; the first row counts as a header when the examples only agree without it; the empty cells of the column are filled in one undo step; nothing happens when no program is found (event `asc_onFlashFill`).
- `cell/view/quick-analysis.js`: position of the Quick Analysis button (`asc_onQuickAnalysis`, `asc_getQuickAnalysisInfo`) and the Totals command (`asc_QuickAnalysisTotals`: SUM, AVERAGE, COUNT, MAX, MIN in the row below or the column to the right, never over data).

Interface (`SSE.Controllers.ExcelShortcuts`):

- **Quick Analysis**: button at the bottom-right corner of a range with data, Ctrl+Q (Control+Q on macOS): Formatting (data bar, color scale, icon set, greater than, top 10 %, clear), Charts (clustered column, stacked column, clustered bar, line, pie, area), Totals (sum, average, count below; sum, average to the right), Tables.
- Ctrl+Alt+V (macOS: Cmd+Ctrl+V, Ctrl+Option+V, Cmd+Option+V): Paste Special dialog for the copied cells; Alt+Shift+F10: menu of the Paste Options button; Cmd+Return (macOS): comment.

Tests: `tests/shortcuts-excel/features.mjs [--platform win|mac]` (22/22 Windows, 20/20 macOS): Repeat (bold applied not toggled, Ctrl+Y, insert row, one undo), End+Home, End+Shift+arrow, F8 then Esc, mode events, Flash Fill (first name with a header row, last name in capitals, initials, two columns combined, one undo, no pattern), Quick Analysis (button shown and hidden, Ctrl+Q menu, totals below and to the right, no overwrite, data bar, chart). `run.mjs` gained `keepObjects` (cases that act on a selected shape).

Still absent: Ctrl+Shift+Page Down / Up (sheet group, kept by Chrome for tab moves), Power Pivot, Copilot, Power Query, XLM macro sheets, chart sheets (F11), data forms, Smart Lookup, Go To Special family (visible cells, precedents, dependents...), outline symbols toggle (Ctrl+8), object display modes (Ctrl+6), Font tab of Format Cells (Ctrl+Shift+F), Modify Cell Style, Create Names from Selection, formula-checking tooltips, argument names (Ctrl+Shift+A), thesaurus.

## 7. Excel UX beyond keys (`elixir/xlppt2`, 2026-10-09)

Branches `elixir/xlppt2` (sdkjs, web-apps), `feat/xlppt2` here; test instance `eo-xlppt2`, port 8121 on development host.

- **Auto Fill Options**: sdkjs `cell/view/autofill-options.js` wraps `WorksheetView.applyFillHandle`, remembers the source, the dragged area and the direction, and raises `asc_onAutoFillOptions` (position and option in use, `null` to hide) while the selection is the filled range. `asc_ApplyAutoFillOption(type)` undoes the fill and replays it: Copy Cells / Fill Series through `applySeriesSettings`, Fill Formatting Only (copy, then clear the text of the new cells), Fill Without Formatting (series, then restore the formatting the cells had), Flash Fill (single column, `asc_FlashFill`; when no pattern is found the previous option is replayed). One history step. The button and menu are in `SSE.Controllers.ExcelShortcuts` (`afMenu`). A single numeric cell dragged plainly is copied (Copy Cells selected), with Ctrl a series, as in Excel. Quick Analysis stays hidden while the button is shown. Tests: `tests/shortcuts-excel/autofill.mjs [--platform win|mac]` (13/13 on both; real mouse drag of the handle).
- **Chart galleries by type** (web-apps `SSE.Views.RibbonTabs.btnsCharts`, `SSE.Controllers.RibbonTabs.bindChartGallery`, slots `slot-elx-chart-*` in `Toolbar.template`): each button opens a `Common.UI.DataView` filtered to its families (`Common.define.chartData`), item click goes to `Toolbar.onSelectChart`, so charts are inserted (or the type of the selected chart changed) exactly as from the old gallery. Tests: `tests/shortcuts-excel/chart-galleries.mjs [--platform win|mac]` (19/19 on both): buttons and tips, gallery sizes and section names, one insert per family with the type checked, All Charts dialog, disabled while a cell is edited.
