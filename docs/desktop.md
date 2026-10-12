# ElixirOffice desktop

The desktop edition opens and converts documents on this computer with the bundled WebAssembly runtime. It needs no document server or account. The hosted edition remains server mode by default.

This preview targets Linux x64, Windows x64 (NSIS cross-built on Linux), and macOS arm64 (DMG built on the owner Mac). Native Windows acceptance still needs the owner PC or VM. The first packages have no publisher certificate; signing follows with owner certificates.

## Using the app

Start ElixirOffice and choose New document, New spreadsheet, New presentation, Open, or a recent file. You can also pass a document path on the command line, use the installed Office file associations, or drop an Office document into the app.

DOCX, XLSX, PPTX, ODT, ODS and ODP use local conversion. Save writes back to the selected file; Save As chooses another destination in the current format. New files initially use DOCX, XLSX or PPTX. Legacy DOC/XLS/PPT imports, when accepted by the converter, save to their modern equivalent and preserve the original.

An asterisk in the window title means there are unsaved changes. Closing offers Save, Discard and Cancel. Opening another document requires a discard decision when the current document has unsaved changes. Only one app instance runs per user; opening another file sends it to that instance.

Export PDF uses the native WebAssembly PDF writer with document fonts and images. Print submits the resulting PDF through the operating system's print dialog. Cancelling a dialog does not submit a print job.

Save prepares and flushes a sibling temporary file, verifies the selected original, keeps a sibling backup while replacing it, and flushes the directory on Linux/macOS. Failed replacement retains the backup and reports its path. A changed original requires Save As. This is not an interprocess file lock; avoid editing the same file simultaneously in another program. Symlink destinations/folders are refused. Files must be regular Office documents under 512 MiB; the save preserves ordinary permission bits, but does not promise preservation of extended ACLs or filesystem ownership.

## Privacy and fonts

There is no TCP document server, telemetry or automatic updater. The app serves its own privileged eoapp resource scheme inside Electron; external resource and network requests are blocked. Local conversion and PDF export use packaged bytes. AI is off in this release; no remote AI configuration or provider traffic is enabled by the desktop shell.

The standard free font set and its licenses are bundled: metric-compatible office fonts, school fonts including Marelle, and UI and symbol fonts. The full set remains available as a separate build option; an optional download is not implemented yet. Computer fonts asks for consent in a native dialog before enumerating standard system and user font folders. Consent is stored once in the app's local profile. The renderer receives opaque font handles, not filesystem paths, and reads only recognized font files under those folders, capped at 20 MiB each. Recent document names and native paths are stored locally, limited to fifteen entries.

The start renderer has a strict self-only script policy, context isolation, a sandbox, and no Node integration. The existing editor bundles require inline scripts and eval/Wasm compilation; their separate resource policy permits these while retaining self-only resource connections and no object embedding. The editor iframe shares the start window's origin and can call window.parent.eoDesktop. Its bundled code is therefore inside the bridge's trust boundary: the main-frame IPC check does not isolate the editor from the parent's API. A compromised bundled editor could use the active document handle, request native dialogs, or select a previously authorized recent file. The bridge exposes no arbitrary filesystem read/write API; document saves and PDF exports require the active opaque handle, and computer fonts require consent. CSP permits unsafe-inline, unsafe-eval and wasm-unsafe-eval for the editor; the shell has neither inline nor eval permission. Frames are self-only, media is disabled, and blob/data remain only where required for image/font loading and local workers/conversion. Files are authorized through native selection, recent-file selection, command-line opening or an OS-backed drop.

## Linux packages

Build outputs are `desktop/dist/ElixirOffice-<version>-linux-x86_64.AppImage` and `desktop/dist/ElixirOffice-<version>-linux-amd64.deb`.

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

Set `EO_DESKTOP_ROOT` to an isolated test directory containing `desktop/`, public `fixtures/`, `results/`, `profiles/`, the Electron executable at `tools/electron/electron`, and Playwright at `tools/node_modules/playwright-core` (or set `EO_PLAYWRIGHT`). The Linux real-desktop harness uses DISPLAY=:0 and its own Xauthority copy. Never run it against another session's profile.

