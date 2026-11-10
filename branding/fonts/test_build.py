#!/usr/bin/env python3
"""Unit tests of the glyph transformations of build.py (scale_outlines, add_ruled_lines) on a tiny
synthetic TrueType font (no download, no private data): python3 -m unittest branding/fonts/test_build.py
Needs fontTools."""
import io, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402
from fontTools.fontBuilder import FontBuilder  # noqa: E402
from fontTools.pens.ttGlyphPen import TTGlyphPen  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402


def synthetic_font():
    """upm 1000; .notdef, 'a' (box 100..400 x 0..500), 'agrave' (composite of 'a' + 'grave' offset), space."""
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder([".notdef", "space", "a", "grave", "agrave"])
    fb.setupCharacterMap({32: "space", 97: "a", 0xE0: "agrave"})

    def box(x0, y0, x1, y1):
        p = TTGlyphPen(None)
        p.moveTo((x0, y0)); p.lineTo((x0, y1)); p.lineTo((x1, y1)); p.lineTo((x1, y0)); p.closePath()
        return p.glyph()

    comp = TTGlyphPen({"a": None, "grave": None})
    comp.addComponent("a", (1, 0, 0, 1, 0, 0))
    comp.addComponent("grave", (1, 0, 0, 1, 200, 600))
    fb.setupGlyf({".notdef": box(0, 0, 500, 700), "space": TTGlyphPen(None).glyph(), "a": box(100, 0, 400, 500),
                  "grave": box(0, 0, 100, 100), "agrave": comp.glyph()})
    fb.setupHorizontalMetrics({".notdef": (500, 0), "space": (300, 0), "a": (500, 100), "grave": (100, 0), "agrave": (500, 100)})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Synthetic", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    b = io.BytesIO(); fb.save(b); b.seek(0)
    return TTFont(b)


def roundtrip(font):
    b = io.BytesIO(); font.save(b); b.seek(0)
    return TTFont(b)


