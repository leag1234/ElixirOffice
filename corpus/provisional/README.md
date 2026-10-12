# DOCX layout fidelity corpus – ElixirOffice

> **PROVISIONAL CORPUS**: a synthetic and open-licence corpus used to bootstrap the measurement chain.
> These 30 files only serve to bootstrap the measurement chain (Word for the web rendering → PDF
> against ElixirOffice server rendering → PDF, page-by-page comparison). They do not replace a corpus
> of real user documents.

## Contents

| Folder       | Category                                | Files    | Public  | Generated |
|--------------|-----------------------------------------|---------:|--------:|--------:|
| `teachers/`  | teacher worksheets (primary and secondary school) | 10       | 2       | 8       |
| `smallorg/`  | small businesses / associations         | 10       | 0       | 10      |
| `admin/`     | administrative documents                | 10       | 4       | 6       |
| **Total**    |                                         | **30**   | **6**   | **24**  |

- `manifest.csv`: one row per file — `id, file, category, origin (public|generated), source_url,
  license, retrieved, pages_estimate, features, notes` (the `notes` column contains the sha256 fingerprint of the
  delivered file).
- `generator/`: scripts that regenerate the corpus identically (see below).
- `generator/assets/`: PNG/JPEG images drawn by `images.py` (geometric shapes, no
  external image).

`pages_estimate`: for generated files, an estimate (checked with LibreOffice 24.8); for
public files, the `<Pages>` value computed by Word and recorded in `docProps/app.xml`.

## Origin and licenses

### Public documents (6)

All come from datasets published **by the producing organization itself** (organization
account) on data.gouv.fr, the open platform for public data; files served by
`static.data.gouv.fr`. Retrieved on **2026-10-05**.

| id  | Producer | License | Dataset |
|-----|-----------|---------|----------------|
| t09 | Ville des Lilas | Licence Ouverte v1.0 (fr-lo) | https://www.data.gouv.fr/datasets/deliberations-2016 |
| t10 | Ministères de l’Éducation nationale (DGESCO) | Licence Ouverte v1.0 (fr-lo) | https://www.data.gouv.fr/datasets/programmes-denseignement-de-terminale-generale-reforme-du-baccalaureat-2021 |
| a07 | Ville des Lilas | Licence Ouverte v2.0 (lov2) | https://www.data.gouv.fr/datasets/reglement-vehicules |
| a08 | Mairie de Noé | Licence Ouverte v1.0 (fr-lo) | https://www.data.gouv.fr/datasets/debat-dorientation-budgetaire-2016 |
| a09 | Ministère du Travail (DGT) | Licence Ouverte v2.0 (lov2) | https://www.data.gouv.fr/datasets/referentiel-des-unites-de-controle-de-linspection-du-travail |
| a10 | Ministère de l’Europe et des Affaires étrangères | Licence Ouverte v1.0 (fr-lo) | https://www.data.gouv.fr/datasets/programme-vacances-travail-pvt |

The exact URL of each file and the sha256 fingerprint of the original are in `manifest.csv` and
`generator/public_sources.py`.

**Only modification made**: the `dc:creator` and `cp:lastModifiedBy` fields of
`docProps/core.xml` (names of public officials) were emptied. The content of the other parts of the package is
copied identically (the zip is recompressed). Attribution required by the Licence Ouverte: "Source:
<producer> – data.gouv.fr – <dataset update date>" (the French "Source : …" wording is the licence's own).

Candidates rejected during selection (personal data in the content): a filled-in
accreditation form (name of an official), an Etalab summary on housing (names of participants),
a Ministry of the Interior documentation (list of names), a regional documentation (name of the
author in the document). The other candidates were rejected for redundancy.

### Generated documents (24)

Produced by `generator/` for this project; **entirely fictitious** content (municipality
"Valmont-sur-Ourse", association "Les Jardins partagés du Moulin", etc.). Phone numbers in the range
01 99 00 xx xx, emails and sites under `example.org` / `.example`, fake SIRET/RCS/RNA identifiers
(999…). License given in the manifest: CC0-1.0 (to be confirmed by the project). The names and
layouts of the public documents were not reused.

## Regenerating the corpus

Prerequisites (tested on Ubuntu 20.04, Python 3.8):

```sh
pip3 install --user python-docx==1.1.2 Pillow==10.4.0 lxml==6.1.3
cd generator
python3 fetch_public.py        # downloads the 6 public files, verifies their sha256, empties the metadata
python3 build.py               # draws the images, generates the 24 .docx, validates everything, writes ../manifest.csv
python3 build.py --only t01,s07   # regenerate only some files (the manifest is not rewritten)
```

Generation is **deterministic**: no current date nor uninitialized randomness, fixed zip
timestamps. Two successive runs produce byte-for-byte identical files (verified);
the result may vary if the Pillow/zlib/lxml/python-docx versions change. If a public file
was modified at the source, `fetch_public.py` reports it (different fingerprint) and does not write it.

Code organization:

- `ooxml.py` — WordprocessingML mini-library: python-docx serves as the "package" layer (parts,
  relationships, images, content types); the XML (document, styles with French identifiers `Titre1`,
  `En-tte`, `Lgende`…, numbering, settings, notes, comments, charts + embedded workbook,
  font table with panose) is written directly.
- `teachers.py`, `smallorg.py`, `admin.py` — one function per document.
- `images.py` — drawn illustrations (Pillow, no rendered text).
- `validate.py` — structural validation (see below).
- `public_sources.py`, `fetch_public.py` — public documents.

## Validation performed

