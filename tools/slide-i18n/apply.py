#!/usr/bin/env python3
"""Write the ElixirOffice presentation editor strings into web-apps locale files.

Usage: python3 tools/slide-i18n/apply.py <web-apps checkout>

- src/*.txt: one line per string, "key | en | fr | de | es | it | pt | pt-pt |
  nl | ru | pl | ja | zh" ("@prefix X.Y." lines set the key prefix), for the new
  strings of the presentation editor (PE.Views.*, PE.Controllers.*), including
  its subclasses of the shared chrome (apps/common/main/lib/elixir-chrome/).
- copy.json: key prefixes copied from the document editor locales, where the
  Word work already translated them (e.g. DE.Views.ElixirTitleBar.* ->
  PE.Views.ElixirTitleBar.*).

Languages: en (default) + fr de es it pt pt-pt nl ru pl ja zh; the other
locales fall back to English at runtime. Idempotent: re-run after a merge.
Files keep the upstream format (2-space indent, UTF-8, line endings, no final newline).
"""
import collections
import glob
import json
import os
import sys

LANGS = ["en", "fr", "de", "es", "it", "pt", "pt-pt", "nl", "ru", "pl", "ja", "zh"]
here = os.path.dirname(os.path.abspath(__file__))
wa = sys.argv[1] if len(sys.argv) > 1 else "."


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=collections.OrderedDict)


def save(p, d):
    with open(p, encoding="utf-8", newline="") as f:
        crlf = "\r\n" in f.read(4096)
    out = json.dumps(d, indent=2, ensure_ascii=False)
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(out.replace("\n", "\r\n") if crlf else out)


def parse(path):
    out, prefix = collections.OrderedDict(), ""
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        if line.startswith("@prefix "):
            prefix = line.split(" ", 1)[1].strip()
            continue
        cols = [c.strip() for c in line.split(" | ")]
        key = prefix + cols[0]
        out[key] = collections.OrderedDict((l, v) for l, v in zip(LANGS, cols[1:]) if v)
        if len(cols) != len(LANGS) + 1:
            print("warning: %s has %d columns" % (key, len(cols) - 1))
    return out


strings = collections.OrderedDict()
for f in sorted(glob.glob(os.path.join(here, "src", "*.txt"))):
    strings.update(parse(f))
copy = load(os.path.join(here, "copy.json"))
# keys of earlier layouts, removed from the locale files
OBSOLETE = ("Common.Views.ElixirTitleBar.", "Common.Views.ElixirBackstage.")

missing = collections.Counter()
for lang in LANGS:
    target = os.path.join(wa, "apps/presentationeditor/main/locale", lang + ".json")
    d = load(target)
    for k in [k for k in d if k.startswith(OBSOLETE)]:
        del d[k]
    de_path = os.path.join(wa, "apps/documenteditor/main/locale", lang + ".json")
    de = load(de_path) if os.path.exists(de_path) else {}
    de_en = load(os.path.join(wa, "apps/documenteditor/main/locale/en.json"))
    for src_prefix, dst_prefix in copy.items():
        for k, v in de_en.items():
            if k.startswith(src_prefix):
                d[dst_prefix + k[len(src_prefix):]] = de.get(k, v)
    for k, tr in strings.items():
        v = tr.get(lang) or tr.get("pt" if lang == "pt-pt" else "") or tr["en"]
        if lang not in tr:
            missing[lang] += 1
        d[k] = v
    save(target, d)
print("ok", len(strings), "strings;", "untranslated:", dict(missing) or "none")
