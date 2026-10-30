# DOCX layout fidelity knowledge

Status: investigation guide, 2026-10-28. Generic rules, implementation landmarks
and proposed tests only: no private document content, filenames, screenshots,
runs or document-specific measurements. See [fidelity.md](fidelity.md) for the
comparison harness and [fonts.md](fonts.md) for the measured font pack.

## Evidence levels

Separate OOXML interpretation by x2t, font selection and measurement, editor
layout, and screen/PDF painting. A visible absence does not prove that x2t dropped
an object. Count and inspect the imported model before changing the importer;
then verify geometry, clipping, paint order and actual output.

Record exact product, core/runtime, SDK and web-apps revisions, package build,
OS, display scale, font consent and inventory. An older-release screenshot shows
a symptom, but does not establish the current root cause. A Word reference needs
its Word version, OS and actual resolved font identities. The dropdown can retain
the requested, missing font name.

Pagination is discontinuous. A small line-height or leading-spacing difference
can push a row onto another page and move following content. Report row heights,
line counts and end positions alongside page counts. Independent changes that
each remove an extra page are not additive percentage contributions. Changing
spacing or anchors proves sensitivity, not that the original property is wrong.

## Tables and paragraph flow

| Area | Rule to preserve | Test target |
|---|---|---|
| Fixed layout | Preserve grids, preferred widths, spans and margins; fixed layout does not mean fixed row heights. Resolve nested tables within their owning cells. | Compare source twips, imported millimetres and final grids; nested cells with explicit widths and borders. |
| Row height | Distinguish absent height, auto, minimum and exact. Minimum height may grow with content. | Core WriteRowHeight and SDK table recalculation. |
| Omitted height rule | The current importer intentionally treats a present height without hRule as a minimum, based on observed Word behavior. An absent height element is separate. | Synthetic Word references for absent, omitted-rule, explicit auto, atLeast and exact; do not globally change this compatibility choice from one document. |
| Splitting | Resolve cantSplit through the table-style hierarchy. If unset throughout, splitting is allowed. An oversized non-splittable row still needs documented multipage behavior. | Nested cells, vertical merges, repeated headers and rows taller than one page. |
| Paragraph spacing | Resolve each attribute through defaults, styles and direct formatting. Auto line spacing uses 240ths of a line, not twips. Adjacent spacing is not an unconditional sum. | Compiled properties, contextual/automatic spacing and cell-end suppression, independently. |
| End paragraphs | Empty paragraphs and paragraph-end marks still have metrics and spacing. Distinguish a terminal table paragraph from following non-empty content. | Absolute body page ranges, end-mark size, effective metrics and trailing content. |
| Floating tables | Preserve tblpPr, text/page/margin anchors, signed offsets, overlap policy and text distances separately from content height. | Positive/zero/negative text-relative offsets with identical content. |
| Compatibility | Preserve document compatibility settings; apply exceptions only with Word evidence. | Otherwise identical synthetic documents in supported modes. |

Implementation landmarks: core OOXML/Binary/Document/BinWriter/BinaryWriterD.cpp,
WriteRowHeight; SDK word/Editor/Paragraph.js; SDK
word/Editor/Table/TableRecalculate.js, private_RecalculatePageXY and position
calculation. Compare imported values before investigating layout.

Microsoft's [row-height reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tablerowheight?view=openxml-3.0.1),
[row-splitting reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.cantsplit?view=openxml-3.0.1)
and [paragraph-spacing reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.spacingbetweenlines?view=openxml-3.0.1)
describe independent constraints. Label observed Word compatibility behavior
separately from schema rules.

## Widow/orphan control inside body content controls

OOXML widowControl prevents an isolated first or last line of a paragraph.
Resolve it through the paragraph/style hierarchy; when never specified, the
default is enabled. A three-line paragraph with room for only two lines must
move as a whole: splitting it two-plus-one leaves a forbidden widow, while
moving only one line leaves a forbidden orphan. A four-line paragraph can split
two-plus-two. Explicit false remains distinct from omitted/inherited true.
See Microsoft's [OOXML widowControl reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.widowcontrol?view=openxml-3.0.1).

