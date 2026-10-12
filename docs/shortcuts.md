# Keyboard shortcuts, KeyTips and interaction polish (text editor)

Session of 2026-10-05. Branches: `elixir/interact` in web-apps and sdkjs (worktree `$EO_WORK/wt/interact`), `feat/interact` in this repository. Test instance: container `eo-interact`, port **8095** on <dev-host>. Nothing is pushed.

## 1. Source and matrix

- Source: Microsoft Support, "Keyboard shortcuts in Word", Windows and macOS tabs, <https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2>, accessed on **2026-10-05**.
- `docs/shortcuts-word.csv`: 309 rows (columns `id, category, action, windows, macos, ms_section, scope, alternative, notes`). Keys are written as on the page; an empty cell means the page gives nothing for the platform (the ElixirOffice equivalent is then in `notes`).
- `tools/shortcuts/extract.py` reads the page; `tools/shortcuts/matrix.py` writes the CSV and checks (`--check`) that each of the 467 rows of the page is covered.
- Scope (`scope`): `editor` 220 (the function exists, the shortcut must work), `browser` 16 (held by the browser), `os` 5, `keytips` 15 and `ribbon` 9 (ribbon access), `absent` 30 (function nonexistent in the editor), `native` 6 (keyboard layout, IME, text field), `mouse` 8.

## 2. Results

Playwright suite `tests/shortcuts/run.mjs`: each shortcut is played on the keyboard in the editor, then its effect is read through the API (document model, builder API, DOM). Two passes: Windows/Linux conventions, and macOS (the editor believes it runs on a Mac: user agent, `navigator.platform`, Cmd/Option/Control keys).

| | Before | After |
|---|---|---|
| `editor` scope, Windows keys | **76/171** | **201/201** (2026-10-07, with Repeat and the editing shortcuts of section 11) |
| `editor` scope, macOS keys | **60/126** | **149/149** (2026-10-07) |
| `browser` scope (tested when the shortcut is implemented for the desktop app) | 2/15 | 8/15 |

A shortcut counts as passed when all its key variants pass. Accepted measurement gaps: `file.help` (F1) is "skipped" because help is disabled in this deployment; on emulated macOS, Cmd+X/C/V do not trigger the native clipboard of Linux Chromium (skipped, the Windows variant passes).

Other suites:

| Suite | Result |
|---|---|
| `tests/shortcuts/keytips.mjs` (KeyTips and keyboard navigation in the ribbon) | 48/49 (`kt.insert-letters`: no KeyTip "U" on the Insert tab of the headless 1440 px window, also on the main instance, not related to the shortcuts) |
| `tests/shortcuts/minitoolbar.mjs` | 18/18 (2026-10-08: font and size drop-downs and the menu afterwards added) |
| `tests/shortcuts/contextmenus.mjs` | 15/15 |
| `tests/ctxmenu/sweep-word.mjs`, `sweep-cell.mjs`, `sweep-slide.mjs` (every right-click menu: every command clicked, see section 12) | Word 410 items clicked, Spreadsheet 427, Presentation 149: all pass (2026-10-07; disabled items skipped). 2026-10-08, after the inline spelling work (F2): Word 410 (the three `misspelled*` scenarios added: word with suggestions, word with none, word in a table cell; the old one never listed the spelling items because the engine had stopped checking the rebuilt document), Presentation 149 pass; the Spreadsheet sweep was not rerun (no spreadsheet code changed); the other suites on the fixed build: shortcuts matrix win 182/182 and mac 140/140, minitoolbar 12/12, contextmenus 15/15, screentips 10/12 as before, keytips 45/47 (Insert tab letters, Table Design tab: not related to menus), ui-check only the known 404 |
| `tests/spell/spell.mjs` (inline spelling correction, F2: suggestions, no suggestion, Ignore All, Add to Dictionary kept and applied to a new document, table cell, F7, Review > Spelling off and on, Language sub-menu and dialog, Presentation) | 33/33 |
| `tests/shortcuts/screentips.mjs` (ScreenTips, states, tabs, no layout jump) | 10/12: immediate redisplay from one command to the next is not confirmed by the test (the next tooltip still waits for the delay) |
| `tests/shortcuts/language-borders.mjs` (Language dialog, Review drop-down and status bar; Borders glyphs at 100%/150%, light/dark) | 51/51 |
| sdkjs `tests/word/shortcuts` (QUnit, `tests/shortcuts/sdkjs-qunit.mjs`) | 248/248 |
| `tools/eval/ui-check.mjs` (AI bar: Alt+I without KeyTips, Ctrl+K) | all AI checks pass; only failure: a 404 on `/elixir-ai/config.json`, specific to this instance without server mode |

Per-shortcut detail (Windows | macOS; ✅ passed, ❌ failed, ⏭ skipped, — no shortcut on the platform):