- `validate.py` on the 30 files: valid zip (CRC), well-formed XML for each part, content
  types, relationship targets and `r:id`, uniqueness of `wp:docPr`, **element order according to the
  ECMA-376 schema** (`pPr`, `rPr`, `sectPr`, `tblPr`, `tcPr`, `settings`, `wp:anchor` — Word rejects
  badly ordered files), referenced styles/numberings/notes/comments exist, paired bookmarks,
  balanced complex fields, cells ending with a paragraph, declared `mc:Ignorable` prefixes.
  Result: 29 files without errors; **a07** (public) reports 4 duplicate `docPr` as produced
  by Word — kept on purpose.
- Opening with python-docx: 30/30.
- PDF conversion by LibreOffice 24.8 (`soffice --headless --convert-to pdf`, on a macOS machine, LibreOffice
  not being installed on <build-host>): 30/30 converted; visual check of the renderings of the generated files.
- **Not verified: opening in Microsoft Word.** To be done at the first Word for the web pass.

## Features exercised

**Layout / sections**: A4 portrait, A3 (poster), landscape; multiple sections (next page,
continuous) alternating orientation, margins and number of columns; 2 and 3 equal columns with a
separator line, unequal-width columns, column break; mirrored margins + gutter; vertical
page alignment (centered); page borders (single, double, thick-thin, **artistic** "pencils");
line numbering; page numbering in Roman numerals then restart.

**Headers / footers**: default, different first page, even/odd, different per section (landscape
width), tables and images in the header, VML watermarks (WordArt), full-page image behind the
text in the header (Seyès), PAGE, NUMPAGES, STYLEREF fields (fldChar and fldSimple).

**Text**: substitution fonts (Cursive standard, Belle Allure CM, Andika, OpenDyslexic, Marianne,
Aptos/Aptos Display, Century Gothic, Segoe UI Symbol, Arial Black, Impact, Georgia, Verdana, Comic Sans
MS, Trebuchet MS, Book Antiqua, Roboto…), Office 2007/2013/2023 themes; w14 WordArt effects (outline,
gradient, shadow); small caps, caps, character spacing, highlighting, hidden text,
superscripts; Wingdings/Symbol symbols (checkboxes, smileys, scissors, bullets); drop cap; automatic hyphenation;
exact/multiple line spacing; left/right/**decimal** tabs (comma separator) with
leaders, underlined, clearing of style tab stops; nonbreaking spaces; OMML (inline fractions).

**Lists**: numbered, bulleted (Symbol, Wingdings, color), multilevel, hierarchical linked to
heading styles (1. / 1.1. / 1.1.1.), administrative outline I. / A. / 1., custom format
"Exercice %1 :" and "Article %1 –", restart (lvlOverride), numbering in cells.

**Tables**: borderless layout tables, table styles with conditional formatting (Grid 4,
List 2), horizontal and vertical merges, vertical text (btLr), repeated header rows (1 and 2
rows), rows that cannot break, exact heights, cell margins, specific cell borders,
nested tables, floating table (tblpPr), long tables over several pages.

**Objects**: inline and floating images (square, tight with polygon, top/bottom, none, behind, in front,
single side), cropping (srcRect), ellipse/rounded-corner geometry, outline, rotation; wps shapes
(rectangle, rounded corners, ellipse, star, sun, ribbon, explosion, callouts, arrow), text boxes
with VML fallback (mc:AlternateContent), images in text boxes, arrow connectors, shape
group (wpg), shadows, gradients; `framePr` frames (recipient block); native charts (clustered and stacked
column, pie, line) with embedded workbook; EMF/real charts (public documents).

**Fields / cross-references**: precomputed multi-level TOC and table of figures (links + PAGEREF), SEQ,
REF (including `\r`), PAGEREF, STYLEREF, http/mailto/internal hyperlinks, bookmarks.

**Notes / review**: footnotes, endnotes; tracked changes (insertion,
deletion, formatting, paragraph property, paragraph mark, **move**, inserted table
row) in **a01** and **a04**; comments with replies and a resolved comment (a01, a04,
s02).

**Forms**: content controls (text, multiline, date, dropdown, combo box,
w14 checkbox, rich block), legacy form fields (FORMTEXT, FORMCHECKBOX, FORMDROPDOWN),
declared "forms" protection.

**Compatibility**: Word 2007 (12, a04), 2010 (14, s02 + public documents), 2013+ (15) modes.

## Known gaps (not covered)

SmartArt; embedded OLE objects (displayed Excel workbook, Visio, Equation 3.0 equations); embedded
fonts; bidirectional text (Arabic/Hebrew) and CJK, Asian vertical layout; mail merge
fields, INDEX/XE, citations and bibliography, DATE/IF/calculated fields; macros (.docm) and templates
(.dotx); glossary (building blocks) for placeholder text; linked (not
embedded) images and linked chart data; 3D/combo charts; OMML equations in
"display" mode (only inline mode is used); theme colors on shapes and text (colors
are RGB); vertical text in text boxes; standalone VML shapes (apart from watermarks and
fallbacks); sub-documents / altChunk; applied password protection; handwritten ink. The generated
documents are "clean": they do not reproduce all the dross of real documents
(duplicate styles, rsid, massive direct formatting, manual line breaks) — hence the importance of the
real corpus to come.

## Tips for the comparison

- Do **not update the fields** (TOC, PAGEREF, REF, STYLEREF) before export: their results are
  precomputed and must be compared as is.
- a01 and a04 have change tracking active: set the same display mode for revisions and
  comments on both sides (e.g. "No Markup" / final version, or "All Markup").
- School fonts and Marianne/Aptos are deliberately absent from standard machines: note the
  substitution font actually used by each engine.
- First gaps observed with LibreOffice (indicative, to confirm against Word): cropped photo
  anchored in a column (s04) not displayed, zero-height connectors (t02) invisible, text of the
  "ribbon"/"explosion" shapes cramped.
