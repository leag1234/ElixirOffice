# Thesaurus languages

The Thesaurus pane (Shift+F7, web-apps controller `WordPanes`) reads MyThes files (`.idx` index and `.dat` data) from the `dictionaries` folder of the server. It picks the file by the language of the text at the cursor: first the exact language (`de_CH`), then the main variant of the language (`de_DE`). Nothing is loaded at startup: the index of a language is fetched the first time the pane looks a word up in that language, and each lookup reads a few kilobytes of the data file with an HTTP range request. No word leaves the server.

The files come from the LibreOffice dictionaries project (https://git.libreoffice.org/dictionaries, mirror https://github.com/LibreOffice/dictionaries, commit 32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4 of 2026-08-22). `tools/thesaurus/build_thesauri.py` copies them into the `dictionaries` submodule as `<dir>/th_<dir>_v2.dat`, builds the `.idx` index (LibreOffice builds it when packaging, with `th_gen_idx.pl`) and copies the licence and readme files next to them. The English, Arabic and Ukrainian files were already in the dictionaries of the upstream.

## Installation

Production image: the `dictionaries` submodule is copied whole into the image (`build/.docker/bundle.bake.Dockerfile`, `COPY dictionaries`), so the `th_*` files ship with it and `tools/image/validate.sh` lists them. Dev container (`eo`): its image carries the upstream dictionaries only, run `make dictionaries` after each recreation (it copies the `th_*` and `*_thes.*` files of the submodule into `$EO_ROOT/dictionaries`). Without them the Thesaurus pane answers nothing for the new languages.

## Bundled

| Language | Folder | Used for | Source | Licence | Entries |
|---|---|---|---|---|---|
| Arabic | `ar` | ar-* | upstream dictionaries (Taha Zerrouki) | GPL 2.0 or later / LGPL 2.1 / MPL 1.1 | |
| Catalan | `ca_ES` | ca-ES, ca-ES-valencia | Softcatalà (Jaume Ortolà) | CC BY 4.0 (compatible with GPL 3 according to the FSF) | 44,038 |
| Danish | `da_DK` | da-DK | Stavekontrolden | GPL 2.0 / LGPL 2.1 / MPL 1.1 (used under LGPL 2.1) | 30,981 |
| English | `en_US` | en-* | upstream dictionaries (WordNet) | WordNet licence (permissive) | |
| French | `fr_FR` | fr-* | Frédéric Labbé, Dicollecte | LGPL 2.1 or later | 36,241 |
| Galician | `gl_ES` | gl-ES | Real Academia Galega / Instituto da Lingua Galega, Miguel Solla | GPL 3 | 6,947 |
| German | `de_DE` | de-DE, de-AT, de-CH, de-LU, de-LI | OpenThesaurus (Daniel Naber) | LGPL 2.1 or later | 120,868 |
| Italian | `it_IT` | it-* | Daniela Volta, Andrea Pescetti, LibreItalia and others | GPL 3 | 25,851 |
| Polish | `pl_PL` | pl-PL | Dobry słownik, Marcin Miłkowski | LGPL 2.1 | 27,060 |
| Portuguese (Brazil) | `pt_BR` | pt-BR | VERO project (Raimundo Moura) | BSD-style (license-thes.readme; the package is LGPL 3 / MPL) | 26,147 |
| Romanian | `ro_RO` | ro-* | Rospell | GPL 2.0 or later / LGPL 2.1 or later / MPL 1.1 | 45,412 |
| Russian | `ru_RU` | ru-RU | based on AOT (aot.ru) | LGPL 2.1 | 11,383 |
| Slovak | `sk_SK` | sk-SK | OpenThesaurus-SK (Tibor Bako, Zdenko Podobný) | MIT | 13,366 |
| Slovenian | `sl_SI` | sl-SI | OdprtiTezaver (tezaver.si) | GPL 3 / LGPL 2.1 | 22,491 |
| Spanish | `es_ES` | es-* | OpenThesaurus-es (Marcelo Garrone) | LGPL 2.1 | 21,846 |
| Swedish | `sv_SE` | sv-* | Synlex (Viggo Kann, KTH) | permissive (use, copy, modify with the notices kept) | 16,047 |
| Ukrainian | `uk_UA` | uk-UA | upstream dictionaries | GPL / LGPL / MPL | |

The German Swiss file of LibreOffice (`th_de_CH_v2`, 31 MB) is the same thesaurus with Swiss spelling; it is left out and de-CH uses the German file.

## Left out

| Language | Reason |
|---|---|
| Portuguese (Portugal), `pt_PT` | Onto.PT under CC BY 3.0: free, but its compatibility with the GPL is not stated by the FSF (only CC BY 4.0 is); to decide (could be bundled as a separate data file, mere aggregation). |
| Czech, `cs_CZ` | Generated from a dictionary under the GNU FDL 1.1 or later: not a licence of the list above. |
| Hungarian, `hu_HU` | GPL text included without "or later": treated as GPL 2.0 only. |
| Norwegian Bokmål and Nynorsk, `nb_NO`, `nn_NO` | spell-norwegian project, "GNU GPL version 2": treated as GPL 2.0 only. |
| Bulgarian, `bg_BG` | GPL 2 licence file without a version statement in the thesaurus readme: unclear. |
| Dutch, `nl_NL` | No MyThes thesaurus in the LibreOffice dictionaries; other free sources (OpenTaal) not checked yet. |
| Greek, `el_GR` | No MyThes thesaurus in the LibreOffice dictionaries. |
| Other LibreOffice thesauri (Icelandic, Indonesian, Latvian, Esperanto, Thai, Marathi, Nepali, Guarani) | Not in the list of main languages of this work; can be added with the same tool after a licence check. |

Size: 80 MB of data files in the dictionaries submodule for the 14 new languages (German 31 MB, Portuguese 15 MB, Catalan 11 MB).
