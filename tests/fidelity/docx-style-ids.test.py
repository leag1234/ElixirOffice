#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""The style ids of a DOCX survive open and save (w:styleId and every reference to it).

Before the fix the editor wrote its generated ids ("725") instead of the ids of the file ("Titre1"),
and every w:pStyle / w:rStyle / w:tblStyle / w:numStyleLink / w:basedOn / w:next / w:link changed with them.

The unit tests build small DOCX files and check the comparison itself. To check a real round trip give
the folder of the original files and the folder of the files saved by the build under test (same file
names; tools/fidelity/docx-roundtrip-sdk.sh makes them):

  EO_STYLEIDS_BEFORE=corpus/provisional/admin EO_STYLEIDS_AFTER=/tmp/saved python3 tests/fidelity/docx-style-ids.test.py
"""
import os
import pathlib
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "tools" / "fidelity"))
import docx_style_ids as sid  # noqa: E402

STYLES = """<w:styles xmlns:w="w"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:link w:val="Titre1Car"/></w:style>
<w:style w:type="character" w:styleId="Titre1Car"><w:name w:val="Titre 1 Car"/><w:link w:val="Titre1"/></w:style>
<w:style w:type="table" w:styleId="TableauGrille"><w:name w:val="Table Grid"/></w:style></w:styles>"""
DOC = '<w:document xmlns:w="w"><w:body><w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Titre1Car"/></w:rPr></w:r></w:p><w:tbl><w:tblPr><w:tblStyle w:val="TableauGrille"/></w:tblPr></w:tbl></w:body></w:document>'


def make(path, styles=STYLES, doc=DOC, extra=None):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("word/styles.xml", styles)
        z.writestr("word/document.xml", doc)
        for name, body in (extra or {}).items():
            z.writestr(name, body)


class CompareTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.a = os.path.join(self.dir.name, "a.docx")
        self.b = os.path.join(self.dir.name, "b.docx")
        make(self.a)

    def tearDown(self):
        self.dir.cleanup()

    def test_same_file(self):
        make(self.b)
        self.assertEqual(sid.compare(self.a, self.b), [])

    def test_generated_ids_are_reported(self):
        # what the editor used to write: numeric ids everywhere
        styles = STYLES.replace("Titre1Car", "725").replace("Titre1", "724").replace("TableauGrille", "13")
        doc = DOC.replace("Titre1Car", "725").replace("Titre1", "724").replace("TableauGrille", "13")
        make(self.b, styles, doc)
        diffs = sid.compare(self.a, self.b)
        self.assertTrue(any("style id lost: Titre1" in d for d in diffs), diffs)
        self.assertTrue(any("document.xml: pStyle=Titre1 no longer used" in d for d in diffs), diffs)

    def test_changed_reference_only(self):
        make(self.b, STYLES, DOC.replace('pStyle w:val="Titre1"', 'pStyle w:val="Normal"'))
        diffs = sid.compare(self.a, self.b)
        self.assertEqual(len(diffs), 2, diffs)  # pStyle=Titre1 no longer used, pStyle=Normal is new

    def test_how_often_a_style_is_used_may_change(self):
        make(self.b, STYLES, DOC.replace("<w:r>", "<w:r><w:rPr><w:rStyle w:val=\"Titre1Car\"/></w:rPr></w:r><w:r>", 1))
        self.assertEqual(sid.compare(self.a, self.b), [])

    def test_header_may_get_a_default_style_but_must_refer_to_an_existing_one(self):
        hdr = '<w:hdr xmlns:w="w"><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p></w:hdr>'
        make(self.b, extra={"word/header1.xml": hdr})
        self.assertEqual(sid.compare(self.a, self.b), [])
        make(self.b, extra={"word/header1.xml": hdr.replace("Normal", "Ghost")})
        self.assertTrue(any("does not exist: Ghost" in d for d in sid.compare(self.a, self.b)))


@unittest.skipUnless(os.environ.get("EO_STYLEIDS_BEFORE") and os.environ.get("EO_STYLEIDS_AFTER"),
                     "set EO_STYLEIDS_BEFORE and EO_STYLEIDS_AFTER to two folders of DOCX files")
class RoundTripTest(unittest.TestCase):
    def test_every_file_keeps_its_style_ids(self):
        before, after = pathlib.Path(os.environ["EO_STYLEIDS_BEFORE"]), pathlib.Path(os.environ["EO_STYLEIDS_AFTER"])
        files = sorted(p.name for p in before.rglob("*.docx") if (after / p.name).exists())
        self.assertTrue(files, "no file with the same name in both folders")
        for name in files:
            src = next(before.rglob(name))
            with self.subTest(name):
                self.assertEqual(sid.compare(str(src), str(after / name)), [])


if __name__ == "__main__":
    unittest.main()
