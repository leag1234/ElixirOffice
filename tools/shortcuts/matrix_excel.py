#!/usr/bin/env python3
"""Excel keyboard shortcut matrix: curated source of docs/shortcuts-excel.csv.

  python3 tools/shortcuts/matrix_excel.py            # writes docs/shortcuts-excel.csv
  python3 tools/shortcuts/matrix_excel.py --check rows.json
                                                     # every row of extract_excel.py is covered

Source of the "windows" and "macos" columns: Microsoft Support, "Keyboard
shortcuts in Excel", Windows and macOS tabs,
https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f
retrieved 2026-10-05. Keys are written as on that page; an empty cell means the
page lists no shortcut for that platform. The page draws a few keys as images
(Forward Delete, Clear): they are written out here.

scope (what the browser spreadsheet editor can do with the shortcut), as in
docs/shortcuts-word.csv:
  editor    the editor has the feature: the shortcut must work (Playwright test,
            tests/shortcuts-excel/run.mjs)
  browser   the browser keeps the key for itself in Chrome, Edge, Firefox or
            Safari; tested anyway (desktop app), see "alternative"
  os        the operating system or window manager keeps the key
  native    produced by the keyboard layout, the IME or a plain text field
            (dialog boxes, menus)
  keytips   ribbon access keys (Alt, then letters)
  ribbon    keyboard navigation inside the ribbon and menus
  absent    ElixirOffice has no such feature (Power Pivot, Copilot, VBA...)
  mouse     a mouse gesture, not a key
"""
import csv
import json
import os
import re
import sys

SOURCE = "https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-excel-1798d9d5-842a-42b8-9c99-9b7213f0040f"
RETRIEVED = "2026-10-05"

FREQ = "Frequently used shortcuts"
RIB = "Ribbon keyboard shortcuts"
NAV = "Navigating in cells"
FMT = "Formatting cells"
PS = "Paste Special dialog box"
SEL = "Making selections and performing actions"
DATA = "Data, functions, and the formula bar"
EXT = "Refreshing external data"
PP = "Power Pivot"
COP = "Copilot in Excel"
FK = "Function keys"
OTHER = "Other useful shortcut keys"
# macOS tab
MWIN = "Work in windows and dialog boxes"
MMOVE = "Move and scroll in a sheet or workbook"
MENTER = "Enter data on a sheet"
MCELL = "Work in cells or the Formula bar"
MFMT = "Format and edit data"
MSEL = "Select cells, columns, or rows"
MWSEL = "Work with a selection"
MCHART = "Use charts"
MSORT = "Sort, filter, and use PivotTable reports"
MOUT = "Outline data"
MFK = "Use function key shortcuts"
MDRAW = "Drawing"