| id | action | Windows | | macOS | | scope | remarque |
|---|---|---|---|---|---|---|---|
| file.open | Open a document | Ctrl+O | ✅ |  | ✅ | editor |  |
| file.open.ctrl-f12 | Display the Open dialog box | Ctrl+F12 | ✅ |  | — | editor |  |
| file.open.ctrl-alt-f2 | Display the Open dialog box | Ctrl+Alt+F2 | ✅ |  | — | editor |  |
| file.new | Create a new document | Ctrl+N | ✅ |  | ✅ | browser |  |
| file.save | Save the document | Ctrl+S | ✅ |  | ✅ | editor |  |
| file.save.shift-f12 | Save the document | Shift+F12 | ✅ |  | — | editor |  |
| file.save.alt-shift-f2 | Save the document | Alt+Shift+F2 | ✅ |  | — | editor |  |
| file.save-as | Display the Save As dialog box | F12 | ✅ | Cmd+Shift+S | ✅ | editor |  |
| file.close | Close the document | Ctrl+W | ❌ | Cmd+F4 | ❌ | browser | win no test case; mac no test case |
| file.close.ctrl-f4 | Close the current document | Ctrl+F4 | ❌ |  | ❌ | browser | win no test case; mac no test case |
| file.print | Print the document | Ctrl+P | ✅ | Cmd+P | ✅ | editor |  |
| file.print-preview | Switch to print preview | Ctrl+Alt+I | ✅ |  | — | editor |  |
| file.print-preview.ctrl-f2 | Display the print preview area on the Print tab in the Backstage view | Ctrl+F2 | ✅ |  | — | editor |  |
| file.print.ctrl-shift-f12 | Display the Print tab in the Backstage view | Ctrl+Shift+F12 | ✅ |  | — | editor |  |
| file.preview.move | Move around the preview page when zoomed in | Arrow keys | ✅ |  | — | editor |  |
| file.preview.page | Move by one preview page when zoomed out | Page up or Page down | ✅ |  | — | editor |  |
| file.preview.first | Move to the first preview page when zoomed out | Ctrl+Home | ✅ |  | — | editor |  |
| file.preview.last | Move to the last preview page when zoomed out | Ctrl+End | ✅ |  | — | editor |  |
| file.rename | Open the dialog box to rename the document or save it to another location | Alt+B | ✅ |  | — | editor |  |
| file.help | Display the Word help task pane | F1 | ⏭ |  | — | editor |  |
| window.next-document | Switch to the next document window when more than one document is open | Ctrl+F6 | ❌ | Cmd+F6 | ❌ | browser | win no test case; mac no test case |
| window.previous-document | Switch to the previous document window when more than one document is open | Ctrl+Shift+F6 | ❌ | Cmd+Shift+F6 | ❌ | browser | win no test case; mac no test case |
| window.cycle-regions | Switch between the document, task pane, status bar, and ribbon | F6 | ✅ | F6 | ✅ | editor |  |
| window.cycle-regions.back | Switch between the document, ribbon, status bar, and task pane | Shift+F6 | ✅ | Shift+F6 | ✅ | editor |  |
| window.dialog-to-document | Move from an open dialog box back to the document, for dialog boxes that support this behavior | Alt+F6 | ✅ |  | — | editor |  |
| edit.cut | Cut the selected content to the Clipboard | Ctrl+X | ✅ | Cmd+X or F2 | ⏭ | editor |  |
| edit.copy | Copy the selected content to the Clipboard | Ctrl+C | ✅ | Cmd+C or F3 | ⏭ | editor |  |
| edit.paste | Paste the contents of the Clipboard | Ctrl+V | ✅ | Cmd+V or F4 | ⏭ | editor |  |
| edit.paste-text | Paste text only | Ctrl+Shift+V | ✅ | Cmd+Shift+V | ⏭ | editor |  |
| edit.paste-special | Display the Paste Special dialog box | Ctrl+Alt+V | ✅ | Cmd+Control+V | ✅ | editor |  |
| edit.select-all | Select all document content | Ctrl+A | ✅ | Cmd+A | ✅ | editor |  |
| edit.undo | Undo the previous action | Ctrl+Z | ✅ | Cmd+Z or F1 | ✅ | editor |  |
| edit.redo | Redo the previous action, if possible | Ctrl+Y | ✅ | Cmd+Y | ✅ | editor |  |
| edit.repeat | Repeat the last command or action, if possible | F4 | ✅ | Cmd+Y | ✅ | editor |  |
| edit.cancel | Cancel a command | Esc | ✅ |  | ✅ | editor |  |
| edit.delete-word-left | Delete one word to the left | Ctrl+Backspace | ✅ |  | ✅ | editor |  |
| edit.delete-word-right | Delete one word to the right | Ctrl+Delete | ✅ |  | ✅ | editor |  |
| edit.move-to | Move the selected content to a specific location | F2, move the cursor to the destination, and then press Enter | ✅ |  | — | editor |  |
| edit.copy-to | Copy the selected content to a specific location | Shift+F2, move the cursor to the destination, and then press Enter | ✅ | Shift+F2 | ✅ | editor |  |
| edit.autotext-define | Define an AutoText block with the selected content | Alt+F3 | ✅ | Option+F3 | ✅ | editor |  |
| edit.autotext-insert | Insert an AutoText block | The first few characters of the AutoText block, and then press Enter | ✅ |  | — | editor |  |
| edit.spike-cut | Cut the selected content to the Spike | Ctrl+F3 | ✅ | Cmd+F3 | ✅ | editor |  |
| edit.spike-paste | Paste the contents of the Spike | Ctrl+Shift+F3 | ✅ | Cmd+Shift+F3 | ✅ | editor |  |
| edit.copy-format | Copy the selected text formatting | Ctrl+Alt+C | ✅ | Cmd+Option+C | ✅ | editor |  |
| edit.paste-format | Paste the selected text formatting | Ctrl+Alt+V | ✅ | Cmd+Option+V | ✅ | editor |  |
| edit.copy-previous-header | Copy the header or footer used in the previous section of the document | Alt+Shift+R | ✅ |  | — | editor |  |
| edit.hyperlink | Insert a hyperlink | Ctrl+K | ✅ |  | ✅ | editor |  |
| edit.replace | Display the Replace dialog box | Ctrl+H | ✅ | Control+H | ✅ | editor |  |
| fmt.bold | Apply bold formatting | Ctrl+B | ✅ | Cmd+B | ✅ | editor |  |
| fmt.italic | Apply italic formatting | Ctrl+I | ✅ | Cmd+I | ✅ | editor |  |
| fmt.underline | Apply underline formatting | Ctrl+U | ✅ | Cmd+U | ✅ | editor |  |
| fmt.strikethrough | Apply strike-through formatting |  | — | Cmd+Shift+X | ✅ | editor |  |
| fmt.font-dialog | Display the Font dialog box | Ctrl+D or Ctrl+Shift+F | ✅ | Cmd+D | ✅ | editor |  |
| fmt.grow | Increase the font size | Ctrl+Shift+Right angle bracket (>) | ✅ | Cmd+Shift+Right angle bracket (>) | ✅ | editor |  |
| fmt.shrink | Decrease the font size | Ctrl+Shift+Left angle bracket (<) | ✅ | Cmd+Shift+Left angle bracket (<) | ✅ | editor |  |
| fmt.grow-1pt | Increase the font size by 1 point | Ctrl+Right bracket (]) | ✅ | Cmd+Right bracket (]) | ✅ | editor |  |
| fmt.shrink-1pt | Decrease the font size by 1 point | Ctrl+Left bracket ([) | ✅ | Cmd+Left bracket ([) | ✅ | editor |  |
| fmt.change-case | Switch the text between upper case, lower case, and title case | Shift+F3 | ✅ | Shift+F3 | ✅ | editor |  |
| fmt.all-caps | Change the text to all upper case | Ctrl+Shift+A | ✅ | Cmd+Shift+A | ✅ | editor |  |
| fmt.hidden | Hide the selected text | Ctrl+Shift+H | ✅ |  | — | editor |  |
| fmt.word-underline | Apply underline formatting to the words, but not the spaces | Ctrl+Shift+W | ✅ | Cmd+Shift+W | ✅ | browser |  |
| fmt.double-underline | Apply double-underline formatting | Ctrl+Shift+D | ✅ | Cmd+Shift+D | ✅ | editor |  |
| fmt.small-caps | Apply small caps formatting | Ctrl+Shift+K | ✅ | Cmd+Shift+K | ✅ | editor |  |
| fmt.subscript | Apply subscript formatting | Ctrl+Shift+Minus sign (-) | ✅ | Cmd+Shift+Minus sign (-) | ✅ | editor |  |
| fmt.superscript | Apply superscript formatting | Ctrl+Shift+Plus sign (+) | ✅ |  | ✅ | editor |  |
| fmt.reset-char | Remove manual character formatting | Ctrl+Spacebar | ✅ |  | ✅ | editor |  |
| fmt.symbol-font | Change the selected text to the Symbol font | Ctrl+Shift+Q | ✅ |  | — | editor |  |
| fmt.bullets | Add a bulleted list | Ctrl+Shift+L | ✅ | Cmd+Shift+L | ✅ | editor |  |
| fmt.show-all | Display all nonprinting characters | Ctrl+Shift+8 | ✅ |  | ✅ | editor |  |
| para.center | Center the paragraph | Ctrl+E | ✅ | Cmd+E | ✅ | editor |  |
| para.justify | Justify the paragraph | Ctrl+J | ✅ | Cmd+J | ✅ | editor |  |
| para.left | Align the paragraph to the left | Ctrl+L | ✅ | Cmd+L | ✅ | editor |  |
| para.right | Align the paragraph to the right | Ctrl+R | ✅ | Cmd+R | ✅ | editor |  |
| para.indent | Indent the paragraph | Ctrl+M | ✅ | Control+Shift+M | ✅ | editor |  |
| para.unindent | Remove a paragraph indent | Ctrl+Shift+M | ✅ | Cmd+Shift+M | ✅ | editor |  |
| para.hanging | Create a hanging indent | Ctrl+T | ✅ | Cmd+T | ✅ | browser |  |
| para.unhanging | Remove a hanging indent | Ctrl+Shift+T | ✅ | Cmd+Shift+T | ✅ | browser |  |
| para.reset | Remove paragraph formatting | Ctrl+Q | ✅ |  | — | editor |  |
| para.spacing-1 | Apply single spacing to the paragraph | Ctrl+1 | ✅ | Cmd+1 | ✅ | editor |  |
| para.spacing-2 | Apply double spacing to the paragraph | Ctrl+2 | ✅ | Cmd+2 | ✅ | editor |  |
| para.spacing-1.5 | Apply 1.5-line spacing to the paragraph | Ctrl+5 | ✅ | Cmd+5 | ✅ | editor |  |
| para.rtl | Switch the writing direction to right-to-left |  | — | Control+Cmd+Left arrow key | ✅ | editor |  |
| para.ltr | Switch the writing direction to left-to-right |  | — | Control+Cmd+Right arrow key | ✅ | editor |  |
| style.normal | Apply the Normal style | Ctrl+Shift+N | ✅ | Cmd+Shift+N | ✅ | browser |  |
| style.heading1 | Apply the Heading 1 style | Ctrl+Alt+1 | ✅ | Cmd+Option+1 | ✅ | editor |  |
| style.heading2 | Apply the Heading 2 style | Ctrl+Alt+2 | ✅ | Cmd+Option+2 | ✅ | editor |  |
| style.heading3 | Apply the Heading 3 style | Ctrl+Alt+3 | ✅ | Cmd+Option+3 | ✅ | editor |  |
| style.list | Apply the List style |  | — | Cmd+Shift+L, when the cursor is at the beginning of a line | ✅ | editor |  |
| style.apply-pane | Display the Apply Styles task pane | Ctrl+Shift+S | ✅ |  | — | editor |  |
| style.pane | Display the Styles task pane | Ctrl+Alt+Shift+S | ✅ |  | ✅ | editor |  |
| style.promote | Promote a paragraph | Alt+Shift+Left arrow key | ✅ | Control+Shift+Left arrow key | ✅ | editor |  |
| style.demote | Demote a paragraph | Alt+Shift+Right arrow key | ✅ | Control+Shift+Right arrow key | ✅ | editor |  |
| style.body-text | Demote the paragraph to body text | Ctrl+Shift+N | ✅ | Cmd+Shift+N | ✅ | browser |  |
| nav.word-left | Move the cursor one word to the left | Ctrl+Left arrow key | ✅ | Option+Left arrow key | ✅ | editor |  |
| nav.word-right | Move the cursor one word to the right | Ctrl+Right arrow key | ✅ | Option+Right arrow key | ✅ | editor |  |
| nav.paragraph-up | Move the cursor up by one paragraph | Ctrl+Up arrow key | ✅ | Cmd+Up arrow key | ✅ | editor |  |
| nav.paragraph-down | Move the cursor down by one paragraph | Ctrl+Down arrow key | ✅ | Cmd+Down arrow key | ✅ | editor |  |
| nav.line-end | Move the cursor to the end of the current line | End | ✅ | Cmd+Right arrow key or End | ✅ | editor |  |
| nav.line-start | Move the cursor to the beginning of the current line | Home | ✅ | Cmd+Left arrow or Home | ✅ | editor |  |
| nav.screen-top | Move the cursor to the top of the screen | Ctrl+Alt+Page up | ✅ |  | — | editor |  |
| nav.screen-bottom | Move the cursor to the bottom of the screen | Ctrl+Alt+Page down | ✅ |  | — | editor |  |
| nav.page-up | Move the cursor by scrolling the document view up by one screen | Page up | ✅ | Page up | ✅ | editor |  |
| nav.page-down | Move the cursor by scrolling the document view down by one screen | Page down | ✅ | Page down | ✅ | editor |  |
| nav.next-page | Move the cursor to the top of the next page | Ctrl+Page down | ✅ | Cmd+Page down | ✅ | browser |  |
| nav.previous-page | Move the cursor to the top of the previous page | Ctrl+Page up | ✅ | Cmd+Page up | ✅ | browser |  |
| nav.document-end | Move the cursor to the end of the document | Ctrl+End | ✅ | Cmd+End | ✅ | editor |  |
| nav.document-start | Move the cursor to the beginning of the document | Ctrl+Home | ✅ | Cmd+Home | ✅ | editor |  |
| nav.previous-revision | Move the cursor to the location of the previous revision | Shift+F5 | ✅ | Shift+F5 | ✅ | editor |  |
| nav.last-revision-on-open | Move the cursor to the location of the last revision made before the document was last closed | Shift+F5, immediately after opening the document | ✅ |  | — | editor |  |
| nav.recent-changes | Cycle through the locations of the four previous changes made to the document | Ctrl+Alt+Z | ✅ |  | — | editor |  |
| nav.floating-shapes | Cycle through floating shapes, such as text boxes or images | Ctrl+Alt+5, and then the Tab key repeatedly | ✅ |  | — | editor |  |
| nav.floating-shapes.exit | Exit the floating shape navigation and return to the normal navigation | Esc | ✅ |  | ✅ | editor |  |
| nav.find | Display the Navigation task pane, to search within the document content | Ctrl+F | ✅ | Cmd+F | ✅ | editor |  |
| nav.go-to | Display the Go To dialog box | Ctrl+G | ✅ | Cmd+Option+G or F5 | ✅ | editor |  |
| nav.go-to.f5 | Display the Go To dialog box | F5 | ✅ | F5 | — | editor |  |
| nav.repeat-find | Repeat the last Find or Go To action | Shift+F4 | ✅ | Shift+F4 or Cmd+Shift+F4 | ✅ | editor |  |
| nav.web-back | Go back one page | Alt+Left arrow key | ❌ |  | ❌ | browser | win no test case; mac no test case |
| nav.web-forward | Go forward one page | Alt+Right arrow key | ❌ |  | ❌ | browser | win no test case; mac no test case |
| nav.web-refresh | Refresh the page | F9 | ✅ |  | ✅ | editor |  |
| sel.char | Select text | Shift+Arrow keys | ✅ | Shift+Arrow keys | ✅ | editor |  |
| sel.word-left | Select the word to the left | Ctrl+Shift+Left arrow key | ✅ | Shift+Option+Left arrow key | ✅ | editor |  |
| sel.word-right | Select the word to the right | Ctrl+Shift+Right arrow key | ✅ | Shift+Option+Right arrow key | ✅ | editor |  |
| sel.line-start | Select from the current position to the beginning of the current line | Shift+Home | ✅ | Cmd+Shift+Left arrow key or Shift+Home | ✅ | editor |  |
| sel.line-end | Select from the current position to the end of the current line | Shift+End | ✅ | Cmd+Shift+Right arrow key or Shift+End | ✅ | editor |  |
| sel.paragraph-start | Select from the current position to the beginning of the current paragraph | Ctrl+Shift+Up arrow key | ✅ | Cmd+Shift+Up arrow key | ✅ | editor |  |
| sel.paragraph-end | Select from the current position to the end of the current paragraph | Ctrl+Shift+Down arrow key | ✅ | Cmd+Shift+Down arrow key | ✅ | editor |  |
| sel.screen-up | Select from the current position to the top of the screen | Shift+Page up | ✅ | Shift+Page up | ✅ | editor |  |
| sel.screen-down | Select from the current position to the bottom of the screen | Shift+Page down | ✅ | Shift+Page down | ✅ | editor |  |
| sel.document-start | Select from the current position to the beginning of the document | Ctrl+Shift+Home | ✅ | Cmd+Shift+Home | ✅ | editor |  |
| sel.document-end | Select from the current position to the end of the document | Ctrl+Shift+End | ✅ | Cmd+Shift+End | ✅ | editor |  |
| sel.window-bottom | Select from the current position to the bottom of the window | Ctrl+Alt+Shift+Page down | ✅ | Cmd+Shift+Option+Page down | ✅ | editor |  |
| sel.extend | Start extending the selection | F8 | ✅ | F8 | ✅ | editor |  |
| sel.extend.char | Select the nearest character to the left or right | F8, Left or Right arrow key | ✅ | F8, Left arrow key or F8, Right arrow key | ✅ | editor |  |
| sel.extend.grow | Expand the selection | F8 repeatedly | ✅ | F8 repeatedly | ✅ | editor |  |
| sel.extend.shrink | Reduce the selection | Shift+F8 | ✅ | Shift+F8 | ✅ | editor |  |
| sel.extend.stop | Stop extending the selection | Esc | ✅ | Esc | ✅ | editor |  |
| table.next-cell | Move to the next cell in the row and select its content | Tab key | ✅ | Tab key | ✅ | editor |  |
| table.previous-cell | Move to the previous cell in the row and select its content | Shift+Tab | ✅ | Shift+Tab | ✅ | editor |  |
| table.row-first | Move to the first cell in the row | Alt+Home | ✅ | Control+Home | ✅ | editor |  |
| table.row-last | Move to the last cell in the row | Alt+End | ✅ | Control+End | ✅ | editor |  |
| table.column-first | Move to the first cell in the column | Alt+Page up | ✅ | Control+Page up | ✅ | editor |  |
| table.column-last | Move to the last cell in the column | Alt+Page down | ✅ | Control+Page down | ✅ | editor |  |
| table.previous-row | Move to the previous row | Up arrow key | ✅ | Up arrow key | ✅ | editor |  |
| table.next-row | Move to the next row | Down arrow key | ✅ | Down arrow key | ✅ | editor |  |
| table.move-row-up | Move one row up | Alt+Shift+Up arrow key | ✅ |  | — | editor |  |
| table.move-row-down | Move one row down | Alt+Shift+Down arrow key | ✅ |  | — | editor |  |
| table.add-row | Add a new row to the bottom of the table |  | ✅ | Tab key, at the end of the last row | ✅ | editor |  |
| table.insert-row | Insert a row |  | — | Cmd+Control+I | ✅ | editor |  |
| table.select-extend | Extend a selection to adjacent cells | Shift+Arrow keys | ✅ | Shift+Arrow keys | ✅ | editor |  |
| table.select-column | Select a column | Select the top or bottom cell of the column, and then press Shift+Page up or Page down | ✅ |  | ✅ | editor |  |
| table.select-row | Select a row | Select the first or last cell in the row, and then press Shift+Alt+End or Home | ✅ | Select the first or last cell in the row, and then press Shift+Alt+End or Home | ✅ | editor |  |
| table.select-table | Select the whole table | Alt+5 on the numeric keypad, with Num Lock switched off | ✅ |  | — | editor |  |
| table.new-paragraph | Insert a new paragraph in a cell | Enter | ✅ | Return | ✅ | editor |  |
| table.tab-char | Insert a tab character in a cell | Ctrl+Tab | ✅ | Option+Tab | ✅ | browser |  |
| review.comment | Insert a comment | Ctrl+Alt+M | ✅ | Cmd+Option+A | ✅ | editor |  |
| review.track-changes | Turn change tracking on or off | Ctrl+Shift+E | ✅ | Cmd+Shift+E | ✅ | editor |  |
| review.close-pane | Close the Reviewing Pane | Alt+Shift+C | ✅ |  | — | editor |  |
| review.comments-first | Move to the beginning of the list of comments |  | — | Cmd+Home, in the Reviewing Pane | ✅ | editor |  |
| review.comments-last | Move to the end of the list of comments |  | — | Cmd+End, in the Reviewing Pane | ✅ | editor |  |
| review.spelling | Display the Editor task pane to check spelling and grammar | F7 | ✅ | Cmd+Option+L or F7 | ✅ | editor |  |
| review.next-error | Find the next spelling or grammatical error | Alt+F7 | ✅ | Option+F7 | ✅ | editor |  |
| ref.footnote | Insert a footnote | Ctrl+Alt+F | ✅ | Cmd+Option+F | ✅ | editor |  |
| ref.endnote | Insert an endnote | Ctrl+Alt+D | ✅ | Cmd+Option+E | ✅ | editor |  |
| ref.next-footnote | Go to the next footnote | Alt+Shift+Right angle bracket (>) | ✅ |  | — | editor |  |
| ref.previous-footnote | Go to the previous footnote | Alt+Shift+Left angle bracket (<) | ✅ |  | — | editor |  |
| ref.bookmark | Display the Bookmark dialog box | Ctrl+Shift+F5 | ✅ | Cmd+Shift+F5 | ✅ | editor |  |
| field.date | Insert a DATE field | Alt+Shift+D | ✅ | Control+Shift+D | ✅ | editor |  |
| field.time | Insert a TIME field | Alt+Shift+T | ✅ | Control+Shift+T | ✅ | editor |  |
| field.page | Insert a PAGE field | Alt+Shift+P | ✅ | Control+Shift+P | ✅ | editor |  |
| field.update | Update the selected fields | F9 | ✅ | F9 | ✅ | editor |  |
| field.unlink | Unlink a field | Ctrl+Shift+F9 | ✅ | Cmd+Shift+F9 | ✅ | editor |  |
| field.toggle-code | Switch between a selected field code and its result | Shift+F9 | ✅ | Shift+F9 | ✅ | editor |  |
| field.toggle-all-codes | Switch between all field codes and their results | Alt+F9 | ✅ | Option+F9 | ✅ | editor |  |
| field.next | Go to the next field | F11 | ✅ |  | — | editor |  |
| field.next.alt-f1 | Move to the next field | Alt+F1 | ✅ |  | — | editor |  |
| field.previous | Go to the previous field | Shift+F11 | ✅ |  | — | editor |  |
| field.previous.alt-shift-f1 | Move to the previous field | Alt+Shift+F1 | ✅ |  | — | editor |  |
| char.line-break | Insert a line break | Shift+Enter | ✅ | Shift+Return | ✅ | editor |  |
| char.page-break | Insert a page break | Ctrl+Enter | ✅ | Cmd+Return | ✅ | editor |  |
| char.column-break | Insert a column break | Ctrl+Shift+Enter | ✅ | Cmd+Shift+Return | ✅ | editor |  |
| char.em-dash | Insert an em dash | Ctrl+Alt+Minus sign (on the numeric keypad) | ✅ |  | — | editor |  |
| char.en-dash | Insert an en dash | Ctrl+Minus sign (on the numeric keypad) | ✅ |  | — | editor |  |
| char.optional-hyphen | Insert an optional hyphen | Ctrl+Alt+Minus sign (-) | ✅ | Cmd+Option+Minus sign (-) | ✅ | editor |  |
| char.nonbreaking-hyphen | Insert a nonbreaking hyphen | Shift+Alt+Minus sign (-) | ✅ | Shift+Option+Minus sign (-) | ✅ | editor |  |
| char.nonbreaking-space | Insert a nonbreaking space | Ctrl+Shift+Spacebar | ✅ | Option+Spacebar | ✅ | editor |  |
| char.copyright | Insert a copyright symbol | Press (, C, ) | ✅ | Press (, C, ) | ✅ | editor |  |
| char.registered | Insert a registered trademark symbol | Ctrl+Alt+R | ✅ | Option+R | — | editor |  |
| char.trademark | Insert a trademark symbol | Ctrl+Alt+T | ✅ | Option+2 | — | editor |  |
| char.ellipsis | Insert an ellipsis | Ctrl+Alt+Period (.) | ✅ |  | — | editor |  |
| char.unicode | Insert the Unicode character for the specified Unicode (hexadecimal) character code | The character code, then press Alt+X | ✅ |  | ✅ | editor |  |
| intl.grave | Insert à, è, ì, ò, ù, À, È, Ì, Ò, Ù | Ctrl+Grave accent (`), the letter | ✅ |  | — | editor |  |
| intl.acute | Insert á, é, í, ó, ú, ý, Á, É, Í, Ó, Ú, Ý | Ctrl+Single quotation mark ('), the letter | ✅ |  | — | editor |  |
| intl.circumflex | Insert â, ê, î, ô, û, Â, Ê, Î, Ô, Û | Ctrl+Shift+Caret (^), the letter | ✅ |  | — | editor |  |
| intl.tilde | Insert ã, ñ, õ, Ã, Ñ, Õ | Ctrl+Shift+Tilde (~), the letter | ✅ |  | — | editor |  |
| intl.umlaut | Insert ä, ë, ï, ö, ü, ÿ, Ä, Ë, Ï, Ö, Ü, Ÿ | Ctrl+Shift+Colon (:), the letter | ✅ |  | — | editor |  |
| intl.ring | Insert å, Å | Ctrl+Shift+At sign (@), a or A | ✅ |  | — | editor |  |
| intl.ae | Insert æ, Æ | Ctrl+Shift+Ampersand (&), a or A | ✅ |  | — | editor |  |
| intl.oe | Insert œ, Œ | Ctrl+Shift+Ampersand (&), o or O | ✅ |  | — | editor |  |
| intl.cedilla | Insert ç, Ç | Ctrl+Comma (,), c or C | ✅ |  | — | editor |  |
| intl.eth | Insert ð, Ð | Ctrl+Single quotation mark ('), d or D | ✅ |  | — | editor |  |
| intl.slash-o | Insert ø, Ø | Ctrl+Forward slash (/), o or O | ✅ |  | — | editor |  |
| intl.inverted-question | Insert ¿ | Ctrl+Alt+Shift+Question mark (?) | ✅ |  | — | editor |  |
| intl.inverted-exclamation | Insert ¡ | Ctrl+Alt+Shift+Exclamation point (!) | ✅ |  | — | editor |  |
| intl.sharp-s | Insert ß | Ctrl+Shift+Ampersand (&), s | ✅ |  | — | editor |  |
| view.zoom-in | Zoom in | Ctrl+Plus sign (+) | ✅ | Cmd+Plus sign (+) | ✅ | editor |  |
| view.zoom-out | Zoom out | Ctrl+Minus sign (-) | ✅ | Cmd+Minus sign (-) | ✅ | editor |  |
| view.zoom-100 | Return back to 100% zoom | Ctrl+0 | ✅ | Cmd+0 | ✅ | editor |  |
| view.zoom-wheel | Zoom in and out with mouse | Ctrl+Scroll | ✅ | Cmd+Scroll | ✅ | editor |  |
| view.print-layout | Switch to the Print Layout view | Ctrl+Alt+P | ✅ |  | — | editor |  |
| outline.move-up | Move the selected paragraphs up | Alt+Shift+Up arrow key | ✅ | Control+Shift+Up arrow key | ✅ | editor |  |
| outline.move-down | Move the selected paragraphs down | Alt+Shift+Down arrow key | ✅ | Control+Shift+Down arrow key | ✅ | editor |  |
| outline.tab | Insert a tab character | Ctrl+Tab | ❌ |  | ❌ | browser | win no test case; mac no test case |
| ribbon.search | Move to the Tell Me or Search field on the Ribbon | Alt, Q, then enter the search term | ✅ |  | ✅ | editor |  |
| ribbon.collapse | Expand or collapse the ribbon | Ctrl+F1 | ✅ | Cmd+Option+R | ✅ | editor |  |
| ribbon.context-menu | Open the context menu | Shift+F10 or the Windows Menu key | ✅ | Shift+F10 | ✅ | editor |  |
| ribbon.actions-menu | Display the menu or message for available actions | Alt+Shift+F10 | ✅ |  | — | editor |  |
| ribbon.macros | Display the Macro dialog box | Alt+F8 | ✅ | Option+F8 | ✅ | editor |  |
| ribbon.vba | Open the Microsoft Visual Basic for Applications editor | Alt+F11 | ✅ | Option+F11 | ✅ | editor |  |

## 3. What was fixed

sdkjs (`elixir/interact`, all `[upstreamable]`):

- `fix(common)`: on macOS, Cmd+Option is no longer mistaken for AltGr, and Control+Cmd is distinguished from Cmd alone. Cmd+Option+1 (Heading 1), Cmd+Option+C/V, Cmd+Option+F did not work.
- `feat(word)`: AutoCorrect (c), (r), (tm), (e) into ©, ®, ™, € like Word.
- `feat(word)`: 43 Word commands added as customizable shortcut types (`word/Editor/word-shortcuts.js`, `Shortcuts.js`) and the keyboard machinery (extend mode F8, accent prefixes Ctrl+' etc., table keys, Ctrl+Up). Word's keys taken over where the editor did something else: Ctrl+5 (strikethrough → 1.5 line spacing), Ctrl+. and Ctrl+, (subscript/superscript → Ctrl+Shift+- / Ctrl+Shift+=), Alt+1..3 (→ Ctrl+Alt+1..3), Alt+H (comment → Ctrl+Alt+M), Ctrl+Shift+- (nonbreaking → Alt+Shift+-), Ctrl+] / [ (size list → 1 point; the list moves to Ctrl+Shift+> / <).

web-apps (`elixir/interact`):

- Shortcuts that open the interface (`controller/WordShortcuts.js`): Ctrl+O/F12/Shift+F12/Alt+Shift+F2/Ctrl+Alt+I/Ctrl+F2/Ctrl+Shift+F12/Alt+B, F6 and Shift+F6 (document, pane, status bar, ribbon), Ctrl+F1, Ctrl+D and Ctrl+Shift+F (launcher's Font box), Ctrl+G and F5 (new **Go To** box: page with +n/-n, bookmark, footnote, endnote), Ctrl+Shift+F5 (bookmarks), Alt+Shift+C, Alt+F8 and Alt+F11 (macros), Alt+Shift+F10 (paste options).
- Cmd+wheel zooms on macOS `[upstreamable]`; F1 undoes on macOS.

## 4. Shortcuts held by the browser (and alternative)

They are implemented when possible: they work in the desktop application and in a browser that does not hold them.

| id | Windows | macOS | In the browser | Alternative |
|---|---|---|---|---|
| file.new | Ctrl+N | — | new window | File > New (Alt, F, N) |
| file.close | Ctrl+W | Cmd+F4 | closes the tab | close the browser tab |
| file.close.ctrl-f4 | Ctrl+F4 | — | closes the tab | close the browser tab |
| window.next-document / previous-document | Ctrl+F6, Ctrl+Shift+F6 | Cmd+F6 | tabs | one document per tab |
| para.hanging / unhanging | Ctrl+T, Ctrl+Shift+T | Cmd+T, Cmd+Shift+T | new tab, reopened tab | Paragraph box > Special: Hanging |
| style.normal (and style.body-text) | Ctrl+Shift+N | Cmd+Shift+N | private window | style gallery > Normal (Alt, H, L) |
| nav.next-page / previous-page | Ctrl+PgDn, Ctrl+PgUp | Cmd+PgDn/PgUp (works) | next/previous tab | Ctrl+G or F5 (Go To page) |
| nav.web-back / web-forward | Alt+Left, Alt+Right | — | history | — |
| table.tab-char, outline.tab | Ctrl+Tab | Option+Tab (works) | next tab | none in Word |

System: Alt+F4, Alt+F5, Ctrl+F10, Cmd+`, Cmd+Shift+`.

## 5. Remaining gaps

Functions absent from the editor (30 `absent` rows of the CSV), by family:

- **Views**: window split (Ctrl+Alt+S), first line only in the Outline view (Alt+Shift+L). Read Mode, Outline and Draft are done (section 13).
- **Office clipboard**: Office Clipboard (Alt, H, F, O). Spike, AutoText, move/copy to (F2, Shift+F2), Paste Special and Repeat are done (sections 10 and 11).
- **Formatting**: AutoFormat (Ctrl+Alt+K), Styles panes (Ctrl+Shift+S, Ctrl+Alt+Shift+S). The Reveal Formatting pane (Shift+F1) is done (section 14).
- **Navigation**: multiple selection and column selection (Ctrl+Shift+F8).
- **References, mail merge, fields**: table of contents, index and table of authorities entries (Alt+Shift+O/I/X), mail merge (Alt+Shift+K/N/M/E/F), LISTNUM fields, links (Ctrl+Shift+F7), MACROBUTTON. The empty field (Ctrl+F9) and field locking (Ctrl+F11, Ctrl+Shift+F11) are done (section 13).
- **Review**: translator, language on the Review tab. The thesaurus (Shift+F7) is done for English (section 14).
- **Ribbon**: command search (Alt, Q), Mailings and Developer tabs. The Selection pane (Alt+F10) is done (section 14).
- macOS: F2/F3/F4 (cut, copy, paste) are not wired: a browser only gives the clipboard to the native Cmd+X/C/V commands.

## 6. KeyTips (ribbon access)

- Alt released, or F10, displays Word's letters on the tabs: File F, Home H, Insert N, Draw JI, Design G, Layout P, References S, Review R, View W; the quick access toolbar is numbered from left to right, Search is Q. Only the ribbon and the title bar carry KeyTips (not the panes nor the status bar).
- Then the letters of the Word for Microsoft 365 commands: Alt, H, 1 (bold), 2, 3, 4, 5, 6, FF (font), FS, FG, FK, 7, E, I, FC, U, N, M, AO, AI, 8, AL, AC, AR, AJ, K, H, B, L, FD, R, SL, FN, PG; Insert NP, B, T, P, SH, M, C, I, L, H, NU, X, W, RC, D, J, Q, E, U; Layout M, O, SZ, J, B, LN, H, IL, IR, SB, SA; References T, A, U, F, K, P, RF, G, V; Review C, D, G, TD, A2, J, M; View K, J, M, R, H; File N, I, S, A, P, E, T. A command with no Word equivalent keeps the editor's automatic letter. **Note**: the instruction cited "Alt, H, B" for bold; in Word, B is Borders and bold is 1, which is what is applied.
- Alt+H held together acts like Alt then H (not on macOS, where Option+letter types a character; not Alt+F, Alt+X nor Alt+I). Esc goes up one level.
- Keyboard navigation: after Alt, Tab or the arrows enter the ribbon; Left/Right change tab, Down enters the commands, Tab/Shift+Tab and the arrows go from command to command, Ctrl+arrows from group to group, Down or Alt+Down opens the list, Esc goes back to the tab then to the document, Ctrl+Shift+F10 shows the tooltip.
- macOS: Word for Mac has no KeyTips; we keep the editor's convention (Option pressed then released). AI keeps Alt+I and ⌃⌥I (no KeyTip reacts to I).
- Look: small light labels with a thin border and soft shadow (dark in dark theme). Screenshots `screenshots/ui2/interact-keytips-tabs.png`, `interact-keytips-home.png`.

## 7. Mini toolbar, context menus, ScreenTips

- **Mini toolbar**: after a mouse selection, near the pointer; font, size, grow/shrink, styles, format painter; bold, italic, underline, highlighter and font color (with palettes), bullets, numbering, new comment. It appears translucent, becomes opaque when the pointer approaches, fades out when it moves away (gone beyond 150 px), disappears on typing, on a click elsewhere or on scrolling; not displayed for a keyboard selection. On right click, it is displayed above the context menu. Screenshots `interact-minitoolbar.png`, `interact-minitoolbar-contextmenu.png`.
- **Context menus** (text, spelling error, table, image, link, header) in Word's order: suggestions in bold first, Cut/Copy/Paste, object commands, Font... (new) and Paragraph..., Link, New Comment, then the editor's additions. Word's labels, Fluent icons (11 new ones, `tools/fluent-icons/map.json`), shortcut on the right, a separator between two visible groups. Screenshots `interact-contextmenu-*.png`.
- **ScreenTips**: bold title with the shortcut in parentheses, one description line (50 commands, 12 languages), 500 ms delay (immediate redisplay from one command to the next is coded but not yet confirmed by the test); 2 px focus ring common to the ribbon, menus, boxes; tab change with a short fade; no layout jump when opening menus or changing tab (measured). Screenshots `interact-screentip.png`, `interact-screentip-fr.png`.

All the new strings go through the language files: en, fr, de, es, it, pt, pt-pt, nl, ru, pl, ja, zh (other languages fall back to English; the context menu labels are only replaced in these 12 languages).

## 8. Foreseeable conflicts with the other work items

`elixir/dev` now contains the "fmt" and "ribbon" slices. Points to settle at merge:

- `sdkjs/word/Editor/Shortcuts.js`: fmt also bound Ctrl+Shift+> / <; here, the "Microsoft Word bindings" block binds them to IncreaseFontSize/DecreaseFontSize (size list) and Ctrl+] / [ to the 1-point step. Keep a single definition.
- Ctrl+Shift+S and Ctrl+Alt+Shift+S (Apply Styles / Styles panes, if fmt creates them): here they are "absent" and Ctrl+Shift+S remains the editor's Save As on Windows.
- Ctrl+F1 (collapse the ribbon): bound here in `WordShortcuts.js`; to deduplicate if the RibbonTabs controller also binds it.
- Alt, Q / Alt+Q (ribbon command search): here "absent" and Alt+Q remains the editor's chat; the Q KeyTip is placed on the title bar's Search button.
- Ctrl+F: here the editor's search bar; if the ribbon makes it the navigation pane, the `nav.find` test accepts both (`#search-bar-text, #search-adv-text`) but not a Navigation pane.
- Contextual ribbon tabs: `WordKeyTips.js` does not give their letters (Word: JT, JL, JP, JD); to add in `TABS` according to the `data-tab` of the RibbonTabs controller.
- `apps/documenteditor/main/app.js` and `app_dev.js`: five controllers added (WordShortcuts, WordKeyTips, MiniToolbar, WordContextMenus, ScreenTips) after ElixirAI; textual conflict likely but trivial.

## 9. Running

```bash
cd $EO_WORK/wt/interact/develop && ./eo.sh up interact 8095
$EO_WORK/wt/interact-work/build.sh web-apps-dev ; $EO_WORK/wt/interact-work/build.sh sdkjs-dev
cd $EO_WORK/wt/interact-repo
EO_BASE=http://localhost:8095 node tests/shortcuts/run.mjs --platform both      # matrix
node tests/shortcuts/report.mjs tests/shortcuts/results/latest.json --md         # table
node tests/shortcuts/keytips.mjs docs/screenshots/ui2                           # and minitoolbar, contextmenus, screentips
python3 tools/shortcuts/matrix.py                                               # regenerates the CSV
```

### 9.1 Running on a real Mac (Chromium, Chrome, WebKit)

The Linux runs above emulate macOS (spoofed user agent and `navigator.platform`). On a Mac the same suites run against a <dev-host> instance through an SSH tunnel, with the real macOS key handling, the native clipboard and the fonts installed on the Mac (Local Font Access).

```bash
# once: Node 22, Playwright and its browsers in a local folder (no system change), and the tunnel to the instance
mkdir -p ~/eo-mac-tests/pw && cd ~/eo-mac-tests/pw && npm init -y && npm i playwright
PLAYWRIGHT_BROWSERS_PATH=~/eo-mac-tests/browsers npx playwright install chromium webkit
ssh -fN -L 18080:localhost:8080 <dev-host>
# a copy of tests/ from this repository in ~/eo-mac-tests/repo, then, per browser:
export PLAYWRIGHT_BROWSERS_PATH=~/eo-mac-tests/browsers PW_DIR=~/eo-mac-tests/pw EO_BASE=http://localhost:18080
export EO_REAL_MAC=1 EO_BROWSER=chromium          # or chrome (installed Google Chrome), webkit (Safari engine)
node tests/shortcuts/run.mjs --platform mac; node tests/shortcuts/repeat.mjs; node tests/shortcuts/minitoolbar.mjs
node tests/ctxmenu/fontcombos.mjs --platform mac; node tests/spell/spell.mjs; node tests/layout/layout.mjs
node tests/shortcuts/contextmenus.mjs
```

- `EO_BROWSER` (in `tests/shortcuts/lib.mjs`, shared by the other suites): `chromium` (default, Playwright's build), `chrome` (channel `chrome`), `webkit`. WebKit has no `clipboard-write` permission: only `clipboard-read` is granted, and a refused grant does not stop the run.
- `EO_REAL_MAC=1`: no user-agent or platform spoofing (the editor already sees a Mac). The suites play the Mac form of the Ctrl shortcuts with Playwright's `ControlOrMeta` (Cmd on macOS, Ctrl elsewhere): undo, redo and select all in `cases-edit-keys.mjs` and `spell.mjs`, every Ctrl key of `repeat.mjs` (Cmd+Y repeats or redoes as in Word for Mac, Cmd+Option+1 is Heading 1). `contextmenus.mjs` expects the labels of Word for Mac (`⌘X`, `⌥⌘A` for New Comment).
- With the local-fonts consent the Mac's own fonts are in the font box, so the list opens scrolled to the font in use (Comic Sans MS in `fontcombos.mjs`, installed on the Mac, not on the server). The suite used to click a row taken from the top of the list, off screen in that case, so nothing was picked (2 intermittent failures in Chromium and Chrome); it now only clicks rows inside the visible part of the list. Not an editor bug: a real click on a visible row applies the font.

## 10. Repeat (F4, Ctrl+Y)

Branches `elixir/repeat` (sdkjs, web-apps) and `feat/repeat` (this repository). Test: `tests/shortcuts/repeat.mjs` (33 scenarios, Windows and macOS keys) and the matrix row `edit.repeat` (`tests/shortcuts/run.mjs`).

**Repeat** works as in Word: the last command is applied again to the **current** selection or cursor.

- F4 always repeats. Ctrl+Y (Cmd+Y on macOS) redoes when there is something to redo, and repeats when there is nothing to redo. Nothing to repeat: nothing happens.
- Repeatable (recorded when the user runs them, whatever the surface: ribbon, mini toolbar, context menu, dialog or shortcut): character formatting (bold, italic, underline, strikethrough, size, font, colour, highlight, case, sub/superscript, clear formatting), paragraph formatting (alignment, indents, spacing, line spacing, lists, borders, shading, paragraph box), styles, tables (insert, rows, columns, merge), page, column and section breaks, symbols, hyperlinks, comments, pictures, equations, page number, delete (Backspace, Delete), cut, paste, Enter and typing (the text typed since the last other command; Backspace shortens it). Not repeatable: navigation, selection, undo/redo, save, zoom, view, find.
- A toggle shortcut (Ctrl+B, Ctrl+E...) is recorded with the value it applied, so a repeat applies bold or centring and never toggles it back. With the cursor in a word, formatting applies to the word, as the original command does.
- A repeat goes through the same lock check, history action and revision tracking as the original command: **one undo step**, recorded as tracked changes in review mode, and nothing happens on a paragraph locked by a co-editor.
- Interface: the Redo button of the quick access toolbar becomes **Repeat** (arrow icon, "Repeat (F4)" and its screen tip) when there is nothing to redo and a command can be repeated.
- Implementation: `sdkjs/word/Editor/repeat-command.js` (a closure per command calling the same engine entry point with the same arguments), API `asc_Repeat`, `asc_CanRepeat`, event `asc_onCanRepeat`; web-apps `Toolbar.js` (`updateRedoRepeat`). macOS: F4 repeats (Word for Mac pastes with it, not wired in a browser).

## 11. Editing shortcuts of phase 1 and 2 (F2, Spike, Paste Special, edit places, underline styles, hidden text, ...)

Branches `elixir/keys2` (sdkjs, web-apps) and `feat/keys2` (this repository). Engine code: `sdkjs/word/Editor/word-edit-keys.js` (new shortcut types 200 to 211 in `c_oAscDocumentShortcutType`, customizable like the others), interface: `web-apps/.../controller/WordEditKeys.js` and `view/PasteSpecialDialog.js`. Cases: `tests/shortcuts/cases-edit-keys.mjs` (played by `run.mjs`), `keytips.mjs` for Alt, H, V, S and Alt, R, P.

| Shortcut (Windows / macOS) | Behaviour | Limits |
|---|---|---|
| F2, Shift+F2 (macOS: Shift+F2 only) | The selection is moved or copied to the place chosen with the cursor (arrows, click): status hint "Move to where? Press Enter", Enter performs it (one undo step, tracked as a move in review mode), Esc cancels | Selections in the document body; typing cancels |
| Ctrl+F3, Ctrl+Shift+F3 (Cmd+F3, Cmd+Shift+F3) | Cut to the **Spike** (accumulates, hint with the number of items) and paste it (each item ends with a paragraph mark, the Spike is emptied) | The Spike lives while the document is open |
| Ctrl+Alt+V (Cmd+Control+V), Alt, H, V, S | Paste Special dialog: Formatted text (keep source formatting), Merge formatting, Unformatted text, Picture; it uses the paste options of the engine (the browser clipboard gives one HTML entry, so there is no separate RTF / HTML choice) | On Windows, Ctrl+Alt+V first applies formatting copied with Ctrl+Alt+C (previous behaviour), then it is Paste Special. The letters K, M, T, S now work in the open Paste menu |
| Shift+F5, Ctrl+Alt+Z | Go back to the place of the last edit, then of the edits before it (history of 4 places, one per paragraph, cycle). Right after opening: the places of the last session, which this browser keeps per document (localStorage); with none, the previous tracked change | Not stored in the .docx, so they are lost with another browser or profile |
| Ctrl+Shift+D, Ctrl+Shift+W (Cmd+Shift+D, Cmd+Shift+W) | **Double underline** and **words-only underline** (no line under spaces and tabs), toggles; also in the Font dialog (Underline style) | Stored as `w:u double` / `w:u words` and read back from .docx (checked); the other underline styles are still drawn as a single line. Ctrl+Shift+W closes the window in Chrome, Edge, Firefox (Cmd+Shift+W in Chrome, Safari): scope `browser` |
| Ctrl+Shift+H | **Hidden text** (`w:vanish`): the engine now applies it (history, undo, collaboration, Clear Formatting) and does not lay it out or draw it, unless the formatting marks are shown (Ctrl+Shift+8), which re-lays out the paragraphs | No dotted underline when shown. It replaces the Comments pane key on Windows (the pane stays on the ribbon button; macOS Cmd+Shift+H still opens it). Numeric keypad / is Outline view only: still absent |
| Print preview (File > Print): Page Up/Down, arrows, Ctrl+Home/End | Previous or next page, first or last page | The preview shows one fitted page and has no zoom, so the arrow keys also change the page |
| Alt, R, P | Opens the Comments pane (list of comments); Cmd+Home / Cmd+End (Ctrl elsewhere) in the pane select the first / last comment | Word's extra letters (1, L) are not needed |
| Alt+F6 | From a pane that does not take the whole window (Find, Comments, Navigation...) back to the document | Modal dialogs keep the focus until closed |
| Alt+Shift+R | In the header or footer of the second or a later section: it becomes the one of the previous section (Link to Previous) | |
| Alt+F3 (Option+F3), name + Enter | **AutoText**: Alt+F3 asks for a name and keeps the selection with its formatting (localStorage, per user and browser); typing the whole name and pressing Enter inserts it | Exact name (no prefix matching or tooltip), no spaces in names; not stored in the document or Normal.dotm, no Quick Parts gallery yet |

Still absent after this work (see the CSV for the notes): numeric keypad / (Outline view only), Alt+F10 Selection pane, Reveal Formatting, the Office Clipboard pane, Outline and Read Mode, window split, fields, mail merge, proofing tools.

## 12. Context-menu sweep (F4, `tests/ctxmenu/`)

Reported: right-click menus "sometimes non-functional, sometimes an error popup". The sweep opens each context menu with a real right click, lists the items and submenu items from the DOM, then, from a fresh menu each time, clicks every item with a real mouse click (Playwright actionability: the item has to be visible and not covered). Per click it records console and page errors, error or warning popups (alert windows), whether the editor state, a dialog, the clipboard, a file chooser, a download or the Ask Elixir bar changed ("no visible effect"), and whether the menu closed. It also checks that each menu is inside the window and that a menu does not keep rewriting its own DOM while a submenu opens (the event loop that broke the Spreadsheet menus).

```bash
cd $EO_WORK/wt/ctxmenu-repo && export EO_BASE=http://localhost:8098
node tests/ctxmenu/sweep-word.mjs     # text, selection, misspelled word, tables, picture (inline and floating), shape, header, footer, hyperlink, comment, list, TOC, margin, track change, equation, footnote
node tests/ctxmenu/sweep-cell.mjs     # cell, range, formula, empty cell, link, comment, row/column header, corner, sheet tabs, shape, picture, chart
node tests/ctxmenu/sweep-slide.mjs    # slide, title text and shape, shape, picture, table, thumbnails
# options: --only id1,id2  --out file.json  --max-sub N (submenu items sampled per submenu, default 4)  --shots dir (screenshot when a menu does not open)
```

Spelling scenarios (`misspelled`, `misspelled-no-suggestion`, `misspelled-table`): the document is rebuilt and a character retyped before each opening, the harness waits until the suggestions have arrived (`waitFor`), and the items of the Language sub-menu are skipped (the menu builds them when it opens; `tests/spell/spell.mjs` clicks them).

Font drop-downs (F5 to F7): `node tests/ctxmenu/fontcombos.mjs [--platform win|mac]` opens, with real clicks, the font-name and font-size lists of the Word mini toolbar (selection in a Comic Sans MS table cell, mini toolbar and right-click menu open together) and ribbon, and of the Spreadsheet and Presentation ribbons, with the local-fonts consent off and on; it checks that there is no error dialog and no console or page error, that the lists are not empty, that the picked font and size are applied (read back from the engine) and that the right-click menu still opens afterwards. The mini toolbar block of `tests/shortcuts/minitoolbar.mjs` checks the same on the real selection flow.

Accepted behaviors (not failures): the Paste notice ("Copy, cut and paste actions", browsers do not let the page read the clipboard), the Warning of "Pick From Drop-down List..." when the column has nothing to pick, Filter and Sort warnings on an empty cell, the confirmation when deleting a sheet, commands whose effect is a view switch, the side panel, print or a file chooser (list `NO_EFFECT_OK` in `tests/ctxmenu/lib.mjs`). Disabled items are skipped. The language submenu of the spelling menu is sampled (4 of 250 items).

Found and fixed (2026-10-07):

1. Spreadsheet: all submenu commands of the cell, row, column and sheet tab menus did nothing (`ExcelContextMenus` rearranged the menu on the bubbling `show.bs.dropdown` of a submenu item: endless loop). Fix in `apps/spreadsheeteditor/main/app/controller/ExcelContextMenus.js`.
2. Example app: Change Picture > From storage (and Insert > Picture > From storage) failed with "The document security token is not correctly formed" five minutes after the page was served (the signed data used the 5 minute editor token lifetime). The data is now valid for 12 hours (document-server-integration `app.js`); the sweep checks the token lifetime.
3. Open point: "Format Cells..." of the cell menu opens the right panel (cell settings), not the Format Cells dialog of Excel.

## 13. Views and fields of phase 2 and 3 (Outline, Draft, Read Mode, Ctrl+F9, Ctrl+F11)

Branches `elixir/parity2` (sdkjs, web-apps) and `feat/parity2` (this repository). Engine: `sdkjs/word/Editor/word-views.js` (shortcut types 220 to 225; the views are layouts of the engine, next to Print and Read in `word/Editor/Layout`, they change neither the document nor its history), interface: `web-apps/.../controller/WordViews.js`. Cases: `tests/shortcuts/cases-views.mjs` (played by `run.mjs`), `tests/views/views.mjs` (View tab, KeyTips, Outlining tab, Draft, Read Mode).

| Shortcut (Windows / macOS) | Behaviour | Limits |
|---|---|---|
| Ctrl+Alt+O (Cmd+Option+O), Alt, W, U, View > Outline | **Outline view**: paragraphs indented by outline level (body text one step under its heading), no paragraph formatting, outline symbols (plus: heading with text under it, minus: without, small circle: body text), a collapsed heading is underlined in grey. The **Outlining** tab (Alt, U) appears before Home: Promote to Heading 1, Promote, Outline Level, Demote, Demote to Body Text, Move Up, Move Down, Expand, Collapse, Show Level, Show Text Formatting, Close Outline View | The view uses long pages of the first section width, without headers and footers. Tables stay visible under a collapsed heading. Floating objects are shown in the text flow |
| Alt+Shift+Plus / Minus (Control+Shift+Plus / Minus) | Expand / collapse one level under the selected headings (or the heading of the cursor): body text first, then the lowest headings; collapsed paragraphs take no room and the arrow keys jump over them | Outline view only (no collapse arrows on headings in Print Layout yet) |
| Alt+Shift+1 to 9, Alt+Shift+A (Control+Shift+...) | Headings up to that level; Alt+Shift+A shows everything, or the headings only when everything is shown | |
| Numeric keypad / | Show or hide the text formatting in the Outline view (plain text at the default size) | |
| Tab, Shift+Tab, Alt+Shift+Left/Right, Alt+Shift+Up/Down | In the Outline view: demote / promote the heading (Shift+Tab on body text makes it a heading under the one above), move a heading with the text a collapse hides | Alt+Shift+L (first line of body text only) is still absent |
| Ctrl+Alt+N (Cmd+Option+N), Alt, W, E | **Draft view**: no headers, footers or top margin, the side margins of the first section, floating objects in the text flow | Long pages rather than one continuous strip: a page break starts a new page; automatic page breaks are not drawn as dotted lines |
| Ctrl+Alt+P (Cmd+Option+P), Alt, W, P | Print Layout, from any view (also leaves Read Mode) | |
| Alt, W, F, View > Read Mode | **Read Mode**: viewing, ribbon folded, no rulers or spelling marks, the text flows in pages of the window size; Page Down/Up, arrows, Space, Home, End, a page number then Enter; Esc goes back to the mode of before (Editing, Reviewing) and restores ribbon, rulers, spelling marks and zoom | One page at a time (Word shows two columns side by side on wide screens); no Read Mode toolbar (View, Tools menus) |
| Ctrl+F9 (Cmd+F9) | **Empty field** `{ }` with its code shown and the cursor inside; a selection becomes the field code. F9 reads the code typed in place, updates the field and shows its result | The engine read the instruction of a shown code from its display replacements (lost after typing); fixed in `ParaRun.ProcessComplexFields` |
| Ctrl+F11, Ctrl+Shift+F11 (Cmd+F11, Cmd+Shift+F11) | **Lock / unlock** the field of the cursor or the fields of the selection; F9 skips locked fields (status hint) | The lock lasts for the session: not saved in the .docx yet (the editor binary format has no `fldLock`; needs an x2t change) |

## 14. Task panes: Reveal Formatting, Selection, Thesaurus

Same branches as section 13. Interface: `web-apps/.../controller/WordPanes.js` (one pane at a time at the right of the document, Esc or the close button closes it); engine: `asc_GetRevealFormatting`, `asc_GetSelectionPaneObjects` and the Selection pane calls of `sdkjs/word/Editor/word-views.js`. Cases: `tests/shortcuts/cases-views.mjs`, `tests/views/panes.mjs`.

| Shortcut | Behaviour | Limits |
|---|---|---|
| Shift+F1 (also macOS) | **Reveal Formatting**: the selected text, then Font (font, size, bold, italic, underline, language, color, effects, character spacing), Paragraph (style, alignment, outline level, indentation, spacing, pagination, list) and Section (margins, columns, paper) at the cursor, in the units of the settings; the Font, Paragraph and Section headings open the Font, Paragraph and Page Setup dialogs; it follows the cursor | No "Distinguish style source" and no "Compare to another selection" |
| Alt+F10 | **Selection pane**: the objects of the document (pictures, shapes, text boxes, groups, charts), the one in front first, named as Word does ("Picture 1") or with their own name; click selects, double click renames (one undo step), the eye hides or shows (one undo step), Show All, Hide All, Bring Forward, Send Backward | No drag and drop in the list, objects of a group are not listed one by one. A hidden object is not drawn and the text does not wrap around it; it is saved hidden (`wp:docPr hidden`) and kept on opening (the engine used to drop hidden objects when it read a file) |
| Shift+F7 (also macOS) | **Thesaurus**: meanings and synonyms of the selected word or of the word of the cursor, from the offline MyThes files of the dictionaries folder (read with HTTP range requests on the document server, nothing sent elsewhere); clicking a synonym looks it up, the Insert arrow replaces the word (one undo step) | Thesaurus files for 17 languages, picked by the language of the text (section 15, docs/thesaurus.md) |

## 15. Block selection, split window, Show First Line Only, field lock saved, Mailings tab, thesaurus languages

Branches `elixir/parity2` (sdkjs, web-apps, core, dictionaries), `feat/parity2` here. 20 matrix rows still `absent` after this wave.

| Command | Windows | macOS | What it does |
|---|---|---|---|
| Block (column) selection | Ctrl+Shift+F8, then the arrow keys; Alt+drag | Cmd+Shift+F8, then the arrow keys; Option+drag | A rectangle on one page; on each line of body text it crosses, the characters between its edges. Copy and cut give one line of text per line of the block; Delete and Backspace remove it (one undo step); character formatting (bold, font, size, colour...) applies to the block only. Esc, a click or any other key ends it (typing starts at its top left corner). |
| Split window | Ctrl+Alt+S, View > Split (Alt, W, S) | Cmd+Option+S | A second pane under the document with its own scroll, drawn by the engine and redrawn after each change. A click in it puts the cursor there; typing goes to the upper pane. Drag the bar to resize. |
| Remove the split | Alt+Shift+C or Ctrl+Alt+S | Cmd+Option+S | Also: double-click the split bar, or drag it to an edge. |
| Show First Line Only | Alt+Shift+L (Outline view), Outlining > Show First Line Only (Alt, U, F) | Control+Shift+L | Body text paragraphs show their first line followed by an ellipsis. |
| Field lock saved | Ctrl+F11 / Ctrl+Shift+F11 | Cmd+F11 / Cmd+Shift+F11 | The lock is now an undoable change, sent to co-editors and saved as `w:fldLock` in .docx; locked fields of Word documents stay locked. |
| Mailings tab | Alt, M | | Select Recipients (CSV or XLSX of the computer, URL, storage when the integration has one), Edit Recipient List (spreadsheet dialog), Insert Merge Field, Highlight Merge Fields, Preview Results with First / Previous / record number / Next / Last, Finish & Merge. |
| Preview the merge | Alt+Shift+K | | Toggles Preview Results. |
| Merge to a new document | Alt+Shift+N | | Downloads one .docx with a section per record (Finish & Merge > Edit Individual Documents). |
| Print the merged document | Alt+Shift+M | | Downloads one PDF of the merged records (Finish & Merge > Merge to PDF); One PDF per Record is in the same menu. |
| Edit the data | Alt+Shift+E | | Opens the recipient list in a spreadsheet dialog (asks for the file when there is none). |
| Insert a merge field | Alt+Shift+F | | Opens the list of the fields of the recipients. |
| Thesaurus | Shift+F7 | Shift+F7 | The thesaurus of the language of the text: 17 languages (docs/thesaurus.md). |

Design notes and limits:

- **Block selection** (`sdkjs/word/Editor/word-block-selection.js`): the engine keeps an ordinary selection from the first to the last character of the block, so the ribbon shows the formatting of the selection, and draws only the block. Body text of one page only (not tables, headers or text boxes). Character formatting goes through `AddToParagraph(ParaTextPr)` for each line; paragraph formatting (alignment, spacing) applies to the paragraphs of the block. Alt+drag no longer shows the KeyTips on Alt release (`HintManager`: the editor area cancels its pointer events, so no mousedown reached the document).
- **Split window** (`WordViews` controller, `asc_DrawPageToCanvas`): the second pane is a live view of the pages; editing happens in the upper pane (a click in the lower one moves the caret there and the upper pane follows). No caret or selection is drawn in the lower pane, and it does not have its own zoom.
- **Field lock**: Ctrl+F11 replaces the begin character of the field through the history (`ElxFieldLock` on `ParaFieldChar`, written in the co-editing binary and in the editor binary format as `c_oSer_FldSimpleType.FldLock = 5`). The C++ converter (core `elixir/parity2`, `OOXML/Binary/Document`) reads and writes it for `w:fldChar` and `w:fldSimple`; x2t must be rebuilt (docs/dev.md, "x2t of a work item"). A simple field (`w:fldSimple`) keeps its lock through x2t, but the editor turns simple fields into its own field objects and does not keep the lock of these.
- **Mail merge** (`WordMailings` controller) uses the existing engine (`asc_StartMailMerge`, `asc_PreviewMailMergeResult`, `asc_DownloadAsMailMerge`): at most 100 records per merge, the result is downloaded (a new document in Word); email merge only when the integration gives the addresses. The recipient list dialog needed a fix of the built `index_internal.html` of the spreadsheet editor (backport of upstream b39b884517 and 676f2e11b9; it also fixes the chart data dialog).
- Tests: `tests/views/wave2.mjs` (37 checks), cases in `tests/shortcuts/cases-wave2.mjs` (played by `run.mjs`), `tests/views/panes.mjs` (thesaurus per language), KeyTips `ribbon.mailings` in `keytips.mjs`.

| Shift+F7 (also macOS) | **Thesaurus**: meanings and synonyms of the selected word or of the word of the cursor, from the offline MyThes files of the dictionaries folder (read with HTTP range requests on the document server, nothing sent elsewhere); clicking a synonym looks it up, the Insert arrow replaces the word (one undo step) | Thesaurus files are bundled for English (en_US, WordNet based, also used for other English variants), Arabic and Ukrainian only; a free French thesaurus exists (LibreOffice / Grammalecte, MPL 2.0) but is not bundled yet (decision for the owner: size and licence) |
## 16. Excel and PowerPoint (2026-10-08, `elixir/xlppt`)

Spreadsheet: every `editor` row of `docs/shortcuts-excel.csv` passes (152/152 Windows, 169/169 macOS key variants), with Repeat, End / Extend / Add modes, Flash Fill (Ctrl+E) and Quick Analysis (Ctrl+Q); details in `docs/shortcuts-excel.md` section 6. Presentation: 12 rows of `docs/shortcuts-powerpoint.csv` moved off `gap` (paragraph keys, regroup, Shift+F4, F6, pen / laser / eraser keys during the show), new `macos_keys` column, suite on both platforms (78/78 Windows, 76/76 macOS); details in `docs/ui.md` (presentation, section 5).

## 17. Browser-reserved keys (2026-10-09, `elixir/browserkeys`)

Browsers keep some shortcuts for themselves (tabs and windows), so a web page never receives them. Branches: `elixir/browserkeys` in web-apps and document-server-integration, `feat/browserkeys` in this repository; instance `eo-browserkeys`, port 8115. Nothing is pushed.

### What is possible, per mechanism

| Mechanism | Result |
|---|---|
| Keyboard Lock (`navigator.keyboard.lock(codes)`) | Chromium (Chrome, Edge, Opera) only; Firefox and Safari have no such API. Tested in headless Chromium: the API exists, `lock()` **resolves from the top-level page and is refused from an iframe** (`InvalidStateError`, "must be called from a primary top-level browsing context"). The editors run in an iframe, so the lock is requested by the top-level page: `web-apps/apps/api/documents/api.js` (`DocsAPI`, loaded by every integration) asks for `W N T Tab PageUp PageDown Digit1..9` at load and again on every `fullscreenchange`. Chromium applies the lock **while the page is in full screen** (hold Esc to leave); a request made outside full screen is accepted and inert. Not testable in Playwright: it sends keys to the page, so the browser's own shortcuts never <dev-host>. |
| Full screen | The editor's "Keyboard shortcuts in the browser" dialog has a Full screen button (the editor asks the top-level page with `postMessage`, the page calls `requestFullscreen()`, then locks). Test: `fullscreen.from-editor`. |
| Installed app (PWA window) | `manifest.webmanifest` (name, `display: standalone`, 192/512 and maskable icons, scope = the start page folder) is linked from the start page and the editor page; Chromium reports no installability error (`Page.getInstallabilityErrors`, test `manifest.installable`). No service worker, no offline cache. An app window has no tabs, so the tab keys (Ctrl+Tab, Ctrl+PageDown/Up and the Shift forms, Ctrl+T, Ctrl+1..9) are not browser commands there and are expected to reach the page; Ctrl+W, Ctrl+N, Ctrl+Shift+W and Ctrl+Shift+N stay window commands. **To confirm on a real Chrome and Edge** with `tests/browserkeys/probe.html` (below). The start page has an "Install app" item in its left bar (shown when the browser offers installation), and the dialog has an Install button. |
| `beforeunload` guard | Already in the editors (`onBeforeUnload`): Ctrl+W, closing the window or reloading asks first when the document has unsaved changes (test `beforeunload.guard-when-modified`). It cannot stop the key, only ask. |
| Alternatives that reach the page | See below. Always work, in every browser. |

### Alternatives (shown in the "Keyboard shortcuts in the browser" dialog)

Pressed as **Ctrl+Alt+Shift+key** (macOS: **Cmd+Option+Shift+key**); free in the three shortcut matrices, and Chrome, Edge and Firefox do not use them. In the Word and PowerPoint editors the alternative plays the reserved key in the editor (`common/main/lib/elixir-browserkeys/Controller.js`), so there is one implementation per function.

| Reserved key | Editor | Instead |
|---|---|---|
| Ctrl+Shift+W (words-only underline) | Word | Ctrl+Alt+Shift+W |
| Ctrl+T (hanging indent) | Word | Ctrl+Alt+Shift+T |
| Ctrl+Shift+N (Normal style) | Word | Ctrl+Alt+Shift+N |
| Ctrl+Tab (tab character in a cell) | Word, PowerPoint (Windows, Linux) | Ctrl+Alt+Shift+Tab (macOS: Option+Tab) |
| Ctrl+N | Excel, PowerPoint | Ctrl+Alt+Shift+N, File > New; Ctrl+N itself opens File > New when it reaches the editor |
| Ctrl+N | Word | File > New (Alt, F, N) |
| Ctrl+T (font dialog) | PowerPoint | Ctrl+Shift+F, Ctrl+Alt+Shift+T |
| Ctrl+T (create table) | Excel | Ctrl+L, Ctrl+Alt+Shift+T |
| Ctrl+PageDown / PageUp (next, previous sheet) | Excel | Ctrl+Alt+PageDown / PageUp; macOS Option+Right / Left |
| Ctrl+Shift+PageDown / PageUp (select next, previous sheet) | Excel | Ctrl+Alt+Shift+PageDown / PageUp; Ctrl+click a sheet tab. (The native keys now work too when they reach the page: the engine only moved the sheet before.) |
| Ctrl+PageDown / PageUp (next page) | Word | Ctrl+G (Go To page); Ctrl+Alt+PageDown is Word's "bottom of the window" |
| Ctrl+W, Ctrl+F4 | all | File > Close; the unsaved-changes guard asks first |

Microsoft's own page for Excel and Word for the web could not be fetched from this environment (404 on the guessed addresses), so the Excel choice Ctrl+Alt+Page Down / Page Up is from memory of that page and still to be compared with it; the dialog and the CSV `alternative` column are the single place to change.

### One-time hint

The page cannot see a reserved key, but sees its effect: Ctrl (or Cmd) was pressed with no other key and the window lost the focus within 2.5 s (tab switch, new window). On return the editor shows a dismissible bar once per browser ("The browser kept that shortcut ... Show shortcuts"); not in an installed app or in full screen, not after a normal combination such as Ctrl+B. Tests `hint.*`. The dialog also opens from File > Options > Keyboard Shortcuts ("Keys kept by the browser").

### Keys still unreachable

Ctrl+W and Ctrl+Shift+W, Ctrl+N and Ctrl+Shift+N in a normal tab (use File > Close, File > New, the alternatives above; the app window and full screen are expected to help for some, to be confirmed on real browsers), Ctrl+Tab and Ctrl+Shift+Tab in Firefox and Safari tabs (no Keyboard Lock there; installed apps are Chromium only), F11 (full screen), Ctrl+F5 (reload), Alt+Left/Right (history, but a page may handle them), and everything the operating system keeps (Alt+Tab, Cmd+Q, Cmd+H). Not handled: Ctrl+Tab in dialogs (Excel) and the Word "Tab in table" on macOS (Option+Tab already works).

### Checking in a real browser

`tests/browserkeys/probe.html` logs every key the page receives, blur / visibility changes, the display mode and the lock state; run `python3 -m http.server 8765` in that folder and open it in a normal tab, in full screen (button) and in the installed app. The matrix of what each browser delivers goes below when run (Mac session, pending):

| Browser, mode | Ctrl/Cmd+W | +N | +T | +Shift+W | Ctrl+Tab | Ctrl+PageDown | Ctrl+Shift+PageDown |
|---|---|---|---|---|---|---|---|
| to be filled on the Mac (Chrome, Edge, Firefox, Safari; tab, full screen with lock, installed app) | | | | | | | |

### Tests

`tests/browserkeys/browserkeys.mjs` (21 checks: lock request and its refusal in the iframe, manifest and icons, installability, full screen from the editor, hint, dialog in Word and Excel, unsaved-changes guard, PowerPoint Ctrl+Alt+Shift+N); the alternatives are variants of the existing matrix cases (`fmt.word-underline`, `para.hanging`, `style.normal`, `style.body-text`, `table.tab-char`, `nav.next-sheet`, `nav.prev-sheet`, `sel.next-sheet`, `sel.prev-sheet`, `file.new` of the Excel matrix).

## 17. PowerPoint Selection pane (`elixir/xlppt2`, 2026-10-09)

Branches `elixir/xlppt2` (sdkjs, web-apps), `feat/xlppt2` here; test instance `eo-xlppt2` (port 8121).

| Shortcut | Behaviour | Limits |
|---|---|---|
| Alt+F10 (Option+F10 on macOS), Home > Arrange > Selection Pane... | **Selection pane** of the current slide, at the right of the slide (`PE.Controllers.SlidePanes` in `presentationeditor/main/app/elixir-slide/Panes.js`; engine `sdkjs/slide/Editor/selection-pane.js`: `asc_GetSelectionPaneObjects`, `asc_SelectPaneObject`, `asc_SetPaneObjectsHidden`, `asc_RenamePaneObject`, `asc_MovePaneObject`). Objects are listed front first with their own names ("Title 1"); click selects (Ctrl adds), the eye hides or shows (one undo step; a hidden object is not drawn in the editor, thumbnails, show or print and cannot be hit), double click renames (one undo step), Show All, Hide All, Bring Forward, Send Backward act on the selected objects. Esc closes the pane when the last click was in it | No drag and drop in the list, group children are not listed one by one. The engine used to drop hidden objects when it read a .pptx (`common/Shapes/Serialize.js`): they are now kept and saved back (`p:cNvPr hidden="1"`) |

Tests: `tests/slide-views/selection-pane.mjs http://localhost:8121 [mac]` (26 checks on each platform, including a save as .pptx and a reopen) and the case `selection-pane` of `tests/shortcuts-pptx`.
