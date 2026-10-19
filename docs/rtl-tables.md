# RTL table direction and interaction candidate

This isolated SDK/core candidate preserves table direction and mirrors inline
columns while retaining logical cell order. Its interaction extension adds physical
column/ruler dragging, outline resizing, selection and table movement. Scoped
native conversion and graphics checks remain those of the frozen first slice. The browser still uses the previous full Wasm converter;
rebuilt browser-Wasm and actual Word acceptance remain open.

## Behavior

The SDK carries an unspecified, false or true BidiVisual property through
copy/merge/defaults, styles, wire field 22 and history. Explicit false overrides
an RTL table style. Public table properties expose get/put access and tblApply;
Undo/Redo recalculates actual cell positions.

A true value places the first logical cell on the right. Cell arrays and exported
XML remain in A/B/C order; physical columns become C/B/A. Paragraph/run direction
is independent. Inline cell metrics reflect before content layout, anchors and
leading indentation reflect within text margins, and border drawing converts
only border coordinates/rules. Text orientation and logical grid indices remain.
Nested tables retain their own direction.

The core preserves explicit false direction and left justification in binary
DOCX export. Horizontal ODF modes map to table direction and physical alignment.
Default/inherited anchors, absolute-indent rounding and the BidiVisual/Jc/TblInd
subset of basedOn chains are preserved. An intermediate centered style retains
the inactive indent needed when a later child or table restores leading alignment.

Internal property records use unused presence/value bits without adding bytes.
The previous reader can reach the next record but ignores direction.
Mixed-version collaborative history and direction fidelity remain unqualified.

## Verified scope

- The frozen first slice passes twelve source tests and six real
  engine/API/history/style checks. Three actual previous-reader record-boundary
  checks pass. The interaction extension adds the separately recorded source,
  engine and browser checks below.
- The frozen baseline browser lost all 21 positive table flags and displayed
  eight positive controlled tables as A/B/C. The SDK candidate retains the flags
  and displays C/B/A. Five DOCX anchor/indent oracles and the colored border
  positions at 486/396/126 pt pass. Four RTL/LTR PDF pairs match fill/border
  vectors over six pages, including spacing, asymmetric margins, vertical merge
  and repeated headers on three pages.
- Real clicks select logical cell 0 on the physical right. Tab/ShiftTab preserve
  logical progression. First-slice protection probes verified that three RTL
  internal/outer drag attempts preserved the grid before the interaction extension.
- All four shared editor bundles build. Actual XLSX/PPTX open/save smoke passes.
  Visio runtime remains unverified because no public fixture was available in
  the owned inputs.
- The earlier 34 browser lifecycle cycles and three chained-style cycles pass
  as operations. The old browser Wasm still fails explicit-false style overrides
  and ODT direction/alignment preservation.
- The final native matrix has 41 inputs and 287 successful, nonempty outputs.
  Forty cases have direction/property oracles; the original ODF page-mode case
  has no effective-direction oracle. All asserted DOCX/ODT properties and
  physical ODF alignments pass. There are 34 input and 34 cross-format PDF
  Latin-order oracles. Eighty-two native DOCX exports retain 258 controlled
  logical-row order oracles.
- The maintained [converter regression](../tests/rtl-tables/README.md) adds
  11 pinned original CC0 inputs and 55 actual conversion steps, all passing,
  including explicit false/left overrides and exact 720-twip reactivation.
- Native graphics match four RTL/LTR pairs over six pages, all five anchors
  and the 486/396/126 pt colored-border oracle. Eight additional style-anchor
  checks use independently resolved XML section frames. Twelve actual native
  page rasters and a full-resolution reactivation output were inspected.

The old and candidate ODF paths both normalize a 12.7 cm table to 12.9 cm and a
612 pt page to 611.95 pt. Anchor checks preserve placement relative to the actual
section geometry; unchanged dimensions and pixel-exact cross-format fidelity
are not asserted.

Evidence is in the owned rtl-tables-implementation-Z-work directory.
geometry-1-profile.json, extended-1-profile.json and safety-api-profile.json
separate the SDK revisions. Native profiles retain all 25 binary hashes and
runtime inputs. Historical profile/harness failures and negative converter
results remain available.

## Interaction extension

Column borders and the horizontal ruler expose physical positions while retaining
logical grid indices. Asymmetric widths/margins and current-cell indices reflect
for the ruler only. RTL inline edits preserve the physical leading right edge;
center/right anchors become a leading anchor with equivalent physical indentation
when needed. GridBefore markers distinguish a row gap from global translation.
Both the origin and explicit table width are updated for that gap edit.