# id, category, action, windows, macos, ms_section, scope, alternative, notes
M = [
    # ---- file -------------------------------------------------------------
    ("file.close", "file", "Close a workbook", "Ctrl+W", "Cmd+W or Ctrl+W", FREQ, "browser", "Close the browser tab", "Ctrl+W and Cmd+W are reserved by every browser"),
    ("file.close.ctrl-f4", "file", "Close the selected workbook window", "Ctrl+F4", "Cmd+F4", FK, "browser", "Close the browser tab", "Closes the tab in Chrome, Edge, Firefox"),
    ("file.quit", "file", "Close Excel", "Alt+F4", "Cmd+Q", FK, "os", "", ""),
    ("file.open", "file", "Open a workbook", "Ctrl+O", "Cmd+O or Ctrl+O", FREQ, "editor", "", "Expected: File > Open/Recent in the backstage"),
    ("file.open.cmd-f12", "file", "Display the Open dialog box", "", "Cmd+F12", MFK, "editor", "", ""),
    ("file.new", "file", "Open a new blank workbook", "", "Cmd+N or Ctrl+N", FREQ, "browser", "File > New (Alt, F, N)", "Cmd+N and Ctrl+N open a browser window"),
    ("file.new-template", "file", "Create a new workbook from template", "", "Cmd+Shift+P", FREQ, "editor", "", "Expected: File > New"),
    ("file.save", "file", "Save a workbook", "Ctrl+S", "Cmd+S or Ctrl+S", FREQ, "editor", "", "Co-editing saves continuously; Ctrl+S forces the save"),
    ("file.save-as", "file", "Display the Save As dialog box", "F12", "Cmd+Shift+S or F12", FK, "editor", "", "Expected: File > Save a copy / Download as"),
    ("file.save.option-f2", "file", "Open the Save dialog box", "", "Option+F2", MFK, "editor", "", ""),
    ("file.print", "file", "Print workbook", "Ctrl+P", "Cmd+P or Ctrl+P", "Preview and print", "editor", "", "Not in the Windows tab of the page; Excel binds it. Opens File > Print"),
    ("file.help", "file", "Display the Excel Help task pane", "F1", "F1 or Cmd+Forward slash (/)", FK, "editor", "", ""),
    ("file.stats", "file", "Open the Workbook Statistics dialog box", "Ctrl+Shift+G", "", FMT, "absent", "", "No workbook statistics"),
    ("file.macro-sheet", "file", "Insert an Excel 4.0 macro sheet", "", "Cmd+F11", MFK, "absent", "", "No XLM macro sheets"),
    # ---- window, interface ---------------------------------------------------
    ("window.ribbon-collapse", "window", "Expand or collapse the ribbon", "Ctrl+F1", "Cmd+Option+R", RIB, "editor", "", ""),
    ("window.fullscreen", "window", "Toggle full screen mode", "Ctrl+Shift+F1", "Cmd+Ctrl+F", FK, "absent", "Browser full screen (F11, Ctrl+Cmd+F)", "Cmd+Ctrl+F is the macOS full-screen key"),
    ("window.formula-bar", "window", "Expand or collapse the formula bar", "Ctrl+Shift+U", "Ctrl+Shift+U", DATA, "editor", "", ""),
    ("window.cycle-panes", "window", "Switch between the worksheet, ribbon, task pane, and Zoom controls", "F6", "F6 or Shift+F6", FK, "editor", "", ""),
    ("window.cycle-panes.back", "window", "Switch between the worksheet, Zoom controls, task pane, and ribbon", "Shift+F6", "", FK, "editor", "", ""),
    ("window.next-window", "window", "Switch between two Excel windows", "Ctrl+F6", "", FK, "browser", "One workbook per browser tab", ""),
    ("window.all-windows", "window", "Switch between all Excel windows", "Ctrl+Shift+F6", "", FK, "browser", "One workbook per browser tab", ""),
    ("window.restore", "window", "Restore the window size of the selected workbook window", "Ctrl+F5", "", FK, "browser", "", "Ctrl+F5 reloads the page without cache"),
    ("window.move", "window", "Perform the Move command on the workbook window", "Ctrl+F7", "", FK, "os", "", "No workbook windows inside the browser tab"),
    ("window.size", "window", "Perform the Size command on the workbook window", "Ctrl+F8", "", FK, "os", "", ""),
    ("window.minimize", "window", "Minimize a workbook window", "Ctrl+F9", "Ctrl+F9", FK, "os", "", ""),
    ("window.maximize", "window", "Maximize or restore the selected workbook window", "Ctrl+F10", "Ctrl+F10 or Cmd+F10", FK, "os", "", ""),
    ("window.next-app", "window", "Switch to the next application", "", "Cmd+Tab", MWIN, "os", "", ""),
    ("window.prev-app", "window", "Switch to the previous application", "", "Shift+Cmd+Tab", MWIN, "os", "", ""),
    ("window.screenshot", "window", "Take a screenshot and save it on your desktop", "", "Shift+Cmd+3", MWIN, "os", "", ""),
    ("window.hide", "window", "Hide Excel", "", "Cmd+H", MWIN, "os", "", ""),
    ("window.zoom-in", "window", "Zoom in", "Ctrl+Alt+Equal sign (=)", "", NAV, "editor", "", ""),
    ("window.zoom-out", "window", "Zoom out", "Ctrl+Alt+Minus sign (-)", "", NAV, "editor", "", ""),
    ("window.scroll-horizontal", "window", "Scroll horizontally", "Ctrl+Shift, then scroll your mouse wheel up to go left, down to go right", "Shift, then scroll the mouse wheel up for left, down for right", NAV, "mouse", "", ""),
    ("window.search", "window", "Access search (when in a cell or when a cell is selected)", "", "Cmd+F", MMOVE, "editor", "", "The Find bar"),
    ("window.smart-lookup", "window", "Open the Smart Lookup pane", "", "Ctrl+Option+Cmd+L", MCELL, "absent", "", ""),
    ("window.drawing-mode", "window", "Toggle Drawing mode on and off", "", "Cmd+Ctrl+Z", MDRAW, "absent", "Draw tab", "No keyboard toggle for drawing mode"),
    # ---- ribbon -------------------------------------------------------------
    ("ribbon.search", "ribbon", "Move to the Search field on the ribbon", "Alt+Q", "", RIB, "absent", "", "No command search; Alt+Q opens the editor's chat"),
    ("ribbon.file", "ribbon", "Open the File menu", "Alt+F", "", RIB, "keytips", "", ""),
    ("ribbon.home", "ribbon", "Go to the Home tab", "Alt+H", "", FREQ, "keytips", "", ""),
    ("ribbon.insert", "ribbon", "Go to the Insert tab", "Alt+N", "", FREQ, "keytips", "", ""),
    ("ribbon.page-layout", "ribbon", "Go to the Page Layout tab", "Alt+P", "", FREQ, "keytips", "", ""),
    ("ribbon.formulas", "ribbon", "Go to the Formulas tab", "Alt+M", "", FREQ, "keytips", "", ""),
    ("ribbon.data", "ribbon", "Go to the Data tab", "Alt+A", "", FREQ, "keytips", "", ""),
    ("ribbon.review", "ribbon", "Open the Review tab", "Alt+R", "", RIB, "keytips", "", ""),
    ("ribbon.view", "ribbon", "Go to the View tab", "Alt+W", "", FREQ, "keytips", "", "Alt, W, P / L / I: page layout, normal, page break preview"),
    ("ribbon.fill-color", "ribbon", "Choose a fill color", "Alt+H, H", "", FREQ, "keytips", "", ""),
    ("ribbon.center", "ribbon", "Center align cell contents", "Alt+H, A, C", "", FREQ, "keytips", "", ""),
    ("ribbon.borders", "ribbon", "Add borders", "Alt+H, B", "", FREQ, "keytips", "", ""),
    ("ribbon.delete-column", "ribbon", "Delete column", "Alt+H, D, C", "", FREQ, "keytips", "", ""),
    ("ribbon.define-name", "ribbon", "Define a name to use in references", "Alt+M, M, D", "", DATA, "keytips", "", ""),
    ("ribbon.keytips", "ribbon", "Select the active tab on the ribbon and activate the access keys", "Alt or F10", "", RIB, "keytips", "", ""),
    ("ribbon.focus-commands", "ribbon", "Move the focus to commands on the ribbon or add-in pane", "Tab key or Shift+Tab", "", RIB, "ribbon", "", ""),
    ("ribbon.items", "ribbon", "Move among the items on the ribbon", "Arrow keys", "", RIB, "ribbon", "", ""),
    ("ribbon.tooltip", "ribbon", "Show the tooltip for the ribbon element currently in focus", "Ctrl+Shift+F10", "", RIB, "ribbon", "", ""),
    ("ribbon.activate", "ribbon", "Activate a selected button", "Spacebar or Enter", "", RIB, "ribbon", "", ""),
    ("ribbon.open-list", "ribbon", "Open the list for a selected command", "Down arrow key", "", RIB, "ribbon", "", ""),
    ("ribbon.open-menu", "ribbon", "Open the menu for a selected button", "Alt+Down arrow key", "", RIB, "ribbon", "", ""),
    ("ribbon.menu-next", "ribbon", "When a menu or submenu is open, move to the next command", "Down arrow key", "", RIB, "ribbon", "", ""),
    ("ribbon.submenu", "ribbon", "Move to the submenu when a main menu is open or selected", "Left arrow key", "", RIB, "ribbon", "", ""),
    ("ribbon.groups", "ribbon", "Move from one group of controls to another", "Ctrl+Left or Right arrow key", "", RIB, "ribbon", "", ""),
    ("ribbon.menu-first", "ribbon", "Select the first command on the menu when a menu or submenu is visible", "Home", "", SEL, "ribbon", "", ""),
    ("ribbon.context-menu", "ribbon", "Open the context menu", "Shift+F10 or Windows Menu key", "Shift+F10", FREQ, "editor", "", ""),
    ("ribbon.error-menu", "ribbon", "Display the menu or message for an Error Checking button or paste options", "Alt+Shift+F10", "Option+Shift+F10", DATA, "editor", "", "Expected: the paste options menu after a paste"),
    # ---- dialog boxes (native widgets) --------------------------------------
    ("dialog.next", "dialog", "Move to the next box, option, control, or command", "Tab key", "Tab key", MWIN, "native", "", ""),
    ("dialog.previous", "dialog", "Move to the previous box, option, control, or command", "Shift+Tab", "Shift+Tab", MWIN, "native", "", ""),
    ("dialog.cancel", "dialog", "Exit a dialog box or cancel an action", "Esc", "Esc", MWIN, "editor", "", ""),
    ("dialog.default", "dialog", "Perform the action assigned to the default button", "Enter", "Return", MWIN, "native", "", ""),
    ("dialog.space", "dialog", "In a dialog box, perform the action for the selected button, or select or clear a checkbox", "Spacebar", "", OTHER, "native", "", ""),
    ("dialog.next-tab", "dialog", "Switch to the next tab in a dialog box", "Ctrl+Tab", "", OTHER, "browser", "", "Ctrl+Tab switches browser tabs"),
    # ---- navigation ---------------------------------------------------------
    ("nav.up", "nav", "Move one cell up", "Up arrow key", "Up arrow key", NAV, "editor", "", ""),
    ("nav.down", "nav", "Move one cell down", "Down arrow key", "Down arrow key", NAV, "editor", "", ""),
    ("nav.left", "nav", "Move one cell left", "Left arrow key", "Left arrow key", NAV, "editor", "", ""),
    ("nav.right", "nav", "Move one cell right", "Right arrow key", "Right arrow key", NAV, "editor", "", ""),
    ("nav.tab", "nav", "Move one cell to the right; in a protected sheet, move between unlocked cells", "Tab key", "Tab key", NAV, "editor", "", ""),
    ("nav.shift-tab", "nav", "Move to the previous cell in a worksheet", "Shift+Tab", "Shift+Tab", NAV, "editor", "", ""),
    ("nav.edge", "nav", "Move to the edge of the current data region", "Ctrl+Arrow key", "Cmd+Arrow key", NAV, "editor", "", ""),
    ("nav.end-mode", "nav", "End mode: move to the next nonblank cell in the same column or row", "End, Arrow key", "", NAV, "editor", "", ""),
    ("nav.last-cell", "nav", "Move to the last cell used on the worksheet", "Ctrl+End", "Ctrl+End", NAV, "editor", "", "MacBook: Ctrl+Fn+Right"),
    ("nav.first-cell", "nav", "Move to the beginning of a worksheet", "Ctrl+Home", "Ctrl+Home", NAV, "editor", "", "MacBook: Ctrl+Fn+Left"),
    ("nav.row-start", "nav", "Move to the beginning of a row", "Home", "Home", OTHER, "editor", "", "MacBook: Fn+Left"),
    ("nav.scroll-lock-home", "nav", "Move to the upper-left cell of the window when Scroll lock is on", "Home+Scroll lock", "", NAV, "absent", "", "No Scroll Lock mode"),
    ("nav.page-down", "nav", "Move one screen down", "Page down", "Page down", NAV, "editor", "", "MacBook: Fn+Down"),
    ("nav.page-up", "nav", "Move one screen up", "Page up", "Page up", NAV, "editor", "", "MacBook: Fn+Up"),
    ("nav.screen-right", "nav", "Move one screen to the right", "Alt+Page down", "Option+Page down", NAV, "editor", "", "The editor binds Alt+Page down to the next sheet"),
    ("nav.screen-left", "nav", "Move one screen to the left", "Alt+Page up", "Option+Page up", NAV, "editor", "", "The editor binds Alt+Page up to the previous sheet"),
    ("nav.next-sheet", "nav", "Move to the next sheet in a workbook", "Ctrl+Page down", "Ctrl+Page down or Option+Right arrow key", NAV, "browser", "Alt+Page down (editor)", "Ctrl+Page down switches browser tabs"),
    ("nav.prev-sheet", "nav", "Move to the previous sheet in a workbook", "Ctrl+Page up", "Ctrl+Page up or Option+Left arrow key", NAV, "browser", "Alt+Page up (editor)", "The macOS tab of the page prints Ctrl+Page down by mistake"),
    ("nav.validation-list", "nav", "Open the list of validation choices on a cell that has data validation", "Alt+Down arrow key", "Option+Down arrow key", NAV, "editor", "", "Also the AutoFilter list and the AutoComplete list (macOS)"),
    ("nav.shapes", "nav", "Cycle through floating shapes, such as text boxes or images", "Ctrl+Alt+5, then the Tab key repeatedly", "", NAV, "editor", "", ""),
    ("nav.shapes-exit", "nav", "Exit the floating shape navigation and return to the normal navigation", "Esc", "", NAV, "editor", "", ""),
    ("nav.scroll-to-active", "nav", "Scroll to display the active cell", "", "Ctrl+Delete", MMOVE, "editor", "", ""),
    ("nav.goto", "nav", "Display the Go To dialog box", "F5", "Ctrl+G or F5", FK, "editor", "", "Go To dialog, or the Name Box focused"),
    ("nav.goto.ctrl-g", "nav", "Display the Go To dialog box", "Ctrl+G", "", FK, "editor", "", "Not on the Windows tab of the page; Excel binds it"),
    ("nav.find", "nav", "Display the Find dialog box", "Ctrl+F", "Ctrl+F or Shift+F5", MMOVE, "editor", "", ""),
    ("nav.replace", "nav", "Display the Replace dialog box", "Ctrl+H", "Ctrl+H or Cmd+Shift+H", FREQ, "editor", "", ""),
    ("nav.search-sheet", "nav", "Move to the Search Sheet dialog box", "", "Ctrl+F5", MFK, "editor", "", "The Find bar"),
    ("nav.protected-tab", "nav", "Move between unlocked cells on a protected sheet", "Tab key", "Tab key", MMOVE, "editor", "", "Tested without protection (nav.tab)"),
    # ---- selection ----------------------------------------------------------
    ("sel.all", "sel", "Select the current region, then the entire worksheet", "Ctrl+A or Ctrl+Shift+Spacebar", "Cmd+A or Cmd+Shift+Spacebar", SEL, "editor", "", ""),
    ("sel.next-sheet", "sel", "Select the current and next sheet in a workbook", "Ctrl+Shift+Page down", "", SEL, "browser", "Ctrl+click a sheet tab", "Ctrl+Shift+Page down moves the browser tab"),
    ("sel.prev-sheet", "sel", "Select the current and previous sheet in a workbook", "Ctrl+Shift+Page up", "", SEL, "browser", "Ctrl+click a sheet tab", ""),
    ("sel.extend", "sel", "Extend the selection by one cell", "Shift+Arrow key", "Shift+Arrow key", SEL, "editor", "", ""),
    ("sel.extend-edge", "sel", "Extend the selection to the last nonblank cell in the same column or row", "Ctrl+Shift+Arrow key", "Shift+Cmd+Arrow key", SEL, "editor", "", ""),
    ("sel.extend-last", "sel", "Extend the selection to the last used cell on the worksheet", "Ctrl+Shift+End", "Ctrl+Shift+End", NAV, "editor", "", ""),
    ("sel.extend-first", "sel", "Extend the selection to the beginning of the worksheet", "Ctrl+Shift+Home", "Ctrl+Shift+Home", SEL, "editor", "", ""),
    ("sel.extend-row-start", "sel", "Extend the selection to the beginning of the row", "Shift+Home", "Shift+Home", MSEL, "editor", "", ""),
    ("sel.extend-page-down", "sel", "Extend the selection down one screen", "Shift+Page down", "Shift+Page down", MSEL, "editor", "", ""),
    ("sel.extend-page-up", "sel", "Extend the selection up one screen", "Shift+Page up", "Shift+Page up", MSEL, "editor", "", ""),
    ("sel.extend-mode", "sel", "Turn extend mode on and extend the selection with the arrow keys", "F8", "F8", SEL, "editor", "", ""),
    ("sel.add-mode", "sel", "Add a non-adjacent cell or range to a selection with the arrow keys", "Shift+F8", "Shift+F8", SEL, "editor", "", ""),
    ("sel.column", "sel", "Select an entire column", "Ctrl+Spacebar", "Ctrl+Spacebar", SEL, "editor", "", ""),
    ("sel.row", "sel", "Select an entire row", "Shift+Spacebar", "Shift+Spacebar", SEL, "editor", "", ""),
    ("sel.objects", "sel", "Select all objects on a worksheet when an object is selected", "Ctrl+Shift+Spacebar", "", SEL, "editor", "", ""),
    ("sel.region", "sel", "Select the current region around the active cell", "Ctrl+Shift+Asterisk sign (*)", "", SEL, "editor", "", ""),
    ("sel.visible", "sel", "Select only visible cells", "", "Shift+Cmd+Asterisk (*)", MSEL, "absent", "", "No Go To Special"),
    ("sel.active-only", "sel", "Select only the active cell when multiple cells are selected", "", "Shift+Delete", MSEL, "editor", "", ""),
    ("sel.array", "sel", "Select the current array", "", "Ctrl+Forward slash (/)", MSEL, "absent", "", "No Go To Special"),
    ("sel.row-diff", "sel", "Select cells in a row that don't match the value in the active cell", "", "Ctrl+Backward slash (\\)", MSEL, "absent", "", ""),
    ("sel.precedents", "sel", "Select only cells that are directly referred to by formulas in the selection", "", "Ctrl+Shift+Left bracket ([)", MSEL, "absent", "Formulas > Trace Precedents", "Tracing arrows only, no selection"),
    ("sel.precedents-all", "sel", "Select all cells directly or indirectly referred to by formulas in the selection", "", "Ctrl+Shift+Left brace ({)", MSEL, "absent", "", ""),
    ("sel.dependents", "sel", "Select only cells with formulas that refer directly to the active cell", "", "Ctrl+Right bracket (])", MSEL, "absent", "Formulas > Trace Dependents", ""),
    ("sel.dependents-all", "sel", "Select all cells with formulas that refer directly or indirectly to the active cell", "", "Ctrl+Shift+Right brace (})", MSEL, "absent", "", ""),
    ("sel.down", "sel", "Move from top to bottom within the selection", "Enter", "Return", MWSEL, "editor", "", ""),
    ("sel.up", "sel", "Move from bottom to top within the selection", "Shift+Enter", "Shift+Return", MWSEL, "editor", "", ""),
    ("sel.right", "sel", "Move from left to right within the selection", "Tab key", "Tab key", MWSEL, "editor", "", ""),
    ("sel.left", "sel", "Move from right to left within the selection", "Shift+Tab", "Shift+Tab", MWSEL, "editor", "", ""),
    ("sel.corner", "sel", "Move clockwise to the next corner of the selection", "Ctrl+Period (.)", "Ctrl+Period (.)", MWSEL, "editor", "", "Excel for Windows binds it too"),
    ("sel.move-drag", "sel", "Move selected rows, columns, or cells (Shift+drag inserts them)", "Shift", "Shift", OTHER, "mouse", "", ""),
    # ---- edit ---------------------------------------------------------------
    ("edit.copy", "edit", "Copy selection", "Ctrl+C", "Cmd+C or Ctrl+C", FREQ, "editor", "", ""),
    ("edit.cut", "edit", "Cut selection", "Ctrl+X", "Cmd+X or Ctrl+X", FREQ, "editor", "", "macOS page also lists Shift+Forward Delete"),
    ("edit.paste", "edit", "Paste selection", "Ctrl+V", "Cmd+V or Ctrl+V", FREQ, "editor", "", ""),
    ("edit.paste-special", "edit", "Open the Paste Special dialog box", "Ctrl+Alt+V", "Cmd+Ctrl+V or Ctrl+Option+V or Cmd+Option+V", FMT, "editor", "", ""),
    ("edit.undo", "edit", "Undo the last action", "Ctrl+Z", "Cmd+Z or Ctrl+Z", FREQ, "editor", "", ""),
    ("edit.redo", "edit", "Redo / repeat the last command or action", "Ctrl+Y", "Cmd+Y or Ctrl+Y or Cmd+Shift+Z", SEL, "editor", "", ""),
    ("edit.repeat", "edit", "Repeat the last command or action", "F4", "", FK, "editor", "", ""),
    ("edit.clear", "edit", "Remove cell contents", "Delete", "Delete", FREQ, "editor", "", "macOS Delete is Backspace"),
    ("edit.clear-active", "edit", "Clear the content of the active cell and edit it", "Backspace", "Delete", OTHER, "editor", "", ""),
    ("edit.delete-cells", "edit", "Open the Delete dialog box to delete selected cells", "Ctrl+Minus sign (-)", "Cmd+Hyphen (-) or Ctrl+Hyphen (-)", FMT, "editor", "", ""),
    ("edit.insert-cells", "edit", "Open the Insert dialog box to insert blank cells", "Ctrl+Shift+Plus sign (+)", "Ctrl+Shift+Equal sign ( = )", FMT, "editor", "", ""),
    ("edit.fill-down", "edit", "Fill Down: copy the topmost cell of a selected range into the cells below", "Ctrl+D", "Cmd+D or Ctrl+D", FMT, "editor", "", ""),
    ("edit.fill-right", "edit", "Fill cells right", "Ctrl+R", "Cmd+R or Ctrl+R", FREQ, "editor", "", "Not on the Windows tab of the page; Excel binds it"),
    ("edit.flash-fill", "edit", "Invoke Flash Fill", "Ctrl+E", "Ctrl+E", DATA, "editor", "", "Basic patterns: words (from the start or the end), initials, whole cells, case changes, literal text"),
    ("edit.hide-rows", "edit", "Hide the selected rows", "Ctrl+9", "Ctrl+9 or Cmd+Left parenthesis (()", FREQ, "editor", "", "macOS page: Cmd+( / Ctrl+("),
    ("edit.unhide-rows", "edit", "Unhide the selected rows", "Ctrl+Shift+9", "Ctrl+Shift+Left parenthesis (() or Shift+Cmd+Left parenthesis (()", MOUT, "editor", "", "Windows key from Excel, not on the page"),
    ("edit.hide-cols", "edit", "Hide the selected columns", "Ctrl+0", "Ctrl+Zero (0) or Cmd+Right parenthesis ())", FREQ, "editor", "", ""),
    ("edit.unhide-cols", "edit", "Unhide the selected columns", "", "Ctrl+Shift+Right parenthesis ()) or Shift+Cmd+Right parenthesis ())", MOUT, "editor", "", ""),
    ("edit.outline-symbols", "edit", "Display or hide the outline symbols", "Ctrl+8", "Ctrl+8", FMT, "absent", "Data > Ungroup", "Grouping exists, but no setting hides the outline symbols"),
    ("edit.group", "edit", "Group selected cells", "Alt+Shift+Right arrow key", "Cmd+Shift+K", MWSEL, "editor", "", "Windows key from Excel, not on the page"),
    ("edit.ungroup", "edit", "Ungroup selected cells", "Alt+Shift+Left arrow key", "Cmd+Shift+J", MWSEL, "editor", "", "Windows key from Excel, not on the page"),
    ("edit.expand-group", "edit", "Expand grouped rows or columns (Shift+wheel down over them)", "Shift+scroll down", "", SEL, "mouse", "", ""),
    ("edit.collapse-group", "edit", "Collapse grouped rows or columns (Shift+wheel up over them)", "Shift+scroll up", "", SEL, "mouse", "", ""),
    ("edit.objects-toggle", "edit", "Switch between hiding objects, displaying objects, and placeholders", "Ctrl+6", "Ctrl+6", FMT, "absent", "", "No object display modes"),
    ("edit.special-chars", "edit", "Insert special characters like symbols, including emoji", "", "Ctrl+Cmd+Spacebar", MFMT, "os", "", "macOS character viewer"),
    ("edit.new-sheet", "edit", "Insert a new worksheet", "Shift+F11", "Shift+F11", FK, "editor", "", "Windows page also lists Alt+Shift+F1"),
    ("edit.new-sheet.alt-shift-f1", "edit", "Insert a new worksheet", "Alt+Shift+F1", "", FK, "editor", "", ""),
    ("edit.chart-sheet", "edit", "Create a chart of the current range in a separate Chart sheet", "F11", "F11", DATA, "absent", "Insert > Chart", "No chart sheets; F11 is the browser full-screen key"),
    ("edit.chart", "edit", "Create an embedded chart of the data in the current range", "Alt+F1", "", DATA, "editor", "", ""),
    ("edit.chart-objects", "edit", "Cycle through chart object selection", "", "Arrow keys", MCHART, "absent", "", "No keyboard selection of chart elements"),
    ("edit.sort", "edit", "Open the Sort dialog box", "", "Cmd+Shift+R", MSORT, "editor", "", ""),
    ("edit.filter", "edit", "Add or remove a filter", "Ctrl+Shift+L", "Cmd+Shift+F or Ctrl+Shift+L", FREQ, "editor", "", ""),
    ("edit.table", "edit", "Display the Create Table dialog box", "Ctrl+L or Ctrl+T", "Cmd+T or Ctrl+T", FMT, "editor", "", "Ctrl+T and Cmd+T open a browser tab: Ctrl+L remains"),
    ("edit.quick-analysis", "edit", "Display the Quick Analysis options", "Ctrl+Q", "", FMT, "editor", "Quick Analysis button at the corner of the selection", "Formatting, Charts, Totals, Tables; Ctrl+Q also on macOS"),
    ("edit.hyperlink", "edit", "Open the Insert hyperlink dialog box", "Ctrl+K", "Cmd+K or Ctrl+K", FMT, "editor", "", ""),
    ("edit.spelling", "edit", "Check spelling in the active worksheet or selected range", "F7", "F7", FMT, "editor", "", ""),
    ("edit.thesaurus", "edit", "Open the thesaurus", "Shift+F7", "Shift+F7 or Ctrl+Option+Cmd+R", MFK, "absent", "Thesaurus plugin", "No built-in thesaurus"),
    ("edit.note", "edit", "Insert a note; open and edit a cell note", "Shift+F2", "Shift+F2", FMT, "editor", "", "The editor's comments play the role of notes"),
    ("edit.comment", "edit", "Insert a threaded comment; open and reply to a threaded comment", "Ctrl+Shift+F2", "Cmd+Shift+F2", FMT, "editor", "", ""),
    ("edit.comment.cmd-return", "edit", "Insert or reply to a threaded comment", "", "Cmd+Return", FREQ, "editor", "", ""),
    ("edit.macros", "edit", "Create, run, edit, or delete a macro", "Alt+F8", "Option+F8", DATA, "editor", "", "Macros dialog (JavaScript)"),
    ("edit.vba", "edit", "Open the Visual Basic for Applications Editor", "Alt+F11", "Option+F11", DATA, "editor", "", "Macros dialog (JavaScript, no VBA)"),
    ("edit.power-query", "edit", "Open the Power Query Editor", "Alt+F12", "Option+F12", DATA, "absent", "", "No Power Query"),
    ("edit.refresh-stop", "edit", "Stop a refresh operation", "Esc", "", EXT, "absent", "", "No external data connections"),
    ("edit.refresh", "edit", "Refresh data in the current worksheet", "Ctrl+F5", "", EXT, "browser", "Data > Refresh", "Ctrl+F5 reloads the page"),
    ("edit.refresh-all", "edit", "Refresh all data in the workbook", "Ctrl+Alt+F5", "", EXT, "editor", "", "Refreshes the pivot tables; Linux: Ctrl+Alt+F5 switches virtual console"),
    ("edit.drag-insert", "edit", "Hold Shift while dragging to insert the cells", "Shift", "", OTHER, "mouse", "", ""),
    # ---- cell entry -----------------------------------------------------------
    ("entry.edit", "entry", "Edit the active cell, insertion point at the end", "F2", "F2", FMT, "editor", "", ""),
    ("entry.edit.ctrl-u", "entry", "Edit the active cell and position the insertion point at the end of the line", "", "Ctrl+U", MCELL, "editor", "", ""),
    ("entry.edit-formula-bar", "entry", "Edit the active cell in the formula bar", "Ctrl+F2", "", FK, "editor", "", ""),
    ("entry.newline", "entry", "Start a new line in the same cell", "Alt+Enter", "Option+Return or Ctrl+Option+Return", SEL, "editor", "", ""),
    ("entry.newline.cmd-option", "entry", "Insert a line break in a cell", "", "Cmd+Option+Return or Ctrl+Option+Return", MFMT, "editor", "", ""),
    ("entry.fill", "entry", "Fill the selected cell range with the current entry", "Ctrl+Enter", "Cmd+Return or Ctrl+Return", SEL, "editor", "", ""),
    ("entry.complete-down", "entry", "Complete a cell entry and select the cell below", "Enter", "Return", DATA, "editor", "", ""),
    ("entry.complete-up", "entry", "Complete a cell entry and select the cell above", "Shift+Enter", "Shift+Return", SEL, "editor", "", ""),
    ("entry.complete-right", "entry", "Complete a cell entry and move to the right", "Tab key", "Tab key", MENTER, "editor", "", ""),
    ("entry.complete-left", "entry", "Complete a cell entry and move to the left", "Shift+Tab", "Shift+Tab", MENTER, "editor", "", ""),
    ("entry.cancel", "entry", "Cancel an entry in the cell or formula bar", "Esc", "Esc", DATA, "editor", "", ""),
    ("entry.array", "entry", "Enter a formula as an array formula", "Ctrl+Shift+Enter", "Shift+Cmd+Return or Ctrl+Shift+Return", MCELL, "editor", "", "Windows key from Excel, not on the page"),
    ("entry.backspace", "entry", "Delete the character to the left of the insertion point", "Backspace", "Delete", MENTER, "editor", "", ""),
    ("entry.delete", "entry", "Delete the character to the right of the insertion point", "Delete", "Forward Delete", MENTER, "editor", "", "MacBook: Fn+Delete"),
    ("entry.delete-eol", "entry", "Delete text to the end of the line", "Ctrl+Delete", "Ctrl+Forward Delete", MENTER, "editor", "", "MacBook: Ctrl+Fn+Delete"),
    ("entry.move-char", "entry", "Move one character up, down, left, or right", "Arrow keys", "Arrow keys", MENTER, "editor", "", ""),
    ("entry.line-start", "entry", "Move to the beginning of the line", "Home", "Home", MENTER, "editor", "", ""),
    ("entry.formula-end", "entry", "Move the cursor to the end of the text in the formula bar", "Ctrl+End", "", DATA, "editor", "", ""),
    ("entry.formula-select-end", "entry", "Select all text in the formula bar from the cursor to the end", "Ctrl+Shift+End", "", DATA, "editor", "", ""),
    ("entry.start-formula", "entry", "Start a formula", "Equal sign ( = )", "Equal sign ( = )", MCELL, "editor", "", ""),
    ("entry.date", "entry", "Enter the current date", "Ctrl+Semicolon (;)", "Ctrl+Semicolon (;)", FMT, "editor", "", ""),
    ("entry.time", "entry", "Enter the current time", "Ctrl+Shift+Colon (:)", "Cmd+Semicolon (;)", FMT, "editor", "", ""),
    ("entry.copy-formula-above", "entry", "Copy a formula from the cell above into the cell or the formula bar", "Ctrl+Apostrophe (')", "Ctrl+Apostrophe (')", FMT, "editor", "", ""),
    ("entry.copy-value-above", "entry", "Copy the value from the cell above into the cell or the formula bar", "Ctrl+Shift+Straight quotation mark (\")", "Ctrl+Shift+Inch mark/Straight double quote (\")", DATA, "editor", "", ""),
    ("entry.autocomplete", "entry", "Display the AutoComplete list", "", "Option+Down arrow key", MCELL, "editor", "", "Same key as nav.validation-list"),
    ("entry.define-name", "entry", "Define a name", "", "Ctrl+L", MENTER, "editor", "", ""),
    ("entry.define-name.cmd-f3", "entry", "Open the Define Name dialog box", "", "Cmd+F3", MFK, "editor", "", ""),
    ("entry.create-names", "entry", "Open the Create names dialog box", "", "Cmd+Shift+F3", FREQ, "absent", "", "No Create Names from Selection"),
    ("entry.paste-name", "entry", "Paste a name from the Paste Name dialog box", "F3", "", DATA, "editor", "", "Needs a defined name"),
    ("entry.data-form", "entry", "Move to the first field in the next record of a data form", "Enter", "", DATA, "absent", "", "No data forms"),
    # ---- formulas ---------------------------------------------------------------
    ("formula.tooltips", "formula", "Turn on or off tooltips for checking formulas", "Ctrl+Alt+P", "Ctrl+Option+P", DATA, "absent", "", "No formula-checking tooltips toggle"),
    ("formula.show", "formula", "Switch between displaying cell values or formulas", "Ctrl+Grave accent (`)", "Ctrl+Grave accent (`)", FMT, "editor", "", ""),
    ("formula.calc-all", "formula", "Calculate all worksheets in all open workbooks", "F9", "Cmd+Equal sign ( = ) or F9", DATA, "editor", "", ""),
    ("formula.calc-sheet", "formula", "Calculate the active worksheet", "Shift+F9", "Shift+F9", DATA, "editor", "", ""),
    ("formula.calc-full", "formula", "Calculate all worksheets, changed or not", "Ctrl+Alt+F9", "Ctrl+Option+F9", DATA, "editor", "", "Linux: Ctrl+Alt+F9 may switch virtual console"),
    ("formula.calc-rebuild", "formula", "Check dependent formulas, then calculate all cells", "Ctrl+Alt+Shift+F9", "Ctrl+Option+Shift+F9", DATA, "editor", "", ""),
    ("formula.args-dialog", "formula", "Display the Function Arguments dialog box (insertion point right of a function name)", "Ctrl+A", "Ctrl+A", DATA, "editor", "", "macOS: the Formula Builder"),
    ("formula.arg-names", "formula", "Insert argument names and parentheses (insertion point right of a function name)", "Ctrl+Shift+A", "", DATA, "absent", "Ctrl+A (Function Arguments)", ""),
    ("formula.autosum", "formula", "Insert the Sum formula", "Alt+Equal sign (=)", "Shift+Cmd+T", DATA, "editor", "", ""),
    ("formula.abs-ref", "formula", "Cycle through absolute and relative references", "F4", "Cmd+T or F4", DATA, "editor", "", ""),
    ("formula.insert-function", "formula", "Insert a function", "Shift+F3", "Shift+F3", DATA, "editor", "", "macOS: the Formula Builder"),
    ("formula.point-mode", "formula", "When editing a formula, toggle Point mode", "F2", "", FK, "editor", "", ""),
    # ---- format -----------------------------------------------------------------
    ("fmt.cells-dialog", "fmt", "Open the Format Cells dialog box", "Ctrl+1", "Cmd+1 or Ctrl+1", FMT, "editor", "", ""),
    ("fmt.font-dialog", "fmt", "Format fonts in the Format Cells dialog box", "Ctrl+Shift+F", "", FMT, "absent", "Home > Font group", "The Format Cells dialog has no Font tab"),
    ("fmt.cell-style", "fmt", "Display the Modify Cell Style dialog box", "", "Shift+Cmd+L", MFMT, "absent", "Home > Cell Styles", "No cell style editor"),
    ("fmt.bold", "fmt", "Bold text or remove bold formatting", "Ctrl+B or Ctrl+2", "Cmd+B or Ctrl+B", FMT, "editor", "", ""),
    ("fmt.italic", "fmt", "Italicize text or remove italic formatting", "Ctrl+I or Ctrl+3", "Cmd+I or Ctrl+I", FMT, "editor", "", ""),
    ("fmt.underline", "fmt", "Underline text or remove underline", "Ctrl+U or Ctrl+4", "Cmd+U", FMT, "editor", "", ""),
    ("fmt.strike", "fmt", "Apply or remove strikethrough formatting", "Ctrl+5", "Shift+Cmd+X", FMT, "editor", "", ""),
    ("fmt.grow-font", "fmt", "Increase font size", "", "Shift+Cmd+Right angle bracket (>)", MFMT, "editor", "", ""),
    ("fmt.shrink-font", "fmt", "Decrease font size", "", "Shift+Cmd+Left angle bracket (<)", MFMT, "editor", "", ""),
    ("fmt.align-center", "fmt", "Align center", "", "Cmd+E", MFMT, "editor", "", ""),
    ("fmt.align-left", "fmt", "Align left", "", "Cmd+L", MFMT, "editor", "", ""),
    ("fmt.border-outline", "fmt", "Apply an outline border to the selected cells", "Ctrl+Shift+Ampersand sign (&)", "Cmd+Option+Zero (0)", FMT, "editor", "", ""),
    ("fmt.border-right", "fmt", "Add an outline border to the right of the selection", "", "Cmd+Option+Right arrow key", MFMT, "editor", "", ""),
    ("fmt.border-left", "fmt", "Add an outline border to the left of the selection", "", "Cmd+Option+Left arrow key", MFMT, "editor", "", ""),
    ("fmt.border-top", "fmt", "Add an outline border to the top of the selection", "", "Cmd+Option+Up arrow key", MFMT, "editor", "", ""),
    ("fmt.border-bottom", "fmt", "Add an outline border to the bottom of the selection", "", "Cmd+Option+Down arrow key", MFMT, "editor", "", ""),
    ("fmt.border-remove", "fmt", "Remove the outline border from the selected cells", "Ctrl+Shift+Underscore (_)", "Cmd+Option+Hyphen", FMT, "editor", "", ""),
    ("fmt.general", "fmt", "Apply the General number format", "Ctrl+Shift+Tilde sign (~)", "Ctrl+Shift+Tilde (~)", FMT, "editor", "", ""),
    ("fmt.currency", "fmt", "Apply the Currency format with two decimal places", "Ctrl+Shift+Dollar sign ($)", "Ctrl+Shift+Dollar sign ($)", FMT, "editor", "", ""),
    ("fmt.percent", "fmt", "Apply the Percentage format with no decimal places", "Ctrl+Shift+Percent sign (%)", "Ctrl+Shift+Percent sign (%)", FMT, "editor", "", ""),
    ("fmt.scientific", "fmt", "Apply the Scientific number format with two decimal places", "Ctrl+Shift+Caret sign (^)", "Ctrl+Shift+Caret (^)", FMT, "editor", "", ""),
    ("fmt.date", "fmt", "Apply the Date format with the day, month, and year", "Ctrl+Shift+Number sign (#)", "Ctrl+Shift+Number sign (#)", FMT, "editor", "", ""),
    ("fmt.time", "fmt", "Apply the Time format with the hour and minute, and AM or PM", "Ctrl+Shift+At sign (@)", "Ctrl+Shift+At symbol (@)", FMT, "editor", "", ""),
    ("fmt.number", "fmt", "Apply the Number format with two decimal places and thousands separator", "Ctrl+Shift+Exclamation point (!)", "Ctrl+Shift+Exclamation point (!)", FMT, "editor", "", ""),
    # ---- Paste Special dialog letters ---------------------------------------------
    ("paste.all", "paste", "Paste Special: all cell contents and formatting", "A", "", PS, "editor", "", "Letter keys in the Paste Special dialog"),
    ("paste.formulas", "paste", "Paste Special: only the formulas", "F", "", PS, "editor", "", ""),
    ("paste.values", "paste", "Paste Special: only the values", "V", "", PS, "editor", "", ""),
    ("paste.formats", "paste", "Paste Special: only the copied formatting", "T", "", PS, "editor", "", ""),
    ("paste.comments", "paste", "Paste Special: only comments and notes", "C", "", PS, "editor", "", ""),
    ("paste.validation", "paste", "Paste Special: only the data validation settings", "N", "", PS, "absent", "", "Not an option of the editor's Paste Special"),
    ("paste.source-theme", "paste", "Paste Special: all contents and formatting from copied cells (source theme)", "H", "", PS, "absent", "", ""),
    ("paste.no-borders", "paste", "Paste Special: all contents without borders", "X", "", PS, "editor", "", ""),
    ("paste.col-widths", "paste", "Paste Special: only column widths", "W", "", PS, "editor", "", ""),
    ("paste.formulas-numfmt", "paste", "Paste Special: formulas and number formats", "R", "", PS, "editor", "", ""),
    ("paste.values-numfmt", "paste", "Paste Special: values and number formats", "U", "", PS, "editor", "", ""),
    # ---- Power Pivot (absent) ----------------------------------------------------
    ("pp.context-menu", "pp", "Power Pivot: open the context menu for the selected cell, column, or row", "Shift+F10", "", PP, "absent", "", "No Power Pivot window"),
    ("pp.select-table", "pp", "Power Pivot: select the entire table", "Ctrl+A", "", PP, "absent", "", ""),
    ("pp.copy", "pp", "Power Pivot: copy selected data", "Ctrl+C", "", PP, "absent", "", ""),
    ("pp.delete-table", "pp", "Power Pivot: delete the table", "Ctrl+D", "", PP, "absent", "", ""),
    ("pp.move-table", "pp", "Power Pivot: move the table", "Ctrl+M", "", PP, "absent", "", ""),
    ("pp.rename-table", "pp", "Power Pivot: rename the table", "Ctrl+R", "", PP, "absent", "", ""),
    ("pp.save", "pp", "Power Pivot: save the file", "Ctrl+S", "", PP, "absent", "", ""),
    ("pp.redo", "pp", "Power Pivot: redo the last action", "Ctrl+Y", "", PP, "absent", "", ""),
    ("pp.undo", "pp", "Power Pivot: undo the last action", "Ctrl+Z", "", PP, "absent", "", ""),
    ("pp.select-column", "pp", "Power Pivot: select the current column", "Ctrl+Spacebar", "", PP, "absent", "", ""),
    ("pp.select-row", "pp", "Power Pivot: select the current row", "Shift+Spacebar", "", PP, "absent", "", ""),
    ("pp.select-col-down", "pp", "Power Pivot: select to the last cell of the column", "Shift+Page down", "", PP, "absent", "", ""),
    ("pp.select-col-up", "pp", "Power Pivot: select to the first cell of the column", "Shift+Page up", "", PP, "absent", "", ""),
    ("pp.select-row-end", "pp", "Power Pivot: select to the last cell of the row", "Shift+End", "", PP, "absent", "", ""),
    ("pp.select-row-start", "pp", "Power Pivot: select to the first cell of the row", "Shift+Home", "", PP, "absent", "", ""),
    ("pp.prev-table", "pp", "Power Pivot: move to the previous table", "Ctrl+Page up", "", PP, "absent", "", ""),
    ("pp.next-table", "pp", "Power Pivot: move to the next table", "Ctrl+Page down", "", PP, "absent", "", ""),
    ("pp.first-cell", "pp", "Power Pivot: move to the first cell of the selected table", "Ctrl+Home", "", PP, "absent", "", ""),
    ("pp.last-cell", "pp", "Power Pivot: move to the last cell of the selected table", "Ctrl+End", "", PP, "absent", "", ""),
    ("pp.row-first", "pp", "Power Pivot: move to the first cell of the selected row", "Ctrl+Left arrow key", "", PP, "absent", "", ""),
    ("pp.row-last", "pp", "Power Pivot: move to the last cell of the selected row", "Ctrl+Right arrow key", "", PP, "absent", "", ""),
    ("pp.col-first", "pp", "Power Pivot: move to the first cell of the selected column", "Ctrl+Up arrow key", "", PP, "absent", "", ""),
    ("pp.col-last", "pp", "Power Pivot: move to the last cell of the selected column", "Ctrl+Down arrow key", "", PP, "absent", "", ""),
    ("pp.cancel", "pp", "Power Pivot: close a dialog box or cancel a process", "Ctrl+Esc", "", PP, "absent", "", ""),
    ("pp.autofilter", "pp", "Power Pivot: open the AutoFilter Menu dialog box", "Alt+Down arrow key", "", PP, "absent", "", ""),
    ("pp.goto", "pp", "Power Pivot: open the Go To dialog box", "F5", "", PP, "absent", "", ""),
    ("pp.recalc", "pp", "Power Pivot: recalculate all formulas", "F9", "", PP, "absent", "", ""),
    # ---- Copilot (absent) ----------------------------------------------------------
    ("copilot.send", "copilot", "Copilot: send your prompt", "Enter", "Return", COP, "absent", "", "No Copilot; Elixir AI has its own keys"),
    ("copilot.stop", "copilot", "Copilot: stop or cancel the request", "Esc", "Esc", COP, "absent", "", ""),
    ("copilot.accept", "copilot", "Copilot: accept changes", "Ctrl+Enter", "Cmd+Return", COP, "absent", "", ""),
    ("copilot.mode", "copilot", "Copilot: switch between edit, chat, and plan mode", "Ctrl+Shift+M", "Cmd+Shift+M", COP, "absent", "", ""),
    ("copilot.responses", "copilot", "Copilot: navigate between chat responses", "Alt+C", "Option+C", COP, "absent", "", ""),
    ("copilot.files", "copilot", "Copilot: confirm use of selected files", "Ctrl+J", "Cmd+J", COP, "absent", "", ""),
    ("copilot.dictation", "copilot", "Copilot: start dictation", "Alt+Shift+H", "Option+Shift+H", COP, "absent", "", ""),
    ("copilot.open", "copilot", "Copilot: open the task pane", "Alt+C", "Cmd+Ctrl+I", COP, "absent", "", ""),
    ("copilot.focus", "copilot", "Copilot: move focus between the grid and the task pane", "F6", "Shift+F6", COP, "absent", "", ""),
]

