# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

SPEC = importlib.util.spec_from_file_location("floating_tables", Path(__file__).with_name("floating_tables.py"))
F = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(F)
NS = {"w": F.W}
W = "{" + F.W + "}"

class FloatingCorpus(unittest.TestCase):
    def test_packages_are_deterministic_and_relationships_resolve(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            first, second = F.generate(Path(a)), F.generate(Path(b))
            self.assertEqual(first, second)
            for row in first:
                name = row["id"] + ".docx"
                self.assertEqual((Path(a) / name).read_bytes(), (Path(b) / name).read_bytes())
                with zipfile.ZipFile(Path(a) / name) as package:
                    for part in package.namelist():
                        ET.fromstring(package.read(part))
                    rels = ET.fromstring(package.read("word/_rels/document.xml.rels"))
                    for rel in rels:
                        self.assertIn("word/" + rel.get("Target"), package.namelist())

    def test_every_comparison_changes_one_parameter_and_marks_word_unverified(self):
        rows = F.configurations()
        by_id = {r["id"]: r for r in rows}
        self.assertEqual(len(rows), 22)
        for row in rows:
            if row["parent"]:
                parent = by_id[row["parent"]]["config"]
                delta = [k for k in row["config"] if row["config"][k] != parent[k]]
                self.assertEqual(delta, list(row["change"]), row["id"])
                self.assertEqual(len(delta), 1)
        with tempfile.TemporaryDirectory() as out:
            F.generate(Path(out))
            manifest = json.loads((Path(out) / "manifest.json").read_text())
            self.assertTrue(all(r["wordResult"].startswith("unverified") for r in manifest["cases"]))

    def test_base_has_decisive_structure_and_explicit_public_font(self):
        parts = F.parts(F.BASE)
        document = ET.fromstring(parts["word/document.xml"])
        self.assertEqual(len(document.findall(".//w:tbl", NS)), 2)
        self.assertEqual(len(document.findall(".//w:tblpPr", NS)), 1)
        self.assertEqual(document.find(".//w:pgSz", NS).get(W + "orient"), "landscape")
        self.assertEqual(document.find(".//w:tblpPr", NS).get(W + "vertAnchor"), "text")
        self.assertEqual(len(document.findall(".//w:trHeight[@w:hRule='atLeast']", NS)), 5)
        for tc in document.findall(".//w:tc", NS):
            self.assertEqual(tc[-1].tag, W + "p", "Every cell needs its terminal paragraph")
        settings = ET.fromstring(parts["word/settings.xml"])
        self.assertEqual(settings.find(".//w:compatSetting", NS).get(W + "val"), "15")
        self.assertEqual({f.get(W + "ascii") for f in document.findall(".//w:rFonts", NS)}, {"Arial"})

    def test_paragraph_break_precedes_spacing_in_schema_order(self):
        paragraph = F.paragraph("Public marker", page_break=True)
        props = paragraph.find("w:pPr", NS)
        self.assertEqual([p.tag for p in props], [W + "pageBreakBefore", W + "spacing", W + "rPr"])

    def test_spacing_pair_changes_only_anchor_attribute(self):
        configs = {r["id"]: r["config"] for r in F.configurations()}
        base, variant = F.parts(configs["f00-base"]), F.parts(configs["f08-anchor-after"])
        for part in base:
            if part != "word/document.xml":
                self.assertEqual(base[part], variant[part])
        old, new = ET.fromstring(base["word/document.xml"]), ET.fromstring(variant["word/document.xml"])
        spacing = new.find("./w:body/w:p/w:pPr/w:spacing", NS)
        self.assertEqual(spacing.get(W + "after"), "160")
        spacing.set(W + "after", "0")
        self.assertEqual(ET.tostring(old), ET.tostring(new))

    def test_wrapped_table_compatibility_pair_changes_settings_only(self):
        configs = {r["id"]: r["config"] for r in F.configurations()}
        base, variant = F.parts(configs["f02-spill"]), F.parts(configs["f15-no-break-wrapped"])
        for part in base:
            if part != "word/settings.xml":
                self.assertEqual(base[part], variant[part])
        settings = ET.fromstring(variant["word/settings.xml"])
        flag = settings.find(".//w:doNotBreakWrappedTables", NS)
        self.assertEqual(flag.get(W + "val"), "1")
        settings.find("w:compat", NS).remove(flag)
        self.assertEqual(ET.tostring(settings), ET.tostring(ET.fromstring(base["word/settings.xml"])))

if __name__ == "__main__":
    unittest.main()
