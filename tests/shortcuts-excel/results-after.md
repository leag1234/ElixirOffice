win.editor   124/141 pass   (before: 79/141)
win.browser  2/4 pass   (before: 2/4)
mac.editor   117/134 pass   (before: 68/134)
mac.browser  0/2 pass   (before: 0/2)

| id | action | Windows | | macOS | | scope | remarque |
|---|---|---|---|---|---|---|---|
| file.close | Close a workbook | Ctrl+W | — | Cmd+W or Ctrl+W | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| file.close.ctrl-f4 | Close the selected workbook window | Ctrl+F4 | — | Cmd+F4 | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| file.open | Open a workbook | Ctrl+O | ✅ | Cmd+O or Ctrl+O | ✅ | editor |  |
| file.open.cmd-f12 | Display the Open dialog box |  | — | Cmd+F12 | ✅ | editor | win no shortcut on this platform |
| file.new | Open a new blank workbook |  | — | Cmd+N or Ctrl+N | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| file.new-template | Create a new workbook from template |  | — | Cmd+Shift+P | ✅ | editor | win no shortcut on this platform |
| file.save | Save a workbook | Ctrl+S | ✅ | Cmd+S or Ctrl+S | ✅ | editor |  |
| file.save-as | Display the Save As dialog box | F12 | ✅ | Cmd+Shift+S or F12 | ✅ | editor |  |
| file.save.option-f2 | Open the Save dialog box |  | — | Option+F2 | ✅ | editor | win no shortcut on this platform |
| file.print | Print workbook | Ctrl+P | ✅ | Cmd+P or Ctrl+P | ✅ | editor |  |
| file.help | Display the Excel Help task pane | F1 | ⏭ | F1 or Cmd+Forward slash (/) | ⏭ | editor | win help is disabled in this deployment (File > Help absent); mac help is disabled in this deployment (File > Help absent) |
| window.ribbon-collapse | Expand or collapse the ribbon | Ctrl+F1 | ✅ | Cmd+Option+R | ✅ | editor |  |
| window.formula-bar | Expand or collapse the formula bar | Ctrl+Shift+U | ✅ | Ctrl+Shift+U | ✅ | editor |  |
| window.cycle-panes | Switch between the worksheet, ribbon, task pane, and Zoom controls | F6 | ✅ | F6 or Shift+F6 | ✅ | editor |  |
| window.cycle-panes.back | Switch between the worksheet, Zoom controls, task pane, and ribbon | Shift+F6 | ✅ |  | — | editor | mac no shortcut on this platform |
| window.next-window | Switch between two Excel windows | Ctrl+F6 | — |  | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| window.all-windows | Switch between all Excel windows | Ctrl+Shift+F6 | — |  | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| window.restore | Restore the window size of the selected workbook window | Ctrl+F5 | — |  | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| window.zoom-in | Zoom in | Ctrl+Alt+Equal sign (=) | ✅ |  | — | editor | mac no shortcut on this platform |
| window.zoom-out | Zoom out | Ctrl+Alt+Minus sign (-) | ✅ |  | — | editor | mac no shortcut on this platform |
| window.search | Access search (when in a cell or when a cell is selected) |  | — | Cmd+F | ✅ | editor | win no shortcut on this platform |
| ribbon.context-menu | Open the context menu | Shift+F10 or Windows Menu key | ✅ | Shift+F10 | ✅ | editor |  |
| ribbon.error-menu | Display the menu or message for an Error Checking button or paste options | Alt+Shift+F10 | ❌ | Option+Shift+F10 | ❌ | editor | win Alt+Shift+F10: paste options menu not open; mac Alt+Shift+F10: paste options menu not open |
| dialog.cancel | Exit a dialog box or cancel an action | Esc | ✅ | Esc | ✅ | editor |  |
| dialog.next-tab | Switch to the next tab in a dialog box | Ctrl+Tab | — |  | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| nav.up | Move one cell up | Up arrow key | ✅ | Up arrow key | ✅ | editor |  |
| nav.down | Move one cell down | Down arrow key | ✅ | Down arrow key | ✅ | editor |  |
| nav.left | Move one cell left | Left arrow key | ✅ | Left arrow key | ✅ | editor |  |
| nav.right | Move one cell right | Right arrow key | ✅ | Right arrow key | ✅ | editor |  |
| nav.tab | Move one cell to the right; in a protected sheet, move between unlocked cells | Tab key | ✅ | Tab key | ✅ | editor |  |
| nav.shift-tab | Move to the previous cell in a worksheet | Shift+Tab | ✅ | Shift+Tab | ✅ | editor |  |
| nav.edge | Move to the edge of the current data region | Ctrl+Arrow key | ✅ | Cmd+Arrow key | ✅ | editor |  |
| nav.end-mode | End mode: move to the next nonblank cell in the same column or row | End, Arrow key | ❌ |  | — | editor | win End, ArrowDown: active cell "B2", expected "A6"; mac no shortcut on this platform |
| nav.last-cell | Move to the last cell used on the worksheet | Ctrl+End | ✅ | Ctrl+End | ✅ | editor |  |
| nav.first-cell | Move to the beginning of a worksheet | Ctrl+Home | ✅ | Ctrl+Home | ✅ | editor |  |
| nav.row-start | Move to the beginning of a row | Home | ✅ | Home | ✅ | editor |  |
| nav.page-down | Move one screen down | Page down | ✅ | Page down | ✅ | editor |  |
| nav.page-up | Move one screen up | Page up | ✅ | Page up | ✅ | editor |  |
| nav.screen-right | Move one screen to the right | Alt+Page down | ❌ | Option+Page down | ❌ | editor | win Alt+PageDown: sheet 2, active cell A1; mac Alt+PageDown: sheet 2, active cell A1 |
| nav.screen-left | Move one screen to the left | Alt+Page up | ❌ | Option+Page up | ❌ | editor | win Alt+PageUp: sheet 2, active cell A1; mac Alt+PageUp: sheet 2, active cell A1 |
| nav.next-sheet | Move to the next sheet in a workbook | Ctrl+Page down | ✅ | Ctrl+Page down or Option+Right arrow key | ❌ | browser | mac Alt+ArrowRight: active sheet index 0, expected 1 |
| nav.prev-sheet | Move to the previous sheet in a workbook | Ctrl+Page up | ✅ | Ctrl+Page up or Option+Left arrow key | ❌ | browser | mac Alt+ArrowLeft: active sheet index 1, expected 0 |
| nav.validation-list | Open the list of validation choices on a cell that has data validation | Alt+Down arrow key | ✅ | Option+Down arrow key | ✅ | editor |  |
| nav.shapes | Cycle through floating shapes, such as text boxes or images | Ctrl+Alt+5, then the Tab key repeatedly | ❌ |  | — | editor | win Control+Alt+Digit5: no shape selected; mac no shortcut on this platform |
| nav.shapes-exit | Exit the floating shape navigation and return to the normal navigation | Esc | ✅ |  | — | editor | mac no shortcut on this platform |
| nav.scroll-to-active | Scroll to display the active cell |  | — | Ctrl+Delete | ✅ | editor | win no shortcut on this platform |
| nav.goto | Display the Go To dialog box | F5 | ✅ | Ctrl+G or F5 | ✅ | editor |  |
| nav.goto.ctrl-g | Display the Go To dialog box | Ctrl+G | ✅ |  | — | editor | mac no shortcut on this platform |
| nav.find | Display the Find dialog box | Ctrl+F | ✅ | Ctrl+F or Shift+F5 | ✅ | editor |  |
| nav.replace | Display the Replace dialog box | Ctrl+H | ✅ | Ctrl+H or Cmd+Shift+H | ✅ | editor |  |
| nav.search-sheet | Move to the Search Sheet dialog box |  | — | Ctrl+F5 | ✅ | editor | win no shortcut on this platform |
| nav.protected-tab | Move between unlocked cells on a protected sheet | Tab key | ✅ | Tab key | ✅ | editor |  |
| sel.all | Select the current region, then the entire worksheet | Ctrl+A or Ctrl+Shift+Spacebar | ✅ | Cmd+A or Cmd+Shift+Spacebar | ✅ | editor |  |
| sel.next-sheet | Select the current and next sheet in a workbook | Ctrl+Shift+Page down | ❌ |  | — | browser | win Control+Shift+PageDown: 1 sheet tab(s) selected, expected 2; mac no shortcut on this platform |
| sel.prev-sheet | Select the current and previous sheet in a workbook | Ctrl+Shift+Page up | ❌ |  | — | browser | win Control+Shift+PageUp: 1 sheet tab(s) selected, expected 2; mac no shortcut on this platform |
| sel.extend | Extend the selection by one cell | Shift+Arrow key | ✅ | Shift+Arrow key | ✅ | editor |  |
| sel.extend-edge | Extend the selection to the last nonblank cell in the same column or row | Ctrl+Shift+Arrow key | ✅ | Shift+Cmd+Arrow key | ✅ | editor |  |
| sel.extend-last | Extend the selection to the last used cell on the worksheet | Ctrl+Shift+End | ✅ | Ctrl+Shift+End | ✅ | editor |  |
| sel.extend-first | Extend the selection to the beginning of the worksheet | Ctrl+Shift+Home | ✅ | Ctrl+Shift+Home | ✅ | editor |  |
| sel.extend-row-start | Extend the selection to the beginning of the row | Shift+Home | ✅ | Shift+Home | ✅ | editor |  |
| sel.extend-page-down | Extend the selection down one screen | Shift+Page down | ✅ | Shift+Page down | ✅ | editor |  |
| sel.extend-page-up | Extend the selection up one screen | Shift+Page up | ✅ | Shift+Page up | ✅ | editor |  |
| sel.extend-mode | Turn extend mode on and extend the selection with the arrow keys | F8 | ❌ | F8 | ❌ | editor | win F8, ArrowDown, ArrowDown: selection [[2,0,2,0]], expected [[0,0,2,0]]; mac F8, ArrowDown, ArrowDown: selection [[2,0,2,0]], expected [[0,0,2,0]] |
| sel.add-mode | Add a non-adjacent cell or range to a selection with the arrow keys | Shift+F8 | ❌ | Shift+F8 | ❌ | editor | win Shift+F8, ArrowRight, ArrowRight: selection [[0,2,0,2]] (A1 should stay selected); mac Shift+F8, ArrowRight, ArrowRight: selection [[0,2,0,2]] (A1 should stay selected) |
| sel.column | Select an entire column | Ctrl+Spacebar | ✅ | Ctrl+Spacebar | ✅ | editor |  |
| sel.row | Select an entire row | Shift+Spacebar | ✅ | Shift+Spacebar | ✅ | editor |  |
| sel.objects | Select all objects on a worksheet when an object is selected | Ctrl+Shift+Spacebar | ❌ |  | — | editor | win Control+Shift+Space: 0 of 2 shapes selected; mac no shortcut on this platform |
| sel.region | Select the current region around the active cell | Ctrl+Shift+Asterisk sign (*) | ❌ |  | — | editor | win Control+Shift+Digit8: selection [[2,0,2,0]], expected [[0,0,5,1]]; win Control+NumpadMultiply: selection [[2,0,2,0]], expected [[0,0,5,1]]; mac no shortcut on this platform |
| sel.active-only | Select only the active cell when multiple cells are selected |  | — | Shift+Delete | ❌ | editor | win no shortcut on this platform; mac Shift+Backspace: selection [[0,0,2,1]], expected [[1,1,1,1]] |
| sel.down | Move from top to bottom within the selection | Enter | ✅ | Return | ✅ | editor |  |
| sel.up | Move from bottom to top within the selection | Shift+Enter | ✅ | Shift+Return | ✅ | editor |  |
| sel.right | Move from left to right within the selection | Tab key | ✅ | Tab key | ✅ | editor |  |
| sel.left | Move from right to left within the selection | Shift+Tab | ✅ | Shift+Tab | ✅ | editor |  |
| sel.corner | Move clockwise to the next corner of the selection | Ctrl+Period (.) | ❌ | Ctrl+Period (.) | ❌ | editor | win Control+Period: active cell "A1", expected "B1"; mac Control+Period: active cell "A1", expected "B1" |
| edit.copy | Copy selection | Ctrl+C | ✅ | Cmd+C or Ctrl+C | ⏭ | editor | mac native clipboard command: not emulated on Linux |
| edit.cut | Cut selection | Ctrl+X | ✅ | Cmd+X or Ctrl+X | ⏭ | editor | mac native clipboard command: not emulated on Linux |
| edit.paste | Paste selection | Ctrl+V | ✅ | Cmd+V or Ctrl+V | ⏭ | editor | mac native clipboard command: not emulated on Linux |
| edit.paste-special | Open the Paste Special dialog box | Ctrl+Alt+V | ❌ | Cmd+Ctrl+V or Ctrl+Option+V or Cmd+Option+V | ❌ | editor | win Control+Alt+v: no Paste Special dialog (open: none); mac Meta+Control+v: no Paste Special dialog (open: none); mac Control+Alt+v: no Paste Special dialog (open: none); mac Meta+Alt+v: no Paste Spe |
| edit.undo | Undo the last action | Ctrl+Z | ✅ | Cmd+Z or Ctrl+Z | ✅ | editor |  |
| edit.redo | Redo / repeat the last command or action | Ctrl+Y | ✅ | Cmd+Y or Ctrl+Y or Cmd+Shift+Z | ✅ | editor |  |
| edit.repeat | Repeat the last command or action | F4 | ❌ |  | — | editor | win F4: bold false, expected true; mac no shortcut on this platform |
| edit.clear | Remove cell contents | Delete | ✅ | Delete | ❌ | editor | mac Backspace: cells {"A1":"10","A2":"20"}, expected {"A1":"","A2":""} |
| edit.clear-active | Clear the content of the active cell and edit it | Backspace | ✅ | Delete | ✅ | editor |  |
| edit.delete-cells | Open the Delete dialog box to delete selected cells | Ctrl+Minus sign (-) | ✅ | Cmd+Hyphen (-) or Ctrl+Hyphen (-) | ✅ | editor |  |
| edit.insert-cells | Open the Insert dialog box to insert blank cells | Ctrl+Shift+Plus sign (+) | ✅ | Ctrl+Shift+Equal sign ( = ) | ✅ | editor |  |
| edit.fill-down | Fill Down: copy the topmost cell of a selected range into the cells below | Ctrl+D | ✅ | Cmd+D or Ctrl+D | ✅ | editor |  |
| edit.fill-right | Fill cells right | Ctrl+R | ✅ | Cmd+R or Ctrl+R | ✅ | editor |  |
| edit.hide-rows | Hide the selected rows | Ctrl+9 | ✅ | Ctrl+9 or Cmd+Left parenthesis (() | ✅ | editor |  |
| edit.unhide-rows | Unhide the selected rows | Ctrl+Shift+9 | ✅ | Ctrl+Shift+Left parenthesis (() or Shift+Cmd+Left parenthesis (() | ✅ | editor |  |
| edit.hide-cols | Hide the selected columns | Ctrl+0 | ✅ | Ctrl+Zero (0) or Cmd+Right parenthesis ()) | ✅ | editor |  |
| edit.unhide-cols | Unhide the selected columns |  | — | Ctrl+Shift+Right parenthesis ()) or Shift+Cmd+Right parenthesis ()) | ✅ | editor | win no shortcut on this platform |
| edit.group | Group selected cells | Alt+Shift+Right arrow key | ✅ | Cmd+Shift+K | ✅ | editor |  |
| edit.ungroup | Ungroup selected cells | Alt+Shift+Left arrow key | ✅ | Cmd+Shift+J | ✅ | editor |  |
| edit.new-sheet | Insert a new worksheet | Shift+F11 | ✅ | Shift+F11 | ✅ | editor |  |
| edit.new-sheet.alt-shift-f1 | Insert a new worksheet | Alt+Shift+F1 | ✅ |  | — | editor | mac no shortcut on this platform |
| edit.chart | Create an embedded chart of the data in the current range | Alt+F1 | ✅ |  | — | editor | mac no shortcut on this platform |
| edit.sort | Open the Sort dialog box |  | — | Cmd+Shift+R | ✅ | editor | win no shortcut on this platform |
| edit.filter | Add or remove a filter | Ctrl+Shift+L | ✅ | Cmd+Shift+F or Ctrl+Shift+L | ✅ | editor |  |
| edit.table | Display the Create Table dialog box | Ctrl+L or Ctrl+T | ✅ | Cmd+T or Ctrl+T | ✅ | editor |  |
| edit.hyperlink | Open the Insert hyperlink dialog box | Ctrl+K | ✅ | Cmd+K or Ctrl+K | ✅ | editor |  |
| edit.spelling | Check spelling in the active worksheet or selected range | F7 | ✅ | F7 | ✅ | editor |  |
| edit.note | Insert a note; open and edit a cell note | Shift+F2 | ✅ | Shift+F2 | ✅ | editor |  |
| edit.comment | Insert a threaded comment; open and reply to a threaded comment | Ctrl+Shift+F2 | ✅ | Cmd+Shift+F2 | ✅ | editor |  |
| edit.comment.cmd-return | Insert or reply to a threaded comment |  | — | Cmd+Return | ❌ | editor | win no shortcut on this platform; mac Meta+Enter: comment box not shown |
| edit.macros | Create, run, edit, or delete a macro | Alt+F8 | ✅ | Option+F8 | ✅ | editor |  |
| edit.vba | Open the Visual Basic for Applications Editor | Alt+F11 | ✅ | Option+F11 | ✅ | editor |  |
| edit.refresh | Refresh data in the current worksheet | Ctrl+F5 | — |  | — | browser | win kept by the browser, not testable in a page; mac kept by the browser, not testable in a page |
| edit.refresh-all | Refresh all data in the workbook | Ctrl+Alt+F5 | ✅ |  | — | editor | mac no shortcut on this platform |
| entry.edit | Edit the active cell, insertion point at the end | F2 | ✅ | F2 | ✅ | editor |  |
| entry.edit.ctrl-u | Edit the active cell and position the insertion point at the end of the line |  | — | Ctrl+U | ❌ | editor | win no shortcut on this platform; mac Control+u, "#", Enter: cells {"A1":"#"}, expected {"A1":"10#"} |
| entry.edit-formula-bar | Edit the active cell in the formula bar | Ctrl+F2 | ✅ |  | — | editor | mac no shortcut on this platform |
| entry.newline | Start a new line in the same cell | Alt+Enter | ✅ | Option+Return or Ctrl+Option+Return | ✅ | editor |  |
| entry.newline.cmd-option | Insert a line break in a cell |  | — | Cmd+Option+Return or Ctrl+Option+Return | ✅ | editor | win no shortcut on this platform |
| entry.fill | Fill the selected cell range with the current entry | Ctrl+Enter | ✅ | Cmd+Return or Ctrl+Return | ✅ | editor |  |
| entry.complete-down | Complete a cell entry and select the cell below | Enter | ✅ | Return | ✅ | editor |  |
| entry.complete-up | Complete a cell entry and select the cell above | Shift+Enter | ✅ | Shift+Return | ✅ | editor |  |
| entry.complete-right | Complete a cell entry and move to the right | Tab key | ✅ | Tab key | ✅ | editor |  |
| entry.complete-left | Complete a cell entry and move to the left | Shift+Tab | ✅ | Shift+Tab | ✅ | editor |  |
| entry.cancel | Cancel an entry in the cell or formula bar | Esc | ✅ | Esc | ✅ | editor |  |
| entry.array | Enter a formula as an array formula | Ctrl+Shift+Enter | ✅ | Shift+Cmd+Return or Ctrl+Shift+Return | ✅ | editor |  |
| entry.backspace | Delete the character to the left of the insertion point | Backspace | ✅ | Delete | ✅ | editor |  |
| entry.delete | Delete the character to the right of the insertion point | Delete | ✅ | Forward Delete | ✅ | editor |  |
| entry.delete-eol | Delete text to the end of the line | Ctrl+Delete | ❌ | Ctrl+Forward Delete | ❌ | editor | win F2, Home, ArrowRight, Control+Delete, Enter: cells {"D1":"otwo three"}, expected {"D1":"o"}; mac F2, Home, ArrowRight, Control+Delete, Enter: cells {"D1":"oe two three"}, expected {"D1":"o"} |
| entry.move-char | Move one character up, down, left, or right | Arrow keys | ✅ | Arrow keys | ✅ | editor |  |
| entry.line-start | Move to the beginning of the line | Home | ✅ | Home | ✅ | editor |  |
| entry.formula-end | Move the cursor to the end of the text in the formula bar | Ctrl+End | ✅ |  | — | editor | mac no shortcut on this platform |
| entry.formula-select-end | Select all text in the formula bar from the cursor to the end | Ctrl+Shift+End | ✅ |  | — | editor | mac no shortcut on this platform |
| entry.start-formula | Start a formula | Equal sign ( = ) | ✅ | Equal sign ( = ) | ✅ | editor |  |
| entry.date | Enter the current date | Ctrl+Semicolon (;) | ✅ | Ctrl+Semicolon (;) | ✅ | editor |  |
| entry.time | Enter the current time | Ctrl+Shift+Colon (:) | ✅ | Cmd+Semicolon (;) | ❌ | editor | mac Meta+Semicolon, Enter: D1 = "46301", expected the current time |
| entry.copy-formula-above | Copy a formula from the cell above into the cell or the formula bar | Ctrl+Apostrophe (') | ❌ | Ctrl+Apostrophe (') | ❌ | editor | win Control+Quote, Enter: A7 formula "", expected "=SUM(A1:A5)"; mac Control+Quote, Enter: A7 formula "", expected "=SUM(A1:A5)" |
| entry.copy-value-above | Copy the value from the cell above into the cell or the formula bar | Ctrl+Shift+Straight quotation mark (") | ❌ | Ctrl+Shift+Inch mark/Straight double quote (") | ❌ | editor | win Control+Shift+Quote, Enter: A7 = "" (formula ""), expected the value 150; mac Control+Shift+Quote, Enter: A7 = "" (formula ""), expected the value 150 |
| entry.autocomplete | Display the AutoComplete list |  | — | Option+Down arrow key | ✅ | editor | win no shortcut on this platform |
| entry.define-name | Define a name |  | — | Ctrl+L | ✅ | editor | win no shortcut on this platform |
| entry.define-name.cmd-f3 | Open the Define Name dialog box |  | — | Cmd+F3 | ✅ | editor | win no shortcut on this platform |
| entry.paste-name | Paste a name from the Paste Name dialog box | F3 | ✅ |  | — | editor | mac no shortcut on this platform |
| formula.show | Switch between displaying cell values or formulas | Ctrl+Grave accent (`) | ✅ | Ctrl+Grave accent (`) | ✅ | editor |  |
| formula.calc-all | Calculate all worksheets in all open workbooks | F9 | ✅ | Cmd+Equal sign ( = ) or F9 | ✅ | editor |  |
| formula.calc-sheet | Calculate the active worksheet | Shift+F9 | ✅ | Shift+F9 | ✅ | editor |  |
| formula.calc-full | Calculate all worksheets, changed or not | Ctrl+Alt+F9 | ✅ | Ctrl+Option+F9 | ✅ | editor |  |
| formula.calc-rebuild | Check dependent formulas, then calculate all cells | Ctrl+Alt+Shift+F9 | ✅ | Ctrl+Option+Shift+F9 | ✅ | editor |  |
| formula.args-dialog | Display the Function Arguments dialog box (insertion point right of a function name) | Ctrl+A | ❌ | Ctrl+A | ❌ | editor | win "=SUM", Control+a: no dialog matching /argument/function/i (open: none); mac "=SUM", Control+a: no dialog matching /argument/function/i (open: none) |
| formula.autosum | Insert the Sum formula | Alt+Equal sign (=) | ✅ | Shift+Cmd+T | ✅ | editor |  |
| formula.abs-ref | Cycle through absolute and relative references | F4 | ✅ | Cmd+T or F4 | ❌ | editor | mac "=A1", Meta+t, Enter: D1 formula "", expected "=$A$1" |
| formula.insert-function | Insert a function | Shift+F3 | ✅ | Shift+F3 | ✅ | editor |  |
| formula.point-mode | When editing a formula, toggle Point mode | F2 | ❌ |  | — | editor | win "=A1", F2, ArrowLeft, "$", Enter: D1 formula "=A1", expected "=A$1"; mac no shortcut on this platform |
| fmt.cells-dialog | Open the Format Cells dialog box | Ctrl+1 | ✅ | Cmd+1 or Ctrl+1 | ✅ | editor |  |
| fmt.bold | Bold text or remove bold formatting | Ctrl+B or Ctrl+2 | ✅ | Cmd+B or Ctrl+B | ✅ | editor |  |
| fmt.italic | Italicize text or remove italic formatting | Ctrl+I or Ctrl+3 | ✅ | Cmd+I or Ctrl+I | ✅ | editor |  |
| fmt.underline | Underline text or remove underline | Ctrl+U or Ctrl+4 | ✅ | Cmd+U | ✅ | editor |  |
| fmt.strike | Apply or remove strikethrough formatting | Ctrl+5 | ✅ | Shift+Cmd+X | ✅ | editor |  |
| fmt.grow-font | Increase font size |  | — | Shift+Cmd+Right angle bracket (>) | ✅ | editor | win no shortcut on this platform |
| fmt.shrink-font | Decrease font size |  | — | Shift+Cmd+Left angle bracket (<) | ✅ | editor | win no shortcut on this platform |
| fmt.align-center | Align center |  | — | Cmd+E | ✅ | editor | win no shortcut on this platform |
| fmt.align-left | Align left |  | — | Cmd+L | ✅ | editor | win no shortcut on this platform |
| fmt.border-outline | Apply an outline border to the selected cells | Ctrl+Shift+Ampersand sign (&) | ✅ | Cmd+Option+Zero (0) | ✅ | editor |  |
| fmt.border-right | Add an outline border to the right of the selection |  | — | Cmd+Option+Right arrow key | ✅ | editor | win no shortcut on this platform |
| fmt.border-left | Add an outline border to the left of the selection |  | — | Cmd+Option+Left arrow key | ✅ | editor | win no shortcut on this platform |
| fmt.border-top | Add an outline border to the top of the selection |  | — | Cmd+Option+Up arrow key | ✅ | editor | win no shortcut on this platform |
| fmt.border-bottom | Add an outline border to the bottom of the selection |  | — | Cmd+Option+Down arrow key | ✅ | editor | win no shortcut on this platform |
| fmt.border-remove | Remove the outline border from the selected cells | Ctrl+Shift+Underscore (_) | ✅ | Cmd+Option+Hyphen | ✅ | editor |  |
| fmt.general | Apply the General number format | Ctrl+Shift+Tilde sign (~) | ✅ | Ctrl+Shift+Tilde (~) | ✅ | editor |  |
| fmt.currency | Apply the Currency format with two decimal places | Ctrl+Shift+Dollar sign ($) | ✅ | Ctrl+Shift+Dollar sign ($) | ✅ | editor |  |
| fmt.percent | Apply the Percentage format with no decimal places | Ctrl+Shift+Percent sign (%) | ✅ | Ctrl+Shift+Percent sign (%) | ✅ | editor |  |
| fmt.scientific | Apply the Scientific number format with two decimal places | Ctrl+Shift+Caret sign (^) | ✅ | Ctrl+Shift+Caret (^) | ✅ | editor |  |
| fmt.date | Apply the Date format with the day, month, and year | Ctrl+Shift+Number sign (#) | ✅ | Ctrl+Shift+Number sign (#) | ✅ | editor |  |
| fmt.time | Apply the Time format with the hour and minute, and AM or PM | Ctrl+Shift+At sign (@) | ✅ | Ctrl+Shift+At symbol (@) | ✅ | editor |  |
| fmt.number | Apply the Number format with two decimal places and thousands separator | Ctrl+Shift+Exclamation point (!) | ✅ | Ctrl+Shift+Exclamation point (!) | ✅ | editor |  |
| paste.all | Paste Special: all cell contents and formatting | A | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.formulas | Paste Special: only the formulas | F | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.values | Paste Special: only the values | V | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.formats | Paste Special: only the copied formatting | T | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.comments | Paste Special: only comments and notes | C | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.no-borders | Paste Special: all contents without borders | X | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.col-widths | Paste Special: only column widths | W | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.formulas-numfmt | Paste Special: formulas and number formats | R | ✅ |  | — | editor | mac no shortcut on this platform |
| paste.values-numfmt | Paste Special: values and number formats | U | ✅ |  | — | editor | mac no shortcut on this platform |
