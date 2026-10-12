#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Writes docs/shortcuts-powerpoint.csv: PowerPoint keyboard shortcuts (Windows, and the macOS keys tested) vs ElixirOffice.

Sources (retrieved 2026-10-05):
  M1 https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-powerpoint-ebb3d20e-dcd4-444f-a38e-bb5c5ed180f4
  M2 https://support.microsoft.com/en-us/office/use-keyboard-shortcuts-to-deliver-powerpoint-presentations-1524ffce-bd2a-45f4-9a7f-f18b992b93a0
status: native (already in the editor), fixed (added by the ElixirOffice presentation work),
        browser (the browser keeps the key), gap (not available), n/a (no equivalent on the web or outside the scope)
test: id of the case in tests/shortcuts-pptx/cases.mjs ("" = not automated)
macos_keys: the keys the suite plays on macOS (Cmd for Ctrl unless the case says otherwise)
"""
import csv, os

M1 = "https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-powerpoint-ebb3d20e-dcd4-444f-a38e-bb5c5ed180f4"
M2 = "https://support.microsoft.com/en-us/office/use-keyboard-shortcuts-to-deliver-powerpoint-presentations-1524ffce-bd2a-45f4-9a7f-f18b992b93a0"
R = []
def r(sec, act, keys, status, test="", notes="", src=M1):
    R.append([sec, act, keys, status, test, notes, src, "2026-10-05"])

S = "Frequently used"
r(S, "Create a new presentation", "Ctrl+N", "browser", "", "opens a browser window; File > New")
r(S, "Add a new slide", "Ctrl+M", "native", "new-slide")
r(S, "Make selected text bold", "Ctrl+B", "native", "bold")
r(S, "Open the Font dialog box", "Ctrl+T", "browser", "", "new browser tab; Ctrl+Shift+F works")
r(S, "Cut", "Ctrl+X", "native")
r(S, "Copy", "Ctrl+C", "native")
r(S, "Paste", "Ctrl+V", "native")
r(S, "Insert a hyperlink", "Ctrl+K", "fixed", "hyperlink", "the stock key did not open the dialog from selected text")
r(S, "Insert a new comment", "Ctrl+Alt+M", "fixed", "comment")
r(S, "Undo", "Ctrl+Z", "native", "undo")
r(S, "Redo", "Ctrl+Y", "native", "redo")
r(S, "Go to the next slide", "Page Down", "native", "next-slide")
r(S, "Go to the previous slide", "Page Up", "native", "prev-slide")
r(S, "Start the slide show", "F5", "fixed", "slideshow-f5", "was Ctrl+F5; full screen like PowerPoint (F5 no longer reloads the page)")
r(S, "End the slide show", "Esc", "native", "end-show")
r(S, "Print", "Ctrl+P", "native", "print", "opens File > Print with the preview")
r(S, "Save", "Ctrl+S", "native", "save")
r(S, "Close PowerPoint", "Ctrl+Q", "n/a", "", "web page; File > Close")

S = "Presentations and slides"
r(S, "Zoom out", "Ctrl+Minus", "native", "zoom-out")
r(S, "Zoom in", "Ctrl+Plus", "native", "zoom-in", "Ctrl+= outside text; numeric keypad + and - too")
r(S, "Zoom to fit", "Ctrl+Alt+O", "fixed", "zoom-fit")
r(S, "Copy the selected slide (duplicate)", "Ctrl+Shift+D", "fixed", "duplicate-slide")
r(S, "Open a presentation", "Ctrl+O", "browser", "", "File > Open")
r(S, "Close a presentation", "Ctrl+D", "n/a", "", "Ctrl+D duplicates the selection, as in recent PowerPoint")
r(S, "Save with a different name", "Ctrl+Shift+S", "native", "save-as", "opens File > Save As")
r(S, "Cancel a command", "Esc", "native")

S = "Copy objects and text"
r(S, "Duplicate selected objects", "Ctrl+D", "native")
r(S, "Copy formatting", "Ctrl+Shift+C", "fixed", "copy-paste-format", "was Ctrl+Alt+C (kept)")
r(S, "Paste formatting", "Ctrl+Shift+V", "fixed", "copy-paste-format", "was Ctrl+Alt+V (kept)")
r(S, "Copy animation painter", "Alt+Shift+C", "gap", "", "no animation painter in the engine")
r(S, "Paste animation painter", "Alt+Shift+V", "gap")
r(S, "Open the Paste Special dialog", "Ctrl+Alt+V", "gap", "", "Ctrl+Alt+V pastes formatting (engine default)")

S = "Objects"
r(S, "Move focus to the first floating shape", "Ctrl+Alt+5", "fixed", "first-shape", "Windows only (Ctrl+Option+5 is not a macOS shortcut); Tab then cycles")
r(S, "Select the next / previous object", "Tab / Shift+Tab", "native")
r(S, "Send object back one position", "Ctrl+Shift+[", "fixed", "send-backward")
r(S, "Bring object forward one position", "Ctrl+Shift+]", "fixed", "bring-forward")
r(S, "Select all objects on a slide", "Ctrl+A", "native")
r(S, "Group", "Ctrl+G", "native", "group")
r(S, "Ungroup", "Ctrl+Shift+G", "native")
r(S, "Regroup", "Ctrl+Shift+J", "fixed", "regroup", "regroups the objects of the last ungrouped group of the slide")
r(S, "Rotate object 15 degrees clockwise", "Alt+Right Arrow", "fixed", "rotate-right")
r(S, "Rotate object 15 degrees counterclockwise", "Alt+Left Arrow", "fixed", "rotate-left")
r(S, "Play or pause media", "Ctrl+Space", "gap", "", "Ctrl+Space resets character formatting")
r(S, "Insert an equation", "Alt+=", "fixed", "equation")
r(S, "Open the context menu", "Shift+F10", "native")

S = "Select, delete and move in text"
for a, k in [("Select one character to the right / left", "Shift+Right / Left"), ("Select to the end / beginning of a word", "Ctrl+Shift+Right / Left"),
             ("Select one line up / down", "Shift+Up / Down"), ("Select text in a selected object", "Enter"), ("Select an object from its text", "Esc"),
             ("Delete one character left / right", "Backspace / Delete"), ("Delete one word left / right", "Ctrl+Backspace / Ctrl+Delete"),
             ("Move one character / word / line", "Arrows, Ctrl+Left / Right"), ("Move to the beginning / end of the line", "Home / End"),
             ("Move to the beginning / end of the text box", "Ctrl+Home / Ctrl+End"), ("Move to the next title or body placeholder", "Ctrl+Enter")]:
    r(S, a, k, "native")
r(S, "Select to the end / beginning of a paragraph", "Ctrl+Shift+Down / Up", "fixed", "select-para-end select-para-start", "")
r(S, "Move up / down one paragraph", "Ctrl+Up / Down", "fixed", "para-down para-up", "Ctrl+Up goes to the start of the current paragraph first")
r(S, "Promote a paragraph", "Alt+Shift+Left Arrow", "fixed", "promote")
r(S, "Demote a paragraph", "Alt+Shift+Right Arrow", "fixed", "demote")
r(S, "Move selected paragraphs up / down", "Alt+Shift+Up / Down", "fixed", "move-para-down move-para-up", "Ctrl+Shift+Up / Down on macOS")

S = "Find and replace"
r(S, "Open the Find pane", "Ctrl+F", "fixed", "find", "opens the search pane with the selected text")
r(S, "Open the Replace dialog", "Ctrl+H", "native", "replace")
r(S, "Repeat the last Find", "Shift+F4", "fixed", "find-next", "")

S = "Format text"
r(S, "Open the Font dialog box", "Ctrl+Shift+F", "fixed", "font-dialog", "paragraph settings (Font tab)")
r(S, "Increase the font size", "Ctrl+Shift+>", "fixed", "grow-font", "Ctrl+] kept")
r(S, "Decrease the font size", "Ctrl+Shift+<", "fixed", "shrink-font", "Ctrl+[ kept")
r(S, "Switch case (lower, UPPER, Capitalize)", "Shift+F3", "fixed", "change-case")
r(S, "Underline", "Ctrl+U", "native", "underline")
r(S, "Italic", "Ctrl+I", "native", "italic")
r(S, "Subscript", "Ctrl+=", "fixed", "subscript", "was Ctrl+. (kept)")
r(S, "Superscript", "Ctrl+Shift++", "fixed", "superscript", "was Ctrl+, (kept)")
r(S, "Remove manual character formatting", "Ctrl+Space", "native", "clear-format")
r(S, "Center", "Ctrl+E", "native", "center")
r(S, "Justify", "Ctrl+J", "native", "justify")
r(S, "Align left", "Ctrl+L", "native", "left")
r(S, "Align right", "Ctrl+R", "native", "right")
r(S, "Bulleted list from * + Space, - + Space, > + Space", "* Space", "native", "", "AutoFormat as you type")

S = "Tables"
for a, k in [("Next cell", "Tab"), ("Preceding cell", "Shift+Tab"), ("Next row", "Down Arrow"), ("Preceding row", "Up Arrow"),
             ("New paragraph in a cell", "Enter"), ("New row at the bottom", "Tab in the last cell")]:
    r(S, a, k, "native")
r(S, "Insert a tab in a cell", "Ctrl+Tab", "browser", "", "switches browser tabs")

S = "Move a slide (thumbnails)"
r(S, "Move the slide up / down", "Ctrl+Up / Down", "fixed", "move-slide-down move-slide-up", "")
r(S, "Move the slide to the beginning", "Ctrl+Shift+Up", "native", "move-slide-start")
r(S, "Move the slide to the end", "Ctrl+Shift+Down", "native", "move-slide-end")

S = "Views and panes"
r(S, "Start in Presenter View", "Alt+F5", "fixed", "presenter-view")
r(S, "Toggle the Outline / Thumbnails pane", "Ctrl+Shift+Tab", "gap", "", "no Outline view")
r(S, "Collapse / expand the ribbon", "Ctrl+F1", "fixed", "ribbon-collapse")
r(S, "Show or hide guides", "Alt+F9", "fixed", "guides")
r(S, "Show or hide the grid", "Shift+F9", "fixed", "gridlines")
r(S, "Cycle through the panes", "F6 / Shift+F6", "fixed", "cycle-panes", "slide, thumbnails, ribbon, status bar")
r(S, "Help", "F1", "native")
r(S, "Open the Selection pane", "Alt+F10", "gap", "", "no Selection pane")

S = "Ribbon"
r(S, "Search (Tell me)", "Alt+Q", "fixed", "tell-me", "Ctrl+Option+Q on macOS; the chat moved to Review")
r(S, "KeyTips", "Alt or F10", "native", "keytips")
r(S, "File", "Alt+F", "native", "file-tab")
r(S, "Home", "Alt+H", "native")
r(S, "Insert", "Alt+N", "fixed", "insert-tab", "was Alt+I")
r(S, "Draw", "Alt+J, I", "fixed", "", "KeyTip JI")
r(S, "Design", "Alt+G", "fixed", "design-tab", "was Alt+D")
r(S, "Transitions", "Alt+K", "fixed", "transitions-tab", "was Alt+N")
r(S, "Animations", "Alt+A", "native")
r(S, "Slide Show", "Alt+S", "fixed", "slideshow-tab", "new tab")
r(S, "Review", "Alt+R", "fixed", "", "KeyTip R")
r(S, "View", "Alt+W", "fixed", "view-tab")
r(S, "Recording tab", "Alt+E", "n/a")
r(S, "Open the menu of a button", "Alt+Down Arrow", "native")

S = "Delivering a presentation"
for a, k, st, n in [
    ("Start from the beginning", "F5", "fixed", ""), ("Start from the current slide", "Shift+F5", "fixed", ""),
    ("Start in Presenter View", "Alt+F5", "fixed", ""),
    ("Next animation or slide", "N, Enter, Page Down, Right, Down, Space", "fixed", "N added"),
    ("Previous animation or slide", "P, Page Up, Left, Up, Backspace", "fixed", "P and Backspace added"),
    ("Blank black / white slide", "B or . / W or ,", "fixed", ""), ("End the presentation", "Esc", "native", ""),
    ("Go to slide number", "number, Enter", "fixed", ""), ("First / last slide", "Home / End", "native", ""),
    ("Pen / arrow / eraser pointer", "Ctrl+P / Ctrl+A / Ctrl+E", "fixed", "pen: red ink; Esc leaves the pen, then the show"),
    ("Laser pointer", "Ctrl+L", "fixed", "red dot pointer"), ("Erase annotations", "E", "fixed", ""),
    ("Hide the pointer", "Ctrl+H", "fixed", "Ctrl+A shows it again; on macOS Ctrl+H (Cmd+H hides the application)"), ("All Slides dialog", "Ctrl+S", "gap", "")]:
    tests = {"Next animation or slide": "show-next", "Previous animation or slide": "show-prev", "Blank black / white slide": "show-black",
             "Go to slide number": "show-goto", "Start from the current slide": "show-current", "Start from the beginning": "slideshow-f5",
             "Pen / arrow / eraser pointer": "show-pen show-arrow show-eraser", "Laser pointer": "show-laser", "Erase annotations": "show-erase",
             "Hide the pointer": "show-hide-pointer"}
    r(S, a, k, st, tests.get(a, ""), n, M2)

# macOS keys: the keys tests/shortcuts-pptx plays on emulated macOS (run.mjs --platform mac), "(none)": no macOS shortcut
MAC = {
    ("Add a new slide", "Ctrl+M"): "Cmd+M",
    ("Make selected text bold", "Ctrl+B"): "Cmd+B",
    ("Insert a hyperlink", "Ctrl+K"): "Cmd+K",
    ("Insert a new comment", "Ctrl+Alt+M"): "Cmd+Option+M",
    ("Undo", "Ctrl+Z"): "Cmd+Z",
    ("Redo", "Ctrl+Y"): "Cmd+Y",
    ("Go to the next slide", "Page Down"): "PageDown",
    ("Go to the previous slide", "Page Up"): "PageUp",
    ("Start the slide show", "F5"): "F5",
    ("End the slide show", "Esc"): "Escape",
    ("Print", "Ctrl+P"): "Cmd+P",
    ("Save", "Ctrl+S"): "Cmd+S",
    ("Zoom out", "Ctrl+Minus"): "Cmd+-",
    ("Zoom in", "Ctrl+Plus"): "Cmd+=",
    ("Zoom to fit", "Ctrl+Alt+O"): "Cmd+Option+O",
    ("Copy the selected slide (duplicate)", "Ctrl+Shift+D"): "Cmd+Shift+D",
    ("Save with a different name", "Ctrl+Shift+S"): "Cmd+Shift+S",
    ("Copy formatting", "Ctrl+Shift+C"): "Cmd+Shift+C",
    ("Paste formatting", "Ctrl+Shift+V"): "Cmd+Shift+C",
    ("Move focus to the first floating shape", "Ctrl+Alt+5"): "(none)",
    ("Send object back one position", "Ctrl+Shift+["): "Cmd+Shift+[",
    ("Bring object forward one position", "Ctrl+Shift+]"): "Cmd+Shift+]",
    ("Group", "Ctrl+G"): "Cmd+G",
    ("Regroup", "Ctrl+Shift+J"): "Cmd+Shift+J",
    ("Rotate object 15 degrees clockwise", "Alt+Right Arrow"): "Option+Right",
    ("Rotate object 15 degrees counterclockwise", "Alt+Left Arrow"): "Option+Left",
    ("Insert an equation", "Alt+="): "Option+=",
    ("Select to the end / beginning of a paragraph", "Ctrl+Shift+Down / Up"): "Cmd+Shift+Down / Cmd+End Cmd+Shift+Up",
    ("Move up / down one paragraph", "Ctrl+Up / Down"): "Cmd+Down / Cmd+End Cmd+Up Cmd+Up",
    ("Promote a paragraph", "Alt+Shift+Left Arrow"): "Option+Shift+Left",
    ("Demote a paragraph", "Alt+Shift+Right Arrow"): "Option+Shift+Right",
    ("Move selected paragraphs up / down", "Alt+Shift+Up / Down"): "Ctrl+Shift+Down / Cmd+End Ctrl+Shift+Up",
    ("Open the Find pane", "Ctrl+F"): "Cmd+F",
    ("Open the Replace dialog", "Ctrl+H"): "Ctrl+H",
    ("Repeat the last Find", "Shift+F4"): "Shift+F4",
    ("Open the Font dialog box", "Ctrl+Shift+F"): "Cmd+Shift+F",
    ("Increase the font size", "Ctrl+Shift+>"): "Cmd+Shift+.",
    ("Decrease the font size", "Ctrl+Shift+<"): "Cmd+Shift+,",
    ("Switch case (lower, UPPER, Capitalize)", "Shift+F3"): "Shift+F3",
    ("Underline", "Ctrl+U"): "Cmd+U",
    ("Italic", "Ctrl+I"): "Cmd+I",
    ("Subscript", "Ctrl+="): "Cmd+=",
    ("Superscript", "Ctrl+Shift++"): "Cmd+Shift+=",
    ("Remove manual character formatting", "Ctrl+Space"): "Cmd+Space",
    ("Center", "Ctrl+E"): "Cmd+E",
    ("Justify", "Ctrl+J"): "Cmd+J",
    ("Align left", "Ctrl+L"): "Cmd+L",
    ("Align right", "Ctrl+R"): "Cmd+R",
    ("Move the slide up / down", "Ctrl+Up / Down"): "Cmd+Down / Cmd+Up",
    ("Move the slide to the beginning", "Ctrl+Shift+Up"): "Cmd+Shift+Up",
    ("Move the slide to the end", "Ctrl+Shift+Down"): "Cmd+Shift+Down",
    ("Start in Presenter View", "Alt+F5"): "Option+F5",
    ("Collapse / expand the ribbon", "Ctrl+F1"): "Cmd+F1",
    ("Show or hide guides", "Alt+F9"): "Option+F9",
    ("Show or hide the grid", "Shift+F9"): "Shift+F9",
    ("Search (Tell me)", "Alt+Q"): "(none)",
    ("KeyTips", "Alt or F10"): "Alt",
    ("File", "Alt+F"): "Alt F",
    ("Insert", "Alt+N"): "Alt N",
    ("Design", "Alt+G"): "Alt G",
    ("Transitions", "Alt+K"): "Alt K",
    ("Slide Show", "Alt+S"): "Alt S",
    ("View", "Alt+W"): "Alt W",
    ("Start from the beginning", "F5"): "F5",
    ("Start from the current slide", "Shift+F5"): "Shift+F5",
    ("Next animation or slide", "N, Enter, Page Down, Right, Down, Space"): "n",
    ("Previous animation or slide", "P, Page Up, Left, Up, Backspace"): "PageDown p",
    ("Blank black / white slide", "B or . / W or ,"): "b",
    ("Go to slide number", "number, Enter"): "3 Enter",
    ("Pen / arrow / eraser pointer", "Ctrl+P / Ctrl+A / Ctrl+E"): "Cmd+P / Cmd+L Cmd+A / Cmd+E",
    ("Laser pointer", "Ctrl+L"): "Cmd+L",
    ("Erase annotations", "E"): "e",
    ("Hide the pointer", "Ctrl+H"): "Ctrl+H",
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shortcuts-powerpoint.csv")
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["section", "action", "windows_keys", "macos_keys", "status", "test", "notes", "source", "retrieved"])
    w.writerows([x[:3] + [MAC.get((x[1], x[2]), "")] + x[3:] for x in R])
from collections import Counter
print(len(R), "rows", dict(Counter(x[3] for x in R)))
