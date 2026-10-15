# Three-engine browser acceptance

Run on development host with Node 22 and the existing /srv/elixiroffice/pw Playwright installation.
Always set EO_BASE to your own loopback instance. The runner rejects :8080,
selects the actual Chromium, Firefox or WebKit engine, and leaves suite assertions
unchanged. Failed engines remain failed in results.json; subsequent engines run.

```sh
export PATH="$HOME/elixiroffice/node-v22.23.3-linux-x64/bin:$PATH"
export EO_BASE=http://localhost:32786
node tests/browsers/run.mjs tests/client-pdf/run.mjs ../w4-A-work/pdf
node tests/browsers/run.mjs tests/browsers/pdf.mjs ../w4-A-work/portable-pdf
export EO_LOCAL_FILE=/absolute/path/to/public/sample.docx
node tests/browsers/run.mjs tests/local-mode/launch-browser.mjs ../w4-A-work/launch
node tests/browsers/run.mjs tests/browsers/handoff.mjs ../w4-A-work/handoff
export EO_LOCAL_FIXTURES=/absolute/path/to/public/fixtures
export EO_LOCAL_ALL=1
node tests/browsers/run.mjs tests/local-mode/editor-browser.mjs ../w4-A-work/local
node tests/browsers/run.mjs tests/local-mode/unsaved-browser.mjs ../w4-A-work/unsaved
node tests/browsers/run.mjs tests/browsers/unsaved-model.mjs ../w4-A-work/unsaved-model
node tests/browsers/run.mjs tests/browsers/lifecycle.mjs ../w4-A-work/lifecycle
node tests/browsers/run.mjs tests/browsers/capabilities.mjs ../w4-A-work/capabilities
```

The original PDF suite requests Chromium-only Local Font Access permission;
Firefox and WebKit report that limitation. pdf.mjs separately exercises real
server-font native PDF export, media, embedded/searchable fonts, print and
fallbacks in all engines. It accepts negotiated Brotli or gzip; only the
artificial missing-runtime context blocks service workers so a route can
actually remove the runtime. It does not mock browser font support.

lifecycle.mjs verifies actual worker close within two seconds: Firefox delivers
the close event asynchronously, while the original conversion test asserts
immediately. The original failure remains recorded.

The original unsaved suite compares serialized bytes after declining a
replacement. Core.toStream stamps the current second on every serialization,
so Firefox/WebKit can fail that equality despite no document change.
unsaved-model.mjs is a separate native-clock probe: session identity and dirty
state must remain unchanged, and all serializer bytes match except at most one
current-second UTF16 Core.modified timestamp at the same offset (within two seconds of the browser timestamp captured
beside serialization). The baseline follows two actual render frames after
the edit, but Firefox/WebKit master/thumbnail rendering can still change slide-number
display text. Those content bytes are not normalized: their comparison fails
and the overall runner stays nonzero while independent lifecycle checks continue. It also
exercises save and later explicit discard. Original assertions and failures
remain intact. Both Playwright clock-fixture attempts were abandoned because
changing browser time affected native dirty events.

For a verified 100-page public DOCX, set EO_LOCAL_MIN_PAGES=100 and
EO_LOCAL_PACKAGED=1 for editor-browser.mjs, or use pdf100.mjs with EO_LOCAL_FILE.
RSS is the simultaneous sum of browser/driver descendants sampled every
100 ms, excludes the Node test process, and can double-count shared pages.
It is neither PSS nor the wasm heap. No timing claim is a percentile.

Native Linux low-memory profile (requires systemd user scopes):
```sh
EO_BROWSER_BUDGET=1G EO_BUDGET_OUT=/absolute/own/work/budget-1g \
  bash tests/browsers/low-memory-native.sh
EO_BROWSER_BUDGET=2G EO_BUDGET_OUT=/absolute/own/work/budget-2g \
  bash tests/browsers/low-memory-native.sh
```
The script uses only own named scopes, no swap and no sandbox changes.
Inspect every result.json, run.log and cgroup memory.events. The script returns nonzero if any engine fails; retain the detailed
per-engine verdicts, including intentional low-budget OOM results.

## Owner-run native Mac acceptance (prepared, not executed)

Follow docs/shortcuts.md section 9.1 for the tunnel workflow. These scripts use
installed Chrome, Safari and Firefox through native WebDriver, without platform
spoofing. Playwright WebKit on Linux is not Safari. Requirements: Node 22,
matching chromedriver and geckodriver on PATH, Safari Develop > Allow Remote
Automation. Safari may also require the owner to run
`safaridriver --enable` once; this can request an administrator password. Override EO_CHROME_DRIVER,
EO_FIREFOX_DRIVER or EO_SAFARI_DRIVER if needed.

Copy only tests/browsers/{mac-run.sh,mac-native.mjs} to a Mac folder; no repository
clone is needed. With a public DOCX already on the Mac:
```sh
EO_MAC_EXPECT_PAGES=100 bash mac-run.sh /absolute/public-100-pages.docx /absolute/own/results
```
Omit EO_MAC_EXPECT_PAGES for another public fixture. The script starts its own
18083 tunnel to development host's own32786 instance, rejects :8080 and refuses occupied
driver ports. Overrides: EO_FIRE, EO_REMOTE_PORT, EO_TUNNEL_PORT.
It checks local open/edit/save (including clean save state), then uploads the
public fixture deliberately for a separate hosted native-PDF probe. It records
actual browser capabilities and PDF backend stats; download files use each
browser's ordinary settings. It does not perform pixel comparison, permission
consent, network escape assertions or Mac memory accounting: those need further
owner-run acceptance, not a claim based on Linux. The script closes only its
own sessions, drivers and tunnel. Do not use private documents.

Final supplemental verdict: Chromium6/6 byte comparisons pass; Firefox/WebKit5/6 pass with PPTX comparison fail (overall exit1). Independent functional prompt/decline/save/discard checks complete6/6 in each engine. See checks.md and docs/wasm.md18; this is not an all-green acceptance claim.

Additional unchanged local-mode suites:
```sh
export EO_LOCAL_IMAGE=/absolute/public/first.png
export EO_LOCAL_REPLACEMENT=/absolute/public/second.png
node tests/browsers/run.mjs tests/local-mode/concurrent-browser.mjs ../w4-A-work/concurrent
node tests/browsers/run.mjs tests/local-mode/queued-images-browser.mjs ../w4-A-work/queued-images
EO_LOCAL_PACKAGED=1 node tests/browsers/run.mjs tests/local-mode/editor-browser.mjs ../w4-A-work/image-pickers
EO_BASE=$EO_BASE python3 tests/local-mode/http-runtime.py
python3 tests/local-mode/packaging.py SDK_OUTPUT_ROOT WEBAPPS_OUTPUT_ROOT
```
Image tests require the public sample fixture variables from the earlier commands;
EO_LOCAL_OUT is provided separately per engine by the runner. Packaging arguments
are output roots containing sdkjs/ and web-apps/, not those child directories.
