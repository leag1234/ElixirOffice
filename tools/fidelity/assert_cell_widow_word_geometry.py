# SPDX-License-Identifier: AGPL-3.0-only
"""Actual exported-PDF allocation assertions against independently bound Word23."""
import hashlib
import json
import math
import os
import unittest
from pathlib import Path
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar,LTTextLine
from pypdf import PdfReader
RESULTS=Path(os.environ["EO_CW_RESULTS"])
WORD=Path(os.environ["EO_CW_WORD_PROOF"])
OBSERVATIONS=Path(os.environ["EO_CW_OBSERVATIONS"])
proof=json.loads(WORD.read_text())
assert proof["observedPDFs"]==23
def walk(node):
    yield node
    if hasattr(node,"__iter__"):
        for child in node:yield from walk(child)
observed=[]
for row in proof["documents"]:
    root=RESULTS/row["id"]
    result=json.loads((root/"result.json").read_text())
    assert result["status"]=="compared",row["caseLabel"]
    pdf=root/"render/candidate.pdf"
    assert hashlib.sha256(pdf.read_bytes()).hexdigest()==result["artifacts"]["render/candidate.pdf"]
    reader=PdfReader(str(pdf));wanted={m["label"] for m in row["markers"]};markers=[]
    for page,layout in enumerate(extract_pages(str(pdf)),1):
        for line in walk(layout):
            if not isinstance(line,LTTextLine):continue
            chars=[c for c in walk(line) if isinstance(c,LTChar)]
            label="".join("".join(c.get_text() for c in chars).split())
            if label not in wanted:continue
            height=float(reader.pages[page-1].mediabox.height)
            baselines=[height-float(c.matrix[5]) for c in chars]
            assert all(math.isfinite(v) for v in baselines) and max(baselines)-min(baselines)<.1
            markers.append({"label":label,"page":page,"baselineFromTopPt":sum(baselines)/len(baselines)})
    assert sorted(m["label"] for m in markers)==sorted(wanted)
    observed.append({"id":row["id"],"caseLabel":row["caseLabel"],"case":row["case"],
                     "pages":len(reader.pages),"markers":markers,"wordMarkers":row["markers"]})
OBSERVATIONS.write_text(json.dumps({"scope":"Actual baseline native export allocations, not a model override","documents":observed,
    "missing":proof["missing"]},indent=2)+"\n")
class WordCellAllocations(unittest.TestCase):
    pass
def case(row):
    def check(self):
        actual={m["label"]:m["page"] for m in row["markers"]}
        expected={m["label"]:m["page"] for m in row["wordMarkers"]}
        self.assertEqual(row["pages"],2)
        self.assertEqual(actual,expected,"Actual target and AFTERTABLE pages must match this observed Word reference")
    return check
for row in observed:
    setattr(WordCellAllocations,"test_"+row["caseLabel"].replace("-","_"),case(row))
if __name__=="__main__":unittest.main()
