# Fonts: inventory, substitution, free pack

State as of 2026-10-05. Measurements: fidelity harness (`tools/fidelity/`, `docs/fidelity.md`) on the provisional
corpus (30 documents, Word for the web references) and on a private real corpus (teacher documents
rendered by Word desktop; only aggregates appear here). Pack: `branding/fonts/` (licenses:
`branding/fonts/LICENSES.md`).

## 1. In brief

- **Selection rule**, applied when the engine looks for a font (`sdkjs/common/libfont/map.js`,
  `GetSubstituteName`): actually installed font > metric clone (same widths, same line height)
  or the closest measured free font > the document's replacement name (`w:altName`) if it is
  installed or has an installed replacement > Word's rule for an unknown font (its default font,
  Calibri, hence Carlito if Calibri is absent) > the upstream's choice by similarity (panose, metrics). An installed font bearing the requested name always
  wins: on a Windows machine with Office, the real Microsoft fonts are used.
- **Symbols**: missing Wingdings, Wingdings 2/3, Webdings and Symbol no longer display as letters
  ("J K L" instead of smileys): each code is converted to its Unicode equivalent (Unicode 7.0 tables
  and Adobe) and drawn with "Elixir Symbols" (Noto glyphs, Wingdings vertical metrics).
- **Free pack** (OFL / AGPL with font exception): 9 derived and measured "Metric" families
  (Georgia, Century Gothic, Comic Sans MS, Arial Black, Aptos, Script École, KG Primary Penmanship 1 and 2,
  symbols), Selawik (Segoe UI), P052 (Book Antiqua / Palatino), and the school fonts Andika,
  OpenDyslexic, Comic Neue, and the 8 national-education Marelle fonts (§ 10, installed by default). Carlito, Caladea, Liberation (including Sans Narrow) and DejaVu were already in
  the upstream image.
- **Non-redistributable** (not shipped, replaced): Belle Allure, Cursive standard, Script École, KG
  Primary Penmanship, Marianne, all the Microsoft fonts. Marelle is not in this list any more: it is free (OFL) and shipped (§ 10). **Rejected for lack of an accepted license**:
  Luciole (CC BY 4.0, to be decided by the test user).

## 2. How the engine handles fonts

### Server and web editor

- At container startup (and through `documentserver-generate-allfonts.sh`), `allfontsgen`
  (`core/DesktopEditor/AllFontsGen`, `fontengine/ApplicationFontsWorker.cpp`) walks
  `/var/www/elixiroffice/documentserver/core-fonts`, `/var/www/elixiroffice/Data/custom-fonts` and the
  system fonts (`/usr/share/fonts`, option `--use-system=true`), then writes:
  `sdkjs/common/AllFonts.js` (list for the browser), `server/FileConverter/bin/AllFonts.js` and
  `font_selection.bin` (list with panose, Unicode ranges, metrics, for the substitution choice),
  `fonts/` (files served to the browser, by number) and the font list thumbnails.
- **By default the browser does not use the machine's fonts** (with the user's consent, Chrome/Edge over HTTPS
  can provide them to the editor: see `docs/localfonts.md`): it downloads from the server the files
  of the `AllFonts.js` list and measures/draws with them. The web editor and the PDF export (x2t, which runs the
  same sdkjs in doctrenderer) therefore see exactly the same set of fonts: the on-screen layout
  and the PDF agree, whatever the machine. When the user chose "Use my fonts", the screen follows the fonts of
  the machine and the (server-side) PDF keeps the server's: the two can then differ (limit documented in
  `docs/localfonts.md`).
- The choice of a missing font is made in sdkjs (`map.js`). Before this work: internal dictionary
  of known fonts (panose, ranges, metrics) then penalties (`GetPenalty`) against each installed
  font, with a small equivalence table (Arial ↔ Liberation Sans, Times New Roman ↔
  Liberation Serif, Cambria ↔ Caladea…); **no** Calibri → Carlito entry (Carlito came out by
  similarity), and a font unknown to the dictionary (Andika, Marianne, Cursive standard…) fell back to
  Liberation Sans ("swiss" class by default). The document's font table (`fontTable.xml`:
  `w:altName`, panose, family) **did not reach sdkjs** (the core code that read it is disabled,
  "selection moved to js", `core/OOXML/Binary/Document/DocWrapper/FontProcessor.cpp`): x2t now writes it
  into a binary `FontTable` table that sdkjs reads (replacement names).
