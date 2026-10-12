#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
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
