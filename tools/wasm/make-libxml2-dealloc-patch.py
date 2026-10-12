#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate patches/0003: the bundled libxml2 casts one-argument free
functions to xmlHashDeallocator (two arguments). Native ABIs tolerate it;
WebAssembly traps ("function signature mismatch") on such indirect calls.
Each cast is replaced by a small two-argument wrapper defined just before the
enclosing function (same #ifdef context).

usage: make-libxml2-dealloc-patch.py CORE_DIR   (edits in place; then git diff)
"""
import re, sys
from pathlib import Path

root = Path(sys.argv[1]) / "DesktopEditor/xml/libxml2"
CAST = re.compile(r"\(xmlHashDeallocator\)\s*([A-Za-z_][A-Za-z0-9_]*)")
TWO_ARGS = {"xmlFreeEntityWrapper"}  # already (payload, name)
total = 0
for f in sorted(root.glob("*.c")):
    if f.name.startswith("test"):
        continue
    raw = f.read_bytes().decode("latin-1")
    eol = "\r" if "\r\n" in raw else ""
    lines = [l.rstrip("\r") for l in raw.split("\n")]
    text = "\n".join(lines)
    if not CAST.search(text):
        continue
    inserts = {}  # line index -> list of wrapper defs
    counter = 0

    def repl(m):
        global total
        nonlocal_state[0] += 1
        fn = m.group(1)
        if fn in TWO_ARGS:
            return m.group(0)
        line = text.count("\n", 0, m.start())
        brace = max(i for i in range(line + 1) if lines[i] == "{" or re.match(r"^[A-Za-z_].*\)\s*\{\s*$", lines[i]))
        start = brace if lines[brace] == "{" else brace + 1
        while start > 0 and lines[start - 1].strip() and not lines[start - 1].rstrip().endswith("*/") and not lines[start - 1].startswith("#"):
            start -= 1
        name = f"{fn}__eo_dealloc_{nonlocal_state[0]}"
        inserts.setdefault(start, []).append(
            f"static void {name}(void *payload, xmlChar *name ATTRIBUTE_UNUSED) {{ {fn}(payload); }}")
        total += 1
        return name

    nonlocal_state = [0]
    new = CAST.sub(repl, text)
    nl = new.split("\n")
    for idx in sorted(inserts, reverse=True):
        nl[idx:idx] = ["/* WebAssembly: exact-signature deallocator (see tools/wasm) */"] + inserts[idx] + [""]
    f.write_bytes((eol + "\n").join(nl).encode("latin-1"))
    print(f.name, nonlocal_state[0])
print("wrappers", total)
