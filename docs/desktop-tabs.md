# Desktop document windows and optional tabs

The 0.3.1 source candidate opens each document in its own window by default (mode A). An empty startup window is reused for its first document. File > Options > Window offers **Open documents in tabs** (mode B) and **Show Home tab** (mode C); both default to off. The Home choice is available only with tabs, and its stored choice is retained when tabs are disabled. Changes route future opens and new documents without moving or rebuilding existing editors. A window already holding tabs keeps them when the preference changes.

Startup and the last File > Close show the full-window start page. Optional Home in mode C opens the existing File > Home content without allocating another document, discarding edits or consuming another capacity slot. File > New chooses another type or a template. Ctrl/Cmd+N creates a blank of the current family; the tab-strip plus does the same. Opening a file already open focuses its existing window/tab, including a hard-link alias. The OS-open completion must not focus the caller over that existing owner.

Activating a tab hides sibling document views and raises the already attached selected native view without first removing it. Each document retains its edits, destination, password state, recovery copy and saved-file actions while another document is active.

The app allows up to 16 document views across all its windows, including an empty start view. The optional Home affordance is not another document. Close a tab before opening another when the limit is reached. A refused open shows a message and leaves the source file and existing edits unchanged; startup file-open requests are also bounded.

The close button, Delete while a tab is focused, File > Close and Ctrl/Cmd+W close the selected document. Windows/Linux also support Ctrl+F4. A modified document offers Save, Don't Save and Cancel. A cancelled or failed save keeps that document open. Closing a window or quitting checks documents in order and stops on Cancel. A document already closed by an earlier Don't Save choice stays closed after a later Cancel; that choice is not undone. If a save acknowledgement does not arrive within 30 seconds, a message says that saving may still complete, leaves the document open and aborts that close attempt. The timer is paused while an untitled document's native destination chooser is open and restarts after a destination is selected. A running save keeps its own write protection, and a late reply cannot close the document. The last File > Close returns to Home on all platforms. Closing the native window still closes that window after the same checks. Cancellation cleanup finishes and releases its write barrier before retained Home can start new writes. Editing and ribbon shortcuts continue to reach the active editor.

Save As, rename and exported copies cannot select a destination owned or reserved by another tab. An external file change still requires a new destination. AutoRecover restores a separate copy with its own recovery identity; locking one document's password removes only that document's recovery copy. PDF export and Print wait for pictures still being imported into that document. Only one native print job can run at a time across all tabs and windows. A concurrent request is refused until cleanup completes; each helper keeps the window of the document that started it.

Drag a tab outside its window to open it in a separate window. Drag it onto another open window's tab strip to move it there. File > Move document, the Move document button and the focused tab's Shift+F10 menu provide keyboard-accessible alternatives. The same editor stays alive, retaining edits and undo history. An empty source window closes on Windows/Linux; macOS opens Home when fewer than 16 document views exist. At the global cap, macOS keeps the source window empty instead of allocating a seventeenth placeholder. A document cannot move while it is opening, saving, closing or waiting for a dialog. Rejected actions show an error while leaving the document open.

Current drag limitation: pressing Escape during a drag outside a window can still detach the tab. The same document remains open in the resulting window; use Move document to bring it back.

The system window frame is the default. Options exposes the custom-title-bar preference and allows an existing preference to be disabled. Custom title bars remain unavailable on unqualified platforms, which continue to use their system frame.

## Current qualification

The 0.3.1 navigation slice has separate test-first main-process, layout, Options and all-45-locale coverage. Its updated last-close tests retain the original save/recovery/rollback assertions and explicitly verify that new writes work after cancelled-save cleanup. Existing tab-specific fixtures select mode B explicitly; default A has its own multi-window and global-cap tests. This source candidate is not rebuilt-package acceptance. Native macOS/Windows, custom titlebar and physical scaling remain unverified for this slice. The earlier Linux tab probes below describe their original 0.3.0 evidence until rerun against the revised behavior.

The interface follows operating-system display scaling and text size by owner decision (issue36). There is no separate Interface size preference; document zoom remains independent.

