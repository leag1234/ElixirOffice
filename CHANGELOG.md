# Changelog

## Desktop 0.3.0

### Added

- Multiple document tabs and live detach/move between windows, including keyboard-accessible move commands.
- Document the independently maintained Arch Linux AUR package.

### Fixed

- Declare audited ALSA, GBM and GL dispatch runtime dependencies in the Linux DEB.

- Clarify Options, Rename and recovery dialogs; preserve document-scoped save and close decisions.
- Wait for document-engine readiness before installing discovered computer fonts.
- Refine macOS app and DMG artwork, including small icon representations.
- Preserve ODS embedded chart caches and worksheet identities; correct CBC padding for protected ODF exports.

### Qualification

- Record the final DEB installation/dependency evidence separately from native startup; container namespace restrictions and diagnostic host-helper differences remain disclosed.
- Record exact recovered AppImageUpdate tool pins; a moving URL remains an unproven explanation for the earlier mismatch.

- Record matched full/PDF runtime qualification, Linux X11 tab scope and outstanding physical Windows tab checks.
- Modern LibreOffice 26.8 encrypted ODS remains unsupported. Strict ODF 1.3 checks fail identically on old/new exports declaring 1.2; no regression shown, normative ODF 1.2 validity unmeasured.

## Desktop 0.2.4 beta (2026-10-20)

### Fixed

