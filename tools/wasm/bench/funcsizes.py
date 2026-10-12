#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""List the largest functions of a wasm binary (V8 refuses functions > 7.65 MB).
usage: funcsizes.py x2t.wasm [x2t.js.symbols] [N]"""
import sys

def leb(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1; r |= (x & 0x7f) << s; s += 7
        if x < 0x80: return r, i

b = open(sys.argv[1], "rb").read()
syms = {}
if len(sys.argv) > 2:
    for l in open(sys.argv[2], errors="replace"):
        k, _, v = l.partition(":"); syms[int(k)] = v.strip()
n_top = int(sys.argv[3]) if len(sys.argv) > 3 else 10
i, n_imports = 8, 0
while i < len(b):
    sid = b[i]; size, j = leb(b, i + 1); end = j + size
    if sid == 2:  # imports: count function imports
        cnt, k = leb(b, j)
        for _ in range(cnt):
            l, k = leb(b, k); k += l; l, k = leb(b, k); k += l
            kind = b[k]; k += 1
            if kind == 0: n_imports += 1; _, k = leb(b, k)
            elif kind == 1: k += 1; fl, k = leb(b, k); _, k = leb(b, k); k = leb(b, k)[1] if fl & 1 else k
            elif kind == 2: fl, k = leb(b, k); _, k = leb(b, k); k = leb(b, k)[1] if fl & 1 else k
            elif kind == 3: k += 2
            elif kind == 4: k += 1; _, k = leb(b, k)
    if sid == 10:
        cnt, k = leb(b, j); sizes = []
        for f in range(cnt):
            s, k2 = leb(b, k); sizes.append((s, f + n_imports)); k = k2 + s
        sizes.sort(reverse=True)
        print(f"functions: {cnt}, code section: {size} bytes")
        for s, idx in sizes[:n_top]:
            print(f"{s:>10} {idx:>7} {syms.get(idx, '?')[:150]}")
    i = end
