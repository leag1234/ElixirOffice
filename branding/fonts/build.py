#!/usr/bin/env python3
"""Build the ElixirOffice free font pack (branding/fonts).

Downloads every source listed in sources.json (pinned URLs, sha256-checked),
copies unmodified fonts as-is and produces the "metric" derivatives described
in sources.json (static instance of a variable font and/or vertical metrics
copied from the Microsoft font they stand in for, family renamed as the OFL
requires for modified versions). Output: <out>/<family-dir>/*.ttf|otf plus the
licence text of each family. Licences and provenance: LICENSES.md.

Usage: [FONT_METRICS_EXTRA=metrics.json] build.py [--out DIR] [--cache DIR] [--groups metric,school] [--update-hashes]
Groups: "metric" = substitutes for Microsoft and school fonts that cannot be shipped;
        "school" = free school fonts installed as such (Andika, OpenDyslexic, Comic Neue).
Needs: python3 + fontTools (pip install fonttools).
"""
import argparse, hashlib, io, json, os, shutil, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def fetch(url, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, hashlib.sha1(url.encode()).hexdigest() + "-" + os.path.basename(url).replace("%5B", "[").replace("%5D", "]"))
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": "elixiroffice-fonts"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
        except Exception as e:
            sys.exit(f"download failed: {url}: {e}")
        with open(path + ".part", "wb") as f:
            f.write(data)
        os.replace(path + ".part", path)
    with open(path, "rb") as f:
        return f.read()


def member(data, inner):
    if not inner:
        return data
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return z.read(inner)


