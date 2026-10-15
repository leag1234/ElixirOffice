#!/usr/bin/env python3
"""Add a wasm "name" section built from an Emscripten symbol map (idx:name).

usage: add-names.py IN.wasm IN.js.symbols OUT.wasm
Lets wasm-opt match function names (e.g. --no-inline=_GLOBAL__sub_I_*) on a
binary linked without --profiling-funcs.
"""
import sys


def uleb(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def vec_str(s):
    b = s.encode()
    return uleb(len(b)) + b


src, syms, dst = sys.argv[1:4]
names = {}
for line in open(syms, encoding="utf-8", errors="replace"):
    idx, _, name = line.rstrip("\n").partition(":")
    if idx.isdigit():
        names.setdefault(int(idx), name)
body = bytearray(uleb(len(names)))
for i in sorted(names):
    body += uleb(i) + vec_str(names[i])
sub = bytes([1]) + uleb(len(body)) + body          # subsection 1: function names
payload = vec_str("name") + sub
data = open(src, "rb").read()
open(dst, "wb").write(data + bytes([0]) + uleb(len(payload)) + payload)
print(f"{len(names)} names added -> {dst}")
