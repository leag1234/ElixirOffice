# ElixirOffice desktop

The desktop edition opens and converts documents on this computer with the bundled WebAssembly runtime. It needs no document server or account. The hosted edition remains server mode by default.

This preview targets Linux x64, Windows x64 (NSIS cross-built on Linux), and macOS arm64 (DMG built on the owner Mac). Native Windows acceptance still needs the owner PC or VM. The first packages have no publisher certificate; signing follows with owner certificates.

## Using the app

Start ElixirOffice and choose New document, New spreadsheet, New presentation, Open, or a recent file. You can also pass a document path on the command line, use the installed Office file associations, or drop an Office document into the app.

DOCX, XLSX, PPTX, ODT, ODS and ODP use local conversion. Save writes back to the selected file; Save As offers DOCX/ODT/RTF/TXT/PDF for text, XLSX/ODS/CSV for spreadsheets, and PPTX/ODP/PDF for presentations. Choosing the current editable format saves to a new active destination; choosing a different format exports a copy, preserving the active document and its unsaved state. New files initially use DOCX, XLSX or PPTX. Legacy DOC/XLS/PPT and RTF/TXT/CSV, DOTX/XLTX/POTX, DOCM/XLSM and PPSX imports open as untargeted DOCX/XLSX/PPTX copies. The next Save chooses a destination. Macro-enabled imports do not enable macro execution. CSV is UTF-8, comma-delimited, with the active worksheet only; its translated format warning explains the loss of other sheets and formatting.
DOCX, XLSX, PPTX, ODT, ODS and ODP use local conversion. Save writes back to the selected file; Save As offers DOCX/ODT/RTF/TXT/PDF for text, XLSX/ODS/CSV/PDF for spreadsheets, and PPTX/ODP/PDF for presentations. Choosing the current editable format saves to a new active destination; choosing a different format exports a copy, preserving the active document and its unsaved state. New files initially use DOCX, XLSX or PPTX. Legacy DOC/XLS/PPT and RTF/TXT/CSV, DOTX/XLTX/POTX, DOCM/XLSM and PPSX imports open as untargeted DOCX/XLSX/PPTX copies. The next Save chooses a destination. Macro-enabled imports do not enable macro execution. CSV is UTF-8, comma-delimited, with the active worksheet only; its translated format warning explains the loss of other sheets and formatting.

An asterisk in the active tab and window title means there are unsaved changes. Opening or creating another document adds a tab and preserves the current edits. Opening the same file focuses its existing tab. Drag a tab outside its window to detach it, or onto another window’s tab strip to join that window. File > Move document, the strip’s Move document button and Shift+F10 on a focused tab provide the same choices without dragging. Closing a modified tab offers Save, Don't Save and Cancel for that document. Closing a window checks each document in turn and stops if a close is cancelled. On Windows/Linux, closing the last tab closes its window; on macOS a new Home tab remains. Only one app instance runs per user; another file launch sends the file to that instance. See [document tabs and qualification](desktop-tabs.md).

Export PDF uses the native WebAssembly PDF writer with document fonts and images. Print submits the resulting PDF through the operating system's print dialog. Cancelling a dialog does not submit a print job.

The next desktop printing correction keeps text and shapes as vectors. It loads a private temporary PDF in a hidden helper and waits for Chromium's PDF viewer to finish loading before opening the native print dialog. Temporary files are removed after completion, cancellation or failure, and interrupted jobs are removed at startup. Readiness is limited to one minute and an unanswered print dialog to ten minutes. A helper failure leaves the editor open. Linux native Print to File checks cover Office output, a 300-page report and mixed portrait/rotated pages; native macOS, Windows and physical-printer acceptance remain pending.

Save prepares and flushes a sibling temporary file, verifies the selected original, keeps a sibling backup while replacing it, and flushes the directory on Linux/macOS. Failed replacement retains the backup and reports its path. A changed original requires Save As. This is not an interprocess file lock; avoid editing the same file simultaneously in another program. Symlink destinations/folders are refused. Files must be regular Office documents under 512 MiB; the save preserves ordinary permission bits, but does not promise preservation of extended ACLs or filesystem ownership.

## Privacy and fonts

There is no TCP document server, telemetry or automatic updater. The app serves its own privileged eoapp resource scheme inside Electron; renderer external resources and network requests are blocked. The 0.3.2 candidate adds an optional, default-on bounded GitHub release-metadata check in the main process, with an Options toggle and no document data or automatic download; see [release notices](desktop-release-notice.md). Local conversion and PDF export use packaged bytes. AI is disabled until explicitly configured. The beta2 candidate uses the native consent and transport described below; other renderer resource/network requests remain blocked.

The standard free font set and its licenses are bundled: metric-compatible office fonts, school fonts including Marelle, and UI and symbol fonts. The full set remains available as a separate build option; an optional download is not implemented yet. Computer fonts asks for consent in a native dialog before enumerating standard system and user font folders. Consent is stored once in the app's local profile. The renderer receives opaque font handles, not filesystem paths, and reads only recognized font files under those folders, capped at 20 MiB each. Recent document names and native paths are stored locally, limited to fifteen entries.

The start renderer has a strict self-only script policy, context isolation, a sandbox, and no Node integration. The existing editor bundles require inline scripts and eval/Wasm compilation; their separate resource policy permits these while retaining self-only resource connections and no object embedding. The editor iframe shares the start window's origin and can call window.parent.eoDesktop. Its bundled code is therefore inside the bridge's trust boundary: the main-frame IPC check does not isolate the editor from the parent's API. A compromised bundled editor could use the active document handle, request native dialogs, or select a previously authorized recent file. The bridge exposes no arbitrary filesystem read/write API; document saves and PDF exports require the active opaque handle, and computer fonts require consent. CSP permits unsafe-inline, unsafe-eval and wasm-unsafe-eval for the editor; the shell has neither inline nor eval permission. Frames are self-only, media is disabled, and blob/data remain only where required for image/font loading and local workers/conversion. Files are authorized through native selection, recent-file selection, command-line opening or an OS-backed drop.

## Linux packages

Build outputs are `desktop/dist/ElixirOffice-<version>-linux-x86_64.AppImage` and `desktop/dist/ElixirOffice-<version>-linux-amd64.deb`.