- Adding fonts to the server: drop them into `/usr/share/fonts/truetype/<dir>` (what our
  image does) or `/var/www/elixiroffice/Data/custom-fonts`, then rerun `documentserver-generate-allfonts.sh`.

### Desktop

- The desktop editors run the same sdkjs, but the font list is generated **on the machine**
  from the installed fonts (`CApplicationFonts::GetSetupFontFiles`,
  `core/DesktopEditor/fontengine/ApplicationFonts.cpp`): Windows, font registry (system and,
  optionally, user); macOS, `/Library/Fonts` and `/System/Library/Fonts`; Linux,
  `/usr/share/fonts` (+ `CUSTOM_FONTS_PATH`). Local fonts are therefore read directly.
- The "real font first" rule guarantees that a Windows machine with Office uses Calibri, Cambria,
  Segoe UI, Wingdings… and not our clones.
- macOS: Office for Mac stores its fonts (Calibri, Cambria, Aptos…) **inside the application**
  (`Microsoft Word.app/Contents/Resources/DFonts`), a directory not walked today: the clones are then
  used. Proposed change (desktop): add this directory to the walked list if it exists.
- Desktop installer: all the pack's fonts are redistributable (license attached). Recommendation:
  install them **in the application directory** (like `core-fonts`, added to the walked list)
  rather than in the system fonts, so as never to mask a font installed by the user
  nor pollute other software; the school fonts (Andika, OpenDyslexic, Comic Neue) can be
  offered as an "also install for the whole system" option. The "Metric" derivatives carry distinct names
  (no collision with Microsoft fonts nor with the free originals).

## 3. Table OS × family → font used

