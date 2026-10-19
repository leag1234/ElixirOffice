# Hosted PDF mouse wheel — Z5 release review

This isolated server candidate fixes modern wheel delivery in the shared PDF SDK.
The hosted Chrome baseline stayed at Y0; Firefox scrolled through legacy events
but ignored Shift-horizontal intent and zoomed on each small Ctrl delta.

The private hosted binding uses a non-passive capture wheel listener. Normal
scrolling delegates to the original PDF handler, preserving field scrolling,
dominant-axis choice and pointer updates. Ctrl/Meta and trackpad-style Ctrl-wheel
use the unchanged desktop contract: 45 pixels per line; viewer height per page;
100 pixels per zoom step; reset after more than 250 ms or direction reversal;
300 pixels per-event clamp. Handled zoom stops holder/document propagation,
including below threshold. This modern hosted branch adds no legacy listener.
Offline, absent-DocInfo and unsupported-wheel clients retain their original
legacy binding; the desktop adapter and every desktop source/test are unchanged.
Repeated actual ready callbacks bind only once.

## Actual qualification

Base Product d1329fc9f17821ef21d08bbe59d533666233b984,
DS a5c3c4523a858e694b6c39ccf8fbb2cc0495d5e1,
SDK fdfd59a5954bc2f0c3bd6ead70dc2943aadc3608,
web-apps 7a539af46ae97327a08221932ef1797cc8593e59,
integration 00962d45ee7794e65b5ed55ab0996a8893d99db1.
Core528e920e4f3489069474d91346e406ddfb78f054 remains unchanged.

An owned loopback DocService instance served current production UI and freshly
compiled Word min/all SDK bundles (PDF viewer is in configs/word.json).
Actual DocsAPI/DocService opened the public12-page PDF with OfflineApp=false
and no local session. Chrome155.0.8059.82 on macOS ran sandboxed; Firefox155.0
ran on development host. No static replacement/API mock/private document was used.

| Check | Baseline | Candidate |
| --- | --- | --- |
| Vertical +240 / -120 | Chrome Y0 / 0; Firefox Y3600 / 1800 | Both Y240 / 120; one call per impulse |
| Shift +180 | Chrome stationary; Firefox vertical Y4500 | Both X279→459, Y120 unchanged; one horizontal call |
| Ctrl/Meta threshold/reset/reversal/clamp | Per-event inherited zoom fails | All pass; no duplicate/browser page zoom |
| PageDown / PageUp | Not in original baseline driver | Both directions pass in both browsers/profiles |
| Real resource pins | Six current hashes per baseline profile | Six expected hashes each; no page/resource/outside-network errors |
| Unchanged desktop units | 244/244 after assembly prerequisites | 244/244 |
| Focused units | Existing desktop6 | 15/15: desktop6 + shared9 |
| Production SDK / style | Current baseline min/all built | Candidate min/all and SDK code-style pass |

Candidate104/104 = four hosted profiles ×26 checks: view/en and
annotation/edit-permitted/fr in each browser. The driver asserts requested
configuration, edit/comment/fillForms permissions and PDF capability flags.
apiViewMode=false/appEdit=true occur in both profiles and are not mode proof.
Actual isPDFEdit=false: no original PDF text-editing claim.

Direct tests extract actual private source without a public test API. They
compare normalized events and deterministic zoom traces with unchanged desktop,
then run the actual shared checker/PDF handler with injected field/scroll objects.
This proves routing/pointer behavior, not a live interactive form document.

## Reproduction and receipts

Run tests/pdf-wheel/fixture.py OUTPUT to create a new public directory with the
12-page PDF and actual DocsAPI HTML. Both reproduce the executed bytes exactly.
Serve it at /z5-public/ on an owned loopback non-JWT test DocService instance.
The internal document URL is http://127.0.0.1/z5-public/wheel.pdf; this is a
dedicated test configuration, not a production security change.

Focused units require Node22+ and existing SDK build dependencies:
UPSTREAM=/path/to/DocumentServer node --test tests/pdf-wheel/shared.test.cjs tests/desktop/pdf-compat.test.cjs
Default UPSTREAM is the sibling DocumentServer checkout.

For node tests/pdf-wheel/hosted.cjs set EO_BROWSER=firefox or chromium,
EO_PLAYWRIGHT_PATH, EO_BASE (loopback), EO_OUT (new directory), EO_EXPECTED
(JSON resource-path→SHA256 map of the six installed SDK/PDF UI/API resources).
Chromium requires EO_CHROMIUM_EXECUTABLE; sandbox is explicitly enabled.
EO_OBSERVE=1 records failing baselines and must not qualify a candidate.
The driver records originally loaded URLs and hashes a native browser re-fetch
of those same immutable URLs; it does not replace resource payloads.

External evidence: /srv/elixiroffice/wt/pdf-wheel-Z5-work, including
baseline-chromium-v4, baseline-firefox-v3, candidate-chromium-r2,
candidate-firefox-r2, source/build/deployment profiles, expected hashes,
input hashes, desktop/focused/style logs and independent review receipts.
Final frozen manifests and local heads are recorded in Z's bus REPORT.
Earlier Firefox body eviction, late code.js observation, missing builder/assets/
generated Help and mismatched test clock failures remain with correction notes.
No historical failure is counted as a product pass.

## Limits

Trusted Ctrl-wheel exercises the standard pinch-wheel path; no physical
trackpad was used. Actual touch/mobile, native Electron/OS packages, live forms,
original text editing, conversion/runtime fidelity and a general hosted
smoke/shortcut matrix remain unqualified. No keyboard/touch handler or web-app
controller changed. Source candidate only: integration/release belong to lead.