Arch Linux (community package, not maintained by the ElixirOffice project): install with `yay -S elixiroffice-bin` or `paru -S elixiroffice-bin`. It repackages our released .deb; see the [AUR package page](https://aur.archlinux.org/packages/elixiroffice-bin). Report packaging problems on that page and application issues [here](https://github.com/leag1234/elixiroffice/issues).

Make the AppImage executable and run it. Systems without FUSE support can extract it with `--appimage-extract` into a writable folder and run `squashfs-root/AppRun`. Chromium's sandbox needs a supported user-namespace or sandbox configuration; do not add `--no-sandbox` as a workaround.

Packages include the upstream and font licences and attribution. Before third-party distribution, the owner supplies the corresponding AGPL source and its publication location; the current review artifacts have not been published.

The Debian package installs under `/opt/ElixirOffice`, adds an Office desktop launcher and MIME associations, and declares GTK/NSS/desktop library dependencies. Package installation is a user/admin action. Tests extract the package into an isolated folder and do not install it on the test desktop.

## Windows installer preview

The cross-built output is `desktop/dist/ElixirOffice-0.1.0-win-x64.exe`. It contains a Windows x64 application; the NSIS installer bootstrapper is x86. The configured interactive installer offers a destination choice and nine Office file associations, and includes an uninstaller. Actual Windows registration, install/uninstall and native workflows have not been tested on a Windows PC or VM.

The preview is unsigned: no Authenticode certificate is embedded in the application or installer. Expect the operating system's unsigned-publisher/SmartScreen handling; signing is a later owner action. The installed app uses the same standard fonts, local conversion, resource/network policy and reduced multilingual help as the accepted Linux preview. The shared ODS/PDF issue and measured Linux startup limits remain disclosed; no Windows startup measurement is claimed.

For a fresh cross-build, follow the same resource/font/theme instructions below, set `DESKTOP_TARGET=windows`, `WINDOWS_BUILD_CACHE` to a new isolated cache outside the source worktree, and `WINDOWS_BUILDER_IMAGE=electronuserland/builder@sha256:b226b27b1a7e95ad25eb3d6414ea90c56c04eb6d8329967f4d721dce50b989ff`. Run `bash tools/desktop/build.sh` with a fresh `desktop/assets` directory. The Windows path invokes `tools/desktop/windows.sh`: it verifies assembled resource hashes, runs the pinned npm lockfile/unit tests in the Wine builder container, then produces x64 NSIS. For resources already assembled and verified, run `bash tools/desktop/windows.sh` with those two variables.

The builder image supplies Node22.22.2 and Wine11 and runs as the invoking user. Only the isolated worktree and cache are mounted; no home directory, .env, SSH keys, Docker socket or signing credentials are forwarded. The image is pinned by digest and is development-only; its 6.32GB is not shipped. The host needs Python/Pillow and Docker, not a system Wine installation. The failed smaller Wine bundle and toolchain choice are documented in [the cross-build decision](decisions/2026-10-11-windows-cross-build.md).

After building, set `ELECTRON_BUILDER_CACHE=$WINDOWS_BUILD_CACHE/builder-cache` and run `node tools/desktop/check-windows.cjs desktop/dist /absolute/new/acceptance-folder`. It verifies the actual NSIS archive, extracts its x64 payload, checks all resource hashes/licences, PE architecture/product/version/icon/certificate metadata, byte equality with the unpacked application, source equality and installer configuration. It does not install or launch Windows.

The final artifact check passed both17896resource hashes and all17970payload files, with44static help animations and preserved active help/locales/Chromium licences. Exact artifact size/digest and the final real runs are in the Windows handoff. Native Windows acceptance remains **unverified**: install/uninstall, file associations/double-click and file URI, native dialogs/drop, six-format edit/save/reopen, PDF/Print, dirty decisions/second instance, system-font consent, offline/no-Node/privacy, startup and SmartScreen. These must run on the owner PC/VM. A successful cross-build is not a release approval.

## macOS arm64 preview

The owner-Mac build produces `desktop/dist/ElixirOffice-0.1.0-mac-arm64.dmg`. It uses the same manifest-verified standard fonts, reduced multilingual help, editors and WebAssembly releases as Linux and Windows. It targets Apple Silicon only; Intel and universal builds are unverified. Universal packaging is deferred because a second architecture would require another runtime download, package and native acceptance.

Use one isolated folder containing the bounded source export and verified assets. Select portable Node22.23.3 in PATH; the official darwin-arm64 archive SHA256 is `23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53`. Set `MAC_BUILD_CACHE` to an isolated cache and run `/bin/bash tools/desktop/mac.sh`. The script verifies resource hashes and Node version, normalizes the cache path, installs the pinned lockfile, runs units and builds using an isolated HOME/TMPDIR. Signing identity discovery and notarization are disabled for this preview. Hardened runtime and the two explicit V8/Wasm entitlements are prepared for a later Developer ID signature; an unsigned preview has no publisher-signed hardened runtime. No signing credentials are forwarded and no system installation is performed.

Electron's macOS archive keeps its Electron and Chromium notices outside the app bundle. `mac-licenses.cjs` verifies that exact pinned archive against Electron's bundled checksums and extracts only those two notices; the image build installs them explicitly. No additional dependency is introduced.

Run `node tools/desktop/check-mac.cjs desktop/dist /absolute/new/acceptance-folder` on macOS. It verifies the DMG, mounts it read-only without browsing, copies the app into the owned acceptance folder and detaches the mount. It checks arm64 Mach-O, bundle identifier/version/category, nine declared Office associations, the generated icon, source equality, exact UTIs with Alternate rank, removal of unused privacy/ATS keys in every bundled Info.plist, prepared entitlements, both complete resource manifests and exact notices. The copied image app must match every built bundle file and symlink. This verifies declared associations, not installed LaunchServices registration.

The preview has a linker ad-hoc signature with no TeamIdentifier, Developer ID publisher signature or notarization. Downloaded/quarantined Gatekeeper behavior remains unverified; no security settings are changed or bypassed. The owner supplies Apple signing and notarization credentials later.

For native tests, `EO_DESKTOP_PROFILE` redirects the app profile even when packaged; use a fresh directory under the owned test folder. `tests/desktop/mac-package.cjs` drives the actual image app through the common CDP harness. Native sheets are operated through the Mac accessibility UI, never mocked. Stages and the owned app PID/profile are written to `results/current-native.json`. After the actual dirty-close Cancel action, the UI driver writes `results/dirty-cancel-<profile basename>.ack` containing the exact profile path; the test then verifies that the modified document remains open. This explicit synchronization does not supply a decision to production code.

Exact artifact identity, native acceptance and outstanding platform checks are recorded in the macOS handoff. Shared embedded-ODS/PDF fidelity and Linux startup limits remain open; no macOS performance result is claimed.

## macOS menus and signing preparation

The macOS application menu includes About, Settings…, Services, Hide, Hide Others, Show All and Quit. Settings shows local font consent and offers the Computer fonts dialog. Edit uses native roles, with explicitly empty Undo/Redo accelerators so the editor retains Cmd+Z and Cmd+Y. Window includes Minimize (Cmd+M), Zoom and Close (Cmd+W); Close runs the existing Save/Discard/Cancel protection. Help opens bundled offline help in a sandboxed window with external navigation blocked. The app quits after all its windows close, consistently with Linux/Windows; it does not remain running without a window. An open-file event queues only a supported Office extension.

The nine Office declarations carry their existing system UTIs and LSHandlerRank Alternate. They advertise an alternative editor without claiming default ownership. The post-pack hook removes unused camera, microphone and Bluetooth usage descriptions and the complete Electron default ATS exception dictionary from the app and helper/framework Info.plists.

EO_DESKTOP_PROFILE is honored even for packaged builds so acceptance runs can use a fresh isolated local profile without modifying the owner's normal preferences or cache. A normal launch without this override uses Electron's standard userData location. The override selects a local profile directory; it does not enable network traffic or renderer filesystem access.

Signing is prepared, **not performed in this preview**. The owner must provide Apple Developer Program membership, a Developer ID Application certificate with its private key available to codesign, its exact identity through EO_MAC_SIGNING_IDENTITY, and working Xcode/notarytool command-line tools. Notarization additionally requires explicit EO_MAC_NOTARIZE=1 and exactly one complete credential set:

- Apple ID: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD (an app-specific password), APPLE_TEAM_ID.
- App Store Connect API key: APPLE_API_KEY (path to the private .p8 file), APPLE_API_KEY_ID, APPLE_API_ISSUER.

The signing config validates presence without printing credential values; never put credentials in source, reports or command logs. Without the explicit identity builds remain unsigned even if a certificate or notary credentials happen to exist. Notarization stays off unless explicitly requested. The unsigned mac.sh deliberately clears signing/notary environment variables; a future owner-authorized signing build must invoke npm run package:mac with the required environment and credentials under the owner's control. No credentials were inspected for this build.

The configured hardenedRuntime=true uses entitlements.mac.plist with allow-jit and allow-unsigned-executable-memory for V8/Wasm. No disable-library-validation exception is included: a Developer ID build re-signs the bundled frameworks under the same identity. Actual signing, notarization, stapling and launch of that future signed build remain unverified. These options follow the pinned builder26 API; see [Electron signing](https://www.electronjs.org/docs/latest/tutorial/code-signing) and [electron-builder macOS26](https://www.electron.build/v26/docs/mac/).

## macOS manual acceptance

The lead review requests eight owner checks; the checklist groups its requested platform behaviors. Run on public disposable documents and record each result.

1. Open the arm64 DMG; verify the displayed unsigned-publisher/Gatekeeper behavior without disabling security protections. Copy/run the preview as the owner chooses; confirm About name/version and icon.
2. Use Open, an installed association/double-click, a file URI and OS-backed drop. Check all nine Office associations are alternatives, unsupported extensions are ignored, and a second file reaches the existing instance.
3. Edit/save/fresh-reopen DOCX, XLSX, PPTX, ODT, ODS and ODP; check original/backup safety and disclose the known embedded-ODS object/PDF limitation.
4. Export PDF and inspect saved text/images/fonts; invoke Print, cancel its native sheet, and confirm no job is submitted. A real print job is an owner action.
5. With unsaved changes, test Cmd+W and Quit: Cancel keeps the document, Save writes and closes, Discard closes. Opening another file also requires a discard decision.
6. Exercise App/Settings/Services/Hide/Show All, Edit/Cut/Copy/Paste/Select All, Window/Minimize/Zoom/Close and offline Help. Confirm Cmd+Z and Cmd+Y reach editor undo/redo and closing every window quits.
7. Refuse then allow Computer fonts, check layout/PDF, reopen the profile and confirm persistence. Confirm a fresh profile starts without consent.
8. Run offline: open/edit/save/export remain local, renderer Node access is unavailable and external requests are blocked. Record startup separately; no macOS performance target is claimed.

## Reproducing a build

Use an isolated DocumentServer checkout at the integrated source pins. Do not build over another session's output or a deployment tree. Node 22, Python 3 with Pillow pinned in tools/desktop/requirements.txt, Docker for font generation, dpkg-deb, and the Linux electron-builder prerequisites are required.

Before building, create an isolated Python environment with `python3 -m venv "$OUTPUT/python"`, activate it with `source "$OUTPUT/python/bin/activate"`, and run `python3 -m pip install -r tools/desktop/requirements.txt`.

1. Set `UPSTREAM` to that checkout, `FULL_RUNTIME` and `PDF_RELEASE` to the full and PDF manifest-verified release folders, and `OUTPUT` to a fresh output folder outside the source trees. Run `bash tools/desktop/compile.sh`. It installs verified runtimes, runs the SDK and themed web-app production pipelines, restores generated locale/icon changes, and prints `SDK_OUTPUT` and `WEBAPPS_OUTPUT`.
2. Set `FONT_TOOL_IMAGE` to an immutable Docker image SHA, `FONT_TOOL_ROOT` to its documentserver directory, `CORE_FONTS` and `FONT_PACK` to licensed free-font inputs, and `FONT_OUTPUT` to a fresh output folder. Run `bash tools/desktop/fonts.sh` (`FONT_SET=standard` by default; `FONT_SET=full` for a separate full-font build). The generator runs without network access and explicitly excludes system fonts.
3. Generate the presentation theme catalog with `bash tools/desktop/themes.sh`, using the same pinned font-tool image, production SDK/web-app outputs and free-font inputs. Set `THEMES` to its generated output directory.
4. Set the printed production output paths, `FONT_FILES=$FONT_OUTPUT/fonts`, `ALL_FONTS=$FONT_OUTPUT/AllFonts.js`, `FONT_IMAGES=$FONT_OUTPUT/Images`, the font-source paths (for standard builds, `CORE_FONTS=$FONT_OUTPUT/inputs/core` and `FONT_PACK=$FONT_OUTPUT/inputs/pack`, including the matching bundled notices; for a full build, retain its licensed original input paths), `PDF_RUNTIME` to the folder containing `current.json` and its versioned release, `TEMPLATES` to the directory containing the three `new.*` Office templates, and `UPSTREAM`. Run `bash tools/desktop/build.sh` with a fresh `desktop/assets` directory. Preserve or move any previous assets first.
5. The script verifies production editor/SDK bundles and all six files in each Wasm release, hashes the complete resource set into `desktop-manifest.json`, installs the pinned lockfile, runs units, and produces both Linux packages. Generated resources, dependencies and packages are ignored by Git.

Electron 44.7.0 and electron-builder 26.15.3 are pinned. Electron is required by the owner's desktop choice; electron-builder is a development-only installer builder, not a shipped runtime dependency. Resource/source hashes make input verification reproducible; installer metadata and compression timestamps are not claimed to be byte-identical across hosts. No homepage URL is included. The AppImage uses electron-builder; the Debian package uses dpkg-deb because the pinned builder requires a homepage.

## Tests and acceptance

`node --test tests/desktop/*.test.cjs` covers resource boundaries and filesystem replacement, conflicts, symlinks, size limits and backup retention.

Native GUI suites use `tests/desktop/harness.cjs`, direct sandboxed Electron spawning and Playwright CDP on an isolated local debugging port. `lifecycle.cjs` checks actual document edits, native save, fresh reopen and native saved PDFs for the six formats, plus the real file chooser and OS-backed drop. `advanced.cjs` checks templates/Save As, close decisions, the font consent bridge, external-request denial and a second instance. Native dialogs are operated through X11 keys restricted to the tested app or its transient child on the active unlocked desktop; they are not mocked.
Native GUI suites use `tests/desktop/harness.cjs`, direct sandboxed Electron spawning and Playwright CDP on an isolated local debugging port. `lifecycle.cjs` checks actual document edits, native save, fresh reopen and native saved PDFs for the six formats, plus the real file chooser and OS-backed drop. `advanced.cjs` checks templates/Save As, close decisions, the font consent bridge, external-request denial and a second instance. Native dialogs are operated through X11 keys restricted to the tested app or its transient child on the active unlocked desktop. An explicitly selected private Xvfb is also supported: EO_XVFB_PID must identify a live process owned by the test user with the exact private display argument; its process identity is rechecked before input, and per-key app/window ownership still applies. Dialog results are not mocked.

Set `EO_DESKTOP_ROOT` to an isolated test directory containing `desktop/`, public `fixtures/`, `results/`, `profiles/`, the Electron executable at `tools/electron/electron`, and Playwright at `tools/node_modules/playwright-core` (or set `EO_PLAYWRIGHT`). The Linux real-desktop harness uses DISPLAY=:0 and its own Xauthority copy. Never run it against another session's profile.

`benchmark.cjs` records five fresh-profile and five warm-profile runs each for the empty document and the public fixture named synth100.docx (97 actual pages). OS page caches remain unchanged. It measures the external spawn epoch to a renderer epoch recorded at full layout completion, polling every 100 ms, matching the prototype method. It also retains the separate harness observation elapsed time and asserts the actual page count. It samples process-tree PSS at readiness, not peak PSS. Compare with the session D prototype medians: empty 2.73 s fresh / 2.04 s warm, 97 pages 8.30 s fresh / 7.09 s warm. Do not equate fresh profiles with a cold OS cache.

An ODS fixture with two embedded charts currently loses an object in the local editor open/save pipeline and lacks a preview image needed for PDF export. The same public fixture fails in web local mode; a direct Wasm ODS-to-editor-to-ODS round trip retains both objects, so this is not attributed to the desktop worker. Reproduction and the distinct image/serialization traces are recorded in the shared ODS ticket. This remains a failing acceptance check. A conservative package guard explains that the local converter could not preserve all embedded objects and offers Cancel or Save a copy. The copy requires a different native-selected destination; the original path, hard-link aliases and the original inode after a rename are refused. This check can also warn about an intentional object deletion. The original remains unchanged, but an explicitly accepted copy may lack objects; this does not establish converter fidelity.

The installer development dependency audit reports eight moderate transitive findings; the runtime dependency audit reports zero. These installer dependencies are not shipped as runtime modules.

Superseded full-font preview acceptance on linux (2026-10-10; these are not the final standard-font packages): both extracted packages pass document argument/edit/atomic-save/fresh-reopen, native Wasm PDF with the saved edit marker, a reachable control endpoint receiving zero renderer requests, no renderer Node access, and all 18,604 packaged resource hashes plus licences. Native Print cancellation, three new templates/Save As, immediate dirty-close Cancel/Save, startup queue, legacy imports and persistent font consent also pass. Installed double-click association registration remains unverified because these tests do not install packages. ODS fidelity remains FAIL.

Five fresh-profile and five primed warm-profile measurements per document, after package extraction and GUI tests completed:

| Document | Fresh median | Warm median | Readiness PSS fresh / warm | Prototype fresh / warm |
| --- | --- | --- | --- | --- |
| Empty (1 page) | 4.661 s | 4.702 s | 518.7 / 516.2 MiB | 2.73 / 2.04 s |
| Synthetic (97 pages) | 7.330 s | 6.616 s | 634.2 / 626.6 MiB | 8.30 / 7.09 s |

These historical figures use the original harness observation timing. The full app opens the empty document more slowly than the prototype; the 97-page result is faster in this run. These readiness PSS samples cannot be compared directly with the prototype peak PSS. OS caches were not cleared. The earlier run that overlapped extraction is excluded from acceptance. Performance improvements in the shared SDK remain session D's work.

Linux review revision (2026-10-11): the standard-font packages contain 18,445 hashed resources and eleven themes. The final AppImage is 476,761,370 bytes (476.8 MB), and the DEB is 664,189,698 bytes (664.2 MB), compared with 566,772,988 and 753,841,660 bytes for the full-font preview. Both extracted final packages pass all 18,445 resource hashes and licences, actual file-URI open/edit/atomic save/native PDF/fresh reopen, no renderer Node and controlled reachable-endpoint network denial. Their installer bytes and app.asar hashes match across development host and linux. Both omit a homepage URL. The full font inputs and the explicit full-font build option remain available; no optional-download feature is claimed.

The dedicated privileged resource scheme uses native file responses, a manifest allowlist, persistent JavaScript code caching and separate external-request filtering. Local modules load in parallel; SDK modification events update the title. A worker starts compiling the manifest-selected conversion runtime while the selected file's editor UI loads. The first conversion receives that worker; completion, error and cancellation terminate it. Every conversion still receives a new module instance and document filesystem. Streaming compilation permits browser compilation caching, but a persistent Wasm cache hit has not been demonstrated and is not claimed.

Matched-prototype timing on the integrated D4 source pins and standard resources, five fresh-profile and five warm-profile runs per document:

| Document | Fresh median | Warm median | Readiness PSS fresh / warm |
| --- | --- | --- | --- |
| Empty (1 page) | 3.368 s | 2.452 s | 528.9 / 533.0 MiB |
| Synthetic (97 pages) | 6.814 s | 6.043 s | 677.6 / 652.3 MiB |

The warm empty-document target of 2.2 s remains FAIL (252 ms above target); the 97-page 7.1 s target passes in both profile modes. Before early worker compilation, the same resources and epoch method measured 3.539/2.616 s and 7.232/6.230 s. Streaming compilation alone measured 3.567/2.565 s and 7.232/6.211 s. All runs, including first warm-run outliers, are retained. Original full-font preview timings above use the historical harness timing, so they are not treated as measurements with the same timing method. Fresh profiles are not cold OS caches; readiness PSS is not peak memory.

Acceptance evidence and measured desktop results are recorded in the mission work folder's checks.md. Platform gaps and any failing check remain explicit until review.

## Signing and future updates

For Windows distribution the owner needs an Authenticode code-signing identity, accessible certificate/private key or hardware/cloud signing service, and a trusted timestamp service. Configure electron-builder signing credentials outside Git; sign the application and NSIS installer, then test Windows SmartScreen, associations and native dialogs on Windows. No signing secret belongs in the lockfile, profile or build logs.

For macOS distribution the owner needs an Apple Developer membership, a Developer ID Application certificate with its private key, and notarization credentials (App Store Connect API key with issuer/key IDs or a keychain-stored notary profile). Build on macOS, sign Electron's app/helpers/frameworks with hardened runtime and the reviewed Electron JIT/library entitlements, notarize with Apple's notary service and staple the ticket to the app/DMG. Test Gatekeeper, Apple silicon/Intel architectures, associations and native dialogs before publishing. An unsigned DMG configuration alone is not macOS acceptance.

There is no updater dependency or update check. A later updater should use owner-controlled HTTPS release metadata with signature verification, explicit user consent and a separate narrow network permission. This document identifies the extension point; it enables no update traffic.

Linux second review (2026-10-11): the reduced unsigned preview preserves all active editor locales, all offline help languages and Chromium licences. Forty-four help GIFs over 1 MB retain their exact static first frame and URL; unused Visio, Internet Explorer variants and the inaccessible macro editor are excluded. The macro engine and visible actions are disabled in all three desktop editors. The AppImage is 347,841,399 bytes and the DEB is 372,535,118 bytes, with 17,896 hashed resources. This preview retains the shared ODS embedded-object/PDF failure and the measured 2.452 s warm empty-document startup (2.2 s target); it is not a release.

The reduced second-review packages both pass native file-URI open/edit/atomic save/native Wasm PDF/fresh reopen, no renderer Node and controlled reachable-endpoint network denial on the unlocked test desktop. Both verify all 17,896 resource hashes/licences and match artifact SHA256 across development host and linux. The earlier locked-desktop GUI failure is retained separately. These checks accept the unsigned preview; they do not resolve the documented ODS/startup limitations or establish installed association acceptance.

Windows review adds an explicit lstat/handle/path identity check when opening a selected document, so refusing final symlinks does not rely on O_NOFOLLOW on Windows. Save validates every parent directory for symlinks/junctions and uses its canonical directory without an exact-string path comparison, allowing ordinary Windows casing/aliases. Eleven Linux units pass, including linked-directory refusal and replacement during open; tests/desktop/windows-files.cjs exercises actual Windows case variants, writable permissions and junction refusal when the owner host is available. These native semantics remain unverified until that run. Native Windows permission acceptance checks its effective write-permission state; POSIX permission-bit guarantees apply on Linux/macOS, not Windows ACLs or arbitrary file attributes.

The native Windows filesystem test also creates a final-file symlink. Windows Developer Mode or an elevated test session may be required to create that fixture; the test reports this prerequisite and fails if it cannot create it, retaining the case as unverified rather than treating it as passed. The existing file-symlink unit also keeps its assertions. No Windows system setting has been changed by the cross-build.


## Windows manual acceptance

Run on the owner's Windows PC/VM; all native cases below remain unverified until recorded. Preserve public fixtures and use copies; the shared ODS limitation is expected and must not be recorded as fidelity success.

1. Install the unsigned x64 NSIS preview, record SmartScreen/publisher handling, choose a custom directory, then verify uninstall removes the app without deleting user documents.
2. Verify installed associations for all nine Office extensions, double-click a file and open a file URI; the existing instance must receive the document.
3. Use the native Open/Save As choosers and drag/drop with spaces, Unicode and mixed-case paths. Confirm an overlong path produces a clear message, including when backup/temp names would exceed the limit.
4. Edit, save and freshly reopen DOCX/XLSX/PPTX/ODT/ODS/ODP copies. Verify the edit and original protection; for ODS embedded-object failure test Cancel and explicit Save a copy, retaining the original and reporting the known loss.
5. Import DOC/XLS/PPT and save modern copies without replacing the legacy originals.
6. Export actual native Wasm PDFs with fonts/images and edited text; open them independently. Test native Print and cancellation without a submitted job; report the known ODS PDF limitation.
7. Test dirty close/open-another-file Save/Discard/Cancel and second-instance delivery; cancelled decisions keep the current document unchanged.
8. Test computer-font consent denied, then explicitly allowed, including persistence after restart; bundled fonts work without consent.
9. Disconnect external networking, repeat conversion/save/PDF, and verify no renderer Node access, telemetry/provider traffic or document upload.
10. Run tests/desktop/windows-files.cjs for native file IDs, casing, write permissions, junction/symlink refusal and long-path original preservation. Hold a test file open in another application, check the actionable save failure and retained backup, then retry after closing it. Record fresh/warm startup timings without claiming a cold OS cache.

Windows rejects paths of260or more UTF-16 units or components over255units before use, including generated temporary/backup paths before mutation. EPERM/EBUSY save errors explain a possible other application or permission issue, suggest closing it or Save As, and retain the error code and any actual backup path.

The opening identity guard uses BigInt file IDs and volume IDs. [libuv's Windows implementation](https://github.com/libuv/libuv/blob/v1.51.0/src/win/fs.c) maps inode to FileId and device to the volume serial; the guard remains enabled. This source check is not a native Windows result: windows-files.cjs additionally compares a named file and an open handle on the owner host. Final-file symlink fixture creation requires suitable Windows privileges as documented above.

The macOS review rebuild compiles the current branded web-apps sources and preserves the previously verified SDK, standard fonts and full/PDF runtime bytes. A missing PowerPoint Smart Picker tooltip formerly caused toolbar initialization to throw and the SDK to protect the document by switching to read-only mode. The shared button now treats an absent tooltip as empty text; editor error protection remains active. Native six-format edit/save checks use fresh copies of the new public ElixirOffice samples and verify the saved marker independently in the Office ZIP.

Desktop tests copy sample fixtures into independent temporary directories before editing, including typed native-dialog paths, queued arguments and lifecycle cases. Own test roots have been refreshed from the branded document-templates samples; ODF test fixtures are regenerated locally from those public samples. Package audits check actual Linux AppImage/DEB, Windows installer payload and Mac resources for old welcome text and test markers. Packages contain the three pristine new-document templates and the explicitly enumerated 22 presentation theme source files; sample documents and test outputs are excluded.

Mac review acceptance (2026-10-11): final unsigned arm64 DMG **381,116,748 bytes**, SHA256 `0bad218dc1fe57665ff06120b7eaeb8afc64e0a02f35be0258f521ae26ac5e83`. Actual read-only mounted image acceptance verifies both 17,896 resource manifests, all 18,169 bundle entries, exact packaged shell sources, nine UTIs with Alternate rank, all bundle privacy declarations and the expected ad-hoc/no-publisher identity. The image has no sample/test documents in app.asar; resource audits accept only the three pristine templates and 22 explicit presentation theme files.

Actual final-image unattended acceptance passes public sample file-URI open, edits and atomic saves in DOCX/XLSX/PPTX/ODT/ODS/ODP, independently extracted saved markers, untouched source sample hashes, Wasm PDF with edited text, fresh reopen, denied-font persistence, no renderer Node and controlled reachable-endpoint network denial. These checks do not operate native modal sheets: native PDF Save, Print, dirty-close choices and menu interactions remain unverified for this rebuilt image while the Mac is locked. Earlier preview native PDF/font consent checks remain historical evidence. Downloaded Gatekeeper, installed associations, Intel and signing/notarization also remain unverified; the eight-item owner checklist above applies. The known ODS embedded-object/PDF failure and Linux warm-start target miss remain disclosed. No timing claim is made for this rebuilt Mac image.

## Desktop Home, File actions and review captures

The desktop Home page reuses the web start page's CSS, Fluent icons and template previews. Home, New and Open navigation, three blank-file thumbnails, two approved templates, and recent-file names/folders/modification dates remain local. The editor fills the window; no separate toolbar sits above the ribbon. Open, Save, Save As, PDF export, Print, New and Close use the existing File backstage and the native file bridge.

The shell chooses the first supported language from Electron's preferred system languages and app locale, preserving Portuguese and Chinese variants and Serbian script, with English as the fallback. Desktop catalogs cover all 45 editor locales; common labels come from the editor catalogs and desktop consent/privacy messages have explicit translations. The editor receives the same selected language. Native font actions in the invitation bar, File > Options, application menu and PDF font service use preload consent and the standard system/user font folders. They never ask for browser site permissions.

A hidden, explicit review option captures only ElixirOffice's own webContents. It uses a fresh temporary profile, creates a bundled blank document, records the start page, editor Home tab and File backstage in each requested locale, writes PNGs and exits. It neither opens existing documents nor captures the desktop or another application. Without --capture-screens, no capture runs; --locales without it is rejected. Use an empty output folder; existing files are never overwritten. The temporary profile is removed after success or failure.

Linux:

```sh
./ElixirOffice-0.1.0-linux-x86_64.AppImage --capture-screens "$HOME/ElixirOffice-review" --locales en,fr
```

If FUSE is unavailable, use the extracted AppImage executable with the same arguments. On macOS:

```sh
/Applications/ElixirOffice.app/Contents/MacOS/ElixirOffice --capture-screens "$HOME/ElixirOffice-review" --locales en,fr
```

On Windows, install the review installer with its Start Menu shortcut enabled. This single PowerShell command resolves that shortcut, so it also works with a custom installation directory:

```powershell
& ((New-Object -ComObject WScript.Shell).CreateShortcut((Get-ChildItem -Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs","$env:ProgramData\Microsoft\Windows\Start Menu\Programs" -Filter 'ElixirOffice.lnk' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName).TargetPath) --capture-screens "$env:USERPROFILE\Desktop\ElixirOffice-review" --locales en,fr
```

Wait for the capture window to close. The output contains en-start.png, en-home.png, en-file.png, fr-start.png, fr-home.png, fr-file.png and captures.json. On Windows these are under %USERPROFILE%\Desktop\ElixirOffice-review. Return that folder for review. These are actual package-window captures; successful cross-building does not substitute for Windows execution. Production signing, downloaded Gatekeeper/SmartScreen handling and native Print/dialog checks remain separate.

Review capture acceptance (2026-10-12): the rebuilt Linux AppImage and actual mounted macOS arm64 DMG each produced six English/French PNGs and exited successfully. Both packages pass real font-bar and File Options native consent with no browser font API calls. The rebuilt Linux app passes actual File Save in all three editors. Linux/macOS ODS acceptance retains both editable charts and all95values after Save, PDF and fresh reopen. Windows installer payload/source/resource acceptance passes; its native screenshots await the owner command above. The branches and release folder remain review candidates, not integrated or published.

Desktop Mailings limitation (owner-approved beta scope): Not yet available in the desktop app: mail merge (Mailings), available in the server version. The offline capability guard hides the tab. The SDK can merge locally, but the desktop download bridge currently ignores MailMergeLoadFile recipient JSON conversion and options.oDocumentMailMerge output, dispatching ordinary Save/PDF instead. Both local bridge paths remain unimplemented.

Desktop UI review fixes (2026-10-12): File Info is restored between Open and Save; empty Recent text is translated in all45shell catalogs. Desktop feature announcements are suppressed; the web French multipage tip is translated. Font invitation buttons wrap without being covered by a tip, and accepted/declined choices are remembered in desktop settings. New Word documents use a pristine template with the UI language as their proofing default; existing documents and nonblank templates retain their language. Each of45blank variants is checked byte-for-byte against the source ZIP, allowing only the default-language element to change. Capture receipts now validate these UI requirements at1360x900. Mailings remains a documented local beta limitation.

Final UI review acceptance (2026-10-12): all seven review items are addressed, with the documented Mailings limitation above. Linux/macOS final packages each produce six validated en/frcaptures: readable titles, Info betweenOpen/Save, translated empty Recent, visible font buttons, nofeature announcements andFrench proofing LCID1036. Ordinary warnings still display. Font decisions are atomically serialized and flushed before reporting the choice or closing; the unchanged Mac restart regression and20overlapping-write test pass.28units and18,000resource/licence/pristine-template checks pass. The owner waived the revised Windows recapture because the shared UI was verified on Linux/macOS; the existing release/elixiroffice-captures.bat it creates Desktop/ElixirOffice-review (or a timestamped sibling), opens that folder aftercapture andleaves normal documents untouched. Native Windows manual acceptance and the separate Mac Print/manual checks remain pending. UI integration is owner-authorized; publication remains lead-owned.

## Desktop beta 2: local gaps, group A1–A3
Public beta 1 contains only the server version. A1–A3 source changes and the approved follow-up were integrated as product28c6a4a/web-apps46538e06af/DocumentServer9f5878d606. Desktop distribution remains planned for beta2.
- Dictionaries: all 366 supplied dictionary, hyphenation, thesaurus and licence files are bundled (342,347,581 bytes). Coverage follows the upstream data: 17 supplied thesaurus families with variant fallback, not a thesaurus for every language. The eoapp handler supports single HTTP byte ranges (206), suffix/open-ended ranges, 416 for invalid or unsatisfiable ranges, and ordinary HEAD. Manifest restrictions and origin/path checks remain in force. Data does not leave the computer.
- AutoRecover: enabled by default; File > Options or the OS Settings menu sets a 15/30/60/120/300-second interval (default 60). The inherited server AutoSave toggle is removed from the desktop header. Recovery stores a serialized document and media in a separate, atomic, checksummed profile file; it does not save the original or clear the dirty state. The next start offers Restore, Discard or Cancel. Restoring opens an unsaved copy with no original destination, so the next explicit Save requires choosing a file. Successful ordinary saves remove the corresponding recovery copy; explicit discard removes it. Closing/discarding invalidates pending snapshots. Disabling recovery preserves existing copies; Cancel keeps them available next start. Corrupt copies remain visibly removable rather than silently accepted. Recovery storage is capped at 512 MiB: older unsaved copies are not automatically deleted; a full store reports a save error. One latest checkpoint per document is retained. A crash before the first checkpoint or during an atomic write can lose changes since the previous completed checkpoint; keep regular manual saves.
- Hyperlinks: Ctrl+click dispatches http/https/mailto to the OS through shell.openExternal after URL validation. Embedded windows and file/javascript/data or credential-bearing web URLs are rejected. The app's network-denial policy remains unchanged. Native browser/mail dispatch is inspected in automated tests without launching the owner's external applications.

The shared local controller exposes detached snapshot bytes and media without resetting history, and rejects automatic original-file saves. The desktop bridge alone schedules and stores recovery. Browser-local IndexedDB recovery is deferred to shared local-mode work; no hosted-server behavior is changed.

Baseline: an actual packaged macOS five-minute run (300,010 ms) showed no visible Comment controls or Track Changes toggle, despite the Review tab being present; canCoAuthoring/canReview were false. The spell worker initialized, but dictionary data returned 404. Comments and Track Changes are session D's separate mission.


## Desktop beta 2: shared local review and pictures, D1–D2

D1–D2 shared editor source is integrated. D3–D4 belong to session E; desktop A4–A6 settings and packaging remain review candidates owned by A. No desktop release is implied.

The Word, spreadsheet and presentation comment controls are available to a single offline user while the light-edition, collaboration, chat and history restrictions remain in place. Untouched imported comments retain their authors; an explicit comment edit uses the configured current editor, matching hosted behavior. Word allows Track Changes and accept/reject; comparison is still unavailable. New comment/revision authors use the existing editor user identity, including A6's desktop name-setting bridge.

Picture file, clipboard and drop paths share a queued local resource importer. Save and detached recovery snapshots wait for queued operations. PNG/JPEG payloads are preserved; GIF/BMP/safe SVG/WebP become PNG. Animation and SVG vector editing are not retained. Linked/active/filter-heavy or excessively complex SVGs are rejected with an explanation. The byte limit is 20 MiB, the decode limit is 16 mebipixels or 32,768 pixels per dimension, and URL reads/decoding have a timeout of 15 seconds. Imported document resources use the existing conversion resource list.

In web local mode, Insert from URL embeds a permitted local asset as a blob. The original local CSP continues to block arbitrary external connections. An unavailable URL reports a clear connection/CORS/security-policy message and suggests inserting a downloaded file. Pasted remote links never trigger a fetch. Requests omit cookies, authorization and referrers and reject redirects; there is no document-server upload. No general network permission is added.

Evidence: the actual packaged Linux baseline was observed for 307,184 ms. Imported Word balloons were already visible; the audit's missing-balloon claim was corrected. The missing new-comment/review controls and stuck SDK image callback were reproduced. Candidate browser tests cover real Word add/edit/delete/author/Track Changes/accept/reject, actual Cell/Slide Insert comment, actual saved XML and fresh reopen; picture SDK contracts cover all three editors and exact saved PNG media. A throwaway Linux runtime on linux passed native comments/revisions, actual X11 clipboard Ctrl+V, DOM drop through the SDK/native close guard, same-file Save and fresh app reopen. This uses the integrated A1–A3 shell plus D production editor bundles, not a published package. Native Windows/macOS acceptance is not claimed.

The normal web launcher required A's separate iframe-height fix: DocsAPI replaces the styled placeholder with an iframe. D copied A456's exact local.html into its own runtime; this dependency must accompany integration. The initial explicitly labelled test-only viewport fixture is superseded by the normal-runtime pass.
## Desktop beta2: group A4–A6 review candidate

The candidate uses the same local converter for additional-format Open and Save As. RTF/TXT/template/macro-enabled/slideshow imports are converted copies: ordinary Save cannot silently overwrite their original file. Different-format exports do not reset the source's saved history or remove its recovery checkpoint. Atomic destination checks and alias/symlink protection remain enabled. TXT and CSV use UTF-8; empty text is supported. Wasm-only overlays correct the converter's UTF-8 byte-truncating fallback and preserve supplementary Unicode through RTF signed UTF-16 export/import; the separate PDF-only pin is retained.

Set your author name in File > Options. New documents receive it in the editor configuration, and changes update the active SDK user, document user information and comment-name parser. Existing comments/revisions retain their original authors. The preference is stored on this computer.

The shell implements a localized Help application menu and F1 shortcut for Linux, Windows and macOS. Menu dispatch is unit-tested for all three platforms; the current native acceptance run covers Linux only. Windows and macOS Help have not been newly verified. File > Help uses the same native bridge. It opens a bundled help index for the current editor and supported help language, with English fallback when that help translation is unavailable. Help navigation stays inside that local language tree. The inherited help describes upstream features; the beta2 limitations below still apply.

Embedded slide audio/video may load from packaged, blob or data resources; external media requests remain blocked. Word and PowerPoint chart Edit Data use the actual nested spreadsheet editor and preserve changed values in exported Office files. GIF/BMP/SVG/WebP picture support is coordinated through session D's shared local image pipeline; static conversion and decoding limits follow that pipeline.

### Optional desktop AI

Open File > Options, then Elixir settings, to reuse the web AI configuration form. Until a configuration is accepted, desktop AI actions, the ribbon tab, shortcuts and search setup suggestions are hidden. Saving a configuration opens the app's native consent dialog naming the exact endpoint and asking permission to send document data. Cancel keeps AI disabled and sends nothing.

HTTP is accepted only for localhost, literal 127.0.0.1 or ::1; HTTPS is required for a remote endpoint. The localhost name is resolved to loopback rather than to an arbitrary DNS address. Only the configured OpenAI-compatible chat-completions route is reachable through the native bridge, with the approved model, bounded request/response sizes, cancellation and timeout. Redirects are not followed. The renderer's HTTP/WebSocket policy stays blocked; no CORS/site-permission setting is needed.

API keys require the operating system's encrypted storage. Linux plaintext/basic_text fallback is refused; a keyless local endpoint remains usable. Keys are encrypted before local persistence, never returned to the renderer or copied to its localStorage, and sent only as Authorization to the approved service. An empty key field preserves a previously stored key for the same endpoint; its opaque masked placeholder indicates a stored key. Remove settings revokes the configuration and deletes the stored key; use it before switching to a keyless configuration. Previous browser-only settings are not automatically trusted or imported. Each saved configuration asks for consent, including a local endpoint.

Actual acceptance receipts and remaining platform checks are recorded in the task checks.md and the accompanying release acceptance record A4–A6 are review candidates; no public desktop release or integration is performed by this task.

Desktop AI configuration and tools currently apply to the Word editor. Spreadsheet and presentation editors do not yet load an AI toolset; their AI actions and configuration button remain unavailable.

Native AI responses, including SSE, are size-bounded and buffered before they reach the editor. Real model quality, inference performance, live token latency and new native Windows/macOS secure-storage acceptance are not qualified by the synthetic loopback tests.

A4–A6 rebase acceptance: the review branches now contain integrated D1–D2 (web-apps d837634fbd). The rebuilt Linux package passes all three editor smoke checks, actual Options author persistence in comment/revision OOXML, and six image formats with decode/export/original/privacy checks. The normal web launcher has an 855-pixel iframe and 659-pixel canvas with local comments/review enabled. No test-only viewport CSS is needed. A4–A6 remain unintegrated.


A4–A6 review hardening: native settings persistence tests confirm that AI keys are encrypted before writing desktop-settings.json and excluded from public settings; unavailable or plaintext storage backends refuse key configuration. Additional provider parameters cannot replace the selected model or conversation messages. File > Options shows AI settings only in Word, where the controller is available; Excel and PowerPoint omit that action. The current native review run covers Linux, with Windows/macOS newly unverified.

### Local Word save-state correctness

Word emits repeated modified-state notifications while updating layout, even when the document history is unchanged. Local saves now count actual history changes, document actions and undo/redo instead of treating every notification as a new edit. A completed unchanged snapshot becomes clean. A newer Word state remains dirty, including an undo returning to the previous saved state after another snapshot has overwritten the file. Word also refreshes its Save control when that unsaved state is restored. A subsequent successful save clears that state.

The change is confined to the explicitly offline Word controller; hosted permissions and the spreadsheet/presentation counters are unchanged. tests/desktop/odt-save-state.cjs holds the result of a real Wasm conversion and checks actual files and SDK state for duplicate notifications, typing, paste, undo/redo, initial-save undo, undo back to a saved state without an in-flight save, and exact callback disposal. The Linux candidate's strict six-format open/edit/save/reopen/PDF matrix and native Word PDF tests pass; additional Windows/Mac acceptance remains separate.
The change is confined to the explicitly offline Word controller; hosted permissions and the spreadsheet/presentation counters are unchanged. tests/desktop/odt-save-state.cjs holds the result of a real Wasm conversion and checks actual files and SDK state for duplicate notifications, typing, undo/redo and initial-save undo. The Linux candidate's strict six-format open/edit/save/reopen/PDF matrix and native Word PDF tests pass; additional Windows/Mac acceptance remains separate.

## Local modes: group E D3–D4 review candidate

In the browser start page, “convert locally” uses the bundled converter for opening, editing and downloads. File > Save As offers the supported formats only: DOCX/ODT/RTF/TXT/PDF for text, XLSX/ODS/CSV/PDF for sheets, PPTX/ODP/PDF for slides. File > Print submits a locally generated PDF to the browser's print interface. No document is uploaded for these operations. Format-copy downloads retain the current editing format and unsaved state; the launcher's ordinary “Download edited file” completes an explicit local Save.

Local web Open accepts RTF/TXT/CSV, DOTX/XLTX/POTX/DOCM/XLSM/PPSX and legacy DOC/XLS/PPT. These inputs open as a modern DOCX/XLSX/PPTX copy. The title/status and suggested “(converted)” filename explain the copy; the selected source stays unchanged. Macros remain disabled. TXT/CSV default to UTF-8; CSV defaults to comma and the current sheet, with export encoding/delimiter choices taken from the existing dialog. HTML, XLSB and PDF input are outside this group.

Spreadsheet Review > Protect Range now works in both local launchers. The normal manager/dialog associates the range with the current local identity; XLSX local save/reopen retains those permissions. Insert text from file and Edit Links entry points are hidden in local editors because their server operations are unavailable. External reference update prompts/actions are suppressed in these explicit Elixir-local API instances. Hosted instances retain their ordinary behavior.

Reproduce web checks with an explicit own EO_BASE, public fixtures and an owned output directory: exports-browser.mjs, imports-browser.mjs, unicode-browser.mjs, csv-ui-browser.mjs, export-media-browser.mjs and protect-range-browser.mjs in tests/local-mode. The desktop Protect Range test is tests/desktop/protect-range.cjs; set EO_DESKTOP_RANGE_FILE, optional EO_DESKTOP_WORD_FILE, EO_PACKAGE_EXECUTABLE and an owned EO_DESKTOP_ROOT. EO_DESKTOP_DISPLAY selects a private test display; the default stays :0. release maintainer ran the packaged Linux shell with generated production candidate assets under its own Xvfb display, keeping Chromium's sandbox enabled. This does not certify OS printer dialogs, Windows/macOS packaging, downloaded-signature handling or physical printer output.

The packaged A1–A3 baseline ran for 302,353 ms and reported real spelling errors after typing a misspelling; the old no-spelling audit is superseded by A1. Review remained disabled and the imported comment model remained present. release maintainer owns comments/review/pictures. Final results, runtime pins, known hosted baseline failures and review limits are recorded in the accompanying release acceptance record

### D3–D4 review follow-up on integrated A4–A6 (2026-10-13)

E now contains integrated A4–A6 and D1–D2 source. Full and PDF-only runtimes share one nine-patch core build input; the explicit selectors and hashes are in the E handoff. Local Word hides the original text-file control and its visible Insert > Object mirror/menu, while hosted flags retain their existing behavior. Copy exports wait for D's real pending-picture queue; actual PDF and Print pixels pass in Word, Excel and PowerPoint. Print blob URLs expire after60seconds.

A new E Linux AppImage and Debian package pass identical18391resource hashes,52units, actual3editor smoke, Protect Range save/reopen/hidden commands and TXT/RTF/CSV Unicode. Added-format Wasm roundtrips and converted-copy opens also pass; that latter test uses EO_CONVERT_ONLY and does not assert an OS Save As chooser. Windows/macOS D4 and physical/native Print dialogs remain unverified. These are private review artifacts; beta2 distribution is still pending.

The desktop File > Help action opens bundled Help in the selected UI language (English fallback when a Help language is absent). Document spelling language does not select Help. Desktop AI settings state that the operating system encrypts a configured API key and the saved key is never shown again. Hosted browser settings retain the separate localStorage disclosure.

For desktop acceptance, launch only an absolute path to the owned application copy. Normal Mac tests pass an isolated --user-data-dir and EO_DESKTOP_PROFILE; never resolve a preview by its bundle identifier or display name, which can open an older installed copy with the owner’s profile. Capture mode creates a unique profile inside its owned output folder and accepts only capture options. Do not attach debugger flags to capture mode. Invalid capture arguments or output preparation now fail before the instance lock or document opening, log the startup stack, and exit 1 without Electron’s uncaught-main-error dialog. The strict parser is unchanged. tests/desktop/capture-startup.test.cjs and harness-cleanup.test.cjs cover these boundaries.

Computer fonts are controlled in File > Options (or Settings). The checkbox shows whether access is enabled; the status also distinguishes a choice not yet made from access declined or disabled. Enabling requires the desktop consent dialog. Disabling revokes future font reads and clears the cached computer-font list. Fonts already used by the open document remain loaded until it is reopened: save changes before reopening to use only bundled fonts. Changing this setting never automatically reloads a document.

## Local PDF preview (G1a, awaiting review)

Desktop and browser convert-locally mode can open PDF bytes directly in the bundled PDF editor. View, text search/select/copy, page navigation, ordinary AcroForm filling and comments/annotations operate locally. Original text editing, OCR and PDF-to-DOCX are not enabled. PDF document JavaScript and form URI actions are disabled locally; scripted calculations and validation therefore are not supported. Hosted PDF behavior remains unchanged.

This stage exports PDF copies and supports local printing, while Save to the original stays disabled pending G1b. The existing drawingfile SplitPages writer retains tested pages, basic form values and annotations, but drops document Title/Author/Subject and bookmarks; signatures are invalidated. Copy export asks for acknowledgement of these losses, defaults to a copy name on desktop and rejects the original path or hard-link identity. It never acknowledges the original as saved. The engine still emits upstream Creator/Producer metadata: this is an open G1b/release issue, not a branded writer acceptance. No newly built package is approved by this source-stage report.

Acceptance on public synthetic fixtures: 94 desktop units; real sandboxed Linux Electron source/dev runs with two pages, a text field filled through keyboard input, old/new annotations and author names retained after export/reopen, unchanged original bytes, visible native copy-loss warning cancelled, real native print dialog cancelled (no print); Firefox browser raw open, search two matches, copy both pages, page navigation, form UI input, comment, actual PDF download and fresh reopen, no Node, 170 static GETs and no upload/server fallback/external request. A 250-page 74,391-byte synthetic PDF reached SDK-ready in about 1.2 seconds on development host; this is not a large-image-PDF memory or first-paint benchmark. New native macOS/Windows PDF acceptance and encrypted/signed/XFA cases remain unverified and belong to subsequent gates.

## Initial G1b preservation candidate (superseded by the safety review below)

Local desktop PDFs now use a bounded incremental writer for original Save and Save As. The complete original byte sequence must remain the output prefix. Native Save clears the unsaved state only after atomic persistence acknowledges the unchanged edit history; browser-local Save downloads a copy and keeps the source unsaved state. Autosave remains disabled. Unsupported or protected PDFs are read-only for original saving; copy export retains the explicit protection/property loss warning. Hosted PDF editing is unchanged.

The parsed policy refuses encryption, signature markers (including compressed objects), XFA, non-text form fields, scripted actions, unsupported catalog/annotation structures and linearization markers. Bounds are 128 MiB input, 64 MiB changes, 256 MiB output, 2,000 pages, 200,000 objects, bounded traversal and a 60-second worker deadline. Producer and modification date change intentionally; original Creator, Title, Author, Subject and outline are retained in the public proof. This is a conservative supported subset, not unrestricted PDF editing.

Evidence: 15 actual browser policy cases; eight independent Poppler preservation outputs; classic/compressed object and xref streams; text/highlight/ink annotations and URI links; first/repeated/second-edit/Undo fresh reopen; 250-page public sample; 116 desktop units after the bd2b998 rebase; sandboxed Linux two atomic saves and fresh reopen. Both runtimes were rebuilt from recipe 8b15cde and core 528e920e4f34 with patches 0001–0011: full 528e920e4f34-b84bad726b86-st and PDF-only 528e920e4f34-7e3dabf57ea2-st. D's password integrity (3) and actual workers (12 groups) pass. Hosted smoke and Windows/Mac shortcut scopes pass with zero errors/failures.

Signature/XFA/linearization fixtures test presence refusal, not cryptographic signature validity or conformance. Image-heavy peak memory, original PDF saving on macOS/Windows, physical printing and new release packages are unverified. Native Linux Save As/print acceptance is recorded separately in the task checks. No integration or publication by session A.

## G1b safety review follow-up (2026-10-13)

Original PDF saving now requires both the complete original byte prefix and exact input/output page-count equality. A shared C++ validator is tested with a fault-injected writer that drops/duplicates pages. The native parser inspects stream dictionaries as well as plain dictionaries, and set AcroForm SigFlags cause a signature refusal. Policy remains writable=false before editing and on every failed branch, becoming true only after output parsing and preservation checks pass. Page-root identity is not separately compared.

Current matched runtimes, built from product recipe05d8f7f and core528e920e4f34 plus patches0001–0011:
- Full: **528e920e4f34-bd14d110aa08-st**, manifest SHA256 **0d97c1fcec3355ed9f5d43e52357d3dda197abe35d0ffc1a74c0a0cf17b73964**.
- PDF-only: **528e920e4f34-98ab90f5d735-st**, manifest SHA256 **d9f0109b81130dbadb9f1e8b99e0e024899844a0874784bfc1310bf8fd34d0c6**.
All12 artifact hashes and common source/patch/tool provenance match. The shared page-count guard header is recorded in both manifests. H1 and initial G1b runtime identifiers elsewhere are historical.

Refusal reasons come from the existing45locale catalogs with English fallback and French translations. Desktop and browser-local modes show the reason, original safety and copy offer; cancellation does not falsely label a writable document read-only. Unsupported named destinations, portfolios and automatic catalog actions are explicitly disclosed. The existing copy loss confirmation and original-path/hard-link refusal remain mandatory.

Acceptance:120desktop units;9password-state units;2legal-attribution units;1manifest test; fault-injected C++ guard;23actual native policy cases plus3failed-write false-policy cases; four first/repeated/second/Undo outputs and four classic/compressed annotation/link cases;8independent Poppler appearance/property/outline/order proofs; actual visible browser Save download keeps dirty state,200staticGET/0errors/250pages;3actual French read-only UI cases. D integrity3 and actual six-format web/desktop worker12groups pass on the final full runtime. Hosted own:32793 smoke0errors/fails and win228+14/mac171+13shortcut scopes pass.

Final matched pair in sandboxed Linux source/dev overlay: two atomic original saves/fresh reopen (7091/8681bytes, old/new annotations retained) and3actual native refusal/copy-offer cases pass without focused input. Fresh native SaveAs/print-dialog reruns are UNVERIFIED: test desktop relocked (LockedHint=yes), owner unlock requested; no focused native event sent. Their earlier G1b native results remain recorded as historical evidence, not a fresh-module pass. Existing Help3/fonts native consent/rename/protected-DOCX menu checks passed before this hardening; those hooks are unchanged.

Current development host assembly has18,393 exact hashed resources after removing only own inactive generated runtime versions; all four production editor bundles and45desktop catalogs are present. Linux evidence is a source/dev overlay, not a release package. macOS/Windows original PDF Save, physical printing, image-heavy peak memory and fresh release packages remain unverified. Signature/XFA/linearization samples are marker-presence fixtures, not cryptographic/conformance proofs. Startup deletion of stale .bak/.tmp is deferred: a backup may be the only recoverable original, and safe automatic cleanup requires a durable ownership/recovery ledger.

No integration, push, demo change or publication by session A. Task/checks/evidence: /srv/elixiroffice/wt/pdf-local-A-G1b-work.

### Closing a busy editor
Closing and Quit preserve the native Save / Discard / Cancel decision. Busy or unconfirmed state offers a conservative native Cancel/Discard warning. State and cleanup waits are bounded to three seconds; Cancel or a failed save unlocks input. A save acknowledgement rechecks late edits. Only a clean/saved document or explicit Discard authorizes destroying the window, so a frozen editor cannot veto the approved exit. Unknown/busy state retains recovery copies. The bounded desktop-close.log in the profile contains timestamps and fixed reason codes only, retains at most 64 KiB, and enforces mode 0600 even when it already exists. Older records are discarded when the size limit is reached.

The macOS regression driver is tests/desktop/mac-close-packaged.cjs. Compile tests/desktop/mac-close-owned.mm with clang++ -arch arm64 -std=c++17 -bundle -undefined dynamic_lookup -framework Cocoa and the Node include directory. Run with EO_DESKTOP_ROOT, EO_PACKAGE_EXECUTABLE (absolute, inside that root), EO_PLAYWRIGHT and EO_CLOSE_NATIVE_HELPER. Launches use fresh isolated profiles and record their exact PIDs. Native window/Quit actions, own-menu Cmd+W/Cmd+Q equivalents and real decision buttons operate only inside that process. No app-name lookup, global input, permission change or substituted dialog result is used. EO_CLOSE_CASES selects an explicit comma-separated subset; EO_CLOSE_RESULTS names its receipt. The full driver requires EO_MANUAL_NATIVE=yes: destination-panel cancellation needs an operator and verifies its actual outcome. Subset receipts never certify unrun manual cases.

The Home page selects four shared template documents and their real previews by the current UI language, with English fallback. Each has matching document proofing language and fictional localized content. tests/desktop/home-templates.cjs clicks the actual packaged Home entries, verifies their source licence hashes and checks the Word proofing language; use only an explicitly identified caller-owned app and isolated profile. See docs/home.md for the common data schema.

Home templates use the shared glyph-covered language manifest: 39 languages ship; ja, zh, zh-tw, ko, si and ur fall back to English without requiring computer-font consent. See docs/home.md for font coverage and reproducible checks.

### Narrow 0.2.0 PDF correction candidate (review pending)

PDF sessions do not produce AutoRecover snapshots. The original stays unchanged until a manual Save; use manual saving for eligible PDFs or Save a copy for PDFs refused by the preservation policy. Office recovery remains unchanged. A recovery failure writes only a bounded reason code and shows at most one calm status per application session, rather than an error claiming the user's manual file save failed. Options explains that its recovery settings apply to Office files.

Tagged PDFs, including common browser-printed pages and Word exports, cannot yet be saved in place when their catalog contains unsupported tagging structures. Save a copy remains available with the existing preservation-loss warning. Extending in-place preservation requires a new verified runtime; this patch changes neither runtime nor pin.

Manual errors retain the actual reason. Known permission, busy-file, full-disk, destination and invalid-output failures use catalog messages; already translated policy details remain visible. Unmapped operating-system errors use the generic localized error instead of exposing a filesystem path. All45 catalogs provide the keys, with English fallback where a translation is not yet supplied.

The desktop PDF adapter binds the modern non-passive wheel event and removes duplicate legacy delivery for that viewer. It normalizes pixel/line/page deltas, keeps Ctrl/Meta zoom and Shift-horizontal scrolling, and delegates page-field scrolling to the existing SDK handler. Hosted behavior is unchanged. Original-text editing stays unavailable: edit-mode/page-entry requests and attempts to replace selected original text show a short status hint; annotation/form input and Copy remain available. No popup is added on open.

Main-process safety logging contains fixed reason codes only, enforces mode0600 and a64KiB cap, and never prints rejected IPC contents. EPIPE and ERR_STREAM_DESTROYED are ignored only as stream-disconnection errors. Unhandled promise rejections record a reason code and keep the app running. Uncaught exceptions mark the app unsafe for further IPC writes and show at most one friendly Close message before exit. Main-process console methods are no-ops: error/warn calls record only their fixed reason code; diagnostics go to the bounded reason-code log, never the console.

The owned Mac test runner uses explicit executable/profile/PID checks, retained file-backed stdout/stderr, a verified unlocked session and >120seconds user idle time before launch/actions. It aborts and confirms scoped process cleanup if activity resumes. The accepted release is not modified by these test overlays. See the task checks for actual passed and unverified native cases; physical/native CG scroll and Save-panel completion are never inferred from browser-input or backend-byte tests.

The desktop PDF wheel adapter runs in capture phase before the inherited DocumentHolder zoom listener. Small Ctrl/Meta wheel deltas accumulate to a100pixel threshold, with a250ms gesture reset and a300pixel per-event clamp; handled zoom stops duplicate delivery. Disposal removes the matching capture listener. Hosted listeners remain unchanged.



## Release build identity

Starting with 0.2.1, About shows the version, unique build number and source revision on all platforms. Candidate and final DEB/Windows/macOS versions follow the shared [build identity](desktop-build-identity.md); final packages require fresh acceptance after rebuild.
Stage-2 evidence:160 affected units; en/fr/ar real-browser DOM fixture covers keyboard, focus, RTL, indeterminate/count rendering, stale events and text escaping. An owned hidden macOS Electron source-overlay test performs actual atomic saves, observes Writing then Ready, opens File and reopens through the Ready action in English/French. It uses synthetic public documents and fresh profiles; it is not a new packaged-release acceptance. Native Finder presentation, Save-panel completion/cancellation, Windows/Linux native UI and the final package remain unverified in this slice. The accepted 0.2.0 package is unchanged.

0.2.1 feedback follow-up (review candidate): before desktop PDF serialization or Office save/export work, the busy notice is presented across two visible frames. Hidden or minimized windows do not wait for frames, and a100ms upper bound prevents a stalled frame from blocking a save. This is a UI presentation boundary, not a percentage or artificial conversion progress. Terminal OS errors pass through the same path-safe translated mapping as ordinary save errors. Final0.2.0 PDF recovery, capture-phase scrolling and safe main-process logging are retained.


PDF progress/cancellation candidate: Word reports each completed drawing page against the actual selected page count. Presentations report actual slide preparation. Spreadsheet drawing remains one synchronous workbook call, so it has an indeterminate stage rather than a guessed page count. The isolated native worker reports loading, initialization and conversion boundaries; its synchronous C++ conversion has no percentage callback.

Cancel is available for PDF export, print preparation and original-preserving PDF save during preparation and conversion. Drawing stops at a JavaScript page boundary; cancellation during native conversion terminates only that export's isolated worker. This is worker termination, not an interrupt inside C++. The progress UI ignores late worker replies, and a retry creates a fresh worker/module. Cancellation cannot invoke native file output, clear the document's dirty state or announce Ready. After handing output to the native chooser/write, cancellation belongs to that native flow and the conversion Cancel button disappears. Worker stage messages are opt-in so cached older callers continue receiving a single result. Final packaging and native button acceptance remain separate gates.


Office Save As/copy feedback candidate: SDK format downloads now use the format-specific native export bridge, carrying the copy's protection flags. PDF uses the PDF bridge. The current editing format and original dirty/history remain unchanged for converted copies; only the native committed acknowledgement can announce a ready copy.


Feedback review corrections: saved-file action failures use a translated moved/deleted-file message and never expose a native path. Names and failure reasons use bidirectional isolation with embedded bidi controls removed. The notice owns only the status text it set; completion leaves unrelated notices intact. Awaiting native output uses Saving rather than implying a chooser for silent saves. Synchronous workbook drawing explicitly disables conversion Cancel until an interruptible stage resumes.

Close-state inspection includes the running renderer operation. Cancelling a close keeps the export/editor usable; explicitly discarding a busy close aborts the renderer operation and disposes its tracker before destroying the window when the renderer responds. A frozen renderer retains the existing bounded forced-close path. VM tests run the actual main handler, renderer state/PDF path, operation tracker and SDK writer for both clean/dirty documents, including worker cleanup, retry, unchanged originals, no partial output and no false Ready. Native OS close dialogs remain injected in these tests; final packaged acceptance is still separate.

Hosted neutrality clarification: opt-in progress/cancellation does not alter ordinary hosted calls, with two accepted defensive changes in the shared PDF writer: a worker reply with neither bytes nor error now rejects immediately, and worker errors call preventDefault before the existing failure/fallback flow. No new network/permission path is added.

Integration source clarification:7598e161d3 is unchanged across the feedback stage2/3 checkpoints, but differs from the0.2.0 release base58da8d6aea. Its local example launcher commit distinguishes browser download initiation from canceled output and returns explicit outcomes to the operation tracker. It is part of the feedback candidate and must be integrated with it.


Named opening/password/print feedback candidate: the desktop shell reuses the shared operation tracker before editor startup and the parallel runtime preparation. A separate desktop-open namespace prevents collisions with iframe save/export counters. A named open remains busy until content and native/backstage hooks are installed. The controller accepts that external job and refuses SDK saves until it finishes; browser-local callers can own an internal opening job. Opening completes as Opened, never as a file-ready write acknowledgement.

Password dialogs report Waiting for your choice and return to preparation on acceptance. Real password-bearing conversion stages report Decrypting or Encrypting with the isolated file name; events contain no password. Save As starts its job and paints before its protection choice, reuses the same job during conversion, and balances busy callbacks on cancellation. The 45 catalogs translate named opening/opened and crypto stages. Cancellation/error cannot clear dirty/history or manufacture a delivered file.

Print preparation uses the same real PDF drawing/stage feedback and can cancel before native handoff. A successful Electron print callback produces print-started and the text Sent to the print system; it does not establish physical printing. Native chooser cancellation stays Cancelled, without Ready or saved-file actions. Workbook drawing remains explicitly uncancellable while its synchronous call runs.

Evidence:201 affected units; actual six-format encrypted open/wrong-password retry/edit/save/reopen and six-format Save As Keep/Change/Remove/Protect/PDF-consent-refusal browser gates; actual public100-page opening with named indeterminate phases; en/fr/ar DOM fixtures; exact shared Operation source in generated shell assets and all45 catalogs. The first repeated-body “100-page” fixture actually laid out as85; it was replaced with99explicit page-break-before boundaries and the exact100assertion retained. Browser tests use a source overlay with real compiled UI globals registered as AMD externals and actual dialog sources, not a final package. Native print dialogs are injected in the unit contract; physical printing and matched0.2.1 packages remain unverified. The accepted0.2.0 DMG is unchanged.
## Save As 0.2.1 review candidate

Choose a format from a descriptive list, then choose the destination with the native file dialog. The default matches a supported source format and the destination starts in the source folder. Same-format Save As adopts the new destination; other formats create a copy while the active document keeps its unsaved state. Only the chosen lossy format asks a loss confirmation. Linux also asks Replace/Cancel for existing destinations because native overwrite behavior varies. All-platform styled fallback is the default pending native Mac/Windows evidence. Current evidence and pending checks.

Save As validation uses tests/desktop/save-as-starts.cjs for untitled and converted-copy destinations; supply an absolute public EO_SAVE_AS_LEGACY_FIXTURE in addition to the normal owned runtime/root/Playwright variables. The browser matrix in tests/local-mode/save-as-browser.cjs accepts EO_SAVE_AS_ALL_OUTPUTS=1, EO_SAVE_AS_EDIT=1 and EO_SAVE_AS_REOPEN=1 with the six explicit Office/ODF source formats. The current Linux preflight, corpus and paired hosted results, including separate baseline issues, are recorded in the Save As handoff.

Local PDF parity G2 first-slice review candidate: right-click a selected page thumbnail and choose the existing localized Rotate right or Rotate left command. The actions appear only in explicitly local mode after the preservation runtime marks the PDF writable, and are disabled during local operations or page locks. They keep annotation mode and its original-text-editing restriction. Add/delete/merge/split and signature verification are not enabled. Text comments, square annotations, highlights and ordinary text-field filling already worked in the baseline; the candidate adds their real-toolbar save/reopen regression. See G2 slice evidence for exact scope and unverified native/package gates.
## Named-document close decision,0.2.1 review candidate

Quit names the document with bidi isolation and localized Save / Don't Save / Cancel; defaultSave and EscapeCancel use explicit platform IDs. Busy close retains a safe Cancel default and explicit Don't Save, with the document name and existing recovery/deadline guards. The File-menu Save caption supplies the translated quit action in45catalogs.242units and32localized DOM projections pass; native OS rendering/key delivery remains unverified. See scope and evidence.

## 2026-10-16 — System fonts S1–S4: isolated review addendum

This dated addendum records the isolated fonts review candidate. Earlier text remains the integrated baseline. Historical source/runtime evidence keeps its original profile; r1 validation and remaining gates are recorded separately. No integration, runtime pin, package or release is implied.

The standard free font set and its licenses are bundled: metric-compatible office fonts, school fonts including Marelle, and UI and symbol fonts. The full set remains available as a separate build option; an optional download is not implemented yet. In the 0.2.2 S1/S2 candidate, Computer fonts is enabled for unset desktop settings; explicit prior declines remain disabled and re-enabling uses the native dialog. The switch stays in File > Options. A private worker index gives bundled/metric fonts priority; [scope and limits](desktop-system-fonts.md). Earlier 0.2.0/0.2.1 packages remain opt-in. The renderer receives opaque font handles, not filesystem paths, and reads only recognized font files under those folders, capped at128MiB each with192MiB selected-byte budgets. Static TTC PDF faces are tested; variable system fonts are eligible only at their default instance, with static or synthetic alternatives for other requests. Native screen/export parity remains unverified. Recent document names and native paths are stored locally, limited to fifteen entries.

The start renderer has a strict self-only script policy, context isolation, a sandbox, and no Node integration. The existing editor bundles require inline scripts and eval/Wasm compilation; their separate resource policy permits these while retaining self-only resource connections and no object embedding. The editor iframe shares the start window's origin and can call window.parent.eoDesktop. Its bundled code is therefore inside the bridge's trust boundary: the main-frame IPC check does not isolate the editor from the parent's API. A compromised bundled editor could use the active document handle, request native dialogs, or select a previously authorized recent file. The bridge exposes no arbitrary filesystem read/write API; document saves and PDF exports require the active opaque handle, and computer fonts require the enabled local setting (with explicit prior declines preserved). CSP permits unsafe-inline, unsafe-eval and wasm-unsafe-eval for the editor; the shell has neither inline nor eval permission. Frames are self-only, media is disabled, and blob/data remain only where required for image/font loading and local workers/conversion. Files are authorized through native selection, recent-file selection, command-line opening or an OS-backed drop.

1. Open the arm64 DMG; verify the displayed unsigned-publisher/Gatekeeper behavior without disabling security protections. Copy/run the preview as the owner chooses; confirm About name/version and icon.
2. Use Open, an installed association/double-click, a file URI and OS-backed drop. Check all nine Office associations are alternatives, unsupported extensions are ignored, and a second file reaches the existing instance.
3. Edit/save/fresh-reopen DOCX, XLSX, PPTX, ODT, ODS and ODP; check original/backup safety and disclose the known embedded-ODS object/PDF limitation.
4. Export PDF and inspect saved text/images/fonts; invoke Print, cancel its native sheet, and confirm no job is submitted. A real print job is an owner action.
5. With unsaved changes, test Cmd+W and Quit: Cancel keeps the document, Save writes and closes, Discard closes. Opening another file also requires a discard decision.
6. Exercise App/Settings/Services/Hide/Show All, Edit/Cut/Copy/Paste/Select All, Window/Minimize/Zoom/Close and offline Help. Confirm Cmd+Z and Cmd+Y reach editor undo/redo and closing every window quits.
7. Refuse then allow Computer fonts, check layout/PDF, reopen the profile and confirm persistence. For 0.2.2, confirm a fresh profile enables computer fonts without a prompt, explicit declines survive restart and capture mode remains disabled; earlier releases start without consent.
8. Run offline: open/edit/save/export remain local, renderer Node access is unavailable and external requests are blocked. Record startup separately; no macOS performance target is claimed.

Before building, create an isolated Python environment with `python3 -m venv "$OUTPUT/python"`, activate it with `source "$OUTPUT/python/bin/activate"`, and run `python3 -m pip install -r tools/desktop/requirements.txt fonttools==4.58.0`.

1. Set `UPSTREAM` to that checkout, `FULL_RUNTIME` and `PDF_RELEASE` to the full and PDF manifest-verified release folders, and `OUTPUT` to a fresh output folder outside the source trees. Run `bash tools/desktop/compile.sh`. It installs verified runtimes, runs the SDK and themed web-app production pipelines, restores generated locale/icon changes, and prints `SDK_OUTPUT` and `WEBAPPS_OUTPUT`.
2. Build the four small desktop fallbacks with `python3 tools/desktop/fallback-fonts.py --out "$OUTPUT/desktop-fallbacks" --cache "$OUTPUT/font-downloads"`; use `--offline` once the verified sources are cached. Set `DESKTOP_FALLBACKS=$OUTPUT/desktop-fallbacks` and retain it through fonts, themes and resource assembly. This helper uses the existing release-driver FontTools 4.58.0 pin; exact source/derivative/OFL/NOTICE hashes are verified before generation. Then set `FONT_TOOL_IMAGE` to an immutable Docker image SHA, `FONT_TOOL_ROOT` to its documentserver directory, `CORE_FONTS` and `FONT_PACK` to licensed free-font inputs, and `FONT_OUTPUT` to a fresh output folder. Run `bash tools/desktop/fonts.sh` (`FONT_SET=standard` by default; `FONT_SET=full` for a separate full-font build). The generator runs without network access and explicitly excludes system fonts.
3. Generate the presentation theme catalog with `bash tools/desktop/themes.sh`, using the same pinned font-tool image, production SDK/web-app outputs, `DESKTOP_FALLBACKS` mount and free-font inputs. Set `THEMES` to its generated output directory.
4. Set the printed production output paths, `FONT_FILES=$FONT_OUTPUT/fonts`, `ALL_FONTS=$FONT_OUTPUT/AllFonts.js`, `FONT_IMAGES=$FONT_OUTPUT/Images`, the font-source paths (for standard builds, `CORE_FONTS=$FONT_OUTPUT/inputs/core` and `FONT_PACK=$FONT_OUTPUT/inputs/pack`, including the matching bundled notices; for a full build, retain its licensed original input paths), `PDF_RUNTIME` to the folder containing `current.json` and its versioned release, `TEMPLATES` to the directory containing the three `new.*` Office templates, `DESKTOP_FALLBACKS` for the matching small fallback files/notices, and `UPSTREAM`. Run `bash tools/desktop/build.sh` with a fresh `desktop/assets` directory. Preserve or move any previous assets first.
5. The script verifies production editor/SDK bundles and all six files in each Wasm release, hashes the complete resource set into `desktop-manifest.json`, installs the pinned lockfile, runs units, and produces both Linux packages. Generated resources, dependencies and packages are ignored by Git.

Existing packages use the shared 39-language Home manifest. The desktop0.2.2 S4 candidate merges a separate24DOCX/24PNG overlay for ja, zh, zh-tw, ko, si and ur. Sinhala/Urdu use the small offline pack; CJK requires consent and eligible covering system fonts, otherwise Home/opening retain English fallback. The server catalog remains unchanged. See docs/home.md and docs/desktop-system-fonts.md for real preview/coverage evidence and native acceptance limits.

S3 adds four small renamed static Arabic/Sinhala fallback faces (882,628 font bytes), including explicit synthetic italic behavior with Computer fonts off. The generated font resources and notices grow by 1,022,525 raw bytes in the controlled comparison; full installer deltas remain unverified. See [source pins, priority, real converter evidence and extraction limits](desktop-system-fonts.md#small-bundled-desktop-fallbacks--s3).

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/desktop-system-fonts.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.


### Local PDF page-order review candidate
Existing pages can be moved using thumbnail drag, including multiple selected pages and the end boundary, in one undoable action. This is enabled only for a verified writable local PDF while no open/save operation is active. It retains page count and source bytes through incremental saving; page insertion/deletion and original-text editing remain unavailable. Hosted thumbnail behavior is unchanged.
The synthetic public five-page classic/compressed regression covers distinct page identities, MediaBox/CropBox, nested outlines, internal destinations, raster images, text-field values, annotations, XMP and document information, actual English/French gestures, grouped Undo/Redo, repeated save and fresh reopen. Independent Poppler rendering compares every reordered page to its source identity. This does not qualify arbitrary PDF structure or native platform packaging.


### 2026-10-16: page-order baseline blocked by inherited attributes
The expanded baseline fixtures exposed a writer limitation: a grouped move
through a nested Pages tree can retain the original byte prefix and page order
while losing the moved page's inherited MediaBox and Rotate. In the synthetic
case, logical page 4 becomes output page 3 with 652-by-872 instead of 642-by-852
and zero instead of 270-degree rotation. Poppler and pypdf independently confirm
the mismatch. The moved text widget's page reference remains correct, but that
does not make the output safe. That baseline candidate was blocked pending a writer repair or safe structural
refusal.
At that baseline, named-destination PDFs were refused by the
unsupported-catalog policy. The required positive test could not pass; the guard
was retained during diagnosis. Flat classic/compressed tests and Undo/Redo
after actual Save pass. Nested single-move inheritance and widget binding pass;
the full nested/group/repeated baseline qualification did not pass.
The independent structure check uses pypdf==5.9.0, pinned in
tests/pdf-local/requirements.txt; install it in the test environment used by
EO_PDF_STRUCTURE_PYTHON (default python3). Production browser tests retain the
positive assertions for all required structures. Native packages and a runtime
change are outside this review correction.


### 2026-10-16: inherited page-order source repair qualified separately
Core branch elixir/pdf-page-order-core-A (39ca5772b4) resolves the original page
by its stable object reference before copying inherited attributes. With the
separate c81d qualification module, all six classic/compressed/Pages-inherited/
named-destination inputs pass actual single, group and end moves, Undo/Redo after
Save, repeated incremental saves and fresh SDK reopen in English at DPR2 and
French. Independent pypdf verifies every page's Resources, MediaBox, CropBox,
Rotate and unchanged object identity, plus named targets and widget /P binding.
The 90 Poppler page comparisons per language have zero mean pixel difference.
All 278 units and 33 native inspect/edit policy fixtures plus three malformed
jobs pass. Signed/encrypted/XFA/scripted/tagged and malformed Names trees remain
refused. Hosted smoke has no errors; the one previously paired Windows
navigation failure remains, with other Windows and Mac shortcuts passing.
The published runtime pins remain unchanged. Old runtimes lack reorderSafe and
the new local gate denies reordering; the actual six-input old-runtime browser
gate preserves order/history. D must build and qualify one combined 0.2.2
runtime pair with security and RTL changes. This isolated binary is never a
release pin. The neutral source patch and regression recipe are in
tools/wasm/review-patches/; integration remains with the lead.

Dialog accessibility 0.2.2 slice 1: Recovery and Options reference their existing visible headings with distinct IDs on repeated openings. The shared editor naming/field-label changes and browser-versus-native acceptance limits are recorded in the slice handoff.

### Home RTL component review (0.2.2)

Shared Home assets include Arabic/Hebrew/Urdu start labels and direction-aware layout. The desktop renderer aligns tile/file labels to logical start and isolates displayed recent filenames/folders with BDI. Embedded Home uses the same logical alignment. Actual assembled45-locale assets/public previews and standalone/embedded renderers are checked in a browser; native Electron startup/close, OS dialogs, actual file opens and packaging are outside this component gate. Existing template font fallback and save/quit behavior are unchanged. See [Home UI tests](../tests/home-ui/README.md).


### Shared Home appearance review (0.2.2)

Home assets include the same UI theme resolver as the web start page. The standalone head loads it before CSS; embedded rendering binds the Home container to its owner document's current app preference. The scoped backstage stylesheet carries the same light/dark tokens and retains the production inline backstage rules. The browser component gate checks40 localized standalone/embedded combinations with system and explicit opposite-system choices; a parent-renderer/foreign-owner fixture checks live host state, OS changes, stable panel reuse, the bind disposer and recent-file callback. It leaves the host root/body untouched. Native Electron lifecycle, Options UI interaction, final packages and OS dialogs remain unverified. [Appearance tests](../tests/home-theme/README.md).

## Open-error resilience (0.2.1 follow-up)

Unreadable recent metadata is isolated per entry. User-document reads retry EBUSY once after100ms while retaining file identity; failures use45-language OPEN guidance and code-only local diagnostics. Existing SAVE/cancel/recovery policies remain unchanged. Validation and limits.

## Desktop keyboard routing,0.2.1-rc.5 review candidate

Desktop file shortcuts follow Office while an editor iframe has focus. Windows/Linux use Ctrl+N/O/S/P and F12 for Save As. Ctrl+Shift+S (Word Apply Styles), Ctrl+Shift+E (Track Changes) and Ctrl+Q (remove paragraph formatting; Excel Quick Analysis) remain editor commands. Quit is available through the menu/window close, including the OS Alt+F4 convention. PDF export has no assigned shortcut and stays in File.

macOS keeps Cmd+N/O/S/P, Cmd+Shift+S for Save As and Cmd+Q for Quit; Cmd+Shift+E remains an editor command. F12 is not reserved by the shell on Mac. New follows the current document family. Only exact native file chords are intercepted; repeats cannot open duplicate actions and Quit/window close retain the existing unsaved/busy guards. Capture cannot invoke these commands. Non-Latin letter layouts use the physical KeyN/KeyS-style code; Latin layout labels remain authoritative, and AltGr/IME are excluded.

The browser-reserved-key hint and its help entry are suppressed for the preload desktop bridge or explicit browser-local API. Hosted behavior and browser-local alternative editing keys remain unchanged. No new translated strings or runtime dependency.

The corrected Linux private-Xvfb/XTest gate has36passing rows:25exactly-once file commands across Home/Word/Excel/PowerPoint/PDF; four trusted unowned-key checks; four notice profiles (Word/Cell/Slide absent notice+dialog, PDF no controller); guarded window close exit0; and two actual Word behavior checks. These prove Apply Styles opens, Track Changes toggles/restores, Ctrl+Q removes direct paragraph formatting without quitting, and F12 reaches the actual desktop Save As chooser and cancels safely. Other New/Save/SaveAs/Print routing observations suppress command effects; they are not file-output/printer acceptance. Earlier39-row evidence used the superseded mapping and is retained as native-shortcuts-pre-office-review.json.

Native testing requires EO_PLAYWRIGHT, EO_NATIVE_WORK, EO_ELECTRON, EO_XVFB and EO_XDOTOOL and uses a fresh private Linux display with mandatory sandboxing. The development host extracted test runtime uses the existing root-owned system Chrome sandbox helper through an isolated symlink; system files are unchanged. Windows/macOS native delivery, Arch/niri Wayland, physical200percent scaling and real non-Latin OS-layout input remain unverified; platform/menu/layout/AltGr/IME mappings have unit coverage. Source evidence is not rebuilt rc.5 package acceptance. See tests/desktop/native-shortcuts.cjs and tests/desktop/receipts/native-shortcuts-rc5.json.

release review Windows follow-up: preference queue draining recovers after failed writes; optional recent persistence cannot invalidate a successful open/save. Font discovery skips unreadable entries and native app identity is ElixirOffice without relocating the profile. RC222/34/26 and focused Windows7/font1/open8 pass. Evidence and native limitations.

## Desktop menu and notification behavior

On Windows/Linux the native menu bar stays hidden; its menu and accelerators remain installed, alongside the desktop before-input handler. The macOS application menu is unchanged. Successful and cancelled informational toasts expire after eight seconds of unpaused display. Hovering or focusing the notice pauses the remaining time; errors and warnings remain until dismissed. File-backstage operation details remain available. The accessible live announcement survives visual expiration. No browser/server behavior or runtime pin changes. Tests: `tests/desktop/menu-visibility.test.cjs`, `tests/desktop/feedback-autodismiss.cjs` and existing shortcut/feedback regressions.

F1 routes through the native before-input handler even when the editor iframe has focus. File backstage provides native Help, About and a guarded Quit action, translated in all 45 shell locales. Help and print child windows also hide their native menu bars on Windows/Linux. Toasts with Open file or Show in folder actions stay until dismissed; only plain informational notices expire after eight unpaused seconds. The reported intermittent print exit on elementary OS 6.1 (Ubuntu 20.04 base) remains an unresolved limitation: public DOCX/XLSX/PDF tests on the same installed binary did not reproduce the owner report. No root cause or printing fix is claimed.


Desktop Close/Open review for 0.2.2: File > Close shares the named quit choices and platform defaults. Save on an untitled document uses the shared Save As format/destination-ticket path; Home waits for committed output and a fresh dirty/pending-picture check. The full Open drop zone uses desktop CSS for its width and visible focus in Home and the editor. Current-main baseline 286/286; candidate 305/305 desktop, 37/37 local and 46/46 simulated Darwin pass. Actual sandboxed Linux Electron covers five Close outcomes, fifteen Open checks and a native Save/real-ticket/precommit-ordering test. Evidence


## Windows file access

Windows saves retry temporary access refusals within a shared five-second window, configurable up to fifteen seconds, while retaining the saving state. After a refused replacement, an existing single-link file can use a verified-backup in-place fallback; failed or unsafe restoration keeps the backup and shows translated recovery guidance. AutoRecover uses the same strategy. Computer font discovery retains readable system, per-user and exact local registry fonts despite individual failures, without scanning registry parent folders. Persistent failures keep fixed-code local diagnostics. See [Windows document and font access](windows-file-access.md).

Windows backup flushing uses a write-capable handle for repeated document, AutoRecover and preference saves. Directory flushing remains disabled on Windows; Linux/macOS retain equivalent save behavior. [Windows file access](windows-file-access.md).

Cancel reaches an active native save retry. Forced close stops queued writes and waits for active write cleanup or restoration; abandoning close permits new writes again. An uncertain restoration keeps its backup, names that backup without a folder path and waits for acknowledgement before closing. Computer font indexing falls back to bounded registry queries if PowerShell cannot run, preserving readable records despite an individual query or encoding failure. [Windows file access](windows-file-access.md).


## Local password choices

Local password choices and the warnings before exporting an unprotected copy or removing protection follow the editor language, with English fallback. No or Cancel preserves protection and stops the operation. Existing conversion, recovery and save safeguards remain in place. [Behavior](local-passwords.md).

Guided feature tips stay clear of editor dialog actions and the AI bar/settings. They can resume after the last surface closes while their associated control remains available. Connection, session and license warnings retain their existing behavior. [Guided tips](guided-tips.md).

### Printing compatibility and private temporary files

The printing correction has a six-second compatibility grace period when the loaded PDF viewer's internal readiness fields are unrecognised. Known loading, incomplete and failed states do not use that fallback. A real-Electron contract check detects field changes independently of the fallback. Printing failures, timeouts and helper failures have distinct messages in all 45 desktop languages.

On Linux and macOS, private print directories and PDFs use modes 0700 and 0600. On Windows, these POSIX mode bits do not create a DACL: temporary jobs inherit the current user's application-profile ACL. The application does not override Windows profile ACLs; profiles must remain private to their user.

The normal helper remains hidden. For supervised diagnosis only, setting EO_PRINT_OFFSCREEN_RETRY=1 before launch enables one retry with an off-screen, minimized helper after a definite failure. It is disabled by default. Cancellation, an uncertain native callback timeout, cleanup failure or a renderer crash after submission never retries, avoiding duplicate or unwanted jobs. This contingency still requires native qualification on the affected platform.

CI must run npm run test:print-viewer from desktop with an explicit private EO_PRINT_CONTRACT_OUT and an owned display. It launches the pinned Electron and reads the actual PDF viewer; it never uses mocked readiness or accepts the compatibility fallback. A changed field contract fails with a specific error and last-state evidence.

### Native print choice feedback

While the system print dialog owns a print choice, the desktop floating operation panel stays hidden. Its separate polite live region remains available to assistive technology. Preparation progress remains visible before this phase; submission, cancellation and errors restore their normal feedback afterward. Other Save As, PDF export and Open choices retain their existing feedback. This does not change print submission or claim that a physical page has printed.

### PDF export progress

Large document exports display conversion stages and real page counts, then keep Open file and Show in folder actions after the native save completes. A generated public 300-page DOCX regression checks intermediate visible counts, all saved page labels and the unchanged source file using the packaged Linux application. [Regression](../tests/pdf-export/README.md).

## Document tabs in review captures

With the tabbed shell, the explicit capture flag records the tab strip together
with the active document's start page, editor Home and File backstage. The image
covers the application client area; native OS window decorations are outside it.
Keep the window unchanged while the capture runs. Captures refuse a changed
owner, hidden or resized view, inconsistent pixel scale or transparent surface
instead of producing an incomplete image.

The shell refreshes its language for each requested locale. Each captures.json
screen records the composition kind, shell language, logical and pixel dimensions,
scale and excluded native frame. Captured pixels remain in the main process.

The composition helper is checked on real sandboxed Electron44.7 views at scales
1,1.25,1.5 and2 on private Linux X11. The complete source-app capture flow produces
six English/French images at1x. New packages and physical Windows/macOS require
their own acceptance. Capture mode uses its own profile in the output folder.
Its local resource transport uses an uncached memory session so default-session
cache writes cannot recreate that profile during shutdown. Startup print-job
cleanup is bound to the selected capture profile and preserves the ordinary
profile's pending print files.

### Linux runtime dependencies

The DEB declares `libasound2t64 | libasound2`, `libgbm1`, `libgl1`, `libegl1`, `libgles2` and `libopengl0` explicitly. Ubuntu 26.04 and Debian 13 provide ALSA in `libasound2t64`; Debian 12 uses `libasound2`. The graphics interface package names are shared across these releases; their dependencies resolve the corresponding system graphics implementation.

Audit all packaged ELF files immediately after a DEB-only installation with `--no-install-recommends`, before installing Xvfb or other test tools. Iterate missing-library resolution to a fixed point and compare the result with dynamic-loader observations, the community Arch package and the exact builder defaults. Installing test tools first can conceal missing runtime dependencies. The release assertion builds a DEB and checks the audited dependency set in both `dpkg-deb -f` and `dpkg-deb -I`.

These dependency checks do not certify native startup or application behavior. See the [graphics dependency decision](decisions/desktop-linux-graphics-dependencies.md) for scope and current qualification limits.

## 0.3.1 File backstage candidate

The desktop extension reorders the existing shared menu nodes, preserving their
controllers and keyboard focus handling: Home, New, Open; Info, Save, Save As,
Print, Export, Close; Options, Help, About. Back and guarded Quit remain available.
A configured AI connection retains its existing entry beside Options. The web
interface is unchanged.

Rename lives in Info and the existing Save As area. Info keeps the shared
property fields, protection and inspection controls. Its window action is
explicitly labelled **Move to another window** in all 45 shell locales; it moves
the live document view through the existing guarded destination menu. It does
not move or delete a file on disk. Physical file relocation and a local folder
display are still pending separate implementation.

Export opens the same native-backed format selection flow as Save As, including
PDF and the current document family's supported formats. Cancellation retains
the editor and its saved state. This slice does not change conversion, native
destination leases, print handling, close/recovery ownership or Home/New content.

Tests: the focused VM cases cover both Print variants, stable repeated ordering,
native Export dispatch and Info actions. The isolated sandboxed Linux source
smoke clicks the real shared views, cancels Rename and Export, and edits a title
through Info before verifying its actual saved DOCX/XLSX/PPTX core XML. PDF
metadata round-trip, native platform dialogs, real Windows/macOS and rebuilt
packages remain separate acceptance checks. Run the source smoke with the
existing private-display runner, `tests/desktop/tabs-native.py --suite backstage`.

## 0.3.1 shared start-page follow-up

The standalone desktop Home page uses the Office-style left rail: Home, New and
Open, with Options, Help and About below. Options works before a document opens;
Cancel leaves Home available. The window owns application identity, so Home
does not add another brand bar. A 200-pixel text rail uses the existing Fluent
theme tokens and 14-pixel labels, with a narrower layout for small windows and
logical spacing for RTL.

The same renderer supplies embedded File Home/New/Open. It adds no second rail
there. Three blank thumbnails, four localized approved templates, Browse,
recent-file type/name/folder/date and the local-document privacy footer remain
the existing shared components. This slice changes no runtime, conversion or
native save/close/recovery policy. The compact title bar is a separate slice;
the native frame remains in use here.

The opt-in capture path now obtains the expected content offset from the trusted
window host. A visible document strip still requires a strict two-surface
composite. When the strip is absent, the document view covers the complete
client area; Chromium cannot capture the fully occluded shell. In that layout
the capture uses the visible full-client document surface. Both paths verify
live ownership/attachment, unchanged revision and bounds, measured native alpha,
opaque visible pixels and matching pixel scale. Capture receipts report the
actual strip height and whether a full-client view or composite was captured.
The existing explicit-flag/parser restrictions remain.

Source evidence: functional Home/template tests, all legacy and new compositor
checks, actual isolated sandboxed Linux Home/Options/recent/keyboard/RTL/dark
checks, and the normal strict capture CLI producing six EN/FR start/editor/File
PNGs with exit0. A diagnostic logging wrapper identified the occluded-shell
error but is not used for final acceptance. No installed package, native
Windows/macOS, physical keyboard/window-manager or native file-dialog
qualification is inferred. Tests: `tests/desktop/home-content.test.cjs`,
`home-native.cjs`, `home-capture-native.cjs` and
`capture-composite.test.cjs`.

### Compact title bar (0.3.2 candidate)

Options > Window offers a compact title bar on qualified Linux/X11. It applies to new windows; turning it off restores the system frame for subsequent windows. Windows/macOS/Wayland keep the native frame. [Behavior, tests and limits](desktop-compact-titlebar.md).