RTL outline resizing uses a southwest handle, continuous screen displacement and
the inverse linear parent transform. The physical right edge stays fixed. Exact
row heights receive the requested delta once, including cell spacing and repeated
header contributions; shrink constraints redistribute the remaining delta.
History retains the original properties for one-step Undo/Redo.

Physical Left/Right intent is separate from paragraph character direction.
Container routing follows each nested table direction, while selections spanning
document elements collapse in document order. Vertical row entry uses physical
cell intervals and local content/table fragments. Text selection begins without
temporarily selecting a whole cell and moving its paragraph/nested caret.
Selection initialization retains the current local fragment. Bounds and internal
anchors map that fragment to its physical page and origin; row grid offsets are
already present in cell metrics.

Floating movement records the initial temporary positions before recalculation,
so an existing-parent move invalidates layout. Original and final anchors remain
in the same history action. This fixes the measured RTL and LTR floating no-op.

RTL pointer gestures cancel after a direction or resolved geometry/style/identity/
parent-transform change. Ruler drags retain an independent starting markup
identity. These controls supplement local stale-preview checks; they do not
establish live multi-client collaboration behavior.

The extension passes 32 maintained source tests and lint. Its controlled browser
evidence records:

- All 48 RTL border/ruler cases pass across center/right/indent/spacing/floating,
  horizontal/vertical merges and a three-page table. Preview/commit positions and
  exact source-state Undo/Redo are checked. The 48 paired LTR cases have identical
  states and physical boundaries to the frozen baseline before/after/Undo/Redo.
  Ten preexisting LTR pointer/preview expectations still fail in both builds.
- Separately frozen profiles pass all 16 basic border/ruler cases, 12 RTL GridBefore/
  GridAfter cases, six held-gesture direction/row-height cancellation cases,
  52 ordinary arrow/Shift/exit/text/collapse cases and 32 multi-element ranges.
- Sixteen extended outline cases pass, including exact rows, spacing, anchors,
  floating tables, merges and three pages. Six additional auto/atLeast controls
  and two shrinking controls pass. Pagination/header-count changes are outside
  this measured scope.
- Sixteen leading row/cell hot-zone and content/trailing negative controls pass,
  including asymmetric margins. Four inline/floating moves pass in RTL/LTR.
- Eighty tall populated and empty nested arrow/Shift/exit controls pass in all
  four outer/inner direction combinations, including sixteen vertical Shift
  controls. One empty paragraph mark is selected on the first
  Shift+Down; a strictly checked second press includes the adjacent row. The
  result is within two presses, not a universal one-press assertion.
- Four two-column LTR/RTL Shift+Up/Down controls pass where two local fragments
  occupy one physical page. Six direct geometry controls cover grid gaps and
  cross-fragment bounds/anchors. The retained old trace shows the wrong page
  causing a document-start fallback; corrected bounds use the physical page and
  each endpoint’s fragment origin.
- Forty real-click keyboard controls pass after no selection, cell selection or
  SelectAll removal, including four later-page starts. Four programmatic
  FromPaste movement controls preserve the existing paragraph-direction contract
  and restore the previous bounded key context.
- Ten actual engine groups include API/history/style, positive ruler/outline
  edits and recording-overlay paint/hit checks with real page/matrix methods.
  This does not qualify a transformed document hierarchy or native UI.
- The four shared production editor builds pass serially with a 2048 MiB heap.
  XLSX/PPTX open/save smoke passes. Visio runtime remains unverified.
- Export checks and PDF visual inspection are recorded separately in
  rtl-interactions-Z-work/exports-and-pdf-oracles-v2.json and pdf-visual/.
  There are 61 DOCX exports with 297 logical-row checks, 24 PDF outputs with
  109 physical label-row checks and eight inspected page rasters. The two empty
  shrink PDFs provide no label-order oracle.
  They qualify controlled logical-row retention and physical label placement;
  they are not actual Word goldens or pixel-exact cross-format proof.

Every result retains its actual source/bundle/fixture profile. Earlier harness
failures remain available: ruler layout timing, suppressed Alt border gestures,
whole-row setup mistaken for a single cell, complete-tail/endmark range rules,
wrapped/clipped nested text, namespace-prefix import and click timing/leading
margin preconditions and an invalid direct-selection type. The corrected oracles
do not relax pointer tolerances. The first two-column run also exposed genuine
fragment/page and row-grid-origin defects; retained traces show the backward
selection falling to document start before the bounds correction.

