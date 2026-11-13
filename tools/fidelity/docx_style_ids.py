#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Compare the style ids of a DOCX before and after a save.

The ids (w:styleId) and every reference to them (w:pStyle, w:rStyle, w:tblStyle, w:numStyleLink,
w:styleLink, and w:basedOn / w:next / w:link inside styles.xml) must come back unchanged: round-trip
diffs, macros and templates look styles up by id, and Word pairs a style with its linked
character style by id ("Titre1" / "Titre1Car").

usage: docx_style_ids.py BEFORE.docx AFTER.docx        (exit 1 and a list of the differences)
"""
import re
import sys
import zipfile
from collections import Counter

REF = ("pStyle", "rStyle", "tblStyle", "numStyleLink", "styleLink", "basedOn", "next", "link")
# the parts whose references must come back exactly; header, footer, note parts may be renumbered
# or get the default style of an empty paragraph, they only have to refer to existing styles
EXACT = ("word/document.xml", "word/numbering.xml", "word/styles.xml")


def read(path):
    z = zipfile.ZipFile(path)
    styles = {}
    text = z.read("word/styles.xml").decode("utf8")
    for m in re.finditer(r"<w:style\b([^>]*)>(.*?)</w:style>", text, re.S):
        attrs = dict(re.findall(r'w:(\w+)="([^"]*)"', m.group(1)))
        if "styleId" in attrs:
            name = re.search(r'<w:name w:val="([^"]*)"', m.group(2))
            styles[attrs["styleId"]] = (attrs.get("type"), name.group(1) if name else None)
    refs = {}
    for part in z.namelist():
        if not (part.startswith("word/") and part.endswith(".xml")) or part == "word/stylesWithEffects.xml":
            continue
        body = z.read(part).decode("utf8", "ignore")
        c = Counter()
        for kind in REF:
            for value in re.findall(r"<w:%s\b[^>]*?w:val=\"([^\"]+)\"" % kind, body):
                c[(kind, value)] += 1
        if c:
            refs[part] = c
    return styles, refs


def compare(before, after):
    """Return a list of readable differences between two DOCX files (empty when the ids are kept)."""
    sa, ra = read(before)
    sb, rb = read(after)
    out = []
    for i in sorted(set(sa) - set(sb)):
        out.append("style id lost: %s (%s)" % (i, sa[i][1]))
    for i in sorted(set(sb) - set(sa)):
        out.append("style id added: %s (%s)" % (i, sb[i][1]))
    for i in sorted(set(sa) & set(sb)):
        if sa[i][0] != sb[i][0]:
            out.append("style %s changed type: %s -> %s" % (i, sa[i][0], sb[i][0]))
    for part in EXACT:
        # the set of (element, id) pairs: the editor may split or merge runs, so how often a style is used can change
        a, b = set(ra.get(part, ())), set(rb.get(part, ()))
        for key in sorted(a - b):
            out.append("%s: %s=%s no longer used" % (part, key[0], key[1]))
        for key in sorted(b - a):
            out.append("%s: %s=%s is new" % (part, key[0], key[1]))
    for part, c in rb.items():
        for (kind, value) in c:
            if value not in sb:
                out.append("%s: %s refers to a style that does not exist: %s" % (part, kind, value))
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    diffs = compare(sys.argv[1], sys.argv[2])
    print("\n".join(diffs) if diffs else "style ids unchanged")
    sys.exit(1 if diffs else 0)