class BuildTransforms(unittest.TestCase):
    def test_scale_outlines_scales_advances_and_flattens_composites(self):
        f = synthetic_font()
        build.scale_outlines(f, 0.5, 2.0)
        f = roundtrip(f)
        self.assertEqual(f["hmtx"]["a"][0], 250)
        self.assertEqual(f["hmtx"]["space"][0], 150)
        g = f["glyf"]["a"]
        self.assertEqual((g.xMin, g.yMin, g.xMax, g.yMax), (50, 0, 200, 1000))
        c = f["glyf"]["agrave"]
        self.assertFalse(c.isComposite(), "composites are flattened")
        self.assertEqual(c.numberOfContours, 2)
        self.assertEqual((c.xMin, c.yMin, c.xMax, c.yMax), (50, 0, 200, 1400))
        self.assertEqual(f["hmtx"]["a"][1], 50, "left side bearing follows the outline")

    def test_ruled_lines_are_drawn_in_every_advancing_glyph(self):
        f = synthetic_font()
        rules = {"upm": 1000, "overlap": 10, "bars": [[-20, -10], [0, 10], [500, 510]]}
        build.add_ruled_lines(f, rules)
        f = roundtrip(f)
        for name, adv in (("a", 500), ("space", 300), ("agrave", 500)):
            g = f["glyf"][name]
            self.assertEqual(g.xMin, -10 if name != "agrave" else -10, name)
            self.assertGreaterEqual(g.xMax, adv + 10, name)
            self.assertLessEqual(g.yMin, -20, name)
            bars = [c for c in _contours(g) if len(c) == 4 and (max(p[0] for p in c) - min(p[0] for p in c)) == adv + 20]
            self.assertEqual(len(bars), 3, name + ": three full-width bars")
        self.assertEqual(f["glyf"]["grave"].numberOfContours, 1 + 3, "grave has advance too")
        self.assertFalse(f["glyf"]["agrave"].isComposite(), "no composite keeps a bar-less component")

    def test_ruled_lines_follow_the_upm(self):
        f = synthetic_font()
        build.add_ruled_lines(f, {"upm": 500, "overlap": 5, "bars": [[0, 5]]})
        g = roundtrip(f)["glyf"]["a"]
        top = max(p[1] for c in _contours(g) for p in c)
        self.assertEqual(top, 500, "bar [0, 5] of a 500-unit font is [0, 10] here; glyph top stays 500")
        self.assertEqual(g.xMin, -10)


    def test_subset_unicodes_drops_other_scripts(self):
        f = synthetic_font()
        f["cmap"].tables[0].cmap[0x627] = "grave"   # an Arabic letter
        build.subset_unicodes(f, ["0000-024F"])
        cm = roundtrip(f).getBestCmap()
        self.assertIn(97, cm); self.assertIn(0xE0, cm)
        self.assertNotIn(0x627, cm)

    def test_tahoma_metric_keeps_only_covered_scripts(self):
        import json
        spec = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources.json")))
        fam = [x for x in spec["families"] if x["family"] == "Tahoma Metric"][0]
        for x in fam["files"]:
            ranges = [tuple(int(h, 16) for h in r.split("-")) for r in x["derive"]["keep_unicode"]]
            covered = lambda cp: any(lo <= cp <= hi for lo, hi in ranges)
            for cp in (0x41, 0xE9, 0x20AC, 0x3C0, 0x416, 0x2019):  # Latin, Latin-1, euro, Greek, Cyrillic, punctuation
                self.assertTrue(covered(cp), hex(cp))
            for cp in (0x627, 0x5D0, 0xE01, 0x645):  # Arabic, Hebrew, Thai
                self.assertFalse(covered(cp), hex(cp))
        out = os.environ.get("TAHOMA_METRIC_BUILT")  # optional: path of a built TahomaMetric-Regular.ttf
        if out and os.path.exists(out):
            cm = TTFont(out).getBestCmap()
            self.assertFalse([c for c in cm if 0x590 <= c <= 0x6FF or 0xFB50 <= c <= 0xFEFF or 0xE00 <= c <= 0xE7F])
            self.assertIn(0x41, cm); self.assertIn(0x416, cm); self.assertIn(0x3C0, cm)

    def test_note_modified_keeps_the_name(self):
        f = synthetic_font()
        build.note_modified(f, "metrics changed")
        f = roundtrip(f)
        self.assertEqual(f["name"].getDebugName(1), "Synthetic")
        self.assertIn("metrics changed", f["name"].getDebugName(5))

    def test_space_advance_follows_reference_and_scales_with_upm(self):
        f = synthetic_font()
        build.set_space_advance(f, {"upm": 2000, "space": 700})
        f = roundtrip(f)
        self.assertEqual(f["hmtx"]["space"][0], 350, "700/2000 em on a 1000-unit font")
        self.assertEqual(f["hmtx"]["a"][0], 500, "other advances untouched")
        self.assertEqual(f["glyf"]["a"].xMax, 400)
        g = synthetic_font()
        build.set_space_advance(g, {"upm": 1000, "winA": 1})
        self.assertEqual(g["hmtx"]["space"][0], 300, "no 'space' key: nothing changes")


