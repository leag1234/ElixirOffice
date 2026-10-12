# ElixirOffice font pack: licenses and provenance

The pack is produced by `branding/fonts/build.py` (`make fonts-pack`) from `sources.json`: each
file is downloaded from a pinned URL (Git commit or published release) and verified by its SHA-256. No
font is versioned in this repository. Each output directory contains the license text of the
family (`LICENSE.txt`).

Rule: only the **OFL 1.1**, **Apache 2.0** and **(A)GPL with font exception** licenses are
accepted. All the families below can be redistributed, including in the server image and in
a desktop installer (with their license text).

## Fonts shipped as is

| Family | Replaces / role | License | Source (URL pinned in `sources.json`) |
|---|---|---|---|
| P052 | Book Antiqua, Palatino Linotype (Palatino: same widths) | AGPL-3.0 + exception for embedding in documents | https://github.com/ArtifexSoftware/urw-base35-fonts (commit 3c0ba3b) |
| Selawik | Segoe UI (width-compatible by design) | OFL 1.1 (RFN "Selawik") | https://github.com/microsoft/Selawik (version 1.01) |
| Andika | school font (SIL) | OFL 1.1 (RFN "Andika", "SIL") | https://software.sil.org/andika/ via google/fonts (commit 7085eb8) |
| OpenDyslexic | "dys" school font | OFL 1.1 (RFN "OpenDyslexic") | https://github.com/antijingoist/opendyslexic (commit 1824da5) |
| Comic Neue | school font | OFL 1.1 | https://github.com/crozynski/comicneue via google/fonts |
| Marelle (8 variants: Marelle, Marelle 2, Marelle Baton, Marelle Baton 2, Marelle LIGNES, Marelle LIGNES 2, Marelle LIGNES Baton, Marelle LIGNES Baton 2) | French national-education school cursive, installed by default (group `metric`) so that Marelle documents render with the real font | OFL 1.1, Reserved Font Name "Marelle" (shipped unmodified, under its own name) | https://marelle.forge.apps.education.fr/ ; official archive `marelle-ttf.zip` v1.005 on forge.apps.education.fr (URL and SHA-256 pinned in `sources.json`) |

Marelle copyright line (from the `LICENSE` file of the archive, shipped as `marelle/LICENSE.txt`): "Copyright 2026 Ministère de l’Éducation nationale, de l’Enseignement supérieur et de la Recherche, Laurent Bourcellier, Jonathan Fabreguettes and Rosalie Wagner, with Reserved Font Name "Marelle"." The Reserved Font Name only forbids modified versions under that name: we ship the files byte for byte, never derive from them.

Already present in the upstream image (`core-fonts` and `/usr/share/fonts`), not duplicated: Carlito
(OFL, Calibri), Caladea (OFL, Cambria), Liberation Sans / Serif / Mono / Sans Narrow (OFL 2.x and GPL+exception
1.07, Arial / Times New Roman / Courier New / Arial Narrow), DejaVu (Bitstream Vera license), Open Sans,
Noto (including Noto Emoji), OpenSymbol, Symbola ("free for any use"), Asana Math.

## "Metric" derivatives (modified versions)

Built by `build.py`, reproducible. Modification: static instance of a variable font and/or
vertical metrics (OS/2 winAscent/winDescent, typo, hhea) copied from the font they replace
(numeric values read from public reference PDFs or public font files, `reference-metrics.json`), widths unchanged unless
noted. In accordance with the OFL (condition 3) and the AGPL, these are renamed modified versions, shipped
with their original license; the modification notice is in the "version" field (nameID 5).

| Derived family | Original font | Replaces | Measured width gap | License |
|---|---|---|---|---|
| Gelasio Metric | Gelasio 1.008 (SorkinType, commit 7ab20e7) | Georgia | 0.02% | OFL 1.1 |
| URW Gothic Metric | URW Gothic (URW base 35) | Century Gothic | 0.01% | AGPL-3.0 + exception |
| URW Gothic Ecole Metric | URW Gothic (URW base 35) | Script École (non-redistributable school font) | 0.6% | AGPL-3.0 + exception |

_Playwrite FR Moderne Metric_ and _Playwrite Seyes Metric_: likewise, vertical metrics, scales and position of the Seyès lines read from private references (real corpus), supplied by `FONT_METRICS_EXTRA` (entries `Cursivestandard` and `RuledCursive`); without them these two families are not built (Playwrite FR Moderne and Trad remain, shipped as is).

