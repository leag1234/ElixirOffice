# SPDX-License-Identifier: AGPL-3.0-only
"""Independent OOXML assertions for public boundary reference inputs."""
import hashlib
import importlib.util
import itertools
import json
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

W="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS={"w":W}
HERE=Path(__file__).resolve().parent

class BoundaryReferences(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location("cell_widow_controls", HERE/"cell_widow_controls.py")
        cls.module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)
        cls.temp=tempfile.TemporaryDirectory()
        cls.root=Path(cls.temp.name)
        cls.rows=cls.module.generate(cls.root/"a")
    @classmethod
    def tearDownClass(cls):
        allocation=cls.root.stat().st_blocks*512+sum(q.lstat().st_blocks*512 for q in cls.root.rglob("*"))
        print("CLEANUP_BEFORE "+json.dumps({"exactInactiveOwnedRoot":str(cls.root),
              "allocatedBytes":allocation,"freeBytes":shutil.disk_usage(cls.root).free}),flush=True)
        filesystem=cls.root.parent
        cls.temp.cleanup()
        print("CLEANUP_AFTER "+json.dumps({"removed":not cls.root.exists(),
              "freeBytes":shutil.disk_usage(filesystem).free,
              "note":"Global free delta may include other jobs."}),flush=True)
    def load(self,row):
        path=self.root/"a"/(row["id"]+".docx")
        with zipfile.ZipFile(path) as z:
            self.assertEqual(len(z.namelist()),6)
            self.assertIsNone(z.testzip())
            self.assertFalse(any("media/" in n or "docProps/" in n for n in z.namelist()))
            for n in z.namelist():
                doc=ET.fromstring(z.read(n))
                if n.endswith(".rels"):
                    self.assertFalse(any(x.get("TargetMode")=="External" for x in doc))
            return path,ET.fromstring(z.read("word/document.xml"))
    def test_complete_factorial_and_hashes(self):
        self.assertEqual(len(self.rows),24)
        self.assertEqual({(r["lines"],r["widow"],r["sdt"],r["hideMark"]) for r in self.rows},
                         set(itertools.product([2,3,4],[False,True],[False,True],[False,True])))
        for r in self.rows:
            path,_=self.load(r)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),r["sha256"])
    def test_one_splittable_inline_table_one_cell(self):
        for r in self.rows:
            _,d=self.load(r)
            self.assertEqual(len(d.findall(".//w:tbl",NS)),1)
            self.assertEqual(len(d.findall(".//w:tr",NS)),1)
            self.assertEqual(len(d.findall(".//w:tc",NS)),1)
            self.assertFalse(d.findall(".//w:cantSplit",NS))
            self.assertFalse(d.findall(".//w:tblpPr",NS))
            self.assertFalse(d.findall(".//w:trHeight",NS))
    def test_exact_target_line_count_and_container(self):
        for r in self.rows:
            _,d=self.load(r);cell=d.find(".//w:tc",NS)
            sdt=cell.find("w:sdt",NS)
            self.assertEqual(sdt is not None,r["sdt"])
            target=cell.find("w:sdt/w:sdtContent/w:p",NS) if r["sdt"] else cell.find("w:p",NS)
            self.assertEqual(len(target.findall(".//w:br",NS)),r["lines"]-1)
            self.assertEqual([x.text for x in target.findall(".//w:t",NS)],
                             ["TARGETLINE"+str(i) for i in range(1,r["lines"]+1)])
            self.assertEqual(target.find("w:pPr/w:widowControl",NS).get("{"+W+"}val"),str(int(r["widow"])))
            self.assertEqual(cell.find("w:tcPr/w:hideMark",NS).get("{"+W+"}val"),str(int(r["hideMark"])))
            self.assertEqual(cell[-1].tag,"{"+W+"}p")
            self.assertFalse(cell[-1].findall(".//w:t",NS))
    def test_no_forced_pagination_or_keep_lines(self):
        for r in self.rows:
            _,d=self.load(r)
            self.assertFalse(d.findall(".//w:pageBreakBefore",NS))
            self.assertFalse(d.findall(".//w:lastRenderedPageBreak",NS))
            self.assertTrue(all(b.get("{"+W+"}type") in (None,"textWrapping") for b in d.findall(".//w:br",NS)))
            for tag in ["keepNext","keepLines"]:
                self.assertTrue(all(n.get("{"+W+"}val")=="0" for n in d.findall(".//w:"+tag,NS)))
    def test_natural_boundary_budget(self):
        for r in self.rows:
            _,d=self.load(r)
            section=d.find("w:body/w:sectPr",NS)
            size=section.find("w:pgSz",NS);mar=section.find("w:pgMar",NS)
            height=int(size.get("{"+W+"}h"))-int(mar.get("{"+W+"}top"))-int(mar.get("{"+W+"}bottom"))
            fill=d.find("w:body/w:p",NS)
            fill_lines=len(fill.findall(".//w:br",NS))+1
            spacing=fill.find("w:pPr/w:spacing",NS)
            self.assertEqual(spacing.get("{"+W+"}lineRule"),"exact")
            line=int(spacing.get("{"+W+"}line"))
            self.assertEqual(fill_lines,18)
            self.assertEqual(height-fill_lines*line,360)
            self.assertLess(line,height-fill_lines*line)
            self.assertGreater(2*line,height-fill_lines*line)
    def test_font_and_explicit_line_spacing(self):
        for r in self.rows:
            _,d=self.load(r)
            for spacing in d.findall(".//w:pPr/w:spacing",NS):
                self.assertEqual(spacing.get("{"+W+"}lineRule"),"exact")
                self.assertEqual(spacing.get("{"+W+"}line"),"300")
            for font in d.findall(".//w:rFonts",NS):
                self.assertEqual(font.get("{"+W+"}ascii"),"Arial")
            for size in d.findall(".//w:sz",NS):
                self.assertEqual(size.get("{"+W+"}val"),"24")
    def test_widow_and_hide_pairs_change_only_the_requested_flag(self):
        lookup={(r["lines"],r["widow"],r["sdt"],r["hideMark"]):r for r in self.rows}
        for r in self.rows:
            for field,tag,index in [("widow","widowControl",1),("hideMark","hideMark",3)]:
                if r[field]:
                    continue
                key=[r["lines"],r["widow"],r["sdt"],r["hideMark"]]
                key[index]=True
                _,a=self.load(r);_,b=self.load(lookup[tuple(key)])
                changes=[n for n in b.findall(".//w:"+tag,NS) if n.get("{"+W+"}val")=="1"]
                self.assertEqual(len(changes),1)
                changes[0].set("{"+W+"}val","0")
                self.assertEqual(ET.tostring(a),ET.tostring(b))

    def test_deterministic_and_no_overwrite(self):
        other=self.module.generate(self.root/"b")
        self.assertEqual(self.rows,other)
        for r in self.rows:
            self.assertEqual((self.root/"a"/(r["id"]+".docx")).read_bytes(),
                             (self.root/"b"/(r["id"]+".docx")).read_bytes())
        with self.assertRaises(FileExistsError):
            self.module.generate(self.root/"a")
    def test_manifest_never_claims_word_geometry(self):
        m=json.loads((self.root/"a/manifest.json").read_text())
        self.assertEqual(m["wordReferenceStatus"],"unverified: actual Word exports required")
        self.assertEqual(m["origin"],"Original synthetic data; no input documents or external assets")
        self.assertEqual(m["cases"],self.rows)

if __name__=="__main__":
    unittest.main()
