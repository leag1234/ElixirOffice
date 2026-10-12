#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Compare native and wasm outputs and summarise both CSVs.

usage: compare.py RESULTS_DIR   (expects native.csv, wasm.csv, native/, wasm/)
Editor.bin: byte equality. Office files: equality of every zip entry's content
(zip timestamps/order ignored).
"""
import csv, hashlib, statistics, sys, zipfile
from collections import defaultdict
from pathlib import Path

res = Path(sys.argv[1])


def norm(name, data):
    # [Content_Types].xml: entry order follows directory listing order, which
    # differs between the in-memory FS and a real disk; compare sorted entries.
    if name == "[Content_Types].xml":
        head, _, rest = data.partition(b"<Types")
        return head + b"".join(sorted(rest.replace(b"><", b">\n<").split(b"\n")))
    return data


def zip_entries(p):
    with zipfile.ZipFile(p) as z:
        return {n: hashlib.sha256(norm(n, z.read(n))).hexdigest() for n in z.namelist() if not n.endswith("/")}


def same(a, b):
    if not (a.exists() and b.exists()):
        return "missing"
    if a.read_bytes() == b.read_bytes():
        return "identical"
    if a.suffix in (".docx", ".xlsx", ".pptx"):
        ea, eb = zip_entries(a), zip_entries(b)
        diff = sorted(n for n in set(ea) | set(eb) if ea.get(n) != eb.get(n))
        return "same-content" if not diff else "differs:" + ";".join(diff)
    return "differs"


rows = defaultdict(list)
for kind in ("native", "wasm"):
    with open(res / f"{kind}.csv") as fh:
        for r in csv.DictReader(fh):
            rows[kind].append(r)

print("== timings (ms, median per step; run 0 = first call, runs 1+ = warm)")
for kind in ("native", "wasm"):
    by = defaultdict(lambda: ([], []))
    for r in rows[kind]:
        if r["file"].startswith("("):
            print(f"{kind} {r['step']}: {r['ms']} ms {r.get('heap_mb', '')}")
            continue
        (by[r["step"]][0] if r["run"] == "0" else by[r["step"]][1]).append(float(r["ms"]))
    for step, (first, warm) in sorted(by.items()):
        print(f"{kind:6} {step:12} first={statistics.median(first):8.1f} warm={statistics.median(warm) if warm else 0:8.1f} total_warm={sum(warm) / max(1, len(warm) // max(1, len(first))):9.1f} n={len(first)}")
    bad = [r for r in rows[kind] if not r["file"].startswith("(") and r["rc"] not in ("0",)]
    print(f"{kind} failures: {len(bad)}", sorted({(r['file'], r['step'], r['rc']) for r in bad})[:10])

print("== output equality (wasm vs native)")
tally = defaultdict(int)
parts = defaultdict(int)
for d in sorted((res / "wasm").iterdir()):
    for f in sorted(d.iterdir()):
        s = same(res / "native" / d.name / f.name, f)
        tally[(f.name.split(".")[-1], s.split(":")[0])] += 1
        if s.startswith("differs"):
            print(f"  {d.name}/{f.name}: {s}")
            for n in s.partition(":")[2].split(";"):
                if n:
                    parts[n.split("/")[-1].rstrip("0123456789.xmlsx") or n] += 1
for k, v in sorted(tally.items()):
    print(f"  {k[0]:5} {k[1]:13} {v}")
print("== differing zip parts (by name stem, count of files)")
for k, v in sorted(parts.items(), key=lambda x: -x[1]):
    print(f"  {k:40} {v}")
