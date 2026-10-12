# Word opening performance and fidelity

D4's reviewed result is small: about 0.3 s on the 97-page document; ten pages
and typing are unchanged. Larger raw before/after differences are noise, not
a broad speed claim. Evidence predates the rebase onto current integration
branches. Integration waits for the lead's explicit authorization after gate 7;
the lead reruns the gates.

Run on a dedicated dev instance, never the lead's :8080. Node22 and the project's
Playwright installation are required. Corpus exports require the pinned native
PDF runtime installed in the instance's static assets. No private corpus is used.

## Opening and input probe

```sh
# On <dev-host>, after preparing a dedicated instance:
node tests/perf-open/run.mjs --base http://localhost:32769 \
  --doc $EO_WORK/wt/open-D-work/fixtures/synth100.docx \
  --throttle 4 --visits 2 --out $EO_WORK/wt/open-D-work/measurements/run-0

# Separate diagnostics: CPU sampling and a DevTools Performance trace.
node tests/perf-open/run.mjs --base http://localhost:32769 \
  --doc $EO_WORK/wt/open-D-work/fixtures/perf-10p.docx \
  --throttle 4 --trace 1 --visits 1 \
  --out $EO_WORK/wt/open-D-work/measurements/profile-0
```

Each output directory is a new persistent browser profile. Visit0 is fresh;
later visits reuse the profile but upload a fresh source document, so earlier
typing cannot contaminate the next document. Browser startup is outside t0.
For a standalone editor, use --url instead of --base/--doc. A physical desktop
uses --chrome /usr/bin/google-chrome --headful 1. Scope HOME/XDG/TMPDIR to the
benchmark work folder on a host with that restriction.

Visible means the first id_viewer page blit followed by one rAF callback;
it is a canvas-paint proxy, not a compositor presentation timestamp. Editable
means a real CDP 'z' keydown accepted by the editor's modification state. The
probe checks readiness every20ms and records whether pagination is still active.
It then sends100 real 'a' keys, targets10Hz, and verifies the complete text
difference outside the timed loop. Busy renderers can lower the achieved rate;
report the actual rate. Keydown-to-two-rAF latency is also a paint proxy.
Background samples are those sent while FullRecalc.Id was active. Ten-page
documents provide few such samples; do not treat their p95 as a stable estimate.

JSON includes resource times, CPU load before/after, method spans, accepted-key
time, exact typing evidence and final page count. Detailed reader spans preserve
the original constructor/prototype and wrap actual methods; they are nested,
so do not add them as independent phases. CPU categories are sample attribution,
not mutually exclusive wall-clock phase durations. Worker runtime/Font FS setup
and conversion timings are reported by the standalone loader when available.

Keep traced diagnostic timings separate from untraced timing runs. On shared
<dev-host>, wait for1-minute load<4 and reject a complete pair if either endpoint>=6;
retain rejected JSON and its reason. Use multiple fresh/reused pairs. Never
discard a sample merely because it is slow.

## Real engine and rendering checks

```sh
EO_BASE=http://localhost:32769 node tests/perf-open/engine.mjs \
  corpus/provisional/teachers/t01-fiche-fractions-cm1.docx \
  $EO_WORK/wt/open-D-work/checks/engine.json

EO_BASE=http://localhost:32769 node tests/perf-open/fidelity.mjs \
  corpus/provisional $EO_WORK/wt/open-D-work/checks/native-pdfs
```

The engine test compares every ASCII value, mixed-script examples and transitions
from Hebrew with the real HarfBuzz-backed classifier. It checks redundant and
actual formatting-mark changes. Native PDFs replay real editor drawing commands;
a JS/server fallback fails the capture. Compare before/after with the existing
tools/fidelity/compare.py at its unchanged defaults. This is a regression
reference to the previous editor rendering, not a new reference for fidelity to Word.

Run the unchanged Word shortcuts (both platforms), smoke, layout and image suites.
Inspect their JSON/logs: shortcuts, images and smoke can exit0 despite reported
failures. Image scores are gesture metrics with existing nonzero baseline
penalties; retain per-scenario values and investigate movement changes.

report.py aggregates visits and retains sample ranges; summarize.py prints spans;
profile.py emits exclusive sample categories plus function self/inclusive tables.
The D4 physical-desktop driver and static-server adapter are retained under
<test-desktop>:$EO_WORK/bench/d4/. Its frozen untraced driver is recorded by SHA256;
run-detail.mjs provides separate detailed diagnostics. See docs/perf.md for
results, host differences and outstanding gates.