"Desktop": ElixirOffice desktop editors (machine fonts + pack). "Web": web editor and server PDF export
(server fonts only, whatever the user's machine).

| Requested family | Windows + Office | Windows without Office | macOS + Office | macOS without Office | Linux desktop | Web / server |
|---|---|---|---|---|---|---|
| Calibri, Calibri Light | Calibri | Calibri (supplied by Windows) | Carlito¹ | Carlito | Carlito | Carlito |
| Cambria | Cambria | Cambria | Caladea¹ | Caladea | Caladea | Caladea |
| Aptos, Aptos Display | Aptos² | Roboto Metric | Roboto Metric¹ | Roboto Metric | Roboto Metric | Roboto Metric |
| Arial, Times New Roman, Courier New | originals | originals | originals | originals | Liberation | Liberation |
| Arial Narrow | Arial Narrow | Liberation Sans Narrow | Arial Narrow | Arial Narrow | Liberation Sans Narrow | Liberation Sans Narrow |
| Georgia, Verdana, Comic Sans MS, Arial Black | originals | originals | originals | originals | Gelasio Metric, DejaVu Sans, Comic Relief Metric, Archivo Black Metric | same as Linux |
| Century Gothic | Century Gothic | URW Gothic Metric | URW Gothic Metric¹ | URW Gothic Metric | URW Gothic Metric | URW Gothic Metric |
| Segoe UI | Segoe UI | Segoe UI | Selawik | Selawik | Selawik | Selawik |
| Book Antiqua, Palatino Linotype | originals | originals | Palatino (system) or P052 | same | P052 | P052 |
| Wingdings, Wingdings 2/3, Webdings | originals | originals | originals (macOS supplies them) | originals | Elixir Symbols (codes → Unicode) | Elixir Symbols |
| Symbol | Symbol | Symbol | Symbol | Symbol | OpenSymbol (codes → Unicode) | OpenSymbol |
| Marelle (8 variants, § 10) | Marelle (pack) | Marelle (pack) | Marelle (pack) | Marelle (pack) | Marelle (pack) | Marelle (pack) |
| Andika, OpenDyslexic, Comic Neue | the pack's | the pack's | the pack's | the pack's | the pack's | depending on the server choice (§ 6) |
| Script École | installed? otherwise URW Gothic Ecole Metric | same | same | same | URW Gothic Ecole Metric | URW Gothic Ecole Metric |
| KG Primary Penmanship (1 / 2) | installed? otherwise Caveat / Neucha Penmanship Metric | same | same | same | Caveat / Neucha Penmanship Metric | same |
| Cursif & Lignes (cursive with Seyès lines) | installed? otherwise Playwrite Seyes Metric | same | same | same | Playwrite Seyes Metric | Playwrite Seyes Metric |
| Cursive standard, Belle Allure…, if the document carries its alias (`w:altName`, § 9) | installed? otherwise Playwrite FR Moderne Metric | same | same | same | Playwrite FR Moderne Metric | Playwrite FR Moderne Metric |
| Unknown font declared `w:family="script"` with a `w:altName` (§ 9) | installed? otherwise Playwrite FR Moderne Compact | same | same | same | Playwrite FR Moderne Compact | Playwrite FR Moderne Compact |
| Belle Allure, Cursive standard without alias, unknown font | installed? otherwise Calibri | same | installed? otherwise Carlito | Carlito | Carlito | Carlito |

¹ Office for Mac installs these fonts inside the application, not seen by the desktop today (§ 2).
² Aptos is an Office "cloud" font (downloaded on demand into the user's font cache, outside the
registry): it is only seen if installed as a normal font; otherwise
Roboto Metric.

## 4. Inventory of the provisional corpus (30 documents, Word for the web)

"Word": font embedded in Word's PDF (pdffonts and font of each text fragment).
"Before": unmodified upstream image. "After": pack (group `metric`) + fixes (image `fonts-6`).

| Requested family | Documents | Word (web) | Before | After |
|---|---|---|---|---|
| Calibri, Calibri Light (theme) | 24 | Calibri | Carlito | Carlito |
| Cambria | t07, t09, s02 | Cambria | Caladea | Caladea |
| Cambria Math | t01 | Cambria Math | Asana Math | Asana Math |
| Arial | 14 | Arial | Liberation Sans | Liberation Sans |
| Times New Roman | t08, t10, s03, s09, a02, a05, a10 | Times New Roman | Liberation Serif | Liberation Serif |
| Aptos (2023 theme) | s06, a09 | Aptos | Liberation Sans | Roboto Metric |
| Georgia | s04 | Georgia | Caladea | Gelasio Metric |
| Verdana | s04 | Verdana | Open Sans | DejaVu Sans |
| Century Gothic | s08 | Century Gothic | Liberation Sans | URW Gothic Metric |
| Comic Sans MS | t03 | Comic Sans MS | Carlito | Comic Relief Metric |
| Arial Black | t03, s05 | Arial Black | Liberation Sans | Archivo Black Metric |
| Impact | s05 | Impact | Liberation Sans | Liberation Sans (no close free candidate) |
| Segoe UI Symbol (☎ ✉ ⌂ ★) | s08 | Segoe UI Symbol | DejaVu Sans, Symbola | Symbola |
| Wingdings (bullets, checkboxes, smileys, scissors) | 14 | Wingdings | OpenSymbol for 10 codes, otherwise **the letter** (J K L…) | Elixir Symbols, all codes |
| Symbol (bullets •) | 7 | Symbol | OpenSymbol | OpenSymbol (+ codes → Unicode) |
| MS Gothic (☐) | t05, s10 | MS Gothic | ASCW3 | ASCW3 |
| Andika, OpenDyslexic | t01, t05 | **Calibri** (absent from Word for the web) | Liberation Sans | Carlito (without the school group) |
| Cursive standard, Belle Allure CM | t01, t03, t06 | **Calibri** (absent) | Liberation Sans | Carlito |
| Marianne | a01, a09, a10 | Calibri; **Times New Roman** for a10 (`w:altName`) | Liberation Sans | Carlito; a10: Liberation Serif (altName Times New Roman) |

Main finding: Word replaces a font it does not know with **Calibri** (or with `w:altName`
if given), we with Liberation Sans; this was the first cause of gaps in the corpus (t01, t05,
t06, a01, a09…). Real corpus (Word desktop, teacher fonts installed on the rendering machine):
Script École (the most frequent), Comic Sans MS, Cursive standard, KG Primary Penmanship 1 and 2, Belle
Allure, Marelle, "Hello…" fonts, Century Gothic, Wingdings, Webdings; Carlito is a poor
replacement there (width 0.78 × that of Script École, 0.80 × Cursive standard), hence the measured derivatives.

## 5. Choice of replacements: method

For each Word font, the width of each character is read from the reference PDFs (box
of each glyph / em size), weighted by the number of occurrences, and compared with the width of the same character
in each free candidate font (≈ 80 candidates: Google Fonts OFL, URW, DejaVu, Liberation…).
Criteria: mean absolute gap (in ems) and total width ratio. The vertical metrics (OS/2
win, typo, hhea) of the original font are read from the font program embedded in the PDF and
copied into the derivative (sdkjs computes the line height with max(hhea, win), like Word in practice).

| Word font | Best free candidate | Mean gap | Width ratio | Original line height → derivative |
|---|---|---|---|---|
| Georgia | Gelasio | 0.02% | 1.000 | 1.136 → 1.136 (original Gelasio: 1.660) |
| Century Gothic | URW Gothic | 0.01% | 1.000 | 1.191 → 1.191 |
| Comic Sans MS | Comic Relief | 0.03% | 1.000 | 1.394 → 1.394 |
| Arial Black | Archivo Black | < 0.01% | 1.000 | 1.410 → 1.411 |
| Aptos | Roboto, wdth axis 96.5 | 1.3% | 1.000 | 1.285 → 1.285 |
| Script École | URW Gothic | 0.6% | 1.002 | 1.465 → 1.465 (private metrics, see below) |
| KG Primary Penmanship | Caveat | 3.7% (5.0% on the public file's alphabet) | 1.010 (1.045) | 1.035 → 1.035 |
| KG Primary Penmanship 2 | Neucha | 2.2% (4.1%) | 0.988 (0.960) | 1.035 → 1.035 |
| Verdana | DejaVu Sans | 1.1% | 1.003 | 1.215 / 1.164 (not derived) |
| Cursive standard, Hello… | none < 4% (sample too weak for Cursive standard) | | | default rule |

Teacher fonts (Script École, KG, Cursive standard, Marelle…): gaps measured on the Word desktop
references of the real corpus (aggregates only). The vertical metrics of KG Primary Penmanship 1 and 2
are read from the public files (dafont, identical to those of the PDFs); those of Script École only
come from the private reference: they are not versioned and are supplied to `build.py` through
`metrics-school.json` (published on 2026-10-07 with the owner's agreement: formatting numbers only) then `FONT_METRICS_EXTRA` (override; without them, URW Gothic Ecole Metric is not built and Script École falls back to
the default rule). A free lead to evaluate for school cursives: Écolier (Jean-Marie Douteau,
OFL, Fedora/Debian packages).

## 6. Real school fonts on the server: to be decided

Measurement (provisional corpus, images `fonts-4` / `fonts-4n`): with Andika and OpenDyslexic installed on the
server, t01 and t05 are rendered in these fonts, wider and taller than the Calibri that Word for the web uses (it does not have them): t01 goes from 2 to 3 pages, t05 from 3 to 4. Without them, these documents follow Word for the web
(Carlito); overall C score 69.7 with, 75.0 without. Both choices can be defended: the real font is what the author sees on their machine (Word
desktop with the font installed), Calibri is what a recipient without the font sees.
**Default retained for the server image and the baseline: `metric` group only** (`FONT_GROUPS=metric`),
which degrades no document; the desktop and the server option `FONT_GROUPS=metric,school` also install
Andika, OpenDyslexic, Comic Neue. Decision to be confirmed by the test user.

## 7. Implementation

- `branding/fonts/sources.json`: pinned sources (commit or release URL + SHA-256), group, replaced font,
  derivation; `build.py` downloads them, verifies, builds the derivatives (fontTools 4.54.1,
  bit-for-bit reproducible output); `reference-metrics.json`: measured vertical metrics;
  `symbol-tables.json`: code tables of the symbol fonts (Symbol: Adobe table published by
  unicode.org; Wingdings 1-3 and Webdings: Unicode 7.0 mappings from proposal UTC L2/11-052r,
  taken from Wikipedia's "Wingdings" and "Webdings" character tables and verified against
  the ToUnicode mappings of Word's PDFs: ☺ F04A, ☹ F04C, ★ F0AB, ✓ F0FC, ⚫ F06C, ✂ F022).
- `make fonts-pack` (pack in `~/.cache/elixiroffice-fonts/out`), `make fonts` (installs the pack in the
  `eo` development container, `/usr/share/fonts/truetype/elixiroffice`, and regenerates `AllFonts.js` /
  `font_selection.bin`, without recreating the container), `make fonts-image` (test image for the harness:
  `FONTS_BASE` + pack + optionally a built sdkjs, `SDKJS_BUILD=`).
- sdkjs (`elixir/fonts`): `FD_Substitutes` table, document `w:altName` (`SetDocumentAltNames`) and
  "unknown font → Calibri" rule (`GetSubstituteName`, called by `GetFontFile`/`GetFontFileWeb`),
  `SymbolFontTables` tables and `ChangeGlyphsMap` "*" entries for Symbol, Wingdings 1-3, Webdings;
  tests `tests/common/libfont/fontSubstitution.html`. core (`elixir/fonts`): binary `FontTable` table
  (name + `w:altName`) written by x2t.

## 8. Still to do

- Also pass the panose and family of `fontTable.xml` (the `FontTable` table only carries name and
  `w:altName`) to refine the choice of a font known to Word but absent from the dictionary.
- Desktop: walk Office for Mac's fonts; installer with the pack (application
  directory).
- Cursive standard, Belle Allure: Playwrite FR Moderne Metric only covers line height and
  average width (weak Cursive standard sample: digits and a few letters); the "Hello…" fonts have no derivative
  (Marelle needs none any more: the real font is shipped, § 10). Belle Allure and Cursive Dumont have no
  Word desktop reference in the real corpus.
- Cursif & Lignes: only the line drawing and the x-height are reproduced; the letter shape is that of
  Playwrite FR Trad (taller capitals, shorter descenders); GPOS (kerning) removed from the scaled derivatives.
- The criterion "the document carries the font's alias" (`w:altName` = PostScript name) is a heuristic: it
  separates documents by authors who had the font (rendered by Word with the font) from those whose font Word
  replaced; to be revisited if a corpus measures the opposite.
- Impact, Tahoma, Trebuchet MS: no free clone retained (Tahoma/Trebuchet not visible in the corpus
  references).

## 9. School cursives with Seyès lines and script fonts (2026-10-07)

Starting point: an exercise sheet from the real corpus (title in capitals, lowercase, then in
cursive on Seyès lines; copying exercise on two groups of six writing lines; true/false table)
whose ElixirOffice rendering differed from Word desktop: cursive replaced by underlined Carlito, Seyès
lines absent or reduced, groups of writing lines compressed and overlapping the next exercise. No
content of the document is reproduced here.

### Diagnosis (document.xml, fontTable.xml, `pdffonts` and glyphs of the reference)

- The font in question ("Cursif & Lignes") is not an ordinary cursive: **each glyph contains the six
  Seyès lines** (thin horizontal bars, thicker baseline, extending beyond the advance width so that the
  lines of neighboring glyphs join up). Word writes and draws with a single font. Its line height
  is **about 2.5 em**, against 1.22 em for Carlito.
- The engine did draw the VML connectors of the writing lines (straight `v:shape`, positioned by
  `margin-top` in points from the top of the paragraph, 9 to 80 pt); but the paragraph that carries them is set
  at 36 pt in this font: 90.6 pt high for Word, 44 pt with Carlito. The lines therefore overflowed their
  paragraph and covered the next one, and each cursive line took half the height (gap no. 2).
  Gaps no. 1 and no. 2 have the same cause: the vertical metric of the substitute font.
- Gap no. 3 (capital lines "narrower"): not reproduced. The title is in Calibri 36 pt (theme font); the width of
  each line in our PDF is identical, to the hundredth of a point, to the sum of Calibri's widths
  (Carlito has the same widths; the 8 pt gap between the two PDFs is a trailing space that Word
  adds to each line). The perceived difference comes from the third line (cursive), replaced by Carlito.
- In the same corpus: "Cursive standard" (numeration worksheet, line height of about 1.7 em) and an author script font
  (Bradley Hand ITC: `w:family="script"`, replacement name `Viner Hand ITC`, absent from the system).

### Fixes

- **Fonts** (`branding/fonts`, `build.py`, `sources.json`; licenses: `LICENSES.md`). Playwrite FR Moderne and
  Playwrite FR Trad (TypeTogether / Typotheque, **OFL 1.1**, no "Reserved Font Name"; pinned URL
  google/fonts commit 7085eb8, SHA-256 in `sources.json`) are shipped as a static 400 instance
  (`derive.instance`) and serve as the base of three renamed derivatives:
  - *Playwrite Seyes Metric* (Trad base): widths and x-height scaled to Cursif & Lignes,
    **Seyès lines drawn in each glyph** (`derive.ruled`), vertical metrics of the original;
  - *Playwrite FR Moderne Metric* (Moderne base): line height and width of Cursive standard;
  - *Playwrite FR Moderne Compact* (Moderne base): public values (1.25 em line, average width of a
    common cursive) for an unknown cursive: nothing from a private font justifies another height.
  `build.py` transformations (`scale_outlines`, `add_ruled_lines`): flattened, scaled outlines;
  GPOS/GDEF removed (kerning and combining-mark anchors: precomposed glyphs suffice for French,
  GSUB kept for ligatures); line bars added to all glyphs that advance. Tests:
  `branding/fonts/test_build.py` (synthetic font, no network).
  Private metrics (line heights, scales, line position), measured on the real corpus references:
  `FONT_METRICS_EXTRA` (entries `CursifLignes`, `Cursivestandard` of `corpus-private/font-metrics-private.json`),
  never versioned; without them, the two "Metric" derivatives are not built. The "Compact" derivative
  only uses `reference-metrics.json`. A small `hhea.lineGap` of Cursive standard was enough to push a line per
  page: the private metrics of Cursive standard are therefore supplied with `lineGap` at 0 (Word follows `win`).
- **sdkjs** (`common/libfont/map.js`, `[upstreamable]`): `FD_SubstitutePatterns` (names that vary: "Cursif &
  Lignes", "Cursif et Lignes", "Seyès…" → Playwrite Seyes Metric, Playwrite FR Trad; "Cursive standard",
  "Belle Allure…", "Écolier…", "Écriture…" → Playwrite FR Moderne Metric, Playwrite FR Moderne) and the
  "script font" rule (`FD_ScriptFontSubstitutes`). An installed font, then an installed `w:altName`, take
  precedence (like Word).
  Two safeguards from the measurements: (1) "author" cursives (Cursive standard, Belle Allure…) are only
  replaced if the document carries their alias (`w:altName` equal to the name up to case and spaces:
  "Cursive standard" / "Cursivestandard", which Word writes when the font is installed on the author's machine);
  otherwise Word, without the font, replaces it with Calibri and so do we (the provisional corpus, rendered by Word for the web
  without these fonts, lost 0.7 to 30 score points per document with an unconditional replacement);
  (2) an unknown script font is only replaced by the "Compact" font if the font table entry
  has a `w:altName` (line height 1.25 em; the "Metric" font, much taller, cost 16 points to the
  worksheet concerned).
- **core** (`BinaryWriterD.cpp`, `[upstreamable]`): the binary `FontTable` table also carries `w:family`
  (`c_oSerFontTableTypes::Family`, 3); sdkjs reads it in `Serialize2.js` (`DocReadResult.fontFamilies`).
  Old readers ignore the element. **This part requires a rebuilt x2t** (see the integration report);
  without it, only the name patterns are active.
- **Non-regression test on synthetic fixtures**: `tools/fonts/test-school-cursive.sh IMAGE`
  (generates a .docx without real content: three paragraphs in "Cursif & Lignes", a script font with
  `w:altName`, an unknown swiss font; checks through `pdffonts` / `pdftotext -bbox` the font retained and the line pitch of
  about 90 pt). qunit tests: `tests/common/libfont/fontSubstitution.html` (substitutions); `test_build.py` (derivation).

### Measurements (harness, penalty score "C"; Word desktop for the real corpus, Word for the web for the provisional one)

| Corpus | Before (image `fonts-6`) | After (image `fonts-10`) |
|---|---|---|
| Real, 4 documents measured (overall) | C 76.0; SSIM 0.842 | C 81.4; SSIM 0.863 |
| – exercise sheet with Seyès lines | 74.9; 0.820 | 94.6; 0.898 |
| – numeration worksheet (Cursive standard) | 36.3; 0.811 (70 p. for 69) | 38.2; 0.818 |
| – two other documents | 93.7; 99.3 | unchanged |
| Provisional, 30 documents (overall) | C 75.69; SSIM 0.8218 | C 75.69; SSIM 0.8218 (no document below the baseline) |

No document below the baseline (`compare.py --check`: PASS on both corpora). The pagination of the
numeration worksheet (70 pages for 69) comes from elsewhere (anchored objects), not from these fonts.

## 10. Marelle, the national-education school fonts (2026-10-07)

Marelle is the free cursive of the French Ministry of National Education (Forge des Communs Numériques
Éducatifs, https://marelle.forge.apps.education.fr/), widely used by primary-school teachers. It is shipped
**by default** (group `metric`, installed with the pack) so that documents using it render with the real font.

- **Licence**: SIL OFL 1.1 (text in the official archive, shipped as `marelle/LICENSE.txt`), copyright "2026
  Ministère de l'Éducation nationale, de l'Enseignement supérieur et de la Recherche, Laurent Bourcellier,
  Jonathan Fabreguettes and Rosalie Wagner", **Reserved Font Name "Marelle"**: the files are shipped unmodified,
  under their own name; no derivative (see `branding/fonts/LICENSES.md`).
- **Source**: official archive `marelle-ttf.zip` v1.005 (forge.apps.education.fr generic package), URL, archive
  SHA-256 and per-file SHA-256 (`member_sha256`, checked by `build.py`) pinned in `sources.json`; downloaded at
  build time, no font in git.
- **Variants** (family names exactly as in the font's name table, ids 1/16): `Marelle`, `Marelle 2`,
  `Marelle Baton`, `Marelle Baton 2` (TTF) and the Seyès-ruled `Marelle LIGNES`, `Marelle LIGNES 2`,
  `Marelle LIGNES Baton`, `Marelle LIGNES Baton 2` (OTF/CFF), all Regular only. The ruled ones are spelled in
  capitals and without accent ("Baton"): a document must use these exact names (font-name matching is case-sensitive).
- **Selection**: no new rule: an installed font with the requested name wins, so Marelle documents get the real
  font (verified: synthetic .docx with the 8 names, `pdffonts` shows the 8 Marelle fonts embedded; a name that does not
  exist, e.g. "Marelle Lignes" in mixed case, still follows the unknown-font rule: Carlito).
- **Écolier court / Écolier lignes court** (J.-M. Douteau): not shipped. Debian/Ubuntu state OFL 1.1, but the files
  carry no licence, the author's site is gone and dafont says "free for personal use": not verifiable from an
  official source. The name patterns "Écolier…" keep mapping to Playwrite FR Moderne Metric (§ 9).
- Test: `branding/fonts/test_build.py` (`SourcesPinning`: every file pinned, Marelle unmodified, OFL, default group).

## 2026-10-16 — System fonts S1–S4: isolated review addendum

This dated addendum records the isolated fonts review candidate. Earlier text remains the integrated baseline. Historical source/runtime evidence keeps its original profile; r1 validation and remaining gates are recorded separately. No integration, runtime pin, package or release is implied.

### Desktop system fonts (0.2.2 S1 candidate)

All existing bundles remain. The desktop-only private index and named-family/style resolver prefer bundled document/metric fonts, then local system fonts, then a small bundled fallback. Default-on applies to unset settings and preserves explicit declines. See [desktop system fonts](desktop-system-fonts.md) for privacy, cache, tests and pending character/PDF/collection gates. No full CJK bundle or new fallback files are added in S1; server font generation is unchanged.

## release review r1 scope — 2026-10-16
This dated candidate addition preserves integrated main41e4fa6f96 in full.
See docs/desktop-system-fonts.md for the independent r1 family, fresh test profiles,
historical evidence limits and open runtime gates. No integration or release.

## 2026-10-27 — Pan-CJK offline fallback candidate

Issue 39 adds pinned, unmodified Noto Sans CJK 2.004 Regular and Bold collections to desktop-generated font assets. In 0.4, CJK text displays correctly when Computer fonts is allowed and a CJK font is installed, as on normal Windows/macOS setups. The bundled collections are not applied on initial open when Computer fonts is declined or no CJK font is installed; standalone initial-open fallback remains a known limitation scheduled for 0.5. Generated `Elixir Fallback CJK JP/SC/TC/KR` aliases and the lazy same-origin loader are component capabilities, not proof that the shipped initial-open path activates them under those conditions. The two files add 39,535,544 raw bytes. OFL/notice, source hashes, regional mapping and scoped PDF evidence are documented in [desktop system fonts](desktop-system-fonts.md#pan-cjk-packaged-fallback--04-issue-39-candidate).
