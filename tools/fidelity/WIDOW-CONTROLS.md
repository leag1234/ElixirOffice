# Body content-control widow/orphan probes

These generators contain original synthetic data. They do not read a corpus,
change a document to force a heading break, or provide independent Word results.

Generate the 60 body cases with: python3 tools/fidelity/widow_controls.py OUTPUT.
Generate the 24 scope controls with: python3 tools/fidelity/widow_scopes.py OUTPUT.
Set PYTHONDONTWRITEBYTECODE=1 and a task-owned TMPDIR. Retain the manifests
and their source hashes, then run baseline and candidate against the **same**
fixtures. Any namespace/fixture correction is a separate, disclosed input.

Run: node tools/fidelity/measure-widow.cjs CORPUS OUTPUT PACKAGED_EXECUTABLE.
This launches an owned Linux Xvfb display and a fresh desktop profile per case.
Require explicit EO_FIDELITY_XVFB and EO_PLAYWRIGHT, and run in a bounded
systemd user unit (2 CPUs, 4 GiB RAM, no swap, 256 tasks, finite runtime).
Keep the desktop sandbox enabled. Use an isolated QA package with the exact
compiled SDK overlay; never replace files through hardlinks to a retained package.
The fixture and package inputs must be public and immutable.

The driver checks imported target existence, widow property, direct/flow owner,
line count, stable repeated recalculation, renderer errors and external requests.
Body cases require equivalent page/line allocation with and without SDT wrappers.
An optional fourth argument is a baseline observations.json for scope controls:
body flow compares with the corresponding direct-body case; frame/float/manual
break and non-body cases retain baseline behavior. A scope run without this
argument records baseline observations; it is not a baseline-equivalence pass.
EO_WIDOW_ROUNDTRIP=1 additionally saves to DOCX and opens a fresh process/profile,
requiring unchanged imported structure, text, properties and pagination.

Independent original probes may supply a row marker and expectedPages
(page/start/end line ranges). The driver checks those explicit expectations as
well as body/SDT equivalence. Keep the independent manifest and all input hashes;
do not replace independent evidence with the candidate's own expectations.

Source method units:
EO_SDKJS=/absolute/sdkjs node --test tests/fidelity/widow-owner.test.cjs.
They execute the real SDK owner/replay/wrapper methods with the unrelated editor
environment stubbed; the native matrix supplies actual pagination coverage.

After each run, record exact inactive task-owned profiles/caches/intermediates
and allocated/free bytes before removing them. Keep model/verdict JSON, logs,
source manifests, hashes and decisive public PDF evidence. Retain packages and
compiled bundles only until the comparison/review that needs them; do not prune
shared or protected release/build images.
