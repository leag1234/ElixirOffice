# Word editor performance

Product goal: a "very fast" editor, at the level of Word for the web. This document
sets the measurement method, the baseline, the fixes made and what remains.

## 1. Method

### Bench

`tools/perf/` (Playwright 1.63, Chromium "new headless", driven from <dev-host> against a
running instance):

| Script | Role |
|---|---|
| `bench.mjs` | all scenarios, N runs, JSON results (`--label`, `--runs`, `--throttle`, `--scenarios`, `--net`, `--dwell`) |
| `report.mjs` | markdown tables of one or more result files |
| `waterfall.mjs` | timeline of a load: requests, websocket frames, editor events, long tasks |
| `profile.mjs` | CPU profile of a load (and of typing): `.cpuprofile` + functions in self and inclusive time |
| `gen_docs.py` | deterministic test documents (python-docx): 10 pages of text; 50 pages with tables and images; 100 pages, 15×6 table every 3 pages, 2000×1300 photo every 4 pages (2.5 MB) |

```bash
python3 -m pip install --user python-docx            # once
python3 tools/perf/gen_docs.py                       # -> tools/perf/docs/
node tools/perf/bench.mjs --base http://localhost:8080 --label main --runs 5 --throttle 1,4
node tools/perf/report.mjs tools/perf/results/main-*.json
```

Each run starts from a fresh browser profile (empty HTTP cache) and opens freshly uploaded
copies of the documents (the document server therefore converts them at each
opening, as at the first opening of a file; the copies are deleted afterwards).
Within a run: **visit 1 = cold cache**, **visit 2 = warm HTTP cache**, **visit 3 =
warm HTTP cache + V8 code cache** (the regime of a daily user). Before the measured
navigation, the tab loads `/healthcheck`: neither the browser startup nor the opening of the
TCP connection is counted (otherwise ~200 ms that are not ours).

**Machine load.** <dev-host> (Ryzen 9 7940HS, 16 cores, 60 GB) is shared with other agents that
are compiling. Each measurement records `uptime` before and after; the bench waits for a load (1 min)
< 4 before each run and **redoes** a run if the load exceeded 6 while it
was running (`discarded` field of the JSON).

**CPU profiles.** `Emulation.setCPUThrottlingRate` (CDP): **x1** = <dev-host> as is, i.e. a
recent high-end laptop (the 7940HS is a laptop chip); **x4** = entry-level laptop /
5-year-old machine. The x4 ratio is the one Lighthouse uses for mobile;
it approximates, not reproduces, a real slow CPU (no cache or turbo effect).

**Network.** By default, localhost (no latency): we measure the CPU cost and the server round
trips. The `--net 40,50` scenario emulates 40 ms RTT and 50 Mbit/s (fiber or good Wi-Fi, remote
server) for the cold load. "Transferred" bytes: actual compressed size as
nginx sends it (Chrome does not report the transfer size of the editor iframe's requests;
the bench remeasures it with an identical HTTP request, gzip accepted).

### Definitions

| Measure | Definition (t0 = start of navigation of the page that contains the editor, or click on the start page) |
|---|---|
| chrome | first paint (FCP) of the editor iframe: ribbon skeleton |
| doc visible | first copy of a page onto the `#id_viewer` canvas, then next frame |
| editable | time (timestamp of the `keydown` event) of the first accepted keystroke: the bench types one key every ~20 ms in the input area as soon as it exists, until `isDocumentModified()` becomes true |
| transferred / requests | all requests of the page and the iframe (excluding data:/blob:), websocket separate |
| TBT, max task | long tasks (> 50 ms, `PerformanceObserver longtask`) between t0 and "editable"; TBT = sum of the excesses beyond 50 ms |
| typing latency | for each of the 200 keystrokes (French text, ~10 char/s) in a 10-page document: `keydown` (event timestamp) → end of the following canvas repaint (`WordControl.OnPaint`) → next animation frame (the one carrying the glyph). p50 / p95 over 5 × 200 keystrokes |
| scrolling | 5 s of wheel at 60 Hz (100 px `mousewheel` events emitted at each frame) on a 50-page document: animation frames per second, **document repaints per second**, p95 frame interval, frames > 50 ms |
| start page | `/example/`: FCP, `load`, bytes; "from the start page": click on a recent file → editable in the new tab (`--dwell`: time spent on the start page before the click) |

Limits: headless Chromium on a server without GPU (software canvas rendering); no measurement
of the system's input latency (the keyboard is injected by CDP); a single user (no
co-editing); generated documents, not the real corpus.

## 2. Baseline (5 October 2026, `elixir/dev`)

Medians of 5 runs, headless Chromium on <dev-host>, localhost unless stated. Raw files:
`tools/perf/results/` (`main-base*` = main instance :8080; `perf-base*` = working
instance eo-perf, same `elixir/dev` code without the branches that have since arrived on :8080).

### Opening a 10-page document

| Instance | CPU | Cache | chrome | doc visible | **editable** | transferred | req. | TBT | max task |
|---|---|---|---|---|---|---|---|---|---|
| :8080 | x1 | cold | 301 | 1458 | **1475** | 14.3 MB | 73 | 348 | 239 |
| :8080 | x1 | warm HTTP | 311 | 1032 | **1051** | 131 KB | 72 | 393 | 232 |
| :8080 | x1 | HTTP + code | 283 | 1095 | **1112** | 41 KB | 72 | 340 | 238 |
| :8080 | x4 | cold | 1626 | 3685 | **3747** | 14.5 MB | 74 | 2310 | 828 |
| :8080 | x4 | HTTP + code | 989 | 3359 | **3454** | 43 KB | 73 | 2155 | 865 |
| :8080, 40 ms / 50 Mbit/s | x1 | cold | 838 | 1650 | **1669** | 14.5 MB | 74 | 413 | 259 |
| :8080, 40 ms / 50 Mbit/s | x1 | HTTP + code | 396 | 1093 | **1119** | 43 KB | 73 | 406 | 258 |
| eo-perf | x1 | cold | 308 | 1429 | **1446** | 14.3 MB | 74 | 337 | 239 |
| eo-perf | x1 | HTTP + code | 291 | 964 | **982** | 41 KB | 72 | 309 | 236 |

