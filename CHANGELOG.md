# Changelog

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

