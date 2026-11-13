#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""A VML WordArt watermark (v:textpath, PowerPlusWaterMarkObject) is drawn like Word draws it.

Reproducer: corpus/provisional/admin/a03-note-de-service.docx, header watermark "DOCUMENT DE TRAVAIL"
(Calibri, 481.9 x 90.7 pt, rotation:315, fillcolor #D9D9D9, centred on the margin box).

Reference: Word 16.0.20326 desktop (tools: reference-word-desktop) exports page 1 with the ink of the
text 477.4 pt long and 59.0 pt wide across, its centre at (293.5, 416.8) pt from the top left of the page.
Other references measured the same way (shape, ink along x across, gaps to the box as fractions):
  Calibri "DOCUMENT DE TRAVAIL" 481.9x90.7  477.4 x 59.0   top .110 bottom .2396  (rotation 0: top .0895 bottom .2601)
  Arial "PROJET"                497.4x142.1 485.2 x 105.3  top .1067 bottom .1526
  Arial Black "DEVIS"           425.2x141.7 410.9 x 104.9  top .0221 bottom .2376
  Times New Roman "CONFIDENTIEL" 450x100    446.4 x 69.2   top .1172 bottom .1904

The unit tests check the measurement on synthetic content streams. Set EO_WATERMARK_PDF to the PDF
the build under test makes of the reproducer (page 1) to compare it with Word:

  EO_WATERMARK_PDF=/path/a03.pdf python3 tests/fidelity/wordart-watermark.test.py
"""
import os
import pathlib
import sys
import unittest
import zlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "tools" / "fidelity"))
import watermark_geometry as wg  # noqa: E402

WORD = {"along": 477.4, "across": 59.0, "centre": (293.5, 416.8)}


def pdf_with(stream):
    body = zlib.compress(stream.encode("latin1"))
    head = b"%PDF-1.4\n1 0 obj\n<< /Length " + str(len(body)).encode() + b" /Filter /FlateDecode >>\nstream\n"
    return head + body + b"\nendstream\nendobj\n"


def rect_ops(x0, y0, x1, y1):
    return "%g %g m\n%g %g l\n%g %g l\n%g %g l\nh\nf\n" % (x0, y0, x1, y0, x1, y1, x0, y1)


class MeasureTest(unittest.TestCase):
    def test_flat_path_horizontal(self):
        # 100 x 20 rectangle at the top left, 0.851 gray, page height 842
        pdf = pdf_with("0.851 g\n" + rect_ops(10, 800, 110, 820))
        r = wg.ink_points(pdf, "0.851", 842)
        self.assertEqual(len(r), 4)
        m = wg.measure_points(r, 0)
        self.assertAlmostEqual(m["along"], 100, places=3)
        self.assertAlmostEqual(m["across"], 20, places=3)
        self.assertAlmostEqual(m["centre"][0], 60, places=3)
        self.assertAlmostEqual(m["centre"][1], 842 - 810, places=3)

    def test_cm_rotation_matches_flat_equivalent(self):
        # the same 100 x 20 box drawn under a 45 degree cm and a translation, as the converter writes it
        s = 2 ** -0.5
        pdf = pdf_with("q\n%g %g %g %g 300 200 cm\n0.851 g\n%s" % (s, s, -s, s, rect_ops(0, 0, 100, 20)) + "Q\n")
        pts = wg.ink_points(pdf, "0.851", 842)
        m = wg.measure_points(pts, 45)
        self.assertAlmostEqual(m["along"], 100, places=3)
        self.assertAlmostEqual(m["across"], 20, places=3)
        # box centre (50, 10) in the local frame
        self.assertAlmostEqual(m["centre"][0], s * 50 - s * 10 + 300, places=3)
        self.assertAlmostEqual(m["centre"][1], 842 - (s * 50 + s * 10 + 200), places=3)

    def test_other_colours_and_clip_paths_are_ignored(self):
        pdf = pdf_with("q\n0 0 100 100 re\nW n\n0.5 g\n" + rect_ops(0, 0, 500, 500) + "0.851 g\n" + rect_ops(10, 10, 20, 20) + "Q\n")
        self.assertEqual(len(wg.ink_points(pdf, "0.851", 842)), 4)


@unittest.skipUnless(os.environ.get("EO_WATERMARK_PDF"), "set EO_WATERMARK_PDF to the PDF of a03-note-de-service.docx")
class WordComparisonTest(unittest.TestCase):
    def test_watermark_matches_word(self):
        m = wg.measure(os.environ["EO_WATERMARK_PDF"], 45.0, "0.851")
        self.assertAlmostEqual(m["along"], WORD["along"], delta=4, msg="length of the text along the diagonal")
        self.assertAlmostEqual(m["across"], WORD["across"], delta=3, msg="height of the text")
        self.assertAlmostEqual(m["centre"][0], WORD["centre"][0], delta=4, msg="centre x")
        self.assertAlmostEqual(m["centre"][1], WORD["centre"][1], delta=4, msg="centre y")


if __name__ == "__main__":
    unittest.main()
