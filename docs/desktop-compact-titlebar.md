# Compact desktop title bar (0.3.2 candidate)

On Linux/X11, Options > Window > Use a custom title bar puts the window title or document tabs, Quick Access and command-search entry in one 36-pixel band. It is an opt-in preference and applies to new windows. Turn it off to use the system frame for subsequent windows. The default remains the native frame.

Windows, macOS, Wayland and unknown display backends automatically retain their native frame, including when a profile contains the custom preference. They have not been qualified for this feature. There is no interface-size preference; the interface follows system scaling, independently of document zoom.

## Behavior and safety

The native [Window Controls Overlay](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar) supplies the window buttons; the app does not draw HTML window controls. The shell reserves the Window Controls Overlay safe area and provides draggable space; interactive controls and document-tab dragging are excluded from that region. Default separate windows, optional document tabs and the optional Home tab retain their existing navigation behavior.

Save, Undo and Redo use the current editor's original Header events and disabled/visibility state. This preserves Redo-as-Repeat rather than assuming every editor uses the same SDK call. A shell action names its expected document; the main process rejects stale ownership, unready, closing, busy or moving documents, authenticates the shell main frame and restores native focus to that exact editor.

Search opens the same command-search widget and command index already provided by the editor, including its existing Alt+Q handler. It is temporarily placed below the compact band; it is not replaced by document Find. Editors without that command-search widget, such as the PDF viewer, retain their original Find control and disabled state. Deferred upstream title-bar setup is observed before moving the actual widget. Returning a live editor to a native-frame owner restores its title row, layout height and original search node and methods. SDK, document identity, undo history and recovery state are retained.

The document view starts at 36 pixels in compact mode, including empty Home. Native windows keep their existing 0/44-pixel layouts. Review capture accepts only these three exact heights and retains ownership, visibility, revision, opacity and pixel-scale validation. Composite client captures exclude native window controls; the isolated Linux qualification also records the actual private display.

This feature adds no network operation. The separate release-notice preference and its privacy policy are documented in [release notices](desktop-release-notice.md).

## Failure recovery

A failed compact constructor, initialization or shell navigation gets one native attempt. A missing or throwing runtime overlay API uses the same recovery path. The current preference is turned off and saved, and the failed capability stays disabled for subsequent windows in that process.

Recovery waits for file operations, editor startup and close/move boundaries. It keeps the registered owner and existing document WebContents, ids, SDK objects and dirty state; it does not reopen documents. Placement and window visibility/maximization follow the previous window. The retired shell loses authorization, while Main follows the replacement window. Normal native close still starts its existing write barrier synchronously.

Concurrent failures share one recovery promise. A second native failure never starts a retry loop or justifies destroying live documents: construction/attachment failures retain the original live views, while an unavailable native tab shell retains those views inside the native frame with their existing editor/File surface. Empty failed startup cleans its partial windows and reports failure. These secondary failures are logged without document content.

## Verification and boundaries

Tests cover frame policy and backend fallback, authenticated actions, stale selection, attach/bounds rollback, exact capture pixels at several scales, bounded state, real DOM command/search restoration and deferred search setup. Tests use a mocked release API.

Actual source Electron runs under a private authenticated Xvfb and Openbox. Native pointer checks include drag, minimize, maximize/restore, resize and clean saved-document close; actual Word checks include command search, Undo/Redo, writing a public DOCX and moving the same editor between compact/native owners. Theme, language and tab-mode receipts are kept separately from component-browser checks.

Windows/macOS GUI behavior, Wayland, installed packages and other window managers remain unverified. No cross-platform qualification is inferred from screenshots or pure policy tests. The source-only unit suite's existing builder skips remain disclosed in the task handoff.

Portable source test entry points:

    node --test --test-concurrency=2 tests/desktop/*.test.cjs
    EO_PLAYWRIGHT=<module> EO_CHROMIUM=<browser> node tests/desktop/compact-editor.cjs <new-output-folder>
    EO_PLAYWRIGHT=<module> EO_CHROMIUM=<browser> node tests/desktop/compact-shell.cjs <new-output-folder>
    python3 tests/desktop/tabs-native.py --suite compact

The native runner uses the existing EO_NATIVE_WORK, EO_PRODUCT_ROOT, EO_ELECTRON, EO_PLAYWRIGHT, EO_XVFB and EO_NODE environment plus extracted EO_OPENBOX_ROOT, EO_XDOTOOL and EO_XDO_LIB. Optional test-only EO_COMPACT_LOCALE=en|fr, EO_COMPACT_THEME=light|dark and EO_COMPACT_TABS=1 choose the fixture's language, UI preference and additional tab cases. They are not application flags.

## Header icon alignment

The native editor header centers its document-type icon in the full-height logo box using flex alignment. This removes the inherited inline logo placement that put its center four CSS pixels above Save, Undo, Redo and the document title. Compact mode already uses centered flex controls. The desktop-only adapter leaves hosted editor styling unchanged.

The isolated Linux regression in tests/desktop/header-alignment-native.cjs measures actual rendered centers for Word, Cell, Slide and PDF in native and compact modes, light and dark. Each visible icon/control center must differ by at most one CSS pixel. Actual macOS and Windows rendering remains unverified until an owner test window.
