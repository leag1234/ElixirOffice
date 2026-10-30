# Keep-with-next across body content controls

This is a separate candidate stacked on the body-SDT widow/orphan fix. Original
synthetic inputs cover an ordinary heading followed by paragraphs/tables inside
body SDTs, independently toggling keepNext. They provide metamorphic comparisons
with unwrapped flow, not independent Word references.

Generate with: python3 tools/fidelity/keep_next_controls.py OUTPUT.
The 114 cases include single/nested preceding/following/same controls, one/two-line
headings, chained keep + widow rollback, explicit page-before/manual/section
breaks, empty controls and a leading no-split table row.

Light units: EO_SDKJS=/absolute/sdkjs node --test tests/fidelity/keep-next-owner.test.cjs.
They execute actual SDK methods with unrelated editor geometry stubbed. On the
approved widow-only baseline, 12 of 28 assertions fail; all 28 pass with the
candidate, with no new skips. This is not native pagination qualification.

Native driver: node tools/fidelity/measure-keep-next.cjs CORPUS OUTPUT EXECUTABLE.
Require explicit EO_FIDELITY_XVFB and EO_PLAYWRIGHT, owned profiles/TMP/cache,
sandboxed Linux QA packages and a bounded unit (2 CPUs, 4 GiB, no swap, 256 tasks,
finite runtime). Verify each fixture hash and exact compiled Word overlay;
record the frozen shell separately from the SDK. EO_EXPECT_KEEP_OWNER=0/1
asserts which actual compiled keep-next method is running.

The driver compares actual heading/chain/target line-page allocation with the
equivalent direct-body case, checks imported properties, control counts, real
table existence and stable full recalculation. It rejects renderer errors and
external requests. EO_KEEP_INCREMENTAL=1 performs a real final-paragraph edit
and Undo on the deeply nested enabled cases, asserting the unchanged keep group
and restored content. EO_KEEP_ROUNDTRIP=1 saves those cases to DOCX and reopens
in fresh processes/profiles. EO_KEEP_EDIT_TARGET=1 selects the target paragraph
instead of the final paragraph; EO_KEEP_VERIFY_INCREMENTAL=1 compares the
edited incremental layout against a full recalculation before Undo. An
unexecuted check remains unverified.

Native/build runs are held until session D reports the 0.5 source archive terminal
(release review reference 435). Do not start a job merely because a process appears idle. After native
qualification rerun the same public Word reference pair; report page-agreement
delta and the actual next divergence, not just total page count.

Clean only exact inactive task-owned intermediates after each stage, with
allocated/free-byte receipts written before deletion. Preserve original inputs,
compact failure evidence and required rollback/review bundles. No source branch
integration until the lead announces 0.5 publication and authorizes the ordered
SDK, DocumentServer gitlink and product integration.

## Qualification recorded on 29 October 2026

The compiled widow-only baseline fails 32 of 114 native comparisons; the
candidate passes all 114, with identical imported source text and properties.
Ten deeply nested cases also pass real edit/Undo and save/fresh-reopen checks.
A separate six-case subset includes three actual target-paragraph edits whose
incremental layout matches full recalculation, followed by successful Undo.
All 24 body/non-body scope controls match their expected unwrapped or retained
baseline behavior. The independent E public synthetic plain/SDT pair changes
from a baseline SDT 2+1 split to both three-line paragraphs on page 2.
These synthetic inputs establish wrapper transparency, not Word certification.

Matched QUnit runs have identical results across 69 modules and 78,564
assertions: eight common failing modules and five existing source-disabled
entries remain. Both runners exit 1; this is baseline equivalence.

The real public a5077259 Word-web pair remains 14 pages with all 3,942 normalized
words retained. Unique-token same-page agreement improves from 392/419 to
419/419 with full matched-token coverage (widow-only intermediate: 403/419).
Mean page changed-ink fraction improves from 39.372192% to 28.286196% at 100 dpi,
gray tolerance 64 and neighbourhood radius 1. This is a diagnostic ink-union
metric, not pixel identity. Visual review of pages 3 and 4 confirms the repaired
section 6 heading and residual table geometry differences. Repeated text still
diverges: Household NPV (if available) is on candidate page 5 versus Word page 4;
the page-3 table caption is 10.51 pt higher. Do not claim complete pagination
identity from the unique-token score.

Compact evidence and protocol: /srv/elixiroffice/wt/sdt-keep-next-06-A-work.
The frozen sandboxed Linux QA shell uses exact compiled Word overlays; no new
release installer or Windows/macOS acceptance is implied. Hosted smoke and
shortcuts remain checks for the later authorized integration.