## Remaining gates and protections

Native here means x2t conversion/rendering; Electron/ASAR and OS acceptance
remain unverified. The browser still uses the old full Wasm converter.

Pencil/eraser grid mutations remain blocked on RTL tables; the mode stays active
but performs no mutation. Numeric properties remain available. Four original
short exact-height nested Down controls still fail in both baseline and candidate:
wrapped text overflows the clipped cell and the logical end caret geometrically
hits the following row. They are retained as negative controls and do not qualify
overflowing-content selection.

General transformed/floating hierarchies, pagination/header-count changes,
conditional styles, inheritance outside the direction/anchor subset, inactive
indent metadata, percentage ODF margins, tracked changes and mixed-version
collaboration require separate qualification. Full OOXML schema validation,
general property ordering and actual Word acceptance remain open.

No actual Word runtime, save/reopen result or PDF/raster golden was measured.
Normative expectations use
[Microsoft table direction](https://learn.microsoft.com/en-us/office/vba/api/word.table.tabledirection),
[OOXML BidiVisual](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bidivisual?view=openxml-3.0.1)
and [ODF 1.3 table formatting](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html).
A rebuilt full converter and browser matrix are required before browser acceptance.

The Arabic/Hebrew template table-justification generator needs a final audit with
the mirrored engine. The frozen template overlay is unchanged. There is no
integration, runtime pin, push, package or release change in this branch.

## Source checkpoints

SDK a097e30a92931434fe688d1fce34cd34222dbfdb is an isolated qualified checkpoint.
Its independent review-sdk-final.md receipt has SHA256
4805a4761b905014295d26d7d1eca050bd216913d57b2cbef13f033c35991c0b.
Manifest 0fb913a50b451d63f5a83a79b310a4a91ac65bebe20e97a33991c9ff2d93ea67
covers 21 source and 16 evidence files; tests/lint and current bundle identities
were independently verified.

Core 2f5f44511ea2296965b03c4ca79872638de249c1 is an isolated native checkpoint.
Its independent review-core-final.md receipt has SHA256
9802896366cca25e6837eb424590998b9f8faadb5815ddcd1dcca9993c5a6f85.
Manifest 7f1a9fe9dd733c1d0373439ca13f418b956c7628c23bb87c42ce6a086de34bd7
covers three source and 350 evidence files. The reviewer verified all 25 native
binary hashes, runtime inputs, 287 success records and key independent output
oracles. Both source commits passed the precommit rebrand check with zero
findings. These receipts do not qualify full Wasm, Word or integration.

Interaction SDK 1639e92f8bd651569b75cc6a8c7398321ee4eede is the separate qualified local checkpoint above
a097e30a. Its review-sdk-final.md receipt has SHA256
8de45b355740ba44ca11dcbc79ddfa43c49002a166f41afd356483e069d717ef.
Manifest 24f8bb37d5fb5c8f03759c0f5ae17e825c289073ee1092ad4ab643175cb9319b
covers eleven final sources and 1,617 evidence files. Independent review verified
all hashes, reproduced 32 tests/lint, recomputed the final matrices and independently
checked all 61 DOCX/297 logical rows, 24 PDF/109 label rows and XLSX/PPTX ZIP/XML
packages. The precommit rebrand check reported zero findings.

The complete evidence retains separately frozen historical profiles and
evidence-caveats.json. Older evolving untracked Node test contents are not all
reconstructible; every production source in six qualifying profiles is reconstructed
and hash matched, and the eleven final source files are complete. No integration,
full-Wasm, actual Word, schema or native desktop approval follows from this receipt.

## release review r1 scope — 2026-10-16
This candidate replays only RTL slices1 and2 onto integrated product41e4fa6f96
and SDK46dfd9b4dc. It excludes inherited system-fonts SDK50f1 and product S1–S4.
The26 changed RTL SDK files match the qualified slice sources exactly; all
seven Fonts-only SDK paths retain integrated46df bytes. Integrated release,
security and runtime identities are preserved. All integrated documentation
lines remain, with dated candidate additions. Earlier broad matrices and source
receipts above are historical profiles, not blanket acceptance of this r1 tree.

Fresh review-rebase-Z-work evidence: desktop206/206,32 actual-source tests,
lint and all four production min/all builds pass. A fresh browser using those
compiled RTL bundles plus the recorded integrated110-font reference passes:
ten engine/history/direction groups, two XLSX/PPTX open/save controls, four
two-column keyboard controls, six selection-bounds cases, sixteen physical
border/ruler drags and six stale-geometry cancellation cases. Shared exports
are independently checked as ZIP/XML below. The older61-DOCX/24-PDF matrix
remains attributed to its original combined source/runtime profile.
Pencil/eraser mutations remain gated and the four clipped nested negatives,
older LTR pointer negatives and other documented exclusions remain open.

Core source is separate on integrated528e920e4f34 and exactly preserves the
three qualified2f5f4451 source files. Eleven portable public fixtures and55
native conversion steps pass again with the25 hash-verified cached native-v3
binaries and new r1 compiled RTL SDK. This verifies those inputs with the
existing binary; it is not a new native/full-Wasm runtime build.
The separate core commit REQUIRES a0.2.2 runtime rebuild with D phase3.
Both DS branches retain core528e920 and web-apps26f3977; only the matching SDK
gitlink may advance. Full browser converter, false-style/ODT browser behavior,
Word/schema/native desktop and general hierarchy/pagination acceptance remain
open. No integration, runtime pin, packaging, push or release.

## release review/20 r2 — LTR compatibility and pointer snapshot cost (2026-10-16)

The candidate is rebuilt above integrated Product62eb698, DS81b22c8 and SDK50f1cfde,
including the integrated System Fonts r2 work. The RTL implementation remains
isolated for review. Its four vertical navigation methods retain all12 original
LTR lookup branches exactly; corrected page-offset/nearest-cell routing applies
only to RTL tables. LTR selection bounds/anchors retain the earlier arithmetic,
including its historical limitations. Floating LTR moves retain the original six
temporary position assignments; history-aware temporary anchors apply only to RTL.

Document left/right intent exists only when the current table stack contains an
RTL table. StartSelectionFromCurPos uses the same RTL-stack context. Entirely
LTR stacks keep the original caret/selection operation. Mixed LTR/RTL stacks are
an explicit routing fix and need their separate controlled evidence. Applying an
effective false direction to a table with no direct value is a no-op: it must not
create a false property, direction history or a new false XML node. A real false
override of inherited RTL remains supported, including undo/redo.

Pointer geometry is captured once and checked with fixed fields, parent slot,
monotone layout revisions, document recalc ID, position/transform scalars and the
history binary writer identity/position. The check does not serialize or walk
rows/cells. Inline/overlap/distance changes are checked even before recalculation.
A fresh pointer-start token is carried through ruler commit; creating an empty
history action does not invalidate it. Recorded changes invalidate it even when
their history point is removed. History-off/incoming changes rely on real model
invalidators and recalculation. Raw inherited-style mutation without the normal
style invalidation/recalc contract is not covered. Cursor/collaboration/save
writes to the history buffer can conservatively cancel a preview; collaborative
drag availability needs its own qualification.

The real-editor LTR comparison uses the engine's official GetSelectionState
contract, public cell/caret/text/bounds/history and raw diagnostic states.
That unchanged engine contract omits transient Type2 and inactive cell-selection
caches; active cell lists and all model endpoints remain strict. Input setup
must observe the SDK's500ms independent multi-click detector, not only Playwright's
clickCount. Single clicks are spaced and asserted. Earlier uncalibrated input/
cache traces remain retained, not treated as qualified product regressions.
Final counts, exact source/bundle hashes and independent receipts live in the
external rtl-ltr-guard-Z-work evidence and the Z report. Prior wider/native
matrices retain their original source/runtime attribution.

### Separate core candidate: explicit LTR effects and rebuild gate

Core0011ded25093108b8980be47c4cdf339be113335 remains separate above528e920e4f34.
It is not in the current DS/runtime. A0.2.2 runtime rebuild with D's phase3 and
a corpus roundtrip are mandatory before converter qualification.

Binary table alignment Left now emits explicit w:jc=left for LTR as well as RTL,
instead of omitting the node. This can override an inherited style alignment;
it is a semantic output change, not an assertion of byte-identical LTR output.
The ODT reader distinguishes explicit Left from Margins: equal left/right margins
may center the Margins case, whereas explicit Left stays left. For resolved
left-aligned LTR output, a length-valued left margin becomes integer-rounded
twip tblInd. Percentage margins are not read as lengths; centered/right-aligned
cases do not receive that leading indent. Explicit ODT LTR writing modes also
emit a false bidiVisual override where needed to preserve direction inheritance.
These changes require paired inherited/direct/default alignment and length/
percentage/zero/asymmetric margin controls, DOCX/ODT save/reopen and PDF/layout
comparison on the rebuilt runtime. The later public/private aggregate corpus gate
must distinguish intentional explicit-property changes from visible regressions.
No such full rebuilt-runtime/corpus result is claimed by this r2 desktop fix.

The shared LTR presentation path also checks for the Word table-stack capability
before using it. A real inserted PPTX table reproduced the missing-method error;
the capability guard retains the original non-Word selection path. Its source
unit and real GraphicFrame Shift-selection regression accompany the final v3
four-editor build. Earlier v2 matrices retain their own source/bundle profile.

## R3: preserve implicit LTR style absence (release review)

CTablePr.InitDefault resets BidiVisual to undefined. It also resets a reused
property object that previously held true or false. Effective LTR remains false
through IsRTL's true-only check. A default table property copied by Styles.Get_Pr
therefore has no manufactured false for BinaryStyleTableWriter/WriteTblPr to emit.
The common writer retains its tri-state behavior: actual inherited/direct true
and false values remain serializable, including a false inherited from an
ancestor or whole-table style during clipboard flattening.

Raw Is_Equal remains strict. A direct false and an absent override can produce
different effective directions beneath an RTL style; globally equating them
would hide comparison changes. Implicit defaults uniformly return to absence.
The LTR regression checks compare both the uppercase raw comparator and the
lowercase comparator actually used by clipboard paste against the baseline,
then paste twice into a blank document and require proportional table growth,
unchanged style count and unchanged table-style records on the second paste.

The controlled set contains the original ten LTR interaction fixtures plus
custom, inherited and whole-table LTR styles. A real r2 custom-style copy adds
six bytes to the baseline style record; r3 removes that default pollution.
Acceptance compares the complete binary style-table record from ordinary save
and actual asc_CheckCopy, and raw word/styles.xml from saved DOCX, converted
clipboard DOCX and pasted DOCX. No XML canonicalization or ignored style fields
are used. Complete BIN/clipboard payloads and DOCX packages remain diagnostic:
existing direct table bidiVisual=0 is supported by the candidate but not SDK50,
and ZIP metadata can differ. Style byte identity is not whole-package identity.

Production bundles for all four editors are installed in isolated full
DocumentServer images, alongside a public fixture asset layer, using pinned
base225f57. Tests retain their local.html product route, served by actual nginx;
docservice/converter/example health is checked and both installed and product
bundle URLs are SHA-verified with gzip negotiation. The ten-fixture480-pair
LTR matrix, runtime guards and shared PPTX selection run against these images.
This qualifies those product browser gates, not live docservice collaboration
or native editor behavior.

The existing image's native converter passes the LTR style-identity checks.
Separate exploratory RTL controls preserve true but omit three false overrides
on DOCX output. Those are recorded FAIL, not counted as LTR acceptance or hidden.
The already separate core0011 changes that binary reader to emit explicit false;
it also changes explicit LTR alignment and ODT indentation as documented above.
D's0.2.2 rebuilt runtime and the later paired corpus gate remain required.
The SDK clipboard/paste controls separately retain inherited true, direct false,
inherited false and whole-table false. No core/runtime pin or release changes.

### Current acceptance base after release review

Current isolated branches descend from Product2b5ec81d37, SDK9ed10d8f1f and
DS c7cd5d0bdb; webapps8aa91ce518 is rebuilt for all six desktop modules.
The integrated thumbnail/reorder change and Fonts ancestry are preserved.
The earlier pre-release review r3 checkpoint is retained separately and cannot qualify
these new build profiles.

The current source37/oracle5/style checks and four-editor production SDK builds
pass. The full-server profiles bind exact SDK and desktop/API output hashes to
both installed and product-route HTTP responses, including gzip negotiation.
The base image initially regenerated installed API code from an old template;
the test image assembly now installs the freshly built API as that template.
The generated API must equal every source byte except one exact cache-token
replacement. No missing code or ignored fields are allowed. Current public
style, paste and browser results are recorded in rtl-msg22-Z-work and validation report.
The product route still uses the local editor; mobile/backend editing and a
new full runtime remain outside this qualification.
