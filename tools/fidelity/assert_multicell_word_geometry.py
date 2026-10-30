# SPDX-License-Identifier: AGPL-3.0-only
"""Assert actual shared-row allocations against independently observed Word PDFs."""
import hashlib
import json
import math
import os
import unittest
from pathlib import Path
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar,LTTextLine
from pypdf import PdfReader

RESULTS=Path(os.environ["EO_MC_RESULTS"])
WORD=Path(os.environ["EO_MC_WORD_PROOF"])
OBSERVATIONS=Path(os.environ["EO_MC_OBSERVATIONS"])
proof=json.loads(WORD.read_text())
assert proof["files"]==8 and proof["markers"]==152
assert proof["allDOriginsEqualWithin1eMinus8"]
def walk(node):
    yield node
    if hasattr(node,"__iter__"):
        for child in node:
            yield from walk(child)
observed=[]
for row in proof["documents"]:
    root=RESULTS/row["id"]
    result=json.loads((root/"result.json").read_text())
    assert result["status"]=="compared",row["id"]
    pdf=root/"render/candidate.pdf"
    assert hashlib.sha256(pdf.read_bytes()).hexdigest()==result["artifacts"]["render/candidate.pdf"]
    reader=PdfReader(str(pdf))
    wanted={m["label"] for m in row["markers"]}
    markers=[]
    for page,layout in enumerate(extract_pages(str(pdf)),1):
        for line in walk(layout):
            if not isinstance(line,LTTextLine):
                continue
            chars=[c for c in walk(line) if isinstance(c,LTChar) and not c.get_text().isspace()]
            assert all(len(c.get_text())==1 for c in chars)
            text="".join(c.get_text() for c in chars)
            for label in wanted:
                start=text.find(label)
                if start<0:
                    continue
                assert text.find(label,start+len(label))<0
                selected=chars[start:start+len(label)]
                height=float(reader.pages[page-1].mediabox.height)
                baselines=[height-float(c.matrix[5]) for c in selected]
                assert all(math.isfinite(v) for v in baselines) and max(baselines)-min(baselines)<.1
                markers.append(dict(label=label,page=page,baselineFromTopPt=sum(baselines)/len(baselines)))
    assert sorted(m["label"] for m in markers)==sorted(wanted)
    observed.append(dict(id=row["id"],case=row["case"],pages=len(reader.pages),markers=markers,wordMarkers=row["markers"]))
OBSERVATIONS.write_text(json.dumps(dict(scope="Actual native export, no predicted or forced pagination",documents=observed),indent=2)+"\n")
class WordSharedRowAllocations(unittest.TestCase):
    pass
def case(row):
    def check(self):
        self.assertEqual(row["pages"],2)
        actual={m["label"]:m["page"] for m in row["markers"]}
        expected={m["label"]:m["page"] for m in row["wordMarkers"]}
        self.assertEqual(actual,expected,"All preceding-row, target, sibling and after-table marker pages must match the observed Word reference")
    return check
for row in observed:
    c=row["case"]
    name=f'test_h{c["rowHeightTwips"]}_widow{int(c["widow"])}_hide{int(c["hideMark"])}'
    assert not hasattr(WordSharedRowAllocations,name)
    setattr(WordSharedRowAllocations,name,case(row))
if __name__=="__main__":
    unittest.main()