A body-level [structured document tag](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtcontentblock?view=openxml-3.0.1)
contains ordinary paragraphs and tables; its wrapper does not justify ignoring
their paragraph pagination properties. Distinguish a body SDT from a table cell,
text frame, header/footer or footnote before extending a body-flow algorithm.

The integrated 0.5 SDK gates the widow request, final-line backtracking and replay
in word/Editor/Paragraph_Recalculate.js on immediate Parent instanceof CDocument
(private_RecalculateMoveLineToNextPage, private_RecalculateLineEnd and
private_RecalculateLineWidow). A paragraph in a block SDT instead has a
CDocumentContent parent. Its compiled WidowControl can be true while these
branches are bypassed. In a public independent-Word comparison, this permits a
three-line paragraph to split two-plus-one; removing only its SDT wrapper in a
transient diagnostic enables the existing body logic and restores the expected
whole-paragraph move. The imported text, spacing, fonts and paragraph count
remain unchanged. A later heading's apparent page-break error can therefore be
a downstream consequence of an earlier widow violation.

The 0.6 candidate implements the generic correction: resolve the appropriate
main-body pagination owner through body SDT containers, and propagate the
widow/backtracking request and previous-page recalculation through those
containers. Keep direct-body behavior and explicit false intact. Do not merely
delete every parent guard, reclassify all document-content containers as body
flow, strip content controls from documents, or add an unconditional heading
page break. Container-relative line/page indices and loop termination need
explicit treatment.

Acceptance matrix: otherwise identical body, single-SDT and nested-SDT cases;
default/inherited/explicit true and explicit false; three-line two-plus-one and
one-plus-two boundaries, four-line two-plus-two, repeated recalculation and
save/reopen. Include adjacent keep-with-next headings, manual page breaks,
multicolumn/floating-object cases and table/frame/header/footer/footnote controls
to prove their existing semantics remain unchanged. Compare actual paragraph
line ranges and PDF word geometry with independent Word references, not just
total page count. Existing public pagination and broader QUnit baseline
equivalence remain required before integrating an engine change.

### Candidate qualification (0.6, pending review)

The candidate reuses GetDocumentContentForRecalcInfo to obtain the body flow
owner and its shared RecalcInfo. It applies this owner consistently to widow
requests, last-line backtracking and replay. GetPrevDocumentElement reaches
a preceding body element even when the paragraph is the first child inside
nested SDTs. DocumentContent and BlockLevel propagate the new previous-page
result and its column/page flags; enabling the paragraph guards alone would
lose that rollback request. Existing non-body owners are excluded.

The original synthetic [widow probes](../tools/fidelity/widow_controls.py)
cover 60 actual Linux native cases: omitted, inherited, explicit true/false;
three-line two-plus-one and one-plus-two boundaries, four-line two-plus-two;
direct body, single and nested SDTs. The integrated baseline fails 18 parity
checks; the compiled candidate passes all 60, with stable repeated recalculation.
Four save/fresh-reopen cases preserve target text, pagination and wrapper
structure. These are metamorphic engine tests, not 60 independent Word references.
[Scope controls](../tools/fidelity/widow_scopes.py) include internal predecessors,
keep-lines, keep-next, manual breaks, columns, floating tables, frames, cells,
headers, footers, footnotes and text boxes. Use canonical DrawingML namespace
prefixes in the text-box fixture: the conversion runtime used here discards the
noncanonical-prefix probe. Do not count a missing imported object as a passing
pagination control. All 24 final controls pass the matched comparison:
body SDTs match direct-body layout, while excluded contexts retain the baseline.
The broader source QUnit run matches all 69 modules and all 78,564 assertions:
both arms have 61 passing modules, eight failing modules and five existing
source-defined disabled modules. This is baseline equivalence, not an all-green
upstream suite.

On the same public 14-page DOCX and independent Word-web PDF, the declaration
starts on page 7 after the change, matching Word (baseline: page 6). The corrected
harness matches 419/419 unique tokens in both arms; page agreement improves
392/419 to 403/419 (93.56% to 96.18%), with no detected wrap divergence.
All 3,942 regex-normalized words and their multiplicities remain unchanged.
Fonts remain bundled Liberation Sans/Elixir Symbols; computer fonts are declined.
Visual inspection of pages 1 and 7 confirms the corrected boundary and declaration.
A residual unique-token divergence remains: “flagged” is on page 3 rather than
Word's page 4. This is not a global fidelity pass or a reason to extend body rules
to table cells. The earlier 40/419 match count was a tokenizer coverage defect.

