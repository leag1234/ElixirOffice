# RTL table converter regression

The eleven original synthetic CC0 inputs exercise true/false table direction,
explicit false over an RTL style, default/center/leading anchors, basedOn chains,
a reactivated 720-twip indent, explicit physical ODF alignment and absolute-indent
rounding. fixtures.json pins every input and independent expected properties.
There are no private documents or actual Word golden files.

Run with an explicitly configured native converter and its SDK/font environment:

    python3 tests/rtl-tables/native_roundtrip.py --converter /path/to/x2t --font-dir /path/to/fonts

The runner uses only these fixtures and a temporary directory, performs 55 actual
conversion steps, checks effective OOXML properties, required explicit false,
ODF table writing-mode/physical alignment and exact 720-twip preservation. The caller
must supply the converter's library/config/SDK dependencies; the runner does not
discover or launch a document service. Python standard library only.

This is a native conversion regression, not full-Wasm, Word, graphical/PDF,
interaction, conditional-style, floating-table or percentage-margin acceptance.
The separate SDK source/actual-engine checks are in its tests/word directory.
See docs/rtl-tables.md for scope and remaining gates.

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/rtl-tables.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.

## release review/20 r2 compatibility gates — 2026-10-16

ltr-compatibility.cjs takes baseline-server.json candidate-server.json fresh-output
and an optional single fixture filename (scoped calibration only). Use Node22+
and EO_PLAYWRIGHT when the Playwright package is elsewhere. Both owned static
servers must serve their exact production bundles; the driver blocks outbound
requests and closes its own browser/server. Its fixture manifest pins controlled
CC0 inputs, including a derivative with only direct bidiVisual removed.

The comparison retains raw UI caches while comparing the official engine
GetSelectionState contract and actual caret/text/cells/bounds/history. It controls
the SDK's separate500ms multi-click detector and asserts real single-click input.
ltr-oracle.test.cjs calibrates strict active cell-data/endpoints/history negatives.
runtime-guards.cjs takes candidate-server.json fresh-output and exercises real
no-direct LTR no-op/export, inherited false override, pre-recalc history-off
setters, real style invalidation/recalc, undo and10,000 checks with traversal/
serialization traps. Existing full-browser528 runtime only; new core rebuild
acceptance remains separate. Exact args/bundle/source/profiles and failed setup
attempts are retained outside Git in rtl-ltr-guard-Z-work.

For the oracle unit command, set EO_SDKJS to the candidate source root and run
Node --test tests/rtl-tables/ltr-oracle.test.cjs. Unknown fixture filters fail
before a browser starts; border tracking is rejected recursively through every
captured table. Complete acceptance can be assembled from ten independently
filtered runs of the same frozen driver, each with48 paired cases; partial/
unknown/empty sets must never be reported as the full matrix.

shared-table-selection.cjs takes server.json blank.pptx fresh-output, inserts a
real presentation table and exercises GraphicFrame's Shift-selection route. It
asserts that the non-Word model has no Word table-stack capability, that selection
succeeds, and that the source fix does not require a presentation-specific API.

## Style output and actual clipboard paste

style-output.cjs takes server.json fresh-output [fixture-filter]
[manifest-name]. The default style-output-fixtures.json contains thirteen LTR
fixtures; style-direction-fixtures.json contains four RTL inheritance controls.
It calls the actual BinaryFileWriter and asc_CheckCopy, captures complete style
table records from the wire format, records both real style comparators, and
downloads DOCX through the product. It does not normalize style data.

style-paste.cjs takes server.json capture-directory fresh-output [fixture-filter]
[manifest-name]. It pastes the captured clipboard twice into a blank product
document, requires the expected direction, proportional table growth and style
reuse, and downloads the result. These are actual engine/API clipboard routes,
not trusted native OS clipboard gestures.

style-output-compare.py takes --baseline, --candidate and --output directories.
Optional paired --native-baseline/--native-candidate add clipboard DOCX style
checks after an explicitly profiled converter run. Optional paired
--paste-baseline/--paste-candidate add actual paste outcomes and pasted DOCX
styles. The comparison reads complete binary style records and raw
word/styles.xml bytes. Whole payload/package hashes are diagnostic only.
Unknown filters fail; existing r2 custom-style capture is a required negative.

For server-build acceptance, install the profiled production SDK bundles into
owned full DocumentServer images, check health and exact HTTP bundle hashes,
and run the existing ltr-compatibility/runtime-guards/shared-table-selection
drivers against their server.json. The maintained product route is local.html;
do not relabel it live docservice/native editing or a new full runtime gate.
Existing-base native RTL false-output failures remain separate from LTR style
identity and require the already queued core0011/D rebuild/corpus qualification.

### Fresh server assembly and API provenance
A base image can regenerate installed api.js from api.js.tpl at startup.
Install the newly built API into that template too, then compare the entire
generated file with the exact source template after its single documented
HASH_POSTFIX substitution. Check the actual HTTP body hashes under both
installed and local product prefixes with gzip enabled. Bind generation receipts
to the current container IDs. Preserve initial assembly failures separately;
never accept missing API code as cache metadata or reuse an earlier image's gate.
Current release review profiles rebuild SDK9ed/desktopwebapps8aa; no mobile build is claimed.
