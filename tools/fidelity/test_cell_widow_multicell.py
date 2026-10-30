# SPDX-License-Identifier: AGPL-3.0-only
"""Independent source assertions for the shared-row reference cohort."""
import importlib.util
import itertools
import hashlib
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
class MultiCellSources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec=importlib.util.spec_from_file_location("cell_widow_multicell",HERE/"cell_widow_multicell.py")
        cls.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.module)
        cls.tmp=tempfile.TemporaryDirectory();cls.root=Path(cls.tmp.name)
        cls.rows=cls.module.generate(cls.root/"a")
    @classmethod
    def tearDownClass(cls):
        print("CLEANUP_BEFORE "+json.dumps({"exactInactiveRoot":str(cls.root),"allocatedBytes":cls.root.stat().st_blocks*512+sum(x.lstat().st_blocks*512 for x in cls.root.rglob("*")),"freeBytes":shutil.disk_usage(cls.root).free}),flush=True)
        parent=cls.root.parent;cls.tmp.cleanup()
        print("CLEANUP_AFTER "+json.dumps({"removed":not cls.root.exists(),"freeBytes":shutil.disk_usage(parent).free}),flush=True)
    def load(self,r):
        q=self.root/"a"/r["file"]
        self.assertEqual(hashlib.sha256(q.read_bytes()).hexdigest(),r["sha256"])
        with zipfile.ZipFile(q) as z:
            self.assertIsNone(z.testzip());self.assertEqual(len(z.namelist()),6)
            for n in z.namelist():
                doc=ET.fromstring(z.read(n))
                if n.endswith(".rels"):self.assertFalse(any(v.get("TargetMode")=="External" for v in doc))
            return ET.fromstring(z.read("word/document.xml"))
    def test_complete_eight_case_factorial(self):
        self.assertEqual(len(self.rows),8)
        self.assertEqual({(r["height"],r["widow"],r["hideMark"]) for r in self.rows},set(itertools.product([410,650],[False,True],[False,True])))
    def test_five_shared_rows_sdt_per_cell_one_span(self):
        for r in self.rows:
            d=self.load(r);self.assertEqual(len(d.findall(".//w:tbl",NS)),1)
            rows=d.findall(".//w:tbl/w:tr",NS);self.assertEqual([len(x.findall("w:tc",NS)) for x in rows],[2,3,3,3,3])
            self.assertEqual(len(d.findall(".//w:sdt",NS)),14)
            spans=d.findall(".//w:gridSpan",NS);self.assertEqual(len(spans),1);self.assertEqual(spans[0].get("{"+W+"}val"),"2")
            for cell in d.findall(".//w:tc",NS):
                self.assertIsNotNone(cell.find("w:sdt/w:sdtContent/w:p",NS));self.assertEqual(cell[-1].tag,"{"+W+"}p")
    def test_height_rule_omitted_and_cell_widths(self):
        for r in self.rows:
            d=self.load(r);heights=d.findall(".//w:trHeight",NS);self.assertEqual(len(heights),5)
            self.assertTrue(all(h.get("{"+W+"}val")==str(r["height"]) and h.get("{"+W+"}hRule") is None for h in heights))
            for row in d.findall(".//w:tr",NS):
                self.assertEqual(sum(int(c.find("w:tcPr/w:tcW",NS).get("{"+W+"}w")) for c in row.findall("w:tc",NS)),5760)
    def test_target_and_siblings_in_last_row(self):
        for r in self.rows:
            d=self.load(r);cells=d.findall(".//w:tr",NS)[-1].findall("w:tc",NS)
            for i,(cell,n) in enumerate(zip(cells,[4,2,1])):
                target=cell.find("w:sdt/w:sdtContent/w:p",NS)
                self.assertEqual(len(target.findall(".//w:br",NS)),n-1)
                expected=str(int(r["widow"] if i==0 else False))
                self.assertEqual(target.find("w:pPr/w:widowControl",NS).get("{"+W+"}val"),expected)
                self.assertEqual(cell.find("w:tcPr/w:hideMark",NS).get("{"+W+"}val"),str(int(r["hideMark"] if i==0 else True)))
    def test_boundary_intent_and_no_forced_page_breaks(self):
        for r in self.rows:
            d=self.load(r);fill=d.find("w:body/w:p",NS);spacing=fill.find("w:pPr/w:spacing",NS)
            used=(len(fill.findall(".//w:br",NS))+1)*int(spacing.get("{"+W+"}line"))+int(spacing.get("{"+W+"}after"))
            self.assertEqual(5760-used-4*r["height"],360)
            self.assertFalse(d.findall(".//w:cantSplit",NS));self.assertFalse(d.findall(".//w:tblpPr",NS));self.assertFalse(d.findall(".//w:pageBreakBefore",NS))
            self.assertTrue(all(b.get("{"+W+"}type") in (None,"textWrapping") for b in d.findall(".//w:br",NS)))
            for tag in ["keepNext","keepLines"]:self.assertTrue(all(x.get("{"+W+"}val")=="0" for x in d.findall(".//w:"+tag,NS)))
    def test_flag_pairs_change_only_intended_property(self):
        rows={(r["height"],r["widow"],r["hideMark"]):r for r in self.rows}
        for r in self.rows:
            for name,tag,index in [("widow","widowControl",1),("hideMark","hideMark",2)]:
                if r[name]:continue
                key=[r["height"],r["widow"],r["hideMark"]];key[index]=True
                a,b=self.load(r),self.load(rows[tuple(key)])
                ac,bc=a.findall(".//w:"+tag,NS),b.findall(".//w:"+tag,NS)
                changes=[(x,y) for x,y in zip(ac,bc) if x.attrib!=y.attrib]
                self.assertEqual(len(changes),1);changes[0][1].attrib=dict(changes[0][0].attrib)
                self.assertEqual(ET.tostring(a),ET.tostring(b))
    def test_determinism_no_overwrite_and_no_word_claim(self):
        other=self.module.generate(self.root/"b");self.assertEqual(self.rows,other)
        for r in self.rows:self.assertEqual((self.root/"a"/r["file"]).read_bytes(),(self.root/"b"/r["file"]).read_bytes())
        with self.assertRaises(FileExistsError):self.module.generate(self.root/"a")
        manifest=json.loads((self.root/"a/manifest.json").read_text())
        self.assertEqual(manifest["wordReferenceStatus"],"unverified: actual Word exports required")
if __name__=="__main__":unittest.main()