Transferred when cold (10 pages, :8080): fonts 25 files (16.6 MB uncompressed, including
NanumBarunGothic 8.6 MB), `sdk-all.js` 18.5 MB (3.4 MB gzip), `fonts.wasm` 3.6 MB, `app.js`
2.6 MB, `sdk-all-min.js` 2.5 MB, `ChartStyles.js` 1.6 MB, `code.js` 1.4 MB, `app.css` 0.6 MB,
`en.json` 0.3 MB, `index.html` 0.3 MB (inline SVG). "Visible" and "editable" coincide to within
20 ms: the editor accepts typing as soon as the first page is drawn.

### Large document (100 pages, tables, 25 photos, 2.5 MB)

| Instance | CPU | Cache | doc visible | **editable** | transferred | TBT | max task |
|---|---|---|---|---|---|---|---|
| :8080 | x1 | cold | 2041 | **2059** | 17.5 MB | 651 | 335 |
| :8080 | x1 | HTTP + code | 1628 | **1647** | 3.2 MB | 642 | 336 |
| :8080 | x4 | cold | 4959 | **5062** | 17.7 MB | 3565 | 1275 |
| :8080 | x4 | HTTP + code | 4677 | **4773** | 3.2 MB | 3370 | 1282 |

### Start page and opening from the start page (:8080, x1)

| Measure | cold | warm |
|---|---|---|
| `/example/` FCP / load | 60 / 49 ms, 134 KB, 9 req. | 52 / 40 ms, 2 KB |
| click on a recent file → editable (new tab) | **1673 ms** (14.3 MB) | 1088 ms |

### Typing and scrolling

| Instance | CPU | typing p50 | **p95** | max | scrolling: repaints/s | frames/s | frame p95 |
|---|---|---|---|---|---|---|---|
| :8080 | x1 | 43 | **64** | 69 | **20** | 60 | 16.7 |
| eo-perf | x1 | 44 | **65** | 72 | **20** | 60 | 16.8 |
| eo-perf | x4 | 59 | **74** | 87 | **20** | 58.6 | 16.8 |

### Version 9.3.4 / 9.3.5

The server announces `buildVersion 9.3.4` (container's `PRODUCT_VERSION` variable, which takes precedence over
`VERSION` = 9.3.5-rc.1) and web-apps is built with the same one: `onServerVersion()` does not
trigger, this path costs nothing today. Risk: in case of mismatch, it blocks
loading (permanent skeleton, "version changed" dialog) — to keep aligned, not a cost.

## 3. Where the time goes (warm load, 10 pages, x1, ~900 ms)

Timeline (`waterfall.mjs`): sample app page 7 ms → iframe and scripts from the cache
→ ~170 ms: socket.io connected (only once `sdk-all.js` has run) → license → 70 ms of
client work → `auth` message → 25 ms server → `documentOpen` 80 ms (the server downloads
the docx from the integration and converts it with x2t) → `Editor.bin` 5 ms → read 50 ms →
fonts (disk cache) ~100 ms → 180 ms task (end of opening: layout of the first
pages, first draw) → visible.

CPU profile (`profile.mjs`, inclusive time):

| Item | 10 p., warm | 100 p., warm |
|---|---|---|
| end of opening after fonts (`asyncFontsDocumentEndLoaded` → layout, draw) | 182 ms | 305 ms |
| binary read (`OpenDocumentFromBin`, including `ReadMainTable` 272 ms at 100 p.) | ~50 ms | 415 ms |
| web-apps interface construction (`onEditorPermissions`, Backbone views, jQuery) | ~150 ms | ~150 ms |
| compilation/parse (`(program)`) | 169 ms | 406 ms |
| socket.io messages (auth, license) | ~80 ms | ~80 ms |
| idle (waiting for server and network) | 158 ms | 264 ms |

Typing (100 profiled characters): ~14 ms of CPU per keystroke, of which `OnPaint` 5.5 ms which **redraws
the whole page** (`StartRenderingPage` → `CDocument.DrawPage` → `Paragraph.Draw`, then
`drawImage`) and `EnterText` 1.9 ms.

## 4. Fixes

Branches: `elixir/perf` in sdkjs, web-apps, document-server-integration (base `elixir/home`),
document-server-package and the superproject (worktree `$EO_WORK/wt/perf`); `feat/perf` here
(bench, results, this page). Patches: `patches/<repository>/perf/`. Before/after measurements on
the eo-perf instance, each against the previous state.

| # | Fix | Repository | Before → after |
|---|---|---|---|
| 1 | Draw loop: the next frame after an input instead of the next 40 ms tick `[upstreamable]` | sdkjs | typing x1 p50/p95 **44/65 → 26/33 ms**, x4 59/74 → 39/47; scrolling **20 → 60 repaints/s** (x4: 20 → 58) |
| 2 | No fallback font for the private use area (Symbol bullet U+F0B7 → NanumBarunGothic loaded for any document with bullets) `[upstreamable]` | sdkjs | 10 p. cold: **14.3 → 10.2 MB**, editable 1405 → 1281 ms; warm 1038 → 985 ms; pixel-identical rendering (perf-10p, corpus a09, a10) |
| 3 | Precompressed static files (gzip_static, incremental and parallel script, launched by the entrypoint) `[upstreamable]` | document-server-package, DocumentServer | 10 p. cold localhost **1281 → 1079 ms**; TTFB of `sdk-all.js` under load: 317 ms → < 1 ms |
| 4 | `worker_processes auto` instead of 1 `[upstreamable]` | DocumentServer | 1079 → 1053 ms (noise for a single client; matters for multi-user load); with 3: WAN 50 Mbit/s cold **1467 → 1230 ms** |
| 5 | Versioned `api.js` cached (only the unversioned URL stays no-store) `[upstreamable]` | document-server-package | one fewer non-cacheable request per opening; no measurable gain on localhost |
| 6 | Warm-up pages `preload.html` / `cache-scripts.html` repaired (service worker script never integrated, CSS at the wrong path) `[upstreamable]` | web-apps | `/example/?dev=1`: **5 requests in 404 and 5 console errors → 0** |
| 7 | Word editor warm-up from the start page (prefetch at idle or on hover of a file) | document-server-integration | editor tab cold: **10.0 MB → 46 KB** downloaded; time unchanged on localhost (1077 → 1087 ms); on 50 Mbit/s a cold opening costs 1230 ms against 1060 ms warm cache, which the warm-up delivers |

