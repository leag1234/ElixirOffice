# Held cell marker layout and fast-path transition candidate

Review branches only; not integrated. The integrated property-only preservation remains independent. Cell-widow scheduling is not implemented here.

## Exactly twelve Word-web references

D's qualified pairlist6bfa6acc, handoffa02492c9 and independent review00d84ae4 bind twelve original synthetic probes and raw Word-web PDFs. All original/PDF bytes were rehashed. A independently reproduced all36 Word label baselines from horizontal character matrices: pageHeight minus matrix f. Raw spaces/blank origins are retained. These are text origins, not glyph bounding-box tops or measured border heights.

| Case group | Word row2 baseline pt | Held/final candidate pt | Candidate minus Word pt |
| --- | ---: | ---: | ---: |
| Six no-empty controls and two true/empty1 controls | 58.05 | 57.79208 | -0.25792 |
| Empty1 omitted/false,10pt marker | 78.30 | 78.20144 | -0.09856 |
| Empty1 omitted/false,12pt marker | 80.80 | 80.68331 | -0.11669 |

The height pattern agrees: an extra empty paragraph increases the separation unless hideMark=true. Absolute coordinates are not exact; the residual cause is unmeasured. Word row1 is27.02pt, candidate approximately26.8827pt. No tolerance is invented to call this perfect parity. All twelve pairs were rendered and inspected at contact-sheet resolution: the three labels/two-row tables remain visible, without observed clipping.

The separate fast-path fix leaves every measured candidate label and blank origin exactly unchanged across a second twelve-PDF export. References are Word web, with its build not exposed; no Word-desktop or full-fidelity acceptance is claimed.

## Separate source commits

The held layout baseline is SDK32b4236b78 on integrated property model dc173b5fca:49 insertions/1 deletion in DocumentContent.js, identical marker-collapse logic to held patch526643c7.

The subsequent fast-path commit SDKc1380f14fd changes only Paragraph.Recalculate_FastWholeParagraph:10 added lines. It falls back to cell-content recalculation when the current paragraph is a semantic hidden marker or its parent-relative page records it as a previously collapsed marker. This covers printing-to-hidden and hidden-to-printing, including cell SDTs and later parent pages. Ordinary fixed-cell/body fast paths and existing header/autofit guards remain tested. The guard depends on the held layout predicate; it is separately reviewable, not an independent approval to ship the whole layout stack.

No cell owner, previous-page table protocol, history format, converter or runtime changes belong to this fix. The separate [cell-widow design](../../docs/hide-mark-layout-design.md) remains a decision document. The known public cell-widow/Declaration page-allocation gap is not resolved, so the full layout stack remains held.

## Qualification

- Tests first: original12 cases8pass/4fail, expanded14 cases8pass/6fail. Failures are the two real transitions across plain/SDT and later local pages.
- Final focused source suites112pass,0fail,0skip: fast guards, layout predicate, property/history, physical comparator and approved body owner tests.
- Actual compiled native matrix138pass, including18 edit/Undo/Redo/Undo/save/fresh-reopen cycles across all flags and both marker sizes.
- Exact portable committed tool also passes six empty-only controls and retains raw transition bottoms. Critical12pt true case: original19.0190252075mm, edited27.0945443454, Undo19.0190252075, Redo27.0945443454, second Undo19.0190252075.
- All138 original source hashes are unchanged. Initial common model fields match the earlier120-case geometry proof. The newer blockSdt observation is absent in that old schema; it is independently checked against the original fixture flag and only that metadata field is excluded from the historical projection. Live assertions remain unchanged.
- Frozen sandboxed Linux0.4build20 shell with exact Word overlays qualifies code; it is not a new installer or native Windows/macOS acceptance run. Shared bounded units use2CPU/4GiB/no swap. No integration is authorized.

Reproduce source units with explicit EO_SDKJS and tests/fidelity/hide-mark-fast.test.cjs plus hide-mark-layout.test.cjs. Generate original synthetic cases with tools/fidelity/hide_mark_controls.py. The actual editor runner is tools/fidelity/measure-hide-mark-layout.cjs CORPUS OUTPUT EXECUTABLE with explicit Xvfb/Playwright, task-owned temporary paths and EO_HIDE_INCREMENTAL=1 EO_HIDE_ROUNDTRIP=1.

Full receipts, exact qualification runners/source bindings, source/bundle hashes, original failed proof and paired PDF measurements are in /srv/elixiroffice/wt/hide-mark-word12-A-work. Original D references remain untouched.

## Frozen59 decision gate (release review reference 451)

The full layout/fast-path stack remains held: 57 compared plus two unchanged strict CJK failures in each arm; one pair regresses 419/419 to417/419 same-page words, despite lower weighted raster error. [Full verdict and per-pair evidence](../../docs/handoff/hide-mark-gate59.md). No integration or release claim.