def set_names(font, family, style, version_note):
    """Rename a modified font (OFL 1.1 condition 3 / FAQ: modified versions get a new name)."""
    from fontTools.ttLib.tables._n_a_m_e import NameRecord  # noqa: F401
    name = font["name"]
    full = family if style == "Regular" else f"{family} {style}"
    ps = (family.replace(" ", "") + "-" + style.replace(" ", ""))
    rib = style if style in ("Regular", "Bold", "Italic", "Bold Italic") else "Regular"
    for rec in list(name.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(rib, 2, 3, 1, 0x409)
    name.setName(f"{ps};ElixirOffice-metric", 3, 3, 1, 0x409)
    name.setName(full, 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    old = name.getDebugName(5) or ""
    name.setName(f"{old}; {version_note}", 5, 3, 1, 0x409)
    if "fvar" in font:
        del font["fvar"]
    if "STAT" in font:
        del font["STAT"]
    # style bits used by Windows to group the 4 faces of a family
    os2 = font["OS/2"]; head = font["head"]
    bold = "Bold" in style; italic = "Italic" in style
    os2.fsSelection &= ~(0x01 | 0x20 | 0x40)
    os2.fsSelection |= (0x20 if bold else 0) | (0x01 if italic else 0) | (0x40 if not (bold or italic) else 0)
    head.macStyle = (1 if bold else 0) | (2 if italic else 0)
    os2.usWeightClass = 700 if bold else 400


def copy_vmetrics(font, ref):
    """Copy vertical metrics (OS/2 win + typo, hhea) of the reference font, scaled to this upm."""
    upm = font["head"].unitsPerEm
    k = upm / ref["upm"]
    os2 = font["OS/2"]; hh = font["hhea"]
    os2.usWinAscent = round(ref["winA"] * k); os2.usWinDescent = round(ref["winD"] * k)
    os2.sTypoAscender = round(ref["tA"] * k); os2.sTypoDescender = round(ref["tD"] * k); os2.sTypoLineGap = round(ref["tG"] * k)
    hh.ascent = round(ref["hA"] * k); hh.descent = round(ref["hD"] * k); hh.lineGap = round(ref["hG"] * k)
    # USE_TYPO_METRICS must match the reference behaviour (bit 7)
    os2.fsSelection = (os2.fsSelection & ~0x80) | (ref["fsSel"] & 0x80)


def _empty_program():
    from fontTools.ttLib.tables import ttProgram
    p = ttProgram.Program()
    p.fromBytecode(b"")
    return p


def _flatten(glyf, name):
    """Glyph "name" as a simple glyph (components resolved), or an empty simple glyph."""
    from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
    g = glyf[name]
    if g.isComposite():
        coords, ends, flags = g.getCoordinates(glyf)
        g = Glyph()
        g.numberOfContours = len(ends)
        g.coordinates = GlyphCoordinates(coords)
        g.endPtsOfContours = list(ends)
        g.flags = bytearray(flags)
        g.program = _empty_program()
    elif g.numberOfContours == 0:
        g = Glyph()
        g.numberOfContours = 0
        g.coordinates = GlyphCoordinates()
        g.endPtsOfContours = []
        g.flags = bytearray()
        g.program = _empty_program()
    return g


def scale_outlines(font, xs, ys):
    """Scale the TrueType outlines and advance widths (xs, ys), so that a free cursive font gets the
    widths and x-height of the font it stands in for. Composite glyphs are flattened first. GPOS/GDEF
    (kerning, mark anchors) are dropped: their values would need the same scaling and the precomposed
    glyphs of the font cover French; GSUB (joining alternates) is kept."""
    glyf = font["glyf"]; hmtx = font["hmtx"]
    flat = {name: _flatten(glyf, name) for name in font.getGlyphOrder()}  # before any glyph is modified
    for name, g in flat.items():
        if g.numberOfContours > 0:
            g.coordinates.scale((xs, ys))
            g.coordinates.toInt()
        g.program = _empty_program()
        glyf.glyphs[name] = g
        hmtx[name] = (round(hmtx[name][0] * xs), 0)
    for tag in ("GPOS", "GDEF", "hdmx", "LTSH", "VDMX", "cvt ", "fpgm", "prep", "gasp"):
        if tag in font:
            del font[tag]
    _fix_bounds(font)


def _fix_bounds(font):
    glyf = font["glyf"]; hmtx = font["hmtx"]
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.numberOfContours > 0:
            g.recalcBounds(glyf)
            hmtx[name] = (hmtx[name][0], g.xMin)
        else:
            hmtx[name] = (hmtx[name][0], 0)


def add_ruled_lines(font, rules):
    """Seyes-style ruled lines drawn in every glyph (as the school fonts "...et Lignes" do): horizontal
    bars spanning the advance plus an overlap, so that the lines of adjacent glyphs join. rules =
    {"bars": [[bottom, top], ...] in 1/upm units of the *reference* font, "upm": reference upm, "overlap": n}."""
    from fontTools.ttLib.tables._g_l_y_f import GlyphCoordinates
    glyf = font["glyf"]; hmtx = font["hmtx"]
    k = font["head"].unitsPerEm / rules["upm"]
    ov = round(rules.get("overlap", 20) * k)
    flat = {name: _flatten(glyf, name) for name in font.getGlyphOrder()}  # before any glyph is modified
    for name, g in flat.items():
        adv, _ = hmtx[name]
        if adv <= 0 or name == ".notdef":
            continue
        pts = list(g.coordinates); ends = list(g.endPtsOfContours); flags = bytearray(g.flags)
        for lo, hi in rules["bars"]:
            lo, hi = round(lo * k), round(hi * k)
            # clockwise outer contour (TrueType outer contours run clockwise)
            pts += [(-ov, lo), (-ov, hi), (adv + ov, hi), (adv + ov, lo)]
            flags += bytearray([1] * 4)
            ends.append(len(pts) - 1)
        g.numberOfContours = len(ends)
        g.coordinates = GlyphCoordinates(pts)
        g.endPtsOfContours = ends
        g.flags = flags
        g.program = _empty_program()
        glyf.glyphs[name] = g
    _fix_bounds(font)


def merge_symbols(parts, codes):
    """Subset each part to the wanted code points (first part wins) and merge them."""
    from fontTools import subset
    from fontTools.merge import Merger
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    bufs, done = [], set()
    for data, inst in parts:
        f = TTFont(io.BytesIO(data), recalcTimestamp=False)
        if inst and "fvar" in f:
            f = instancer.instantiateVariableFont(f, inst)
        keep = sorted((codes - done) & set(f.getBestCmap()))
        o = subset.Options()
        o.layout_features = []
        o.hinting = False
        o.notdef_outline = True
        o.name_IDs = ["*"]
        o.drop_tables += ["GSUB", "GPOS", "GDEF", "STAT", "fvar", "gvar", "avar", "HVAR", "MVAR", "COLR", "CPAL",
                          "DSIG", "fpgm", "cvt ", "prep", "vmtx", "vhea", "hdmx", "LTSH", "VDMX", "gasp"]
        s = subset.Subsetter(o)
        s.populate(unicodes=keep)
        s.subset(f)
        os2 = f["OS/2"]
        for a in ("usLowerOpticalPointSize", "usUpperOpticalPointSize"):
            if hasattr(os2, a):
                delattr(os2, a)
        os2.version = 4
        f["post"].formatType = 2.0
        b = io.BytesIO(); f.save(b); b.seek(0)
        bufs.append(b); done |= set(keep)
    merged = Merger().merge(bufs)
    merged.recalcTimestamp = False
    merged["head"].created = merged["head"].modified = TTFont(bufs[0], recalcTimestamp=False)["head"].modified
    return merged, len(done)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.environ.get("FONTS_OUT", os.path.join(HERE, "out")))
    ap.add_argument("--cache", default=os.environ.get("FONTS_CACHE", os.path.expanduser("~/.cache/elixiroffice-fonts")))
    ap.add_argument("--groups", default=os.environ.get("FONT_GROUPS", "metric,school"))
    ap.add_argument("--update-hashes", action="store_true", help="record sha256 of new downloads in sources.json")
    a = ap.parse_args()
    spec_path = os.path.join(HERE, "sources.json")
    spec = json.load(open(spec_path))
    refm = json.load(open(os.path.join(HERE, "reference-metrics.json")))
    # Metrics that cannot be published (measured on private references) are merged from FONT_METRICS_EXTRA;
    # a derived family whose reference metrics are unknown is skipped.
    # School-font metrics (pure numbers: line heights, scales, ruling geometry) are published, with Gaël's OK (2026-10-07).
    _school = os.path.join(os.path.dirname(os.path.abspath(__file__)), "metrics-school.json")
    if os.path.exists(_school):
        refm.update(json.load(open(_school)))
    if os.environ.get("FONT_METRICS_EXTRA"):
        refm.update(json.load(open(os.environ["FONT_METRICS_EXTRA"])))
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    if os.path.isdir(a.out):
        shutil.rmtree(a.out)
    os.makedirs(a.out)
    bad = 0
    groups = set(a.groups.split(","))
    for fam in spec["families"]:
        if fam.get("group", "metric") not in groups:
            continue
        missing = [f["derive"][k] for f in fam["files"] for k in ("vmetrics", "ruled") if f.get("derive", {}).get(k) and f["derive"][k] not in refm]
        if missing:
            print(f"skip {fam['family']}: no reference metrics for {', '.join(sorted(set(missing)))} (FONT_METRICS_EXTRA)", file=sys.stderr)
            continue
        d = os.path.join(a.out, fam["dir"])
        os.makedirs(d, exist_ok=True)
        for f in fam["files"]:
            raw = fetch(f["url"], a.cache)
            h = sha256(raw)
            if f.get("sha256") and f["sha256"] != h:
                print(f"SHA256 MISMATCH {f['url']}: {h}", file=sys.stderr); bad += 1; continue
            if not f.get("sha256"):
                if a.update_hashes:
                    f["sha256"] = h
                else:
                    print(f"no sha256 pinned for {f['url']} (run --update-hashes)", file=sys.stderr); bad += 1; continue
            data = member(raw, f.get("member"))
            if f.get("member_sha256") and f["member_sha256"] != sha256(data):
                print(f"SHA256 MISMATCH {f['name']} (archive member): {sha256(data)}", file=sys.stderr); bad += 1; continue
            out = os.path.join(d, f["name"])
            derive = f.get("derive")
            if not derive:
                open(out, "wb").write(data)
                continue
            if derive.get("merge"):
                tables = json.load(open(os.path.join(HERE, derive["merge"]["codes_from"])))
                codes = set()
                for key in derive["merge"]["tables"]:
                    codes |= {int(p.split(":")[1], 16) for p in tables[key].split()}
                parts = [(data, f.get("instance"))]
                for extra in derive["merge"]["with"]:
                    xr = fetch(extra["url"], a.cache)
                    if extra.get("sha256") != sha256(xr):
                        if a.update_hashes and not extra.get("sha256"):
                            extra["sha256"] = sha256(xr)
                        else:
                            print(f"SHA256 MISMATCH {extra['url']}", file=sys.stderr); bad += 1; continue
                    parts.append((xr, extra.get("instance")))
                font, n = merge_symbols(parts, codes)
                print(f"   merged {n} code points into {f['name']}")
            else:
                font = TTFont(io.BytesIO(data), recalcTimestamp=False)
            if derive.get("instance"):
                font = instancer.instantiateVariableFont(font, derive["instance"])
            if derive.get("vmetrics") and ("xscale" in refm[derive["vmetrics"]] or "yscale" in refm[derive["vmetrics"]]):
                r = refm[derive["vmetrics"]]
                scale_outlines(font, r.get("xscale", 1.0), r.get("yscale", 1.0))
            if derive.get("ruled"):
                add_ruled_lines(font, refm[derive["ruled"]]["rules"])
            if derive.get("vmetrics"):
                copy_vmetrics(font, refm[derive["vmetrics"]])
            set_names(font, fam["family"], derive["style"], spec["derivative_note"])
            font.save(out)
        lic = fetch(fam["license_url"], a.cache)
        open(os.path.join(d, fam.get("license_name", "LICENSE.txt")), "wb").write(member(lic, fam.get("license_member")))
        print(f"ok {fam['family']}: {len(fam['files'])} file(s) -> {d}")
    if a.update_hashes:
        json.dump(spec, open(spec_path, "w"), indent=1, ensure_ascii=False)
        open(spec_path, "a").write("\n")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