**Tried and rejected**: `<link rel=preload>` of the sdkjs bundles in the editor's `index.html`
(starting `sdk-all.js` with the page rather than after `app.js`). Localhost cold 1057 → 1020 ms,
but warm 887 → 1023 ms and, on 50 Mbit/s, cold **1230 → 1691 ms** (preloading 3.3 MB
at high priority delays `app.js`, on the critical path). Not committed.

The service worker 404s seen in the console came from `preload.html` (fix 6): in
the editor, `document_editor_service_worker.js` answers 200.

### Cumulative result (eo-perf, all `elixir/perf` branches)

| Scenario | CPU | Before (perf-base / main-base) | After (perf-final) |
|---|---|---|---|
| 10 p. cold | x1 | 1446 ms, 14.3 MB | **1050 ms**, 10.0 MB |
| 10 p. warm (HTTP + code) | x1 | 982 ms | **868 ms** |
| 10 p. cold, 40 ms / 50 Mbit/s | x1 | 1669 ms (:8080) | **1227 ms** |
| 10 p. warm, 40 ms / 50 Mbit/s | x1 | 1119 ms (:8080) | **970 ms** |
| 10 p. cold | x4 | 3747 ms (:8080) | **3156 ms** |
| 10 p. warm | x4 | 3454 ms (:8080) | **2890 ms** |
| 100 p. cold / warm | x1 | 2059 / 1647 ms (:8080) | **1393 / 1268 ms**, 17.5 → 13.2 MB |
| 100 p. cold / warm | x4 | 5062 / 4773 ms (:8080) | **4340 / 4131 ms** |
| start page → editable, cold | x1 | 1423 ms, 14.3 MB in the tab | **1089 ms**, 121 KB |
| typing p50 / p95 | x1 | 44 / 65 ms | **27 / 33 ms** |
| typing p50 / p95 | x4 | 59 / 74 ms | **37 / 45 ms** |
| scrolling, repaints/s | x1 / x4 | 20 / 20 | **60 / 59** |

(The ":8080" columns compare with the main instance, whose code has advanced since
`elixir/dev`: read as an order of magnitude. The x4 has no eo-perf baseline for
loading.)

## 5. What remains (and requires engine work)

1. **CPU at load** (x4: ~3 s even with a warm cache). Items: end of opening (layout
   + first draw) 180–300 ms x1; binary read 415 ms for 100 pages; web-apps
   interface ~150 ms (Backbone/jQuery, ribbon construction); compilation ~170–400 ms for
   ~26 MB of JavaScript. Leads: layout of the first page before the rest and lazy
   reading; build the ribbon after the first paint; split `sdk-all.js`
   (charts `ChartStyles.js` 1.6 MB, math, forms loaded on demand).
2. **Bundle size**: Terser runs with `mangle:false` (required by sdkjs's shared-globals
   model), hence 18.5 MB for `sdk-all.js` (Closure produced ~6). Precompressed Brotli -11
   would reduce a further ~25% (sdk-all.js 3.28 → 2.44 MB; fonts.wasm 1.43 → 1.06 MB)
   but requires the nginx brotli module in the image (`libnginx-mod-http-brotli-static`).
3. **Fonts**: the editor always loads Arial, Times New Roman, Courier New (4 styles each,
   i.e. 12 Liberation files, ~2.2 MB compressed) plus Symbol/Wingdings and, through the
   range selector, Open Sans for ASCII; all the document's families in the 4
   styles even if only the regular is used. On-demand loading per style = a change to the font
   loader (`GlobalLoaders.js`), with a rendering risk until it is done.
   The loader's polling is done in 50 ms steps (`check_loaded_list`).
4. **Server round trips**: the socket.io connection only opens after `sdk-all.js` has
   run; `auth` is sent twice (in the handshake then as a message, 70 ms of
   client work between the two); the x2t conversion is done at each new key (80 ms for
   10 pages). Starting the opening at the handshake would gain ~100 ms (server + client).
5. **Typing**: each keystroke redraws the whole page (5.5 ms/keystroke at x1, ~4× at x4); a
   per-modified-rectangle render would bring it under a frame even at x4.

## 6. Proposed targets

| Measure | Profile | Today (perf-final) | Target |
|---|---|---|---|
| editable, 10 p., warm cache | x1 | 868 ms | **< 800 ms** |
| editable, 10 p., warm cache | x4 | 2890 ms | **< 1.5 s** (engine work §5.1) |
| editable, 10 p., first access, 50 Mbit/s | x1 | 1227 ms | < 1.5 s ✔; < 1 s with brotli and on-demand fonts |
| editable, 100 p., warm cache | x1 / x4 | 1268 / 4131 ms | < 1.5 s / < 3 s |
| bytes at first access (10 p.) | — | 10.0 MB | **< 6 MB** |
| typing p95 (glyph displayed) | x1 / x4 | 33 / 45 ms | **≤ 34 ms (2 frames) / < 50 ms**; p50 ≤ 1.5 frame |
| scrolling | x1 / x4 | 60 repaints/s | ≥ 55 repaints/s, no frame > 50 ms |
| start page FCP | x1 | 52 ms | < 100 ms (met) |
| max long task at load | x1 | 231 ms | < 150 ms |

## 7. Point of comparison: Word for the web