- Windows saving: retry every file step within a short limit; a locked leftover backup copy no longer turns a completed save into an error; clear guidance (edits stay open, use Save As) when a file cannot be replaced. [#8](https://github.com/leag1234/elixiroffice/issues/8), [#12](https://github.com/leag1234/elixiroffice/issues/12)
- Add local diagnostics for save problems with an explicit "Copy diagnostics" action (no paths or content).
- Make the Quick Access toolbar buttons clearly visible in the Classic Light theme and stop the page shadow from darkening while typing. [#13](https://github.com/leag1234/elixiroffice/issues/13)
- Hide the print status panel while the system print dialog is open.

## Desktop 0.2.3 beta (2026-10-19)

### Fixed

- Debian/Ubuntu package: install the Electron sandbox helper with the permissions needed on systems that restrict unprivileged user namespaces (Ubuntu 24.04 and later), so the application starts. [#19](https://github.com/leag1234/elixiroffice/issues/19)
- README: Windows and macOS download links on separate lines. [#20](https://github.com/leag1234/elixiroffice/issues/20)

### Changed

- All other installers are rebuilt from the 0.2.2 application source with the new version number.

## Desktop 0.2.2 beta (2026-10-19)

### New

- Improve Arabic, Hebrew and Urdu right-to-left Home layouts and add light/dark Home appearance.
- Improve local use of installed fonts and PDF font selection; add small Arabic/Urdu and Sinhala fallbacks.
- Add six localized desktop-template variants, with installed-font requirements and English fallback for East Asian variants.

### Fixed

- Address Windows repeated-save and AutoRecover failures, with bounded retries and a verified-backup fallback. [#8](https://github.com/leag1234/elixiroffice/issues/8)
- Improve Windows per-user/registered font discovery and tolerance of unreadable fonts. [#9](https://github.com/leag1234/elixiroffice/issues/9)
- Keep the Word zoom track clear of its plus button. [#2](https://github.com/leag1234/elixiroffice/issues/2)
- Wait for the prepared PDF before native printing and preserve vector text and shapes.
- Complete Save As for untitled documents from File > Close; wait for saving to finish and keep the document open if saving fails or is cancelled.
- Make the full Browse area clickable and keyboard accessible.
- Improve Options, picture-layout and formula-wizard focus; label dialogs for accessibility, pause feature tips around dialogs and translate existing password-choice labels and warnings.
- Reduce duplicate desktop menus and expire informational notices without hiding errors or warnings.

### Security

- Harden the document converter: archive limits and integrity checks, no external XML entities or network access, SVG images limited to embedded and same-document content, stricter EPUB checks, and failed embedded archives no longer produce partial output. Archives with path-escaping members are cleaned rather than rejected; strict rejection is planned for 0.2.3.

### Known limitations

- Multiple document windows are not implemented. [#7](https://github.com/leag1234/elixiroffice/issues/7)
- Physical-printer output, older-Linux print compatibility, and native Windows save/font fixes still need confirmation.
- Local PDF editing, AutoRecover and page reordering remain limited; some right-to-left table conversions and Arabic/Urdu/Sinhala PDF text extraction remain imperfect.
- Arabic picture-menu and other translation gaps, font-dependent templates, ODS embedded-object loss, and unsigned installers remain as described in the release notes.
- A small “Waiting for your choice” status panel stays visible while the system print dialog is open; improving it is planned for 0.2.3.


## Desktop 0.2.1 beta (2026-10-16)

### Fixed

- Opening files no longer fails after a settings write error or an unreadable recent file (including network-share and OneDrive paths) with a misleading "open elsewhere" message (GitHub #4).
- Computer fonts on Windows tolerate unreadable font files (GitHub #4).
- Office-style file shortcuts work in open documents: Ctrl+N/O/S/P, Save As with F12 on Windows/Linux or Command+Shift+S on macOS. Word's Ctrl+Shift+S, Ctrl+Shift+E and Ctrl+Q remain available to the editor (GitHub #6).
- The desktop app no longer shows the browser-only keyboard notice (GitHub #3).
- A "Cancelled" message no longer stays at the bottom of the window (GitHub #2).
- Dialogs show the ElixirOffice product name.

### Changes
- Saving and exporting show progress, can be cancelled where possible, and end with a "file ready" message with Open and Show in folder.
- Save As has a new dialog that lists every format with a short description, followed by the system dialog to choose the folder and name.
- When you close a document with unsaved changes, ElixirOffice asks, as Word does, whether to save the changes to the named document: Save, Don't Save or Cancel.
- PDF pages can be rotated, and Arabic blank templates use upright text.
- About identifies the application version, build number and source revision on every platform.
- Package versions are distinct and ordered for upgrades.

### Security

This release includes security fixes for the server version and for links in documents.

- Hosted/server hardening: downloads retain network filtering when JWT authentication is disabled, require verified WOPI token metadata and reject mismatched signed URL fields; unsigned URLs receive no outbox credentials. AI proxy authentication and destination checks are strengthened.
- Hosted/server and editor text handling: WOPI conversion status and /baseurl output are escaped or plain text; privileged cache hashes are validated under the C locale; spreadsheet Formula Wizard values are encoded.
- Document links use an explicit scheme allowlist across main, mobile, embed and forms interfaces, including diagrams. Bare www. targets receive http://; unsupported relative document links show a non-opening warning. Forms integrator-config relative links retain their configured-origin behavior.
- Imported tracked font/style names are encoded in the Review panel.

Upstream security-fix attribution: server download/WOPI commits [a82922ed](https://github.com/ONLYOFFICE/server/commit/a82922ed2349d06495bfb85bed924be17fb71740), [fba41289](https://github.com/ONLYOFFICE/server/commit/fba41289d55fee1a90d34df41fa115b7de8f4f1d); AI proxy commits [ae8eb764](https://github.com/ONLYOFFICE/server/commit/ae8eb764354f75539fbb3c1ca12e0d967d02cdf0), [b98384e6](https://github.com/ONLYOFFICE/server/commit/b98384e6524fbc0376c8db4332ca0398e00abf67); WOPI text commit [4927e10d](https://github.com/ONLYOFFICE/web-apps/commit/4927e10d44b9f9f2ee6f9656d96be4a950fdd707). Only code hunks dated before 2026-05-14 were ported; original licence headers are retained. Base-URL, cache, Formula Wizard, hyperlink policy and Review-panel corrections are ElixirOffice changes.

Further converter hardening and explicit per-document confirmation before running macros are planned for desktop 0.2.2 and server 0.1.2. A separate execution realm for macros remains an architecture backlog item. The 0.2.1 build retains its existing converter runtime; the source branch and regression results do not certify the later rebuilt converter.

