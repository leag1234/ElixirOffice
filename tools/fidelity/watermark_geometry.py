#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Measure the ink of a filled watermark (a VML WordArt text path) on a PDF page.

The watermark is found by its fill colour (Word: D9D9D9 at 50 % -> 0.851 gray). The ink points
are taken through the current transformation matrix, so the same function reads a PDF written by
Word (flat paths) and one written by the converter (paths under a ``cm`` and a clip).

usage: watermark_geometry.py FILE.pdf [--angle 45] [--color 0.851] [--page-height 841.9] [--clipped]

The text runs along the direction ``angle`` (degrees, counter-clockwise on the page: 45 for a shape
turned by rotation:315). Prints "along ACROSS centre_x centre_y" in points (y from the page top):
the length of the ink along the text, its extent across, and the centre of the ink.
"""
import math
import re
import sys
import zlib

NUM = r"-?\d*\.?\d+"


def _streams(data):
    for m in re.finditer(rb"stream\r?\n", data):
        end = data.find(b"endstream", m.end())
        try:
            yield zlib.decompress(data[m.end():end]).decode("latin1")
        except Exception:
            try:
                yield data[m.end():end].decode("latin1")
            except Exception:
                continue


def _concat(new, old):
    na, nb, nc, nd, ne, nf = new
    oa, ob, oc, od, oe, of = old
    return (na * oa + nb * oc, na * ob + nb * od, nc * oa + nd * oc, nc * ob + nd * od,
            ne * oa + nf * oc + oe, ne * ob + nf * od + of)


def ink_points(pdf_bytes, color, page_height=841.9, tol=0.004, clipped_only=False):
    """Points (x, y from the top) of every path filled with `color` (gray value or 'r g b'), as a list.
    clipped_only keeps the fills made under a clip (the converter clips its text; table shading does not)."""
    want = [float(v) for v in str(color).split()]  # one value: any gray or equal rgb; three: r g b
    best = []
    for text in _streams(pdf_bytes):
        ctm, stack, fill, path, pts, clip, pend = (1, 0, 0, 1, 0, 0), [], None, [], [], False, False
        for raw in text.splitlines():
            line = raw.strip()
            if not line:
                continue
            op = line.split()[-1]
            nums = [float(v) for v in re.findall(NUM, line)]
            if op == "q":
                stack.append((ctm, fill, clip))
            elif op == "Q":
                if stack:
                    ctm, fill, clip = stack.pop()
            elif op == "cm" and len(nums) >= 6:
                ctm = _concat(tuple(nums[-6:]), ctm)
            elif op in ("g", "rg") and len(nums) >= 1:
                fill = nums[-3:] if op == "rg" else nums[-1:]
            elif op in ("m", "l") and len(nums) >= 2:
                path.append(tuple(nums[-2:]))
            elif op == "c" and len(nums) >= 6:
                path += [tuple(nums[-6:-4]), tuple(nums[-4:-2]), tuple(nums[-2:])]
            elif op in ("f", "f*", "F", "B", "b"):
                if (clip or not clipped_only) and fill is not None and all(abs(a - b) <= tol for a, b in zip(fill, want * (len(fill) // len(want)))):
                    a, b, c, d, e, f = ctm
                    pts += [(a * x + c * y + e, page_height - (b * x + d * y + f)) for x, y in path]
                path = []
            elif op in ('W', 'W*'):
                pend = True
            elif op in ("n", "S", "s"):
                if op == "n" and pend:
                    clip = True
                pend, path = False, []
        if len(pts) > len(best):
            best = pts
    return best


def measure_points(pts, angle):
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    us = [x * ca - y * sa for x, y in pts]
    vs = [x * sa + y * ca for x, y in pts]
    cu, cv = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    return {"along": max(us) - min(us), "across": max(vs) - min(vs),
            "centre": (cu * ca + cv * sa, -cu * sa + cv * ca)}


def measure(pdf_path, angle=45.0, color="0.851", page_height=841.9, clipped_only=False):
    with open(pdf_path, "rb") as fh:
        pts = ink_points(fh.read(), color, page_height, clipped_only=clipped_only)
    if not pts:
        raise ValueError("no filled path with colour %s in %s" % (color, pdf_path))
    return measure_points(pts, angle)


if __name__ == "__main__":
    args = sys.argv[1:]
    opts = {"--angle": "45", "--color": "0.851", "--page-height": "841.9"}
    clipped = "--clipped" in args
    args = [a for a in args if a != "--clipped"]
    path = None
    while args:
        a = args.pop(0)
        if a in opts:
            opts[a] = args.pop(0)
        else:
            path = a
    if not path:
        sys.exit(__doc__)
    r = measure(path, float(opts["--angle"]), opts["--color"], float(opts["--page-height"]), clipped)
    print("%.1f %.1f %.1f %.1f" % (r["along"], r["across"], r["centre"][0], r["centre"][1]))