class SourcesPinning(unittest.TestCase):
    """sources.json: every file is pinned (https URL + SHA-256); Marelle is shipped unmodified by default."""

    @classmethod
    def setUpClass(cls):
        import json
        cls.spec = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources.json")))
        cls.fams = {f["family"]: f for f in cls.spec["families"]}

    def test_every_file_is_pinned(self):
        for fam in self.spec["families"]:
            self.assertTrue(fam["license_url"].startswith("https://"), fam["family"])
            for f in fam["files"]:
                self.assertTrue(f["url"].startswith("https://"), f["name"])
                self.assertRegex(f.get("sha256", ""), r"^[0-9a-f]{64}$", f["name"])

    def test_verdana_tahoma_noto_entries(self):
        import json
        refm = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference-metrics.json")))
        for fam, names in (("Verdana Metric", ["Regular", "Bold", "Italic", "Bold Italic"]), ("Tahoma Metric", ["Regular", "Bold"])):
            f = self.fams[fam]
            self.assertEqual([x["derive"]["style"] for x in f["files"]], names)
            for x in f["files"]:
                r = refm[x["derive"]["vmetrics"]]
                self.assertEqual(r["upm"], 2048)
                self.assertGreater(r["space"], 0)
                self.assertGreater(r["winA"], r["tA"], x["name"])
        self.assertEqual(self.fams["Tahoma Metric"]["license"].split()[0], "LGPL-2.1-or-later")
        for x in self.fams["Verdana Metric"]["files"]:
            self.assertRegex(x["member_sha256"], r"^[0-9a-f]{64}$")
        noto = self.fams["Noto Sans"]
        self.assertEqual(noto["license"], "OFL-1.1")
        for x in noto["files"]:
            self.assertTrue(x["derive"]["keep_name"], "no Reserved Font Name: the name stays")
            self.assertIn(x["derive"]["vmetrics"], refm)
        self.assertEqual(sorted(x["name"] for x in noto["files"]), ["NotoSans-Bold.ttf", "NotoSans-BoldItalic.ttf", "NotoSans-Italic.ttf", "NotoSans-Regular.ttf"])

    def test_ubuntu_families_unmodified_ufl(self):
        for name, prefix in (("Ubuntu", "Ubuntu"), ("Ubuntu Mono", "UbuntuMono")):
            fam = self.fams[name]
            self.assertTrue(fam["license"].startswith("UFL-1.0"))
            self.assertEqual(fam["license_member"], "ubuntu-font-family-0.83/LICENCE.txt", "UFL text shipped with the fonts")
            self.assertRegex(fam["files"][0]["url"], r"ubuntu-font-family-0\.83\.zip$")
            self.assertEqual(sorted(f["name"] for f in fam["files"]),
                             sorted("%s-%s.ttf" % (prefix, s) for s in ("Regular", "Bold", "Italic", "BoldItalic")))
            for f in fam["files"]:
                self.assertNotIn("derive", f, "UFL: unmodified copies may keep the reserved name, modified ones may not")
                self.assertRegex(f["member_sha256"], r"^[0-9a-f]{64}$", f["name"])
                self.assertTrue(f["member"].startswith("ubuntu-font-family-0.83/" + prefix + "-"))

    def test_marelle_variants_pinned_unmodified_ofl(self):
        fam = self.fams["Marelle"]
        self.assertEqual(fam["group"], "metric", "installed by default")
        self.assertTrue(fam["license"].startswith("OFL-1.1"))
        self.assertIn("RFN Marelle", fam["license"])
        self.assertEqual(fam["license_member"], "LICENSE", "OFL text shipped with the fonts")
        self.assertRegex(fam["files"][0]["url"], r"/packages/generic/marelle/v\d+\.\d+/marelle-ttf\.zip$")
        self.assertEqual(sorted(f["name"] for f in fam["files"]), sorted([
            "Marelle-Regular.ttf", "Marelle2-Regular.ttf", "MarelleBaton-Regular.ttf", "MarelleBaton2-Regular.ttf",
            "MarelleLIGNES-Regular.otf", "MarelleLIGNES2-Regular.otf", "MarelleLIGNESBaton-Regular.otf",
            "MarelleLIGNESBaton2-Regular.otf"]))
        for f in fam["files"]:
            self.assertNotIn("derive", f, "Reserved Font Name: must be shipped unmodified")
            self.assertEqual(f["member"], f["name"])
            self.assertRegex(f["member_sha256"], r"^[0-9a-f]{64}$", f["name"])


def _contours(g):
    out, s = [], 0
    for e in g.endPtsOfContours:
        out.append(list(g.coordinates[s:e + 1])); s = e + 1
    return out


if __name__ == "__main__":
    unittest.main()
