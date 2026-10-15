# ElixirOffice 0.2.0 beta (desktop)

**Draft for review. No final beta 3 packages have been built or approved. Final source revisions, runtime pins, checksums and platform acceptance will be filled after the build gates.**

ElixirOffice is a free and open source office suite (AGPLv3) for documents, spreadsheets and presentations, with the Office ribbon, menus, dialogs and keyboard shortcuts. It is derived from Euro-Office and ONLYOFFICE Docs.

This update adds local PDF viewing, annotations, ordinary forms, printing and edited-PDF copy export, plus password-protected Office and OpenDocument files. It also includes desktop Options controls for computer fonts and the newer rename and Save a copy folder workflows. Editing and conversion use the bundled WebAssembly engine without a document server. AI remains off by default.

Desktop release tag: `v0.2.0`, marked as a pre-release; application version `0.2.0`. The server has separate numbering: `0.1.1` for beta 1.1.

The server release is separate; desktop changes here do not establish a new server package. See the separate server packages in the [release history](https://github.com/leag1234/elixiroffice/releases).

This is a beta: keep backups of important files and check saved documents and PDF output before sharing them.


## Downloads

| Platform | File | Installation |
| --- | --- | --- |
| Linux x86_64 | `ElixirOffice-0.2.0-x86_64.AppImage` | Make executable and run. |
| Linux x86_64 Flatpak (planned) | `ElixirOffice-0.2.0-x86_64.flatpak` | Pending build and sandbox acceptance; user installation. |
| Linux external update metadata (planned) | `ElixirOffice-0.2.0-x86_64.AppImage.zsync` | Used by AppImageUpdate; not an installer. |
| Debian/Ubuntu x86_64 | `ElixirOffice-0.2.0-linux-amd64.deb` | Install with your package manager. |
| Windows x64 | `ElixirOffice-0.2.0-win-x64.exe` | Run the installer and choose an installation directory. |
| macOS Apple Silicon arm64 | `ElixirOffice-0.2.0-mac-arm64.dmg` | Open the image and drag ElixirOffice to Applications. |

The release also includes `SHA256SUMS`, `BUILD-INFO.json` (exact source revisions) and the corresponding source archive. Check the downloaded files against the supplied checksums.

## SHA-256

Pending build. Do not use beta 2 checksums for this update. Final `SHA256SUMS` will cover the actual approved packages, matching AppImage `.zsync`, public build information, release notes and corresponding source archive.

## Install

### Linux

The AppImage uses the Chromium sandbox when unprivileged user namespaces are available. If they are unavailable, it falls back to running without that sandbox and prints a warning to standard error. The .deb and Flatpak use a sandboxed launch without this fallback. Editors load bundled local content; editor network access is blocked by the local content security policy. Optional, explicitly configured remote AI is separate from local editor content. Native Linux acceptance is pending.

Planned for this release: users may check for AppImage updates with the external [AppImageUpdate tool](https://github.com/AppImage/AppImageUpdate). ElixirOffice itself does not check for or download updates. The external tool contacts GitHub when the user starts an update check. The matching `.zsync` file will be supplied alongside the AppImage.

For the AppImage:

```sh
chmod +x ElixirOffice-0.2.0-x86_64.AppImage
./ElixirOffice-0.2.0-x86_64.AppImage
```

If FUSE is unavailable, use:

```sh
./ElixirOffice-0.2.0-x86_64.AppImage --appimage-extract-and-run
```

Flatpak is planned alongside these packages. After an accepted build, install with `flatpak install --user ElixirOffice-0.2.0-x86_64.flatpak`. Its runtime dependencies must already be available or installed from a trusted repository; the single-file application bundle is not a dependency-free offline installer. Exact runtime and sandbox behavior remain pending the Flatpak gates.

For Debian/Ubuntu:

```sh
sudo apt install ./ElixirOffice-0.2.0-linux-amd64.deb
```

### Windows

Run the x64 installer. It has no publisher certificate, so Windows may show an unknown-publisher or SmartScreen warning. If you trust the download, “More info” and “Run anyway” may be available. Smart App Control or an administrator policy may block installation; do not disable system protections.

### macOS

Open the arm64 DMG and drag ElixirOffice to Applications. This build supports Apple Silicon only. It is ad-hoc signed, without a Developer ID certificate, and is not notarized. The ad-hoc signature seals the bundle but does not identify a trusted publisher.

Gatekeeper may block opening the app. If you trust the download, use the per-app “Open Anyway” option in System Settings > Privacy & Security where available. See [Apple's instructions](https://support.apple.com/en-us/102445).

### Check the download

On Linux, run `sha256sum <downloaded-file>` and compare the result with the matching entry in `SHA256SUMS`. On macOS, run `shasum -a 256 <downloaded-file>` and compare the result with the matching entry. On Windows, use PowerShell `Get-FileHash <downloaded-file> -Algorithm SHA256`.

Checksums detect corruption; they do not authenticate the publisher.

## Changes since beta 2

- Open PDFs locally, search/select/copy text, navigate pages, add comments/annotations and fill ordinary forms; print and export an edited PDF copy. Office-document-to-PDF export was already available in beta 2. Embedded PDF scripts and URI actions are disabled.
- Open encrypted DOCX, XLSX, PPTX, ODT, ODS and ODP with a masked password dialog. Save retains the password; Save As offers Keep, Change and Remove, with explicit confirmation before removing protection. The normal Protect command can encrypt a local document on save.
- Disable AutoRecover for the entire session of a password-protected document, even after removing its password. Unprotected PDF exports require explicit consent. Passwords are not stored in application preferences or recovery copies. Earlier plaintext files and historical backups are not erased.
- Desktop Options shows computer-font permission status and an enable/disable control. Enabling asks for permission; disabling clears the cached list and asks you to save and reopen to use only bundled fonts.
- Rename documents and choose a destination folder for Save a copy in supported storage; desktop rename uses the native destination dialog. Browser-selected originals remain unchanged when a downloaded copy is produced.

Offline Help and its recent startup fixes are included. These Help fixes were already present in the published beta 2 build; they are retained here rather than claimed as a new beta 3 fix.

**Conditional before finalization:** if G1b is integrated and accepted, add the supported original-PDF Save behavior and exact preservation/unsupported-input limits here. Until then original PDF Save is disabled; copy export may lose metadata/bookmarks and invalidate signatures, with a warning. Do not advertise the preliminary preservation experiment as released.

## Known limitations

The following features are not available offline:

- Mail merge.
- Document compare/combine.
- Version history.
- Editing original PDF text, OCR and PDF-to-DOCX conversion.
- Plugins and macros.
- Digital signatures.
- External workbook links and their refresh.
- Real-time co-editing.

AI is available only in the desktop Word editor. A configured remote AI service requires a network connection; local document editing and conversion do not.

Password support is limited to the six formats listed above, with a nonempty password of at most 255 UTF-16 code units. Encrypted PDF support, signed/XFA PDFs and advanced PDF preservation are not established by this draft. Unsupported protected inputs must not silently become editable plaintext.

The prior beta 2 Windows installer was verified on real hardware on earlier builds only. Native Windows acceptance for this update is pending.

macOS supports arm64 Apple Silicon only. The app is ad-hoc signed and not notarized. Native macOS and Linux packaged acceptance for this update is pending; prior release receipts do not establish these packages' acceptance. Downloaded-app Gatekeeper behavior remains unverified.

Physical printing has not been tested. Prior source-stage Linux print-dialog Cancel is not a physical printing result.

Complex formatting, fonts and embedded objects can still show conversion differences. Check round trips and PDF output with your own documents.

## Source code and licence

ElixirOffice is released under the GNU Affero General Public License v3.0. Product source is at [github.com/leag1234/elixiroffice](https://github.com/leag1234/elixiroffice); the modified components are listed in its README. The release's build information identifies the exact source revisions. Third-party licences and attributions are included in the application and source notices.

ElixirOffice is not affiliated with or endorsed by Microsoft, Ascensio System SIA or the Euro-Office project. Microsoft, Word, Excel and PowerPoint are trademarks of Microsoft Corporation.

## Reporting bugs

Open an issue at [ElixirOffice GitHub Issues](https://github.com/leag1234/elixiroffice/issues) with the release name, operating system and architecture, what you did, what you expected and what happened. Include relevant error messages; a screenshot helps.

Attach a small synthetic or anonymized example only if it contains nothing private. Never attach API keys, passwords or configuration containing secrets. For conversion problems, include the input and output formats and explain which content changed. Reports about behavior that differs from Word, Excel or PowerPoint are welcome too.