_URW Gothic Ecole Metric_: the vertical metrics of Script École were taken from a private reference and are not versioned; `build.py` only builds this family if `FONT_METRICS_EXTRA` supplies them (on <build-host>: `corpus-private/font-metrics-private.json`). To be published when a public copy of Script École (or the owner's agreement) allows versioning them.

| Comic Relief Metric | Comic Relief 1.210 (via google/fonts) | Comic Sans MS | 0.03% | OFL 1.1 |
| Archivo Black Metric | Archivo Black (Omnibus-Type) | Arial Black | < 0.01% | OFL 1.1 |
| Roboto Metric | Roboto (variable, instance wdth 96.5 / 100) | Aptos, Aptos Display (no free clone; the closest) | 1.3% (width ratio 1.000) | OFL 1.1 |
| Caveat Penmanship Metric | Caveat (variable, instances 400 / 700) | KG Primary Penmanship (non-redistributable; metrics read from the public dafont file) | 3.7% (real text) / 5.0% (alphabet) | OFL 1.1 |
| Neucha Penmanship Metric | Neucha | KG Primary Penmanship 2 (same) | 2.2% (real text) / 4.1% (alphabet) | OFL 1.1 |
| Playwrite FR Moderne | Playwrite FR Moderne (TypeTogether / Typotheque; google/fonts commit 7085eb8, v1.003), static instance wght 400 | – (free school cursive, fallback of the derivatives below; no "Reserved Font Name" in Playwrite's OFL: the name is kept) | – | OFL 1.1 |
| Playwrite FR Trad | Playwrite FR Trad (same), static instance wght 400 | – (same) | – | OFL 1.1 |
| Playwrite FR Moderne Metric | Playwrite FR Moderne, widths scaled (private factor), GPOS/GDEF removed, vertical metrics of Cursive standard | Cursive standard, Belle Allure, unknown school cursives (font declared "script" by the document) | see `docs/fonts.md` § 5 (weak sample) | OFL 1.1 |
| Playwrite Seyes Metric | Playwrite FR Trad, widths and x-height scaled (factors read from a private reference), Seyès lines drawn in each glyph, GPOS/GDEF removed, vertical metrics of ruled school cursive | ruled school cursive (school font with embedded Seyès lines, non-redistributable) | 3.9% (20 characters) | OFL 1.1 |
| Elixir Symbols | Noto Sans Symbols 2 + Noto Sans Symbols (instance 400), merged subset | Wingdings, Wingdings 2, Wingdings 3, Webdings (glyphs at the Unicode code points of the symbols, vertical metrics of Wingdings) | – | OFL 1.1 |

"Width gap": average, weighted by occurrences, of the absolute width gap of the characters
actually used in the reference PDFs (as a fraction of an em).

## Rejected fonts

| Font | Reason |
|---|---|
| Luciole | text fonts under CC BY 4.0 (only the math font is under OFL): license outside the list; to be decided by the owner (CC BY allows redistribution with attribution) |
| Belle Allure (Jean Boyault) | free for teachers and pupils, redistribution not allowed: replaced by Playwrite FR Moderne Metric |
| Cursive standard | distributed on dafont without an identifiable license: replaced by Playwrite FR Moderne Metric |
| Script École, KG Primary Penmanship, "Hello" fonts | free for personal use / without a redistribution license: replaced by a measured derivative when a free candidate is close enough, otherwise by the default rule (Calibri → Carlito) |
| Symbola 9.17 (derivative) | "free for any use": outside the list, so no modified version by us (the original is still supplied by the upstream) |
| Écolier court / Écolier lignes court (J.-M. Douteau) | Debian/Ubuntu packages (`fonts-ecolier-court`, `fonts-ecolier-lignes-court`) state OFL 1.1, but the font files carry no licence (only "© 1998-2005"), the author's site is gone and dafont lists them as free for personal use: licence not verifiable from the author, not shipped (2026-10-07) |
| Marianne | reserved for State services |
| Aptos, Calibri, Cambria, Segoe UI, Wingdings… | Microsoft fonts, non-redistributable: used if present on the machine (Windows desktop), never shipped |
