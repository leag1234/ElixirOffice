# Images: stable placement of several images

Session of 2026-10-05/06. Branches: `elixir/images` in sdkjs and web-apps (worktree `wt/images`), `feat/images` in this repository. Measurement instance: `eo-images` on development host (port 32776). Nothing is pushed.

## 1. The problem

Feedback from a teacher, the reason she rejected LibreOffice and OnlyOffice: "one image is fine, as soon as you add several the whole layout falls apart". Goal: insert, move and resize several images in the text editor with the same predictability as Word, and **measure** it.

## 2. What Word does (references)

| Word behavior | Source |
|---|---|
| An inserted or pasted image is **In Line with Text** by default (File > Options > Advanced > "Insert/paste pictures as") | [Change default text wrap setting for images](https://support.microsoft.com/office/change-default-text-wrap-setting-for-images-3f9f0e39-9114-4138-90f9-5c3e528862bb) |
| **Layout Options** button next to the selected image: In Line with Text; With Text Wrapping (Square, Tight, Through, Top and Bottom, Behind Text, In Front of Text); "Move with text" / "Fix position on page"; "See more…" | [Layout options](https://support.microsoft.com/office/layout-options-a0f53857-b501-46c6-ba8b-68ba51e0e3cc), [Wrap text around a picture in Word](https://support.microsoft.com/topic/d764f846-3698-4374-baa5-2e869d1f4913) |
| "Move with text": the image follows its paragraph; "Fix position on page": it no longer moves when text is added above it | [Layout options](https://support.microsoft.com/office/layout-options-a0f53857-b501-46c6-ba8b-68ba51e0e3cc), [Wrap text and move pictures in Word](https://support.microsoft.com/word/wrap-text-and-move-pictures-in-word) |
| The **anchor** is displayed in the margin, to the left of the paragraph the floating image is attached to; it moves to the paragraph under the image when it is moved, unless "Lock anchor" is checked | [Shape.Anchor (Word VBA)](https://learn.microsoft.com/en-us/office/vba/api/word.shape.anchor), [Layout options](https://support.microsoft.com/office/layout-options-a0f53857-b501-46c6-ba8b-68ba51e0e3cc) |
| Green alignment guides during the move (margins, page center, paragraphs, other objects) | Word's "Use alignment guides" option; described in the pages above |
| An image that overflows into the bottom margin takes its anchor paragraph to the next page (Word 2013+ mode) | [Why Do My Pictures Keep Moving to the Next Page](https://smallbusiness.chron.com/pictures-keep-moving-next-microsoft-word-27117.html), LibreOffice DOCX compatibility bugs (tdf#135570, tdf#149241); rule already reproduced by sdkjs |

## 3. The stability metric

Harness: `tests/images/` (Playwright on the instance, the editor is driven like a user: file picker, clipboard, real file drag and drop through CDP, mouse on the canvas). After each action, `probe.js` reads the recomputed layout: number of pages, position (page, top, bottom, left, right) of each paragraph, including in cells, and of each image (page, x, y, size, wrapping, anchor, reference frames).

`metric.mjs` compares the layout before and after **one** action:

- **paragraphs concerned**: the one that contains or anchors the manipulated image (before and after), the one where we type, and all those whose lines cross the wrapping rectangle of a floating image (before or after): they are allowed to reflow, as in Word;
- **U (mm)**: for each other paragraph, the variation of the gap with the element that precedes it (previous paragraph of the body or of the cell, bottom of the previous table row) as long as both stay on their page, plus its height variation (reflowed lines) and, in a table, the horizontal shift of its cell. What is explained by pagination (a paragraph pushed to the next page) is not counted: Word does the same cascade;
- **J**: unexplained page jumps (paragraph that changes page without anything having grown before it, image that does not arrive on the page where its anchor takes it);
- **M**: other floating images that move by more than 0.5 mm beyond what their anchor explains ("move with text": like the start of their paragraph; "fixed position": not at all);
- **O**: new overlaps between images that push text away;
- checks of `run.mjs`: **F** created or modified images that overflow the paragraph, the cell or the page; **self** displacement of an image whose wrapping alone is changed (Word leaves it in place); **D** gap between where the image is dropped (the ghost at button release, snapping included) and where it lands, or displacement of the fixed corner during a resize. Word's rules do not count (image that overflows at the bottom: paragraph on the next page; image kept within the page width).

**Cost S = U + 50·J + 20·M + 20·O + 20·F + self + D**; 0 = only what Word's model imposes has moved.

## 4. Scenarios (2-page worksheet: title, instruction, 6 numbered exercises, 4×4 table)

`tests/images/make_fixtures.py` generates the worksheet (Word 2013+ mode, and a copy in Word 2010 compatibility mode) and six images (camera photo 4000×3000, portrait scan, small photo, transparent PNG clipart, icon, banner).

| Scenario | Actions |
|---|---|
| insert-1/2/4/8 | 1, 2, 4, 8 images inserted (Insert > Picture > From file) at the end of different exercises |
| wrap-cycle | an image goes through Square, Tight, Top and Bottom, Behind, In Front, Square, In Line, another image next to it |
| drag-float | 4 small images in Square moved (small and large moves, one onto another, downwards) |
| drag-cross-page | image moved to the next page, then brought back |
| drag-down-page | Square, Top and Bottom, In Front: moved 60 mm down, then into the bottom margin |
| drag-over-table | image in Square dropped on the table, then taken out |
| type-before | 4 floating images "move with text", we type 3 lines then 3 Enter above |
| type-before-fixed | 3 images "fixed position on page", we type above |
| resize | corner handles, opposite corner and side |
| paste | photo and clipart pasted (Ctrl+V of an image file) |
| table-cell | photo and scan inserted in cells, banner dragged from the desktop onto a cell |
| worksheet-8 (+ compat14) | complete session: 8 images, 4 set to Square, reduced to 45 mm, 3 moved, a sentence added above; same thing on the worksheet in Word 2010 mode |

Command: `EO_BASE=http://localhost:32776 node tests/images/run.mjs --out tests/images/results/after.json`. Functional non-regression tests: `tests/images/layout-options.mjs` (31 checks) and `tests/images/drag-resize.mjs` (15 checks).

## 5. Results

Before = `elixir/dev` (sdkjs d286b4f314, web-apps 6f7e08fd68); after = `elixir/images`. Same instance, same suite (`tests/images/results/before.json`, `after.json`).

| Scenario | S before | S after | Detail before → after |
|---|---:|---:|---|
| insert-1 | 20 | **0** | 1 image that overflows the right margin (numbered exercise, indent) → 0 |
| insert-2 | 20 | **0** | F 1 → 0 |
| insert-4 | 60 | **0** | F 3 → 0 |
| insert-8 | 80 | **0** | F 4 → 0 |
| wrap-cycle | 27.7 | **8.5** | F 1 → 0; residual U 8.5 mm (title "Table to complete" at the top of the page) |
| drag-float | 40 | 76.2 | O 2 → 0, but M 1 and U 56: the image dropped on another pushes the table away (chaotic scenario, 76 to 98 depending on the passes) |
| drag-cross-page | 115.8 | **8.8** | D 114 → 7 mm |
| drag-down-page | 197.6 | **25.8** | D 82 → 0; U 116 → 6 |
| drag-over-table | 54.4 | 54.4 | unchanged: D 18.7 mm (image anchored in the cell, kept in the cell) |
| type-before | 0 | 0 | the images follow their paragraph, as in Word |
| type-before-fixed | 0 | 0 | fixed images do not move |
| resize | 7.9 | 7.9 | opposite corner shifted by 4.9 mm when the image exceeds the page edge (kept within the page) |
| paste | 40 | **0** | F 2 → 0 |
| table-cell | **1,441.8** | **0** | U 1,382 mm → 0: the photo widened the column to the full width, the table and what followed jumped |
| worksheet-8 | 176.7 | **63.5** | J 1 → 0, F 3 → 0; U 43.5 (table shifted by an image dropped next to it) |
| worksheet-8-compat14 | 675.7 | **20** | self 247 → 0 (scan that jumped a page when going to Square), D 60 → 0, U 269 → 0 |
| **Total** | **2,957.6** | **265.1** | **−91%** |

Screenshots (`docs/screenshots/images/`): `before-table-cell.png` / `after-table-cell.png`, `before-insert-4.png` / `after-insert-4.png`, `before-worksheet-8.png` / `after-worksheet-8.png`, `layout-options-en.png`, `layout-options-fr.png`, `drag-guides.png`.

### Fidelity (`tools/fidelity` harness, build-host, Word-for-web references, provisional corpus)

Measurement image: `ghcr.io/euro-office/documentserver:latest` + built sdkjs (before: `elixir/dev`, after: `elixir/images`), own container and network (`eo-fidelity-images`, port 8097) so as not to disturb the fonts work.

| | A mean SSIM | B % pages ≥ 0.98 | C penalties | Different pages |
|---|---:|---:|---:|---:|
| Before | 0.74328 | 1.32% | 55.85 | 7/30 |
| After | 0.74328 | 1.32% | 55.85 | 7/30 |

Non-regression check: PASS (no document out of tolerance). Expected: no fix touches the layout of an open document, only the gestures (insertion, move, resize) and the interface.

Real corpus (private, on build-host, 4 documents, Word desktop references): before and after identical (SSIM 0.63865, C 18.19). See §7.

## 6. Causes found and fixes

| # | Cause | Fix | Commit |
|---|---|---|---|
| 1 | An inserted, pasted or dropped image was reduced to the width of the **section column**, without taking into account the paragraph's or table cell's indents, and its height was never limited: overflow into the margin on a numbered exercise, table column widened to the whole page (the table and what follows jump). | `CDocument.GetInlineObjectMaxSize` / `FitInlineObjectSize`: space available at the insertion point (column, cell, header, minus the indents; column or cell height), used by Insert > Picture, URL, drag and drop, multiple insertion and paste. | sdkjs `5bb10b560a` [upstreamable] |
| 2 | An image moved with wrapping was positioned relative to its new paragraph **according to the layout from before the move**; by leaving its old place and pushing text away at the new one, it made that paragraph move and landed up to 100 mm further (same effect, weaker, on the fixed corner of a resize). | After the drop (or resize) and its recomputation, the remaining gap is carried over to the object's offset and the recomputed page (3 rounds at most, a useless round is cancelled), in the same undo point. | sdkjs `8a146045d5` [upstreamable] |
| 3 | No Layout Options button nor visible anchor; the interface did not know the geometry of the selected object. | API `asc_GetSelectedDrawingLayout` + `ParaDrawing.GetWrappingStyle`; web-apps module `elixir-images`: button to the right of the top corner, Word's pane (icons drawn Word-style), "Move with text" / "Fix position on page" without moving the image, "See more…" (Layout box, Position tab), anchor in the margin (padlock if locked), hidden during drag, Esc, arrows. 12 languages. | sdkjs `554fd4c654` [upstreamable], web-apps `1aff0cc9d1` |
| 4 | "Lock anchor" read, saved and respected on move, but neither displayed nor editable. | `asc_CImgProperty.LockAnchor`; "Lock anchor" checkbox in the Position tab of the Layout box. | sdkjs `bcbbbff84d`, web-apps `9a4e9994e6` [upstreamable] |
| 5 | Gray dotted snapping guides across the whole view, no snapping to paragraphs. | Solid green guides limited to the page, like Word; snapping to the top of the first line of the page's paragraphs (in addition to margins, center and other objects). | sdkjs `31fc020183` [upstreamable] |
| 6 | Proportions: a photo (locked proportions) keeps its proportions at the corners, with or without Shift. | None: this is Word's behavior (the lock is changed in the Layout box). The "Shift releases proportions" fix (sdkjs `dc5b16c691`) was reverted at integration, product decision: Word prevails. | sdkjs `dc5b16c691`, reverted |

Already conforming to Word in the upstream code (verified by measurement, nothing to change): image inserted **In Line with Text** by default; switching from In Line to a wrapping without moving the image (ribbon menus); "move with text" when typing above; anchor moved to the paragraph under the top of the image; Word 2013+ rule of the paragraph taken to the next page; images always "laid out in the cell" in Word 2013+ mode; no recomputation loop (no action exceeds 3.5 s, typing included).

## 7. Real corpus (aggregated, nothing copied off build-host)

Analysis of the 4 real worksheets in .docx: 165 inline images, 456 floating objects, of which **433 "in front of text"** (no wrapping) and 35 behind, 16 "through", 7 square; 413 positioned relative to the paragraph, 42 relative to the page; **199 images in table cells**; 422 VML shapes; 3 documents in Word 2013+ mode, 1 without mode (Word 2007). Reading: teachers mostly place "in front of text" images anchored to paragraphs and many images in tables. Hence the importance of fitting to the cell (fix 1) and of "in front of text" having no effect on the text (already right). Fidelity on these 4 documents (Word desktop references): before SSIM 0.63865, C 18.19, 2 documents with a different page count; after: identical (gaps due to fonts, separate work item).

## 8. Remaining gaps

- **Live layout during the drag** (Word 365 reflows the text during the move): we display the image's ghost and the guides, the text reflows at the drop.
- Image dropped **on a table**: anchored in the cell, it stays in the cell (D 18.7 mm); Word's behavior not verified.
- Floating objects **kept within the page width** (resize beyond the edge: opposite corner shifted); Word lets an object go beyond the page edge.
- A table next to a Square image shifts or shrinks (worksheet-8, drag-float); to compare with Word on a reference.
- Image anchored to a paragraph placed **above** it (negative offset): its position depends on the recomputation order (drag-float, M 1).
- Word 2010 mode (compatibility 14): the "column" starting point takes into account the objects of the first line (sdkjs's emulation of Word 2010); an image can shift horizontally when another moves (M 1 in worksheet-8-compat14). This is Word 2010's behavior, not fixed.
- Paragraph taken to the next page when an image overflows into the bottom margin: Word's rule reproduced, but surprising; the AI layer's "Why?" button will be able to explain it.
- No anchor that can be moved with the mouse (the image is moved); no live preview on hover of the pane's choices.
- Word references: the rules come from Microsoft documentation; no scenario was replayed in Word itself (to do with the test user on 2 or 3 scenarios: drop on a table, image that exceeds the page, image above its paragraph).
