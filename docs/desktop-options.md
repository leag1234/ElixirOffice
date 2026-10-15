# Desktop, browser-only, mobile versions: options and choice

Reference document (created 2026-10-07 at the owner's request). Criterion no. 1: **speed** (startup, opening, typing, memory), then fidelity to the web behavior, maintenance and size.
Statements marked "to verify" come from general knowledge of the ecosystem, not from a measurement made here: the first task is the test bench of section 4.

## 1. What has to run

| Component | Role | Replaceable by |
|---|---|---|
| Web engine (JavaScript, canvas, workers, WebAssembly) | web-apps interface + sdkjs editing engine | embedded browser (Chromium) or the system web view |
| x2t converter (C++) | .docx/.xlsx/.pptx ↔ internal format, and export | native program shipped with the app, or WebAssembly version |
| PDF / image rendering | uses the JS engine on the native side (doctrenderer, V8) in the server version (to verify for a WebAssembly version) | browser JavaScript |
| Fonts | faithful rendering | system fonts + our free pack |
| Server (docservice, databases) | co-editing, storage | unnecessary locally; only needed for shared work |

## 2. The options

| # | Option | Pros | Cons | Speed | Size |
|---|---|---|---|---|---|
| A | **Upstream desktop application** (Qt + CEF + native libraries) | complete, already there, native converters | frozen at 9.3.1, CEF 109 (Chromium from early 2023, security risk), no macOS, heavy build | good (native) | ~300 MB+ |
| B | **Electron + native x2t** (program shipped alongside) | a single engine (Chromium) on the 3 systems, easy updates, our interface as is, fast native conversion | heavy application, one Chromium per application, signing and notarization per system | very good; startup 1–2 s | ~150–250 MB |
| C | **Electron + WebAssembly x2t** | a single binary with no native program to compile per system | slower conversion than native (to verify: factor 1.5 to 3), 32-bit WebAssembly memory limit (4 GB), PDF export to verify | medium on big files | ~200 MB |
| D | **Tauri + native x2t** (system web view: WebView2 / WKWebView / WebKitGTK) | very light, fast startup, no embedded Chromium | different engines depending on the system (Chromium on Windows, WebKit elsewhere), engine age tied to the OS, WebKitGTK to install on Linux, risks on canvas, workers, clipboard, fonts | to measure (WebKit may be slower or faster) | ~10–30 MB |
| E | **Tauri + WebAssembly x2t** | the lightest and most portable | accumulates the risks of D and C | to measure | ~30–60 MB |
| F | **Direct CEF** (in-house C++ shell + recent Chromium) | full control, up-to-date Chromium, option A's core modernized | a lot of C++ to write and maintain; Electron equivalent at a higher cost | very good | ~150–250 MB |
| G | **Qt WebEngine** (Chromium in Qt) | native Qt interface, one engine | Qt license and weight, heavy to maintain | good | ~200 MB |
| H | **Three native shells** (WebView2 + C#, WKWebView + Swift, GTK + WebKitGTK) | best integration with each system (menus, files, printing) | three code bases, three web engines to validate | to measure | ~10–30 MB |
| I | **Wails / Neutralino / Flutter-webview** | light, close to Tauri | smaller ecosystem; same limits as D | to measure | ~10–30 MB |
| J | **Installable PWA + WebAssembly x2t** | no installation, offline through service worker, a single version everywhere | limited file access on Safari (File System Access API mostly Chromium), no system integration, slower conversion | medium | 0 (browser cache) |
| K | **Embedded local mini-server** (slimmed-down docservice + x2t, the browser opens localhost) | reuses the server architecture as is, co-editing possible | heavy stack (Node, database, message queue), processes to manage, ports, firewall | good after startup; slow startup | ~500 MB+ |
| L | **Simple wrapper around the web service / Nextcloud** | trivial, nothing to compile | no offline, no local conversion, depends on the network | depends on the network | ~10–150 MB |
| M | **Mobile** (Android / iOS): WebView + native or WebAssembly x2t | reuses the interface | editor to adapt to touch, limited memory; WebAssembly likely on iOS | to measure | 50–150 MB |

## 3. Combinable leads

- **Browser-only version** (J, C, E): also unlocks remote testing from a static hosting (GitLab Pages), maximum privacy and the brief's offline mode. Co-editing and direct Nextcloud access (WebDAV from the browser) are missing.
- **Fonts**: on desktop, system fonts are read before our clones (substitution rule: real font > metric clone > close free font), and the installer can install our free pack.
- **Offline + local AI**: a desktop version is the right place for a local AI engine (Ollama / llama.cpp), see the project roadmap.

## 4. Test bench to run before choosing

Same documents (10 and 100 pages, table, images, school fonts), same machines (Apple Silicon Mac, Windows 11, Linux):
1. **Cold start** until the editor is usable; **opening** a 10- and a 100-page .docx; **typing latency** p50/p95; **scrolling**; **memory**; **installation size**.
2. In **WebKit** (WKWebView, WebKitGTK) and **Chromium**: canvas rendering, clipboard, fonts, printing, drag and drop, shortcuts.
3. **Native x2t against WebAssembly**: opening and saving times, memory, PDF export.
4. Comparison baseline: the upstream desktop application (option A) on Windows and Linux.

Tools: `tools/perf` harness (Playwright, already written), Playwright WebKit (already installed on development host), `tools/fidelity` fidelity bench to check that rendering is identical.

## 5. Provisional recommendation (to be confirmed by the test bench)

1. **First desktop version: option B (Electron + native x2t).** It is the safest and fastest route to deliver: same engine everywhere, performance measured on Chromium (that is what we optimized), native conversion.
2. **In parallel, feasibility study of x2t in WebAssembly** (options C, E, J): this is what opens the browser-only version and remote testing without a server.
3. **Tauri (D)** if the test bench shows that WebKit holds up on speed and compatibility: an application ten times lighter.
4. To rule out for now: F, G, H (maintenance cost), K (too heavy), L (no offline).

## 6. Cross-cutting work to plan

Compiling the converter for Windows, macOS (arm64 and x64) and Linux; signing and notarization (macOS), signing (Windows); automatic updates; installer that offers the font pack; file type association; opening from the file explorer; Nextcloud / Murena Workspace storage integration.

## 7. System fonts with a web view (clarification of 2026-10-07)

A web page, even in an embedded web view, **cannot directly read** the system fonts: it is the same restriction as in a browser. What changes on desktop is the **native shell** around the web view (Electron, Tauri…), which can read the disk:

1. At first launch (and when fonts change), the shell runs **our font list generator** (`AllFontsGen`, already in `core`, target `core/allfontsgen`) on the system font folders (Windows: `C:\Windows\Fonts` and the user's folder; macOS: `/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts`; Linux: `/usr/share/fonts`, `~/.local/share/fonts`) **plus our free pack**. It produces the same `AllFonts.js` and the same indexes as the server.
2. The shell exposes these font files to the page through a **local protocol** (Electron: `protocol.handle`; Tauri: assets protocol limited to these folders). The editor loads them as it loads the server's fonts today.
3. The **native converter** (x2t) reads the same folders: PDF export and opening therefore use the same fonts as the screen.

This is how the desktop application of the upstream project proceeds (CEF + `AllFontsGen`). Substitution rule unchanged: font actually installed under the requested name > metric clone > close free font.

Consequences for the choice:
- **One more binary** has to be shipped per system: `AllFontsGen` (or call it through x2t/docbuilder).
- With a system web view (Tauri), the page only receives the fonts through this protocol: plan to test it in WKWebView and WebKitGTK (loading fonts from a custom protocol, text measurement on canvas).
- Chromium variant (Electron, WebView2): the local fonts access API (`queryLocalFonts`) also exists, but requires the user's permission; the route through the shell avoids this prompt.

## 8. W6 D: static editor + x2t.wasm shell study (2026-10-10)

### Recommendation for the owner

Prototype **Electron + x2t.wasm (C)** on Linux first; retain **Tauri 2 +
x2t.wasm (E)** as the footprint challenger. This supersedes section 5's native
converter recommendation for the local-conversion target. Electron provides a
controlled Chromium engine and explicit printing APIs; Tauri needs additional
WKWebView/WebKitGTK qualification. Speed remains the first criterion: the owner-approved D2 Linux benchmark below
favours Electron for usable-document speed and whole-tree PSS, while Tauri
shows a faster fresh native window. The owner decides before any product
prototype is integrated.

The converter becomes platform-independent, but shells still need platform
builds, signing and native glue for files, fonts and printing. W2 fonts, W3 local
open/save and W4 engine qualification are dependencies, not completed features
assumed by this study. W1's PDF-only module cannot open Office files.

### Baseline and measurements on development host

Scratch evidence: /srv/elixiroffice/wt/w6-D-work/electron-release.json.
The original document has estimates and a proposed bench, not shell results.

| Observation | Result | Limit |
|---|---|---|
| Official Electron v44.7.0 Linux x64 ZIP downloaded on development host | 122,998,223 compressed bytes; 296,307,552 uncompressed file bytes; 72 entries | Engine distribution only, excluding editor, converter, fonts, installer and block allocation |
| ZIP SHA-256 | 3ae7d5bdad61c664486c6ab61361dd084d064c8c08af8d13a687096e18ce555a | Artifact identity, not signature verification |
| Installed WebKitGTK package | libwebkit2gtk-4.1-0 2.52.6; Installed-Size 93,416 KiB | Package metadata, excludes dependencies; not memory |
| Installed GTK package | libgtk-3-0t64 3.24.41; Installed-Size 9,772 KiB | Same limitation |
| Benchmark prerequisites | No DISPLAY/WAYLAND_DISPLAY, Xvfb, cargo or rustc | GUI startup, RSS/PSS and compatibility unverified |
| Existing full W0 wasm | 53,064,743 raw bytes / 8,778,766 Brotli; glue 141,843 raw | Historical converter measurement, not complete app |
| Existing 97-page conversion, wasm study section 12 | 412 ms warm; 525 ms cold conversion + 408 ms init | build host Node; excludes shell, editor and file I/O |

Reproduction: Python urllib fetched GitHub /repos/electron/electron/releases/latest,
selected the Linux x64 ZIP, downloaded it and summed ZipInfo.file_size. The JSON
records URL, hash and byte counts. dpkg-query supplied Installed-Size. Archive
download duration is not a startup benchmark. No Windows/macOS or Tauri app
size was measured; no runnable graphical prototype was built.

Total installation = shell + editor assets + full wasm/glue + selected fonts +
metadata/cache. Installer compression differs from HTTP Brotli; a custom
protocol does not automatically decode a bundled .br file. Count system engine
dependencies both incrementally and on a clean offline machine. Section 2's
30–60 MB Tauri+wasm estimate is not defensible for a complete installation:
the full raw converter alone is about 53 MB before editor and fonts.

### Platform and capability comparison

| Topic | Electron + wasm | Tauri 2 + wasm |
|---|---|---|
| Engine | Bundled Chromium/V8 across Windows/macOS/Linux, updated with app | WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux; runtime/OS determines version |
| Size | Linux engine archive measured above; complete app unmeasured | Native shell size unmeasured; system dependency cost matters. Official Windows guide estimates +127 MB for offline WebView2 installer, +180 MB for fixed runtime |
| Startup / memory | D2 below measures the Linux prototype including main, renderer, GPU and utilities; other platforms unverified | D2 below measures Linux shell/WebKit helpers; other platforms unverified. Shared disk engine does not establish low RAM |
| Local Font Access | Chromium permission-based API; feature-test on actual secure app origin | Do not rely on it in WebKit; WebView2 support must be tested separately |
| System fonts | Narrow native enumeration/byte bridge can supply approved fonts | Native enumeration/byte bridge needed for WebKit; scope to font folders |
| Associations / double-click | Register extensions in installer: Linux MIME/desktop Exec; Windows argv/second-instance; macOS open-file event | bundle.fileAssociations plus OS launch handling and single-instance plugin; verify actual path delivery on each OS |
| Drag/drop | Native handle bridge; qualify document and editor image/text drops | Native drag-drop events/scoped access; check interaction with HTML drag/drop |
| Save back | Chosen-file bridge, atomic temporary write/replace, dirty/error handling | Scoped filesystem/dialog bridge with identical requirements |
| PDF / print | wasm command-stream PDF is fidelity path; webContents.print/printToPDF print a web page and do not automatically print the document PDF | Same wasm export; actual document PDF print route unverified. Qualify native/OS PDF handoff per OS |
| Offline | Bundle all assets/fonts; secure local origin must support workers/fetch/wasm; no service worker required | Same; clean Windows install also needs WebView2, Linux needs runtime dependencies |
| Updates | Built-in autoUpdater Windows/macOS; Linux package manager or separately qualified updater | Signed updater plugin artifacts; update signature is distinct from OS signing |
| Windows signing | Sign executable/installer; SmartScreen reputation still applies | Same, signing does not guarantee absence of reputation prompts |
| macOS signing | Developer ID, hardened runtime configuration, notarisation for direct distribution; arm64/x64 packages | Same native binary/package obligations |
| Linux packaging | deb/rpm/AppImage or selected channel; package/repository signatures; preserve Chromium sandbox | Same channel choice; specify supported WebKitGTK/GTK, test clean offline install |
| Licence | Electron MIT; Chromium/Node/third-party notices remain | Tauri MIT OR Apache-2.0; webview/GTK and plugin obligations remain. Neither changes product AGPLv3 |

These are framework facts and implementation plans, not tested ElixirOffice
features. Official sources checked on 2026-10-10:
[engines](https://tauri.app/reference/webview-versions/),
[Windows installer](https://tauri.app/distribute/windows-installer/),
[associations/config](https://tauri.app/reference/config/),
[single instance](https://tauri.app/plugin/single-instance/),
[Tauri updater](https://v2.tauri.app/plugin/updater/),
[Windows signing](https://tauri.app/distribute/sign/windows/),
[Tauri distribution](https://tauri.app/distribute/),
[Electron distribution](https://www.electronjs.org/docs/latest/tutorial/distribution-overview),
[Electron updates](https://www.electronjs.org/docs/latest/api/auto-updater),
[printing](https://www.electronjs.org/docs/latest/api/web-contents),
[protocol](https://www.electronjs.org/docs/latest/api/protocol),
[security](https://www.electronjs.org/docs/latest/tutorial/security),
[font API](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts),
[Electron licence](https://github.com/electron/electron/blob/main/LICENSE),
[Tauri licences](https://github.com/tauri-apps/tauri).

Reuse W2's font interface for native-supplied bytes if it can provide full
converter metadata. Do not automatically retain AllFontsGen: first verify the
font selection requirements. If needed, record that native sidecar explicitly.
Canvas and converter must receive the same bytes and respect embedding rights;
real installed font > metric clone > close free font remains the priority.
Playwright WebKit results do not qualify actual WKWebView/WebKitGTK.

### Other credible options

A Chromium PWA is useful for offline web use with no bundled engine installer,
but OS file handlers, save-back permissions and Safari behavior still need
qualification; it is not yet the universal desktop double-click path. Direct
CEF/Qt WebEngine offer controlled Chromium but add native maintenance without
a measured speed benefit over Electron. Wails/Neutralino/thin WRY shells keep
system-engine qualification work and need more integration evidence. Keep them
as fallbacks. Upstream desktop is a useful baseline if a current build is
supplied; section 2's historical CEF version was not reverified here.

### Prototype plan after owner decision (Linux first, estimated 3–5 days)

1. Pin shell/full wasm manifest in an isolated worktree. Serve static assets
   from a secure local origin supporting MIME, workers, fetch, cache and wasm.
   No docservice/database/local TCP server should be necessary. Electron:
   sandbox/contextIsolation, no renderer Node, allowlisted preload IPC.
   Tauri: explicit capabilities and filesystem scopes.
2. Implement one bridge for open bytes, chosen-file save, fonts and PDF handoff.
   Queue initial open until ready, handle second launch and macOS open events.
   Validate formats/sizes; never give an untrusted document unrestricted paths.
3. Test Linux double-click, drag/drop, offline edit/save-back and PDF for all
   six W3 formats on public/synthetic fixtures. Reopen outputs through reference
   path, run W3 fidelity and W1 PDF gates. Exercise cancellation, missing fonts,
   read-only/conflicting files, interrupted writes and large-file memory errors;
   preserve original on failure.
4. Run at least 10 fresh process launches; report median/p95 and distinguish
   cold cache from warm cache. Measure shell ready, editor usable and document
   editable separately, identical 10-/100-page fixtures, typing p50/p95,
   scrolling, open/save/PDF. Record process-tree PSS and wasm heap, idle/peak;
   main-process RSS alone is insufficient. Record hardware/load, versions,
   asset hashes, fonts, samples and failures.
5. Measure release installer/unpacked assets/fonts and clean offline Linux
   install. Run the same payload/bridge in a minimal Tauri challenger before
   choosing the final shell. Tauri qualifies only with fidelity, shortcuts,
   clipboard, font, worker/wasm and print gates green and comparable/better
   measured speed. No numerical performance pass is claimed by this study.
6. Then qualify Windows and macOS actual engines, associations, print dialogs,
   signed/notarised packages and signed updates/rollback. Test network-disabled
   restart/edit/save; capture requests, require zero document uploads and no
   silent hosted-server fallback. Updates/external AI are explicit settings,
   never prerequisites for offline startup.

Suggested sequence: day 1 origin/bridge; day 2 file lifecycle; day 3 gates/bench;
days 4–5 Tauri comparison/report, conditional on W2/W3 readiness. OS signing,
printing and updates remain unverified until those platform tests. D stops
with this study ready for lead review; owner approval precedes prototype work.

### D2: physical Linux desktop benchmark on linux (2026-10-10)

This owner-approved comparison uses two throwaway shells, without product
integration. Evidence and reproducible shell/measurement scripts are kept under
/srv/elixiroffice/bench/ on linux. The common payload is a snapshot of the built
static editor from development host's eo container, full W0 x2t.wasm release
9ee6831853aa-fd40349d310d-st, and W1 PDF-only release
9ee6831853aa-36c327f971c4-st. No personal/private corpus was used.

The approved batch6 image was the initial source, but its compiled client-PDF
bundle lacked the integrated native wasm route. The final common payload uses
the newer built development host snapshot (DocsAPI 9.3.4), plus a minified current-main
clientpdf.js override and the manifest-verified W1 runtime. This is explicitly
a scratch adaptation, rather than a claim that the deployed image already
supports standalone desktop operation. The local SDK adapter supplies local
owner permissions with coediting/premium disabled, actual empty-template bytes,
and W0-converted synthetic document/image bytes. A loopback HTTP server provides
assets and measurement transport; no DocumentServer process, database, remote
document service is used.

Hardware: linux, elementary OS 6.1 / Ubuntu 20.04 base, i5-8265U,
approximately 15 GiB RAM, physical X11 session :0. Both editors have a
1280 x 900 content viewport. Electron 44.7.0 uses its bundled Chromium 152
and native host graphics. Tauri 2 uses WebKitGTK 4.1 version 2.52.6 in an
isolated dependency container with the physical X11 socket, host IPC namespace for MIT-SHM, and GPU devices.
The host's WebKitGTK 4.0 cannot satisfy Tauri 2's 4.1 dependency. Nothing was
installed system-wide and no sudo was used. The Tauri container runtime and
newer graphics dependencies are a comparison limitation, not a clean native
package-install result.

Each document/shell group has five fresh browser profiles, each immediately
restarted with that same profile for the warm sample. Every sample is a new
application process: fresh does not mean a cold OS page cache or a reboot,
and warm does not mean a reused live editor/converter. Runs are sequential;
no second shell workload runs concurrently. The session must remain active
and unlocked. Typing injects 200 real XTest key events at 10 characters/second,
checks 200 latency samples and an exact 200-character before/after insertion,
and stops if focus leaves the bench window. The p50/p95 values measure keydown
dispatch to two animation callbacks; they exclude pre-dispatch OS delay and
are a paint proxy, not measured key-to-photon latency. The table reports the
median of each run's p50 or p95, not a pooled percentile.

Scroll values are animation-callback cadence during a three-second native SDK
scroll operation. They do not count compositor-presented frames; the empty
one-page case is not a meaningful document-scroll workload. PDF time includes
actual editor command capture, font/image loading and native wasm export,
after the typing/scroll workload; no JS PDF fallback is accepted.
Memory sums every sampled descendant's /proc/PID/smaps_rollup at 250 ms.
RSS double-counts shared mappings; PSS apportions them. Peaks are sampled
whole-tree peaks across startup/editing/export, not exact allocation maxima;
shared loopback-server and pre-existing Docker daemon memory are excluded.

#### Editor workload: median of five runs per row

| Shell | Document | Profile | Editable (s) | Typing p50 / p95 (ms) | Scroll rAF/s | Native PDF (ms) | Peak RSS (MiB) | Peak PSS (MiB) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Electron | Empty | fresh | 2.73 | 27.3 / 32.2 | 60.2 | 169 | 869 | 531 |
| Electron | Empty | warm | 2.04 | 27.3 / 32.1 | 60.1 | 143 | 868 | 535 |
| Electron | 97 pages | fresh | 8.30 | 29.0 / 40.9 | 57.7 | 1638 | 1134 | 788 |
| Electron | 97 pages | warm | 7.09 | 29.0 / 40.6 | 57.1 | 1612 | 1120 | 780 |
| Tauri | Empty | fresh | 4.18 | 37.0 / 51.0 | 61.0 | 222 | 955 | 822 |
| Tauri | Empty | warm | 3.66 | 36.0 / 51.0 | 61.5 | 223 | 890 | 754 |
| Tauri | 97 pages | fresh | 12.94 | 49.0 / 81.0 | 36.6 | 1884 | 1451 | 1318 |
| Tauri | 97 pages | warm | 12.27 | 48.0 / 80.0 | 36.6 | 1906 | 1391 | 1254 |
| Chrome 138 | Empty | fresh | 2.94 | 34.8 / 47.0 | 60.2 | 153 | 1293 | 617 |
| Chrome 138 | Empty | warm | 2.36 | 34.8 / 45.6 | 60.3 | 140 | 1097 | 592 |
| Chrome 138 | 97 pages | fresh | 9.40 | 32.6 / 49.9 | 57.5 | 1832 | 1479 | 881 |
| Chrome 138 | 97 pages | warm | 8.09 | 32.2 / 48.2 | 57.8 | 1786 | 1388 | 878 |

All forty final runs passed: exactly 200 inserted characters and 200 latency
samples per run, expected 1/97-page layout, native wasm PDF backend, and complete
readable application process-tree samples. Electron had up to seven application
processes; Tauri up to three (shell, WebKit network and web helpers). Shared
loopback server/Docker infrastructure is excluded. At the editable event the
median PSS was 474/474 MiB (Electron empty fresh/warm), 613/637 MiB (Electron
97-page), 627/580 MiB (Tauri empty) and 972/921 MiB (Tauri 97-page).

#### Window visibility, native capabilities and disk footprint

| Shell | Fresh window visible (ms) | Warm window visible (ms) |
|---|---:|---:|
| Electron | 967 | 278 |
| Tauri | 326 | 310 |
| Chrome 138 | 1032 | 335 |

Each cell is the median of five independent empty-bootstrap launches, measured
externally from process spawn to the first X11 IsViewable observation for the
actual application PID (container NSpid for Tauri), with 10 ms polling plus query
cost. This measures a mapped native window, not rendered editor readiness.
Tauri includes docker exec overhead. Its faster fresh window does not imply a
faster usable document; the editor table shows the opposite for this payload.

| Capability | Electron | Tauri |
|---|---|---|
| Local Font Access on secure loopback | queryLocalFonts available | undefined |
| Native file chooser | Selected the actual synthetic DOCX | Selected the same DOCX |
| Native byte-write bridge | Exact 7,902,201-byte copy | Exact 7,902,201-byte copy |
| Page-print API | printToPDF produced a 10,773-byte PDF | WebKit PrintOperation dialog opened; Cancel returned |

Native saved copies have SHA-256
0a7896d6a02d9a35d63541d508a06ff1c330ea64c7d9546f36042d10e8ef77ee,
identical to the fixture. This establishes minimal chooser/byte-write feasibility;
the bridge writes a fixed path in results, not a complete atomic original-file
edit-save/reopen lifecycle. No printer job was submitted. Page-print APIs print
HTML; the intended Office fidelity route is the generated native wasm document PDF,
whose OS PDF/printer handoff remains unqualified. Font API availability is not
a consent/enumeration test or qualification of a future custom app origin.
Both runtime process sets opened /dev/dri/renderD128; Electron reported Intel
UHD Graphics 620 through WebGL. WebKit reported Apple GPU on this Intel host,
so that string is not used to identify its hardware. No virtual-display or
sandbox-disabled smoke sample contributes to the tables.

| Unpacked on-disk observation | Bytes allocated | Limit |
|---|---:|---|
| Common untrimmed payload | 1,450,819,584 | Includes all built editors/templates/fonts, W0/W1 and public font mirror |
| Electron distribution | 296,497,152 | Host system dependencies and installer excluded |
| Timed Tauri binary | 13,811,712 | WebKitGTK/GTK and other runtime dependencies excluded |
| Electron payload + shell + scratch entry scripts | 1,747,333,120 | About 1.747 GB; prototype, not release installer |
| Tauri payload + timed binary | 1,464,631,296 | About 1.465 GB before required engine dependencies |

The timed Tauri binary is 13,811,472 apparent bytes. Its required container
WebKitGTK package is 2.52.6 (Installed-Size 93,416 KiB); GTK is 3.24.41
(9,772 KiB). These two package figures do not include the full dependency
closure. The 5,731,941,840-byte uncompressed runtime-fixture image adds
635,247,711 logical image bytes over the pre-existing approved base, including
compiler/Xvfb infrastructure; it is not a shipping Tauri package measurement.
The host has WebKitGTK 4.0, rather than Tauri 2's required 4.1. A complete clean
offline installer/runtime footprint remains unverified for both shells; the
smaller Tauri binary alone does not establish a complete-install advantage.

Bench/compiler/browser/download caches were removed after recording results,
with licence/notice files preserved. The retained bench directory occupies
2,987,249,664 allocated bytes; including the new runtime-image increment gives
3,622,497,375 bytes. The observed peak before cleanup plus that increment was
12,129,524,831 bytes, below the 15 GB task limit. The own static server and
runtime container are stopped; tools, binaries, sources, payload and evidence
remain available for review.

#### Recommendation and evidence for review

**Keep Electron + wasm as the first Linux product-prototype choice.** In this
specific matched prototype, it reaches the empty editor and 97-page document
sooner, has lower typing paint-proxy latency, higher large-document scroll
callback cadence, faster native PDF export and lower whole-tree PSS. The warm
97-page comparison is 7.09 versus 12.27 seconds to editable, p95 typing proxy
40.6 versus 80.0 ms, scroll callback cadence 57.1 versus 36.6/s, PDF 1.61 versus
1.91 seconds, and peak PSS 780 versus 1,254 MiB. Tauri wins fresh native-window
appearance (0.33 versus 0.97 seconds) and has a smaller standalone binary; retain
it as the packaging challenger. This is Linux evidence for the tested engines,
not a general Windows/macOS claim. The Tauri dependency container/newer graphics
stack and lack of a clean packaged-install comparison limit extrapolation.
The owner still decides; these shells are not integrated into the product.

All forty native Office PDF files parsed successfully with pdfinfo and had
the expected 1/97 pages. No product fidelity/shortcut/clipboard/save lifecycle
or actual printer gate is claimed. Preliminary failures are retained separately:
stale assets/version bootstrap, an interrupted 20-characters/s workload, a
title-only focus guard and stale diagnostic window, missing container GPU/IPC
access, and an initial chooser cancellation. None contributes to the accepted
five-run medians; the interrupted fast-input workload is not treated as a
settled throughput comparison after the later harness/container corrections.

Evidence is retained on linux under /srv/elixiroffice/bench/results and copied
with reproducible scratch scripts to development host
/srv/elixiroffice/wt/w6-D2-work/evidence. Acceptance/progress records and
pdf-structure-check.json are in the D2 work folder. summarise.py requires all
forty complete, exact-input, native-PDF, readable-tree runs before producing
summary.json. The same recorded Tauri binary is retained separately from the
later bridge-only chooser-default fix, along with its timed source.

Artifact identities (SHA-256):

- Shared payload manifest: aa899fb965155d15b2c870fc57214c13663f7d8b50233409623ca72156f41d87 (26,786 files at handoff).
- Timed Tauri binary: b114997e0f701e79590a6d05664a17cecceb6382c0ef45a17eaad4d371a2e976.
- Bridge-only Tauri binary: f4b1c9233a0b389ba745260563f170b5b13d4107ad085629fb5a511687c6b4b8.
- W0 full wasm: 02fb2c24156813b7918e56f1c1063cc8a1a17d370efd3bc9de1fc1fffb219c8b.
- Electron ZIP: 3ae7d5bdad61c664486c6ab61361dd084d064c8c08af8d13a687096e18ce555a.

artifacts.json and payload-manifest.json record the other file hashes, versions,
exact apparent/allocated sizes and runtime image identity. Tauri crate 2.12.2,
tauri-runtime-wry 2.12.1 and tauri-build 2.7.1 are pinned in Cargo.lock.


### D3: plain Chrome baseline (2026-10-10)

The added Chrome rows use installed Google Chrome 138.0.7204.49 on the same
unlocked physical linux desktop, against the unchanged D2 static payload,
synthetic 97-page document and actual empty template. This is a normal browser
window with its toolbar, rather than app/headless mode. Separate scoped browser
profiles have no personal tabs or extensions. CDP adjusts the content viewport
to exactly 1280 x 900 during startup; that setup remains included in
launch-to-editable time. No GPU or sandbox bypass is used.

Five fresh/reused-profile pairs per document pass the same exact 200-character
XTest input at 10/s, two-rAF typing proxy, three-second SDK scrolling, native
wasm PDF and expected page-count checks. All twenty PDFs parse with pdfinfo
and contain the expected 1/97 pages. Memory samples begin at process spawn
in a separate 250 ms sampler, covering viewport setup as well as editor/export.
The full descendant tree is read from smaps_rollup, including normal browser
helpers. Chrome's transient exited helpers can remain in /proc while being
reaped; on ENOENT/ESRCH the sampler re-enumerates and retries the entire capture,
recording every failed attempt (bounded 25 x 10 ms). No PID is omitted or
zero-filled to pass the check. Permission failures or unresolved incomplete
captures invalidate a run. Earlier incomplete/interrupted series and
post-viewport-only sampling diagnostics are retained and excluded.

At the editable event, median Chrome PSS is 555/540 MiB for empty fresh/warm,
and 716/693 MiB for 97 pages. The independent ten mapped-window samples use
the same spawn-to-IsViewable definition and actual _NET_WM_PID matching,
with 10 ms polling plus X11 query cost; warm median is 335 ms. Browser
instrumentation processes and the shared static server are excluded from
the application process tree. Chrome had up to thirteen descendants. A separate
non-metric launch confirms open /dev/dri/card0 and /dev/dri/renderD128 handles.
The existing /opt/google/chrome distribution occupies 385,699,840 allocated
bytes (385,475,450 apparent), excluding system dependencies and installer.

**The approximately seven-second Electron result is not explained by the
Electron shell alone.** Plain Chrome also needs 8.09 seconds for the warm
97-page editor, compared with 2.36 seconds for empty (5.73 seconds additional
document work). Electron's corresponding difference is 5.05 seconds. Chrome's
large warm conversion events report median module/font preparation 1.22 seconds
and native conversion 0.24 seconds. These observations point to a substantial
common editor/bootstrap/conversion/layout cost in this scratch payload.
They do not assign every millisecond to a component: Chrome 138 versus
Electron's Chromium 152, normal browser UI and CDP viewport setup prevent
a clean version-matched engine/shell decomposition.

Reproducible scripts are run-chrome.py, chrome-viewport.cjs,
chrome-windows.py and summarise-chrome.py under /srv/elixiroffice/bench/.
Accepted empty IDs are 12/13/14/20/21; accepted large IDs are
14/20/21/22/23, each with fresh and immediately reused profiles.
Raw results and strict summary.json are in results/chrome; identity-check.json
verifies the complete D2 payload manifest after the measurements.
Review copies and protocol records are in development host's
/srv/elixiroffice/wt/w6-D3-work/. The normal browser is already installed;
this baseline does not claim a new packaged installer qualification.

### D3: throwaway W3 Electron file prototype

The separate /srv/elixiroffice/bench/proto-electron/ on linux uses A's
read-only W3 conversion/controller snapshot, the retained static editor,
full W0 conversion runtime and W1 native PDF runtime. No application code
is integrated. Its README.md documents ./run.sh, an optional Office-file
argument, scoped native Open/Save/PDF dialogs and file drops.

Nine real DOCX/XLSX/PPTX x command-line/dialog/drop cases pass offline edits,
same-path atomic saves and fresh-process reopens. Word's native keyboard
marker survives; invalid tokens and externally changed originals are rejected.
Permission bits survive, including mode 0664. Native document PDFs contain
the edited text and have 3/1/8 pages for the public Word/Sheets/Slides fixtures.
The request audit contains local static GETs only. Spreadsheet/presentation
PDF adapters are prototype-only, not integrated product support.

Native chooser tests preselect a real fixture and accept the actual GUI;
drop tests use the native browser file-drag backend, not an in-memory File
or fabricated converter result. An actual file-manager mouse gesture,
broad PDF fidelity, crash/concurrent-writer recovery, installer/signing and
platform security qualification remain unverified. Source/runtime identities,
raw results and limitations are retained in the prototype and D3 work folder.
The owner decides on integration after W3; D stops here for review.