Automated source tests cover sender authorization, document isolation, destination ownership, close attempts, Windows save retry/rollback cleanup, recovery, routing and per-key language fallback. A private Linux X11 runtime checks two real editors, native keyboard input and Save/Don't Save/Cancel dialogs, output, pending pictures, print cancellation, menus, shortcuts and Options. The shared desktop harness selects editors by exact document identity rather than browser page order, retains observations across every document and shell page in the app's shared browser context, and observes later pages as they appear.

Physical Windows confirmation of document-view stacking, plus macOS/Wayland, native OS launch and chooser transport, physical printers, complete desktop shortcut/context-menu sweeps, translated tab UI and custom title-bar overlays require further qualification. Missing translations use English per key without changing the selected language or direction. Native drag-out/back and the move menus are checked on Linux X11 at display scale 1, without a window manager. Drag behavior on other platforms, compositors and display scales remains unverified.

## Repeating the Linux native check

The tests/desktop/tabs-native.py runner starts its own Xvfb with a mode-0600 authorization cookie and TCP disabled and closes only its own child processes. It requires Python 3 with Pillow, X11/XTest libraries, Poppler, Node, Playwright Core, a sandbox-capable Electron executable and prepared desktop assets. Provide absolute paths through EO_PRODUCT_ROOT, EO_NODE, EO_PLAYWRIGHT, EO_ELECTRON and EO_XVFB; set EO_NATIVE_WORK to a new output directory. Run python3 tests/desktop/tabs-native.py. The output includes results, failure diagnostics when applicable, source-runtime limits and process cleanup status. SIGTERM/SIGINT trigger cleanup of the two owned Linux sessions, including their live descendants; unrelated sessions are excluded. The script refuses to reuse an existing output directory and does not disable the Electron sandbox.


Run the same private-display runner with --suite detach for the two-window Word/spreadsheet probe. It checks live editor identity, independently dirty documents, native Save As and Cancel routing, Shift+F10, real XTest drag-out/back, File and strip move commands, modal keyboard focus, undo/redo and visible failure feedback. Its serialization comparison is diagnostic: the SDK writes a new core modification timestamp on every serialization. The probe requires a no-move control and compares every other byte after structurally locating that single timestamp. Raw byte equality and file-format fidelity are not established by this diagnostic.

The private-display runner also accepts --suite navigation for the 0.3.1 A/B/C source smoke. It uses the actual main process and editors; native keyboard/dialog/window-manager and installed-package acceptance are separate checks.

## Window placement and tab state (0.3.1 source candidate)

Document windows remember their normal size, position and maximized state.
New windows reuse that size with a small cascade. Restoring a window clamps its
entire frame to a current display work area, including when a monitor was removed
or its resolution changed. Valid positions on monitors to the left remain valid;
minimized and fullscreen geometry are not saved. Window state belongs to the
app's local preferences. Closing flushes the latest normal state even if the
window was minimized before its move/resize debounce finished. Screenshot capture
mode does not persist geometry into its disposable profile.

In tab modes B/C, each filename has the shared Fluent document, spreadsheet,
presentation or PDF icon. A separate dot indicates edits not yet saved; the
accessible label includes the translated unsaved state in all45catalogs. Filenames,
keyboard navigation, close buttons and drag ownership retain their existing paths.

Successful opens finish without a floating Opened notification. Their accessible
completion announcement and File operation details remain available. Opening/PDF
progress, errors, warnings, print submission and saved-file Open/Show actions keep
their existing behavior; dismissible information still pauses its expiry while
hovered or focused.

Source checks cover invalid settings, multiple display layouts, actual main
persistence/close, capture isolation, tab type/dirty accessibility and precise
feedback visibility. The private Linux source probe also moves/resizes a real
window, creates another with the expected cascade, observes a real SDK edit,
checks light/dark tab glyphs and reopens the profile in a fresh source process.
Normal X11 window-state checks do not establish maximized restoration under a
window manager, native Mac/Windows, physical display/DPI changes or installed-package
acceptance. Disposable edited test apps exit explicitly; normal app shutdown is
not inferred from that cleanup.

Window close explicitly awaits its caught geometry-save promise before destroying the owner, including empty owners with no usable renderer. Application Quit awaits the same barrier. A settings-write failure is logged without turning it into an uncaught rejection; it does not claim successful persistence. Fault-injection tests hold and release the real settings writer and verify the final atomic settings file.