`benchmark.cjs` records five fresh-profile and five warm-profile runs each for the empty document and the public fixture named synth100.docx (97 actual pages). OS page caches remain unchanged. It measures the external spawn epoch to a renderer epoch recorded at full layout completion, polling every 100 ms, matching the prototype method. It also retains the separate harness observation elapsed time and asserts the actual page count. It samples process-tree PSS at readiness, not peak PSS. Compare with the session D prototype medians: empty 2.73 s fresh / 2.04 s warm, 97 pages 8.30 s fresh / 7.09 s warm. Do not equate fresh profiles with a cold OS cache.

An ODS fixture with two embedded charts currently loses an object in the local editor open/save pipeline and lacks a preview image needed for PDF export. The same public fixture fails in web local mode; a direct Wasm ODS-to-editor-to-ODS round trip retains both objects, so this is not attributed to the desktop worker. Reproduction and the distinct image/serialization traces are recorded in the shared ODS ticket. This remains a failing acceptance check. A conservative package guard explains that the local converter could not preserve all embedded objects and offers Cancel or Save a copy. The copy requires a different native-selected destination; the original path, hard-link aliases and the original inode after a rename are refused. This check can also warn about an intentional object deletion. The original remains unchanged, but an explicitly accepted copy may lack objects; this does not establish converter fidelity.

The installer development dependency audit reports eight moderate transitive findings; the runtime dependency audit reports zero. These installer dependencies are not shipped as runtime modules.

Superseded full-font preview acceptance on <test-desktop> (2026-10-10; these are not the final standard-font packages): both extracted packages pass document argument/edit/atomic-save/fresh-reopen, native Wasm PDF with the saved edit marker, a reachable control endpoint receiving zero renderer requests, no renderer Node access, and all 18,604 packaged resource hashes plus licences. Native Print cancellation, three new templates/Save As, immediate dirty-close Cancel/Save, startup queue, legacy imports and persistent font consent also pass. Installed double-click association registration remains unverified because these tests do not install packages. ODS fidelity remains FAIL.

Five fresh-profile and five primed warm-profile measurements per document, after package extraction and GUI tests completed:

| Document | Fresh median | Warm median | Readiness PSS fresh / warm | Prototype fresh / warm |
| --- | --- | --- | --- | --- |
| Empty (1 page) | 4.661 s | 4.702 s | 518.7 / 516.2 MiB | 2.73 / 2.04 s |
| Synthetic (97 pages) | 7.330 s | 6.616 s | 634.2 / 626.6 MiB | 8.30 / 7.09 s |

These historical figures use the original harness observation timing. The full app opens the empty document more slowly than the prototype; the 97-page result is faster in this run. These readiness PSS samples cannot be compared directly with the prototype peak PSS. OS caches were not cleared. The earlier run that overlapped extraction is excluded from acceptance. Performance improvements in the shared SDK remain session D's work.

Linux review revision (2026-10-11): the standard-font packages contain 18,445 hashed resources and eleven themes. The final AppImage is 476,761,370 bytes (476.8 MB), and the DEB is 664,189,698 bytes (664.2 MB), compared with 566,772,988 and 753,841,660 bytes for the full-font preview. Both extracted final packages pass all 18,445 resource hashes and licences, actual file-URI open/edit/atomic save/native PDF/fresh reopen, no renderer Node and controlled reachable-endpoint network denial. Their installer bytes and app.asar hashes match across <dev-host> and <test-desktop>. Both omit a homepage URL. The full font inputs and the explicit full-font build option remain available; no optional-download feature is claimed.

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

The reduced second-review packages both pass native file-URI open/edit/atomic save/native Wasm PDF/fresh reopen, no renderer Node and controlled reachable-endpoint network denial on the unlocked test desktop. Both verify all 17,896 resource hashes/licences and match artifact SHA256 across <dev-host> and <test-desktop>. The earlier locked-desktop GUI failure is retained separately. These checks accept the unsigned preview; they do not resolve the documented ODS/startup limitations or establish installed association acceptance.

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