## Missing fonts and metric compatibility

Word also substitutes missing fonts. The result depends on the available fonts,
platform, metadata, name matching and substitution settings. The requested family
alone does not identify the face used. Microsoft documents
[cross-platform font-name substitution issues](https://support.microsoft.com/en-us/support/known-issues/office-documents-are-not-rendering-as-expected).
Do not infer an installed font from an author's chosen name. Record availability;
Word PDF font identities and advances are stronger evidence than a dropdown.

The SDK map is common/libfont/map.js; document alternate names and family metadata
also matter. Desktop consent and desktop/font-resolver.js add a separate policy.
Inspect GetFontFileWeb, selected font information and the actual loaded face.

Record requested/selected family and style, source/file identity, units per em,
ascender, descender, line gap, synthesis and metrics actually used by the editor.
Measure advances on a public alphabet, and privately on document-weighted text
when authorized. Compare wrapping, line count and row height at unchanged widths.
Then compare PDF text geometry and screen painting.

Public pack metadata includes derived vertical metrics and historical candidate
width measurements. Those do not establish the original face/version used by a
particular Word reference. Near-matching average widths do not guarantee identical
line breaks.

Use original fonts only with appropriate rights. Personal/classroom availability
is not a redistribution, application or server license; the
[KG Fonts guidance](https://kimberlygeswein.com/faq/) distinguishes those uses.
Keep licensed originals out of packages and commits. If lawful original-font
measurements are unavailable, mark original-installed A/B tests and exact width
ratios unverified.

## Floating shapes and paint

For mc:AlternateContent, establish which supported Choice/Fallback is consumed;
avoid importing both. Inspect drawing count and text privately, extents, anchor
reference, signed position, wrapping, in-cell layout and z-order. Then inspect
gradient/theme fill and clipping. A negative paragraph-relative offset is not
grounds to discard a shape.

Core entry: BinaryDocumentTableWriter::WriteDrawingPptx in
OOXML/Binary/Document/BinWriter/BinaryWriterD.cpp. SDK anchor:
word/Editor/Paragraph/ParaDrawing.js. Microsoft's
[anchor reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.wordprocessing.anchor?view=openxml-2.8.0)
lists layoutInCell, distances, positioning, wrapping and overlap separately.

Prove screen and PDF output independently. Extracted text proves retention,
not visible glyphs, color or placement. Combine it with paint evidence in the
expected region. A correct PDF does not establish that the screen repainted.

## Generic proposals and acceptance gates

1. **Private-safe layout tracing.** Opt-in numeric diagnostics for absolute
   body/row page ranges, effective paragraph/end-mark metrics, floating anchors,
   resolved margins and actual font source. Gate: a synthetic case explains each
   row height; diagnostics omit text and identifying metadata by default.
2. **Word differential micro-corpus.** Original public fixtures for minimum-height
   nested tables near a boundary, floating signed offsets, trailing paragraphs
   and inherited spacing. Record Word version and actual fonts. Gate: page count,
   row boundaries and split decisions agree, with no existing-corpus regression.
   Fix only the first differing rule demonstrated by traces.
3. **Fallback calibration.** Compare licensed original faces and known Word
   substitutions with metric derivatives. Gate: eligible installed fonts retain
   priority; measured line breaks improve without changing exact-font documents
   or hosted inventory unexpectedly. Do not globally replace measured derivatives
   with a default sans family.
4. **Shape regression coverage.** Original synthetic WPS text box with theme
   gradient, negative paragraph offset, wrap-none and in-cell variants. Gate: one
   imported shape, retained text, expected bounds and visible screen/PDF paint
   before and after font loading/reflow.

These are proposals, not implemented fixes or Word-equivalence claims.

## Reproducible private experiments

Keep source and all derived DOCX, model dumps, profiles, logs, rasters and PDFs
inside the authorized private directory. Never upload private documents to font
sites, online converters or AI services. Commit only original generic fixtures
and conclusions.

Before trusting a one-factor variant, run a no-op parse/serialize control and
compare table/drawing/paragraph counts and pagination. Preserve namespace prefixes
referenced by mc:Requires and mc:Ignorable: renaming or dropping declarations can
make the importer skip content. Reject such a variant rather than reporting its
apparent page reduction as a layout improvement.

Without matched Word rendering and actual original-font inventory, precise font
versus layout percentage attribution is unverified. Keep sensitivity results
separate from causal estimates.

## Public floating-table micro-corpus

[The original probe guide](../tools/fidelity/FLOATING-TABLES.md) describes
22 deterministic, single-variable DOCX probes and Word-export discriminants.
Run the generator and measurement driver from the product root. All inputs are
new public text and geometry; no private source is needed.

Published positioning rules tie a floating table to the next regular paragraph.
Compare preceding- and following-paragraph changes before choosing an anchor
reservation fix. Ordinary float pagination, row cantSplit, whole-table
doNotBreakWrappedTables and inter-table overlap are distinct controls.

A public standards probe can expose ignored compatibility behavior without
establishing the cause of a different document's pagination. Word PDFs are
pending; do not treat current Linux page counts as confirmed Word expectations.

## Repeatable desktop differential diagnostics

Use the [public differential harness](../tools/fidelity/DIFFERENTIAL.md) to pair
immutable Office inputs with independently exported reference PDFs. Keep font
mode explicit: bundled-only and system-allowed answer different questions.
Check the PDF glyph faces and advances rather than assuming consent guarantees
a particular face was selected. Unique-token agreement must be read together
with coverage; repeated words and missing references cannot prove agreement.

The first page/wrap divergence supplies a location to investigate, not a source
paragraph identity or a causal percentage. Retain raw page-box deltas even when
the exploratory score tolerates decimal serialization noise. Keep partial runs
visibly pending and preserve the original failure before a corrected rerun.

PDF text may encode a space as a positioned gap instead of a space glyph.
The original diagnostic built token strings from LTChar only, dropping
pdfminer's inferred LTAnno whitespace. This concatenated words, sharply
reduced matched-token coverage and hid an earlier page divergence. Cross-check
the complete lines with an independent whitespace-aware extractor before
naming the first divergent paragraph. The corrected harness preserves inferred
separators in tokenization while
keeping glyph metrics tied only to actual glyphs. It does not invent advances
or treat repeated words as unique matches. Three original positioned-gap PDF
regressions fail before the correction and pass afterwards; all 19 tests pass.

## Held engine candidates, pending Word references

The explicit floating-table no-break compatibility flag is carried by core's
Flags2 bit 9. Its read/write/layout policy is integrated for 0.5 (SDK1267b480).
The default remains false; ordinary single-column floats still fragment
normally. The policy reuses the existing whole-table measurement/position
correction rather than making all floating tables indivisible. It does not
change the paragraph widow/orphan behavior described above.

A second, explicitly opt-in experiment uses the next regular paragraph's
before-spacing and page-break request for text-relative, single-column body
floats. A page-start group guard prevents applying that paragraph break twice.
The experimental value is transient, defaults false and is not serialized or
enabled by document input. SDT-contained anchors, complex frame/section cases
and broader multicolumn semantics need separate references before extending it.

The anchor experiment remains held; it is not an integrated fix or confirmation of Word behavior.
The public preceding/following-paragraph probes are falsifiable: reject or revise
the experiment if the Word PDF positions agree with the original engine instead.
Keep the documented compatibility-policy difference separate from anchor
hypotheses and from an unrelated document's root-cause attribution.

## Keep-with-next across body content controls

A main-body block SDT is transparent to the keep-with-next paragraph chain.
Resolve the main-body pagination owner consistently for request, reset and
replay, and traverse preceding body elements across wrappers. Keep explicit
page/section breaks, inline/page-count conditions and non-body owner guards.
A wrapper-wide entry hook can incorrectly override an explicit first-child
page break; reuse existing paragraph/table flow calls instead.

Tests must separate keep-next from widow control (heading widow=false), include
leading tables, nested/same/adjacent controls, empty controls and explicit
breaks, and compare actual incremental edits with full recalculation plus
Undo/save/reopen. See [the original probes](../tools/fidelity/KEEP-NEXT-CONTROLS.md).
The real public Word-web improvement still leaves table/repeated-phrase
pagination differences; unique-token agreement alone cannot certify fidelity.