No usable Microsoft 365 account here, hence no direct measurement. I found no published
and verifiable figure (opening time or typing latency) for Word for the web:
Microsoft only publishes qualitative announcements (e.g. the desktop application's
"Startup Boost" preloading, The Register, 1 May 2025,
https://www.theregister.com/2025/05/01/microsoft_will_preload_office_apps/). The targets
above therefore rely on general web benchmarks: one frame at 60 Hz = 16.7 ms;
web.dev rates an interaction "good" under 200 ms (INP) — a threshold far too loose for
typing, hence the target in frames. For a real comparison: replay `bench.mjs` (typing,
scrolling) against Word for the web from a machine that has an account, same documents.

## 8. Reproducing the measurements

```bash
# on <dev-host>, from this repository
python3 tools/perf/gen_docs.py
node tools/perf/bench.mjs --base http://localhost:8080 --label main --runs 5 --throttle 1,4
node tools/perf/bench.mjs --base http://localhost:8080 --label main-wan --scenarios load --net 40,50
node tools/perf/waterfall.mjs http://localhost:8080 tools/perf/docs/perf-10p.docx 1 warm
node tools/perf/profile.mjs --base http://localhost:8080 --warm --typing 100
node tools/perf/report.mjs tools/perf/results/<file>.json [<other>.json]
```

Long benches are launched with `nohup` (an SSH drop kills the process). Do not measure
during a build on the same instance; check `discarded` and the "load avg" column.

## After integration on the main instance (:8080, 2026-10-05 20:39)

Medians of 5 measurements, CPU x1, load 1.7–3.1. File: tools/perf/results/main-perf-2026-10-052039.json.

| Scenario | Before | After |
|---|---|---|
| 10 pages, 1st opening | 1475 ms, 14.3 MB | 1181 ms, 10.2 MB |
| 10 pages, warm caches | 1112 ms | 1036 ms |
| From the start page, 1st opening | 1673 ms | 1194 ms (155 KB in the editor tab) |
| Typing p50 / p95 | 43 / 64 ms | 27 / 33 ms |
| Scrolling | 20 repaints/s | 60 repaints/s |

The first display of the interface is slower than before (~500 ms against ~300 ms): probably an effect of fire's load and of the interaction modules added; to be analyzed.

## 9. D4: Word opening profiles and two small optimizations (2026-10-10)

Conditionally approved by the lead; integration waits for explicit confirmation
that gate 7 is done. The lead will rerun the gates. The supported result is a
**small gain of about 0.3 s on 97 pages; ten pages and typing are unchanged**.
Larger before/after differences below are measurement noise, not a broad speed
claim. These measurements predate the rebase onto current integration branches.
Measurement SDK base: `6b2b217b0b3e`; product base:
`1dbe19f`. Measurements used the dedicated `eo-open-D` instance on <dev-host>
(port 32769), and physical Chrome 138.0.7204.49 on <test-desktop>. No shared instance
or private corpus was used. Source and raw evidence remain in
`<dev-host>:$EO_WORK/wt/open-D-work/` and `<test-desktop>:$EO_WORK/bench/d4/`.
The provisional-corpus rendering check passes, but the complete integration
gate is **not green**: an unchanged Windows navigation failure and an image
gesture score increase are retained as historical gate evidence. Conditional
approval does not replace the lead's post-gate-7 regression run.

### Method and interpretation

The large fixture is the same synthetic DOCX used for W6 desktop measurements:
7,902,201 bytes, final 97 pages, SHA256
`0a7896d6a02d9a35d63541d508a06ff1c330ea64c7d9546f36042d10e8ef77ee`.
The small fixture is generated by `tools/perf/gen_docs.py`, final 10 pages.

`tests/perf-open/run.mjs` records navigation-to-first-viewer-blit plus one
animation frame, and navigation-to-first real CDP key accepted by the editor.
Both are proxies: the first is not an OS compositor timestamp; accepted input
is not completion of all pagination. Every accepted probe saw four calculated
pages and active background recalculation. Browser launch is outside the clock.
These definitions differ from the earlier W6 whole-document readiness benchmark,
so the numbers must not be substituted directly into its table.

Untraced timings are medians of three fresh/reused profile pairs per document
and host. Each visit opens a fresh source document; the second reuses browser
and code caches. The <dev-host> renderer is headless Chromium, CPU throttled x4;
<test-desktop> is headful Chrome at native speed with the W0 static loader. These are
within-host comparisons, not equivalent deployments. The unchanged standalone
driver is frozen by SHA256 in `d4/results/source-sha256.txt`; detailed CPU/trace
diagnostics use a separate driver and do not enter timing medians.

On shared <dev-host>, the runner waits for one-minute load below 4 and rejects a pair
if either endpoint is at least 6. One after/large pair was rejected by that rule;
all records and reasons remain. Slow accepted visits are retained. On <test-desktop>,
a before/reused large visit took 20.91 s, including a 17.21 s font-end callback.
It remains in the three-visit sample. Small samples, sequential phases, JIT and
host load limit causal conclusions.

### Raw before and after observations (not the supported gain)

Seconds, medians; background typing is keydown-to-two-animation-frames in ms.
The probe targets 10 keys/s and verifies exactly 100 inserted characters.
Latency cells are the median of each run's background p50/p95, not a pooled
percentile.

| Host / document / visit | First page before → after | Accepted key before → after | Background p50 / p95 before → after |
|---|---|---|---|
| <dev-host> x4 / 97 / fresh | 5.83 → 5.20 | 5.89 → 5.26 | 96 / 139 → 94 / 146 |
| <dev-host> x4 / 97 / reused | 6.48 → 6.07 | 6.56 → 6.17 | 94 / 141 → 106 / 162 |
| <dev-host> x4 / 10 / fresh | 3.89 → 4.88 | 3.99 → 4.95 | 116 / 300 → 122 / 300 |
| <dev-host> x4 / 10 / reused | 4.43 → 5.67 | 4.52 → 5.73 | 102 / 261 → 113 / 328 |
| <test-desktop> / 97 / fresh | 6.77 → 5.19 | 6.80 → 5.25 | 48 / 73 → 47 / 83 |
| <test-desktop> / 97 / reused | 4.98 → 3.90 | 5.01 → 4.02 | 45 / 77 → 46 / 79 |
| <test-desktop> / 10 / fresh | 5.12 → 4.43 | 5.17 → 4.45 | 87 / 136 → 91 / 122 |
| <test-desktop> / 10 / reused | 3.77 → 3.12 | 3.81 → 3.14 | 118 / 118 → 109 / 109 |

<dev-host> large accepted-key ranges: fresh 5.65–6.12 → 5.25–5.50 s;
reused 6.13–7.14 → 5.67–6.78 s. <dev-host> small: fresh
3.97–4.16 → 4.04–5.45 s; reused 4.49–6.40 → 4.53–6.68 s.
Full sample ranges and per-visit spans are in `<dev-host>-summary.json` and
`evidence/<test-desktop>/results/summary.json`.

The lead's reviewed conclusion is **about 0.3 s on 97 pages; ten pages and
typing unchanged**. The larger gains and losses in these raw medians are noise,
not evidence of a broad improvement or a demonstrated ten-page regression. Achieved large-document input rates were about
8.3/8.5 → 8.3/7.7 Hz on <dev-host> (fresh/reused) and 9.9 Hz on <test-desktop>.
<dev-host> large runs supply roughly 100 background keys each; <test-desktop> about 45–51.
Ten-page runs supply only 1–5 background keys, making their p95 unstable.
Preparation/load variability dominates the larger median differences. Only the
roughly 0.3 s reduction supported by the detailed opening callbacks is attributed
to the two source changes.

### Attribution: where opening spends time

Diagnostic traced visits below are **not** the timing samples above. The
standalone reused 97-page profile provides the clearest matched phase comparison:

| Diagnostic phase (<test-desktop>, reused 97 pages) | Before | After |
|---|---|---|
| SDK min asset transfer | 14 ms | 13 ms |
| SDK full asset transfer | 318 ms | 277 ms |
| W0 runtime/font-FS preparation | 1.614 s | 1.634 s |
| x2t conversion | 225 ms | 224 ms |
| OpenDocumentFromBin total | 722 ms | 574 ms |
| nested ReadMainTable | 455 ms | 348 ms |
| nested PostLoadPrepare | 190 ms | 160 ms |
| fonts-end callback, including UI and initial layout | 711 ms | 543 ms |
| first ContinueRecalculationLoop | 120 ms | 133 ms |
| first page from navigation | 4.462 s | 4.169 s |
| accepted key from navigation | 4.599 s | 4.203 s |

SDK asset requests overlap preparation and execution: full asset transfer is
about 18.7 MB in this uncompressed development setup, plus about 2.55 MB for
the min asset. Transfer duration excludes later compilation/execution.
The W0 preparation path includes its existing full font-FS setup. Only conversion
itself is around 0.2 s here. Reader phases are nested in OpenDocumentFromBin;
fonts-end contains UI events, style previews and layout, not just font fetching.

Exclusive CPU sample attribution for this reused <test-desktop> before → after profile:
binary decoding 140 → 121 ms, model construction 283 → 191 ms,
model fixup 183 → 150 ms, layout 172 → 187 ms, style previews 159 → 133 ms,
drawing 24 → 21 ms, web-apps/bootstrap 1183 → 936 ms,
VM/native 818 → 753 ms, GC 155 → 103 ms, other SDK 324 → 389 ms,
idle 1874 → 1884 ms. These are heuristic stack categories, not independent
wall phases. Worker preparation is not sampled by the main-thread profiler.

The earlier fresh <test-desktop> profile identified inclusive hot functions:
ReadFromStream (~1.14 s), ReadMainTable (~0.79 s),
PostLoadPrepare (~0.35 s), CRunText (~0.26 s),
updateRtlFlag/isRtlScript (~0.19 s), refreshHiddenText (~0.22 s),
GenerateStyles (~0.18 s). UI sendEvent/toolbar callbacks also dominate.
Raw top-60 self/inclusive tables and stack locations are retained in
`phase-cpu.jsonl` and `<dev-host>-cpu.jsonl`.

<dev-host> traced large before/after profiles had substantially different execution
costs: OpenDocumentFromBin 1.374 → 1.738 s, fonts-end 1.693 → 1.962 s,
initial continuation 315 → 509 ms, accepted key 7.281 → 8.023 s.
After's detailed reader spans are ReadMainTable 1.101 s and PostLoadPrepare
406 ms. CPU samples attribute the baseline to decoding 361 ms, construction
422 ms, fixup 347 ms, layout 508 ms, previews 219 ms and drawing 105 ms;
web-apps/bootstrap takes 3.755 s and VM/native 1.479 s.
These diagnostics identify costs but do not establish a stable speed gain.

Initial pagination already yields: Document.js uses StartPagesCount=2,
a page-index condition that calculates four initial pages in these documents,
then a nominal 10 ms budget with 10 ms continuation timers. A single complex
page can exceed the budget. The first accepted key follows the first-page proxy
by tens of milliseconds, rather than waiting for all 97 pages. After opening,
<test-desktop> large runs spend roughly 2.47–2.54 s inside continuation loops over the
entire capture, including typing-triggered recalculation; the first sampled key
with all pages and idle layout is at 8.71–8.88 s in fresh runs. <dev-host> can continue
pagination beyond the 100-key sequence. These are concurrent-layout observations,
not an isolated, exact full-pagination wall-time measurement.

Images have an existing async load mode; adding a second lazy layer without
checking placeholders and dimensions risks layout changes. Actual fonts must
be ready before text measurement. Spelling can be disabled through existing
API settings, but was not a demonstrated dominant stack. Comments, review,
navigation and style panes are initialized through UI callbacks; their aggregate
cost is visible, but this study does not establish that disabling a specific
pane safely saves that cost. No font, image, spelling or pane behavior changed.

### Three candidates and selected changes

1. **Skip repeated formatting-mark invalidation.** refreshHiddenText walks all
   paragraphs/runs. Expected 0.15–0.3 s on the large fixture. The setter now
   calls it only when the effective mark value changes; repaint and callbacks
   remain. Actual toggles still invalidate hidden text.
2. **Avoid HarfBuzz script classification for ASCII CRunText.** Expected
   0.1–0.2 s. U+0000–U+007F cannot be RTL; all non-ASCII values still use the
   original classifier, and flag clearing is unchanged.
3. **Defer style-gallery first preview action using its existing timer.**
   Expected up to 0.15 s earlier paint, with work moved later. Toolbar
   subscription/timing risk and lack of measured benefit make this a deferred
   candidate. If pursued, use an opt-in setting and measure input contention.

Only the first two are implemented: five inserted lines, two removed, in
Word api.js and Paragraph/RunContent/Text.js. There is no layout algorithm
change or risky scheduling option enabled. The detailed <test-desktop> reused profile's
combined open/finishing callbacks save about 0.32 s, consistent with the intended
optimization and the lead's approximately 0.3 s conclusion. Broader median
changes are noise; ten pages and typing remain unchanged.

### Regression evidence and review blockers

- Real HarfBuzz-backed checks: 276 constructor/RTL-transition comparisons pass;
  repeated mark setting causes zero hidden-text scans, two actual toggles cause
  two invalidations. The unchanged fmt.hidden shortcut also verifies the actual
  hidden-text width and visibility when marks change. The original repeated
  setter fails the new redundant-scan expectation.
- Final benchmark page counts remain 97 and 10. Thirty public provisional DOCX
  documents were exported through the native WASM PDF backend before/after.
  Existing comparator defaults give C=100, SSIM=1, zero page-count mismatches;
  all 30 raster outputs are pixel-identical and PDF differences are dates only.
  This is regression against the previous editor rendering, **not** a newly
  established fidelity score against Word reference PDFs.
- Layout suite: 24/24 before and after. Smoke after: zero failed checks and zero
  console/page errors. Initial AI-off endpoint 404s were corrected in this
  dedicated instance's configuration; no product source change was needed.
- Word after: Mac 171 editor + 13 browser checks pass; Windows 227 editor +
  14 browser checks pass with **one failure**, nav.screen-top (scroll1122→1020).
  The same Windows failure occurs before changes and in an isolated baseline
  rerun. The initial Mac spelling failure passes in isolated baseline and after.
  Untested entries remain untested; counts exclude them.
- Images: all scenarios complete without errors; total S 284.1 → 283.3.
  This alone does not establish per-scenario non-regression. drag-cross-page
  S rises 3.4 → 9.6 in the full runs. Three focused repeats give before
  [3.4,8.8,1.7], after [9.6,9.6,8.8]; the increase is mainly drop-distance D.
  drag-float improves: before [100.6,78.6,78.8], after [76.2,76.2,76.2].
  The cross-page gate remains **unverified**, not silently accepted as green.

See `tests/perf-open/README.md` for probe commands and limitations.
All failing attempts, rejected contention samples and unchanged suite outputs
remain in the work folder. The lead conditionally approved the engine changes
and will rerun the gates. Integration is withheld until the lead explicitly says
gate 7 is done and authorizes integration; no tests were weakened.


## 10. D5: production local opening and an opt-in preview experiment

D5 uses current W2/W3 with the rebased D4 candidate, in isolated branches.
The target is first accepted real key on the 97-page fixture at <=3.5 s fresh
and <=3.0 s reused on <test-desktop>. Ten-page opening and typing p95 must not worsen.
This study does not authorize integration of D4 or D5.

### Production and measurement conditions

The SDK and web-apps are built through their production pipelines. Word's full
SDK is about 18.7 MB raw even when minified; raw size is not evidence of a
development asset. Its gzip sidecar is 3.33 MB and an actual fresh transfer is
about 3.42 MB. Reused CDP network transfers show about 933 bytes of revalidation;
resource encodedBodySize can still report the cached body length. Current W2
local worker preparation is roughly 0.43 s on <test-desktop>, rather than the older W0
1.6 s. Structural conversion reports zero worker font bytes on these fixtures;
editor fonts are still required for layout.

The three unchanged fixtures are the 97-page synth100.docx, ten-page generated
document and genuinely empty en-US new.docx template (one page, no nonempty
w:t). The real W3 page receives a file through its picker on each navigation.
No document is uploaded. t0 is navigation; browser startup is excluded and
fileInputAt is recorded separately. The first accepted z must modify the model,
then 100 actual a keys must produce exactly the expected text. Latency is the
key-to-two-animation-frames proxy, not an OS-to-display measurement. It excludes
waiting before event dispatch and does not prove that a deferred long task
cannot delay a queued physical input. Reports
include median per-run all-key p95 and background-layout-only p95.

<test-desktop> runs physical headful Chrome 138. <dev-host> runs Playwright Chromium153 with
main-renderer CPU x4; workers are not throttled by that setting. Both use the
same owned eo-open2-D production instance on port32770. <test-desktop> reaches it via an
owned reverse SSH tunnel at http://localhost:18777 through the Mac, allowing a
secure context without browser security exceptions. Plain HTTP to a LAN IP
fails crypto.randomUUID and is retained as a failed transport diagnostic.
This transport is part of the measured method, not an Internet-deployment claim.

Initial quiet production medians (five fresh/reused pairs each) were 3.891 /
3.563 s for 97 pages, 3.011 / 2.449 s for ten pages, and 2.597 / 2.164 s empty.
They overlapped own <dev-host> regression jobs and are descriptive baseline evidence,
not proof of a scheduling gain. The original contended series is retained
separately (one pair reached 7.426 / 15.577 s at load1 around 12-13).
The final matched experiment alternates OFF/ON order in five pairs per document,
retains all raw samples and waits for load1<4; pairs ending at load1>=6 are
retained as rejected and repeated. Timing, CPU profiling and regression gates
run separately, with no concurrent own build/gate work during final timing.

### Scope of the opt-in

de-settings-defer-opening-ui is false by default. Only initial style-gallery
previews are queued after a successful visible-page draw, two animation frames
and a task. Command controls remain initialized; opt-in moves their existing
50 ms task to a microtask after SDK control initialization and the opening stack.
A keyboard command can demand the pending gallery before its existing handler.
Asynchronous preview completion retains the user's search/dialog focus.
No model, pagination, fonts, image, spelling or conversion algorithm changes.
The local configuration already disables plugins/macros and this instance has
AI disabled, so those panels are not measured opportunities here. Pane/status
controls stay on their original paths after the broader deferral failed.
The profiles do not establish spelling or thumbnails as a dominant safe-to-defer
stack; D5 does not disable them to manufacture a faster opening.


Broader pane/control deferral was rejected by actual early-input tests.
Initializing controls synchronously was also rejected: local opening reentered
toolbar bootstrap before its menus existed, causing the SDK's error protection
to set view mode and lose the first key. The microtask removes that observed
exception. Failed attempts and diagnostic stacks remain in the work folder.

Win and Mac shortcut modes (Linux browser platform emulation) pass early real
typing, bold, search typing and font-dialog focus
with work actually queued. The earliest File click fails on both platforms.
A matched OFF control also fails with native pointerdown/up/click still targeting
File; this is a baseline local-opening issue, not a demonstrated D5 regression.
The assertion remains failing. The setting stays opt-in and must not be called
ready for default-on on the strength of the passing keyboard cases alone.

### 97-page breakdown on current production baseline

Separate traced/profiled <test-desktop> visits give the following landmarks. They are
diagnostic samples, not the n5 opening medians. Durations are milliseconds;
start/end values are offsets from navigation. Layout CPU is the sum of
Recalculate_Page calls before the accepted key. The callbacks nest, so these
rows must not be summed into an opening total.

| Landmark or measured span | Fresh | Reused |
| --- | ---: | ---: |
| Full SDK resource load, start -> end | 707 -> 998 | 371 -> 655 |
| Local worker init / conversion | 429 / 242 | 425 / 303 |
| OpenDocumentFromBin, start / duration | 2293 / 699 | 1901 / 629 |
| ReadMainTable, start / duration | 2381 / 426 | 1928 / 408 |
| PostLoadPrepare, start / duration | 2808 / 149 | 2336 / 157 |
| Fonts-end callback, start / duration | 3210 / 720 | 2735 / 572 |
| Layout CPU before first key | 194 | 160 |
| First viewer-frame proxy | 4038 | 3400 |
| First accepted key | 4049 | 3432 |
| Pages calculated at first key | 4 | 4 |

ReadMainTable interleaves parsing and model creation. The separate CPU sample
categories below estimate those costs; no exact wall-time split into pure parse
versus model build is available. Fonts-end includes nested UI/layout work and
does not mean720 ms of font fetching. SDK resource end is load completion,
not JavaScript evaluation completion. Resource encoded-body sizes can include
cache hits; actual wire-byte accounting uses CDP. <dev-host> x4 diagnostic first
viewer/accepted are5795/5828 ms fresh and5067/5094 ms reused, initial layout
321/274 ms. Raw landmarks are in baseline/phase-breakdown.json.

### Remaining costs and deeper options (proposals only)

A separate <test-desktop> baseline CPU profile gives 1.485 s of exclusive samples in
web-apps/bootstrap, 0.181 s binary decoding, 0.212 s model construction, 0.141 s
model fixup, 0.160 s style previews and 0.269 s layout. These sampled categories
cover the capture and are not additive opening wall phases. Inclusive callbacks
also overlap: onDocumentContentReady about199 ms, GenerateStyles177 ms,
createDelayedElements90 ms, applyModeEditorElements377 ms, onAppShowed335 ms.

1. **SDK/web interface bootstrap.** About1.485 s of exclusive main-thread
   CPU samples is attributed to web-apps/bootstrap. Batch repeated DOM sizing
   and caption measurements and reduce initial mandatory work before attempting
   more deferral. The already-minified/compressed SDK still needs loading and
   evaluation; any smaller initial bundle needs dependency and cache validation.
   The preview experiment shows that moving a long task later is insufficient:
   mandatory controls must still be ready, and later work needs an input budget.
2. **Serial local worker preparation and conversion.** W3 currently loads its
   helper scripts and starts the conversion controller inside onAppReady.
   Worker init around0.43 s and structural conversion around0.24-0.30 s are
   therefore serial with SDK startup. A could prepare a cancellable worker from
   file selection while the editor loads, preserving format validation,
   lifecycle/disposal and the no-upload contract. Measure actual overlap before
   claiming these sums saved. This is A's local-mode ownership, not implemented
   by D5. Worker durations and main-thread CPU are different measurements.
3. **Binary decoding, model construction and fixup.** Sampled CPU attribution
   totals about0.53 s across these categories. ReadMainTable interleaves decoding
   and model creation, followed by PostLoadPrepare; no exact pure-parse wall
   budget is claimed. A compact worker-produced representation could separate
   decoding from main-thread materialization, but the live object graph needs
   serialization and identity/reference handling. Dependency-aware chunks need
   headers/footers, styles, numbering, sections, fields, anchors and references
   before correct first-page layout. Propose cancellation, memory/transfer
   measurements and native fidelity gates before changing production semantics.
   Showing pages before the whole model is ready needs a stable input/selection
   frontier and later pagination that does not shift references. Layout already
   starts incrementally, accepting input after four pages; simply avoiding
   full97-page layout is not a new saving. Fonts must be ready before text
   measurement. No deep model or partial-model renderer is implemented.

### Evidence and review status

Final <test-desktop> matched results, n=5 per cell. Opening columns are median seconds
[min,max]; p95 is the median of per-run all-key p95 in milliseconds.

| Document / profile | OFF accepted key | ON accepted key | OFF / ON p95 |
| --- | ---: | ---: | ---: |
| 97 pages / fresh | 3.783 [3.734,3.988] | 3.765 [3.725,3.831] | 71.7 / 75.5 |
| 97 pages / reused | 3.549 [3.029,3.608] | 3.592 [3.466,3.666] | 69.0 / 75.5 |
| 10 pages / fresh | 2.999 [2.932,3.229] | 3.027 [2.942,3.291] | 154.5 / 151.0 |
| 10 pages / reused | 2.816 [2.449,2.846] | 2.852 [2.444,2.960] | 178.9 / 179.2 |
| Empty / fresh | 2.627 [2.589,2.782] | 2.683 [2.643,2.800] | 65.5 / 65.2 |
| Empty / reused | 2.214 [2.188,2.561] | 2.537 [2.178,2.602] | 65.3 / 65.4 |

The matched97-page median viewer-frame proxies are OFF3771/3537 ms
(fresh/reused) and ON3750/3577 ms. Background-layout-only p95 is
OFF76.7/77.8 ms and ON83.7/75.6 ms; these subsets have different key counts,
so all-key p95 is reported alongside them rather than selectively claiming a
win from the reused subset. Actual typing rate is recorded per run.

Final separate CPU profiles also retain substantial pre-input-capture work:
fresh OFF/ON web-apps samples1411/1427 ms, style preview samples157/140 ms,
model decode/build/fixup558/548 ms. The capture ends after the accepted-key
check, so this is sampled capture attribution, not exact wall-time saving or
proof that every sample preceded the key event. These profiles are excluded
from the n5 medians; raw traces and profile summaries are preserved.

The candidate misses both97-page targets and shows no useful gain: fresh median
18 ms earlier, reused43 ms later. Ten-page medians worsen27/36 ms;97-page
all-key p95 worsens3.8/6.5 ms. No statistical significance is claimed with n5,
but these data do not establish non-regression or justify default-on. The
experiment is rejected for integration; its isolated, default-off code is
retained for review. The scheduler hook stays installed after opening, so the
opt-in Toolbar focus guard can also affect later style refresh callbacks; that
interaction was not separately established as safe. This is another reason to
review the experiment as rejected code rather than a production-ready change.
The existing first-File failure is an additional open
acceptance issue. <dev-host> main-renderer x4 matched results, n=5 per cell, same column units:

| Document / profile | OFF accepted key | ON accepted key | OFF / ON p95 |
| --- | ---: | ---: | ---: |
| 97 pages / fresh | 5.115 [5.017,5.231] | 5.204 [5.158,6.104] | 125.6 / 132.9 |
| 97 pages / reused | 5.420 [5.392,5.467] | 5.541 [5.467,6.085] | 122.6 / 119.0 |
| 10 pages / fresh | 3.986 [3.938,4.007] | 4.081 [4.044,4.116] | 72.0 / 73.3 |
| 10 pages / reused | 4.385 [4.342,4.431] | 4.453 [4.406,5.182] | 72.7 / 73.5 |
| Empty / fresh | 3.591 [3.550,3.613] | 3.710 [3.665,3.726] | 57.7 / 57.8 |
| Empty / reused | 4.035 [3.994,4.051] | 4.118 [4.102,4.144] | 56.4 / 56.9 |

All120 final visits validate:97/10/1 pages as expected,100 exact keys each,
zero recorded page errors and the requested setting actually applied. Each
host/setting/document/profile cell has n5. Recorded load1 endpoints range0-2.51;
no final pair was rejected by the predefined contention threshold. Slow samples,
including <dev-host> ON6.104/6.085 s for97 pages, remain in the ranges. <dev-host> reused
opening is slower than fresh in this series; the data are retained without
assuming cache warmth guarantees a faster opening. Differences between the
initial production series and these matched OFF results are not attributed to
the candidate. The matched fire97 medians worsen89/121 ms with ON; ten pages
worsen95/68 ms. These results reinforce rejection of default-on.



Local native baseline repeated exports are 30/30 pixel-identical, C=100;
current hosted exports versus D4 hosted are also 30/30 identical, C=100.
Cross-path local versus D4 hosted is 26/30 identical, C=99.09 with no page-count
mismatch; a08/a10 are material changes and a01/a04 small changes. This pre-existing
conversion/font difference is retained as a failure, not erased by the matched
local determinism result. Baseline shortcuts pass Win228/Mac171 editor and14/13
browser checks, with14 browser entries untested,8 existing editor skips and
70 n/a entries excluded from pass counts. Layout24/24 and smoke have zero failed
checks/errors. Image scenarios
retain their existing penalties; a total score alone cannot establish acceptance.

Final opt-in regression checks use the unchanged suites with only the preference
injected into browser contexts:

- Engine276 checks pass (zero redundant scans, two real mark-toggle scans).
- Word shortcuts228 Windows /171 Mac pass, plus14/13 browser checks. The same
  14 untested browser entries,8 editor skips and70 n/a entries are retained.
- Local native PDF30/30 pixel-identical to the pre-change local baseline,
  C=100, SSIM=1, zero pagination mismatches; byte differences are dates only.
- Layout24/24 passes. Smoke has zero failed checks and zero console/page errors.
- Images finish with zero errors, but total S worsens283.3 ->292.8.
  The only changed scenario metrics are drag-float S93.6 ->103.1 and
  drop-distance D0 ->9.5. This is one measured run, not proof of causality,
  and image non-regression remains failing. Existing cross-page penalties
  are retained. Aggregate completion/exit0 is not a green performance gate.

Full identical early OFF controls finish with Win/Mac typing, bold and search
passing; first font-dialog and File fail on both platforms. ON passes font-dialog
and focus retention, while File still fails. Promoting command controls therefore
has a measured readiness benefit, but the speed/latency tradeoff is not accepted.
First accepted letter here is a narrower boundary than all commands ready.
No early-command assertion is removed or weakened.

Both speed and non-regression acceptance remain unmet. The study is ready for
review as a measured rejected experiment, not a claim of successful acceleration.

Raw evidence, rejected attempts, source provenance and task checks are outside
git in wt/open2-D-work. No integration or push is performed. Release-1 server
installation work follows the D5 review checkpoint.

### D5 follow-up after D4 integration (2026-10-11)

The study is now based on integrated D4; rebasing preserves the experiment source and frozen measurements. Six final diagnostic profiles attribute approximately80–100ms of sampled inclusive CPU on <test-desktop> to ribbon caption width measurement. Each source call inserts a span, reads offsetWidth, and removes it; repeated caption measurements may force layout. These are whole-profile CPU values, not measured pre-key wall time or a promised saving. A document-editor opening batching/cache trial would require theme/font/locale invalidation and review of the shared Button component. Even removing the whole sampled cost cannot alone close the observed283ms fresh/549ms reused target gap. W3 worker overlap remains coordinated with A; deeper model changes remain proposals only. No default-on or integration recommended. Evidence: open2-D-work/ui-cost-followup.json and continuation-20261011.md.

### Lead conclusion (2026-10-11)

D5 is accepted as a study, not as an integrated optimization. With production bundles and compression, the97-page document becomes editable in about3.5–3.8s on <test-desktop>. The scheduling experiment stays off and is not integrated: it provides no useful measured gain and does not establish typing/ten-page non-regression. Remaining gains from the studied UI changes are small; deeper work remains a proposal. The2–3s target was not achieved.
