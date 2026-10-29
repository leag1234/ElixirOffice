# Original public floating-table probes

These documents are generated from scratch. No source document, private text,
image, font or original document measurement is an input. All marker text is
newly authored. The generator uses only Python's standard library.

Generate with Python 3:

    python3 tools/fidelity/floating_tables.py /absolute/output/corpus
    python3 tools/fidelity/test_floating_tables.py

The output has 22 DOCX files, manifest.json and SHA256SUMS. Timestamps, contents
and package permissions are fixed. The manifest records one changed parameter
relative to each parent. Two independent contexts are intentional: a tall
floating table with a nested cell, and a pair of short colliding tables.

All cases use A4 landscape, half-inch margins, compatibility mode 15, Arial
12 pt, fixed grids, zero vertical cell padding and explicit minimum row heights.
Arial should resolve to Arial in Word; the qualified Linux bundled-only run uses
Liberation Sans. Record the actual font used if Arial is unavailable in Word.

## First Word export batch

Export these ten first: f00-base, f02-spill, f08-anchor-after,
f12-small-end-mark, f14-cant-split, f15-no-break-wrapped,
f17-following-before, f18-following-break, o00-collision-never,
o01-collision-allowed. The remaining files refine the first differing rule.

Open each original in desktop Word, without modifying it. If Word reports a
repair, record that failure; do not silently accept a repaired reference.
Use Export or Save a Copy as PDF, all pages, normal document content.
Do not use a screenshot, browser print or an intermediate office converter.
Use the same basename, for example f00-base.pdf. Do not save changes to the
original DOCX. Return PDFs with Word version/build, OS, actual Arial availability
and whether Word displayed Compatibility Mode or any repair/normalization notice.
There are no comments, fields, external relationships or linked assets.

Record these discriminants, not only total pages:

- Page and vertical position of TABLE-A-ROW-1-CELL-1 and the final table row.
- Whether a row itself splits, or an intact row moves to another page.
- Page/position of ANCHOR, FOLLOW-01 and FOLLOW-02.
- Whether TABLE-A and TABLE-B overlap in the collision context.
- Any normalization of signed/zero offsets in the optional anchor cases.

Word results remain unverified until those PDFs exist. Linux observations are
not Word references, and no fixture is assigned a fabricated Word page count.

## Case matrix

| ID | Parent | Only variable | Decisive observation |
|---|---|---|---|
| f00-base | root | Main context | Baseline table/paragraph positions |
| f01-inline | f00 | Remove floating positioning | Inline versus floating text flow |
| f02-spill | f00 | Vertical offset 720 to 2160 twips | Whole-table versus row pagination |
| f03-zero-offset | f00 | Offset zero | Zero text-relative origin |
| f04-negative-offset | f00 | Offset -720 | Signed offset/Word normalization |
| f05-page-anchor | f00 | Vertical reference page | Page versus paragraph reference |
| f06-margin-anchor | f00 | Vertical reference margin | Margin versus paragraph reference |
| f07-text-horizontal | f00 | Horizontal reference text | Column versus margin reference |
| f08-anchor-after | f00 | Preceding paragraph after 160 twips | Reservation above the table |
| f09-anchor-line | f00 | Preceding paragraph line 259/240 | Line metric contribution above |
| f10-anchor-size | f00 | Preceding paragraph 2 pt | Anchor/end-mark metric contribution |
| f11-flat-cells | f00 | Flatten nested table, preserve text | Nested minimum-height composition |
| f12-small-end-mark | f00 | Required paragraph after nested table 2 pt | End-of-cell paragraph contribution |
| f13-omitted-height-rule | f00 | Omit outer row hRule | Omitted versus explicit atLeast |
| f14-cant-split | f02 | Row cantSplit true | Row-level policy, not table-wide policy |
| f15-no-break-wrapped | f02 | doNotBreakWrappedTables true | Floating-table compatibility policy |
| f16-explicit-break-allowed | f02 | Same flag explicitly false | Explicit false versus absent |
| f17-following-before | f00 | Next paragraph before 480 twips | Following-anchor space reservation |
| f18-following-break | f00 | Next paragraph pageBreakBefore | Does the float follow that paragraph? |
| f19-following-size | f00 | Next paragraph 36 pt | Following-anchor/end-mark metrics |
| o00-collision-never | independent root | Two short tables, same margin position | Non-overlap adjustment |
| o01-collision-allowed | o00 | Overlap allowed on both tables | Collision policy only |

The f08/f09/f10 labels call the preceding visible paragraph an anchor *probe*,
not an assertion that it is the correct normative anchor. Compare them with
f17/f18/f19, which alter the next regular paragraph.

## Published rules and unresolved Word behavior

The [table-position reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tablepositionproperties?view=openxml-3.0.1)
defines an out-of-flow table with a logical relationship to the next regular
paragraph. It does not by itself settle the iterative interaction between the
anchor line, exclusion region and overflow; the paired probes measure that.

[ECMA-376 Part 4](https://ecma-international.org/publications-and-standards/standards/ecma-376/),
14.8.3.10, and Microsoft's
[compatibility flag reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.donotbreakwrappedtables?view=openxml-3.0.1)
distinguish ordinary floating-table pagination from an enabled whole-table
no-break policy. This is independent of
[row-level cantSplit](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.cantsplit?view=openxml-3.0.1).
A floating table is therefore not universally an indivisible one-page object.

[Table overlap](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.tableoverlap?view=openxml-3.0.1)
governs collisions between floating tables. A never policy on either table
prevents their overlap; it is not a general row-height or page-break instruction.

[MS-OI29500 Word positioning notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/4175e818-958f-4b4f-b6f7-17003f1721b5)
describe defaults and cases where Word ignores positioning, plus its offset
encoding/range differences. The fixtures declare anchors explicitly. Record
current Word treatment of negative offsets rather than assuming the published
range note predicts every contemporary build.

Do not patch table anchors, minimum heights or paragraph spacing to force a
desired page count before comparing matched Word output. A standards mismatch
and a reproduced current-Word layout mismatch are separate findings.

## Linux measurement

Use an explicit packaged executable, an owned Xvfb binary and a Playwright module:

    EO_FIDELITY_XVFB=/absolute/path/Xvfb \
    EO_PLAYWRIGHT=/absolute/path/playwright \
    node tools/fidelity/measure-floating.cjs \
      /absolute/output/corpus /absolute/output/linux /absolute/package/elixiroffice

The driver verifies all input hashes, creates a separate profile per case, keeps
Computer fonts declined, checks actual font selection, exports a real Wasm PDF
and records numeric table fragments and following-paragraph bounds. It rejects
external requests and changed input files. It stops only its own app/display.
PDFs, selected screenshots and observations go under linux/results.
Word results are always labelled unverified separately.

## Held SDK candidate comparison

The measurement driver accepts EO_FIDELITY_NEXT_ANCHOR=1 only for the separate,
unmerged SDK candidate. It sets a transient experimental document-setting value,
recalculates and labels each receipt with anchorExperiment=true. It does not
change the input files or serialize that experimental switch. Without the
environment variable, the candidate keeps its default anchor behavior.

The SDK draft separates explicit no-break compatibility support from speculative
next-paragraph anchoring. Compare both modes with the same original fixtures
and Word PDFs before accepting the anchor experiment. This is a test harness
option, not a shipped desktop setting.

Both modes also export converted DOCX copies of f02, f15 and f16. These receipts
check the real settings read/save path. They are written only in the measurement
output directory; generated source DOCX files remain hash-checked and unchanged.
