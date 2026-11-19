# OpenDocument support: what is kept, changed, lost

ElixirOffice opens and saves `.odt`, `.ods` and `.odp`, but it does not edit them natively. When you open one, the
file is converted into the editor's own model; when you save, the model is converted back. Anything the model or the
converter does not carry is simplified or dropped on the next Save. This page lists what we measured, so you can decide
when an OpenDocument file is safe to edit here and when to keep a copy.

The numbers come from the `odf-roundtrip` gate ([how to run it](../tools/fidelity/ODF-ROUNDTRIP.md)): 41 generated test
documents (one feature group each) plus 74 real-world text documents converted to `.odt`, each opened in the desktop
app, edited by one character and saved. It is repeated for every release.

## Before you save an OpenDocument file

* **Keep the original** when the file matters and uses anything under "Lost" or "Changed" below. *Save As* a new file
  (or export a copy) is always safe; the original is never touched by Save As.
* **Embedded objects are protected.** If a Save would lose a formula, a chart or another embedded object, the desktop app
  does not overwrite your file: it asks whether to save a copy instead. In the whole test set the guard never had to step
  in, because formulas and charts are kept.
* **Word, Excel and PowerPoint files are different.** `.docx`, `.xlsx` and `.pptx` are the formats the editor works in;
  this page is only about OpenDocument.

## Writer (.odt)

**Kept**: text and its formatting (fonts, bold, italic, underline, colours, size, super/subscript, small caps, spacing);
paragraph formatting (alignment, indents, spacing, borders, shading, tab stops); bulleted, numbered and outline lists;
tables with merged cells, borders, shading, repeated header rows and nested tables; pictures (inline and anchored); text
boxes and basic shapes; footnotes and endnotes; tables of contents; bookmarks and links; tracked insertions and
deletions; comments (author, date, text, the commented range and comment points; replies stay as separate comments);
equations and charts (as objects); page size; page numbers, page count and time fields; text sections with columns;
hidden text; text input fields.

**Changed**: heading levels (in 0.9.2 and earlier every save moved a heading one level down, fixed, see below); a heading that
is part of an outline numbering becomes a numbered list item with the same look; several page styles and their headers
and footers are merged when the pages follow each other without a page break (a landscape page between portrait pages
that have their own headers and footers is one of the cases; see below); the date of a comment is saved in UTC;
table-of-contents entries become links;
style names are regenerated (your named styles are kept); form controls are only partly kept (5 controls became 2 in the
test document).

**Lost**: text sections with a single column (the text is kept, the section itself is not); drop caps; fields that are computed by the document, which become plain text: date, title,
author, file name, word count, variables and user fields, caption numbers (Figure 1) and cross-references to them; drop-down
list content controls; reference marks; the "format changed" kind of tracked change; the author name of the document
(the title is kept); the background and border of a page style are rewritten.

## Calc (.ods)

**Kept**: sheets and their names, cell values and formulas (including formulas across sheets, named ranges and array
formulas), merged cells, hidden rows, columns and sheets, protected sheets, cell comments, data validation with its
messages, conditional formatting (colour rules, colour scales, data bars), charts, pivot tables, auto filter, frozen
panes, row heights.

**Changed**: column widths use the editor's default width instead of LibreOffice's (columns without a set width get
narrower); custom number formats such as day names and the AM/PM time format are rewritten and can display differently;
cell values are stored with more digits (0.2 is written 0.20000000000000001, the same number); built-in cell styles that
no cell uses are not written.

**Lost**: sheet tab colours; pictures and shapes placed over cells are re-created as text boxes or dropped.

## Impress (.odp)

**Kept**: slides, master pages, text, speaker notes, tables, pictures, charts, most shapes.

**Changed**: bullets (a multi-level bullet list is flattened when the layout placeholder is rebuilt); placeholders of
the master pages are rewritten; gradient, dash and arrow definitions are rewritten; animations are partly rewritten
(15 steps became 9 in the test deck).

**Lost**: slide transitions (fade, wipe, automatic advance); custom shows; some grouped shapes are ungrouped.

## What was fixed for 1.0

Three losses were fixed in the converter (core branch `eo/odf-fix-core`, runtime rebuild needed, about 20 minutes on a
16-core machine with a warm cache):

* Manual line breaks (Shift+Enter) were removed when an `.odt` was saved; they are kept now.
* Headings opened one level too deep and moved one more level on every save (Heading 1 became 2, then 3); the level is now
  read correctly.
* Links that LibreOffice opens in a new window lost their first character (`https://` became `#ttps://`) and no longer
  worked; they are kept.

In the test set, headings with a preserved level went from 0 of 36 to 24 of 36 documents, links with a preserved
address from 9 to 11 of 14 and unchanged text from 94 to 97 of 111; no document got worse.

Two more losses were fixed afterwards (core branches `eo/odf-comments` and `eo/odf-pagestyles`):

* **Comments in a Writer file were dropped on save.** The reader wrote the range markers of a comment inside a text run,
  where the editor ignores them; the editor then kept the comment as a comment of the whole document, which the ODT writer
  did not carry. Markers are now written between runs, a comment without a range gets an empty range at its position, and
  comments of the whole document (a comment typed without a selection) are saved at the start of the document. In the
  test set the comments kept went from 1 of 3 to 3 of 3 documents (author, date, text, range).
* **A page that switched page style, and text sections with columns, collapsed.** Every section break was written as a
  continuous one, so a landscape page (or a different first page) ran on the previous page, and the section break of every
  text section after the first one was suppressed, so columns were lost. A paragraph that switches the page style now opens
  a next-page section (this keeps the case of bug 76397, a text section is not a page style change); a text section with columns
  is a continuous section with its columns (unequal widths included). When the file is saved again, a continuous section
  with the page size and margins of the previous one no longer gets a page style, and so no extra page, of its own. The
  documents with a lost column count went from 10 to 7 and with kept sections from 5 to 7. What is still open: when a
  document has a landscape page between portrait pages, each with its own header and footer, the ODT writer creates the
  page styles but does not give them to the paragraphs, so the pages run together on the next save (a three page test
  document became one page).

## Known open work

The losses above under "Lost" are tracked for later releases. The largest ones for real documents are computed fields,
slide transitions, the comments of a presentation (an `.odp` loses them on open) and text boxes that hold a table.
