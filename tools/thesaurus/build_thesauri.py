#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Copies the free MyThes thesauri of the LibreOffice dictionaries project into the dictionaries submodule,
with the .idx index that LibreOffice builds at packaging time (th_gen_idx.pl) and the licence files.

   python3 tools/thesaurus/build_thesauri.py <libreoffice-dictionaries checkout> <DocumentServer/dictionaries>

Each language goes to <dictionaries>/<dir>/th_<dir>_v2.dat and .idx, loaded on demand by the Thesaurus pane
(web-apps controller WordPanes) for the language of the text. The licences were checked by hand: see
docs/thesaurus.md (languages left out and why)."""
import os, shutil, sys

# dir in our dictionaries, source .dat, licence and readme files (relative to the LibreOffice checkout), licence
THESAURI = [
    ("ca_ES", "ca/dictionaries/th_ca_ES_v3.dat", ["ca/README_thes_ca.txt", "ca/LICENSES-en.txt"], "CC BY 4.0"),
    ("da_DK", "da_DK/th_da_DK.dat", ["da_DK/README_da_DK.txt"], "GPL 2.0 / LGPL 2.1 / MPL 1.1"),
    ("de_DE", "de/th_de_DE_v2.dat", ["de/README_thesaurus.txt"], "LGPL 2.1 or later"),
    ("es_ES", "es/th_es_v2.dat", ["es/README_th_es.txt"], "LGPL 2.1"),
    ("fr_FR", "fr_FR/dictionaries/thes_fr.dat", ["fr_FR/dictionaries/README_thes_fr.txt"], "LGPL 2.1 or later"),
    ("gl_ES", "gl/thesaurus_gl.dat", ["gl/README_th_gl.txt", "gl/COPYING_th_gl"], "GPL 3"),
    ("it_IT", "it_IT/th_it_IT_v2.dat", ["it_IT/README_th_it_IT.txt"], "GPL 3"),
    ("pl_PL", "pl_PL/th_pl_PL_v2.dat", ["pl_PL/README_en.txt"], "LGPL 2.1"),
    ("pt_BR", "pt_BR/th_pt_BR.dat", ["pt_BR/license-thes.readme"], "BSD-style (MyThes)"),
    ("ro_RO", "ro/th_ro_RO_v2.dat", ["ro/README_EN.txt", "ro/COPYING.LGPL"], "GPL 2.0 or later / LGPL 2.1 or later / MPL 1.1"),
    ("ru_RU", "ru_RU/th_ru_RU_M_aot_and_v2.dat", ["ru_RU/README_thes_ru_RU_M_aot_and_v2.txt"], "LGPL 2.1"),
    ("sk_SK", "sk_SK/th_sk_SK_v2.dat", ["sk_SK/README_th_sk_SK_v2.txt"], "MIT"),
    ("sl_SI", "sl_SI/th_sl_SI_v2.dat", ["sl_SI/README_th_sl_SI.txt"], "GPL 3 / LGPL 2.1"),
    ("sv_SE", "sv_SE/th_sv_SE.dat", ["sv_SE/README_th_sv_SE.txt"], "permissive (Synlex, KTH)"),
]


def build_index(dat_path, idx_path):
    """th_gen_idx.pl: first line the encoding, then the number of entries, then word|byte offset, sorted"""
    with open(dat_path, "rb") as f:
        data = f.read()
    lines = data.split(b"\n")
    encoding = lines[0].strip()
    entries = []
    offset = len(lines[0]) + 1
    i = 1
    while i < len(lines):
        line = lines[i]
        start = offset
        offset += len(line) + 1
        i += 1
        text = line.rstrip(b"\r")
        if b"|" not in text:
            continue
        word, _, count = text.rpartition(b"|")
        try:
            n = int(count)
        except ValueError:
            continue
        entries.append((word, start))
        for _ in range(n):  # the meaning lines
            if i >= len(lines):
                break
            offset += len(lines[i]) + 1
            i += 1
    entries.sort(key=lambda e: e[0])
    with open(idx_path, "wb") as f:
        f.write(encoding + b"\n" + str(len(entries)).encode() + b"\n")
        for word, start in entries:
            f.write(word + b"|" + str(start).encode() + b"\n")
    return len(entries)


# thesauri already in the dictionaries of the upstream, shipped without their index
INDEX_ONLY = ["ar/th_ar.dat"]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    for dat in INDEX_ONLY:
        n = build_index(os.path.join(dst, dat), os.path.join(dst, dat[:-4] + ".idx"))
        print("%-6s %8d entries  (index only)" % (dat.split("/")[0], n))
    for d, dat, docs, licence in THESAURI:
        out = os.path.join(dst, d)
        os.makedirs(out, exist_ok=True)
        base = os.path.join(out, "th_%s_v2" % d)
        shutil.copyfile(os.path.join(src, dat), base + ".dat")
        n = build_index(base + ".dat", base + ".idx")
        for doc in docs:
            name = os.path.basename(doc)
            target = name if name.lower().startswith(("readme_th", "readme_thes")) else "THESAURUS_" + name
            shutil.copyfile(os.path.join(src, doc), os.path.join(out, target))
        print("%-6s %8d entries  %s" % (d, n, licence))


if __name__ == "__main__":
    main()