COLUMNS = ["id", "category", "action", "windows", "macos", "ms_section", "scope", "alternative", "notes"]


def write(path):
    ids = [r[0] for r in M]
    dup = {i for i in ids if ids.count(i) > 1}
    assert not dup, dup
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(COLUMNS)
        for r in M:
            assert len(r) == len(COLUMNS), r
            w.writerow(r)


def squash(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("command", "cmd").replace("key", ""))


FK_RE = r"((?:(?:Cmd|Ctrl|Alt|Shift|Option)\s*\+\s*)*F\d{1,2})(?: alone)?\s*:"


def keys_of(cell):
    """The key combinations of a cell: "Ctrl+B or Ctrl+2" -> {"ctrlb", "ctrl2"}."""
    parts = re.split(r"(?i) or,? |, then | then |\. |,| On a MacBook, ", cell)
    return {squash(p) for p in parts if squash(p)}


def check(rows_path):
    """Every Windows/macOS row of the Microsoft page has a row in the matrix
    whose key matches (same platform column) and, when the page gives one,
    whose action starts like the page's."""
    rows = json.load(open(rows_path, encoding="utf-8"))
    col = {"windows": 3, "macos": 4}
    missing = []
    for r in rows:
        c = col[r["platform"]]
        if r["section"] == FK and r["platform"] == "windows":
            # one row per key: "F1 alone: ... Ctrl+F1: ... Alt+F1: ..."
            for k in re.findall(FK_RE, r["action"]):
                if not any(squash(k) in keys_of(m[c]) for m in M):
                    missing.append((r["platform"], k, r["action"][:60]))
            continue
        page_keys = keys_of(r["keys"])
        first = squash(re.split(r"(?i) or,? |, then | then |\. |,| On a MacBook", r["keys"])[0])
        hits = [m for m in M if first in keys_of(m[c]) or (page_keys & keys_of(m[c]))]
        if not hits:
            # keys drawn as images on the page (Forward Delete...): match the action
            a = squash(r["action"])[:24]
            hits = [m for m in M if a and squash(m[2]).startswith(a[:16])]
        if not hits:
            missing.append((r["platform"], r["keys"], r["action"][:80]))
    for m in missing:
        print("not in matrix:", *m)
    print(len(rows), "rows checked,", len(missing), "missing")
    return not missing


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--check":
        sys.exit(0 if check(sys.argv[2]) else 1)
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "..", "..", "docs", "shortcuts-excel.csv")
    write(out)
    from collections import Counter
    print(len(M), "rows ->", os.path.normpath(out))
    print(dict(Counter(r[6] for r in M)))
