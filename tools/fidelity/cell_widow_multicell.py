# SPDX-License-Identifier: AGPL-3.0-only
"""Public five-row shared-cell probes; no engine implementation or Word oracle."""
import argparse
import copy
import hashlib
import itertools
import json
import zipfile
from pathlib import Path
from floating_tables import BASE,el,parts,xml
from widow_controls import wrap
from cell_widow_controls import paragraph

def document(height,widow,hide_mark):
    data=parts(copy.deepcopy(BASE));doc,body=el("document"),el("body");doc.append(body)
    # Intent only: four preceding minimum-height rows leave18pt for a15pt line.
    filler_height=5760-360-4*height
    count,after=divmod(filler_height,300)
    fill=paragraph(["FILL%02d"%i for i in range(1,count+1)])
    fill.find("w:pPr/w:spacing",{"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}).set("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}after",str(after))
    body.append(fill)
    table=el("tbl");pr=el("tblPr");pr.append(el("tblW",{"w":5760,"type":"dxa"}))
    borders=el("tblBorders")
    for side in ["top","left","bottom","right","insideH","insideV"]:borders.append(el(side,{"val":"nil"}))
    pr.append(borders);pr.append(el("tblLayout",{"type":"fixed"}))
    margins=el("tblCellMar")
    for side in ["top","bottom","left","right"]:margins.append(el(side,{"w":0,"type":"dxa"}))
    pr.append(margins);table.append(pr)
    grid=el("tblGrid")
    for _ in range(3):grid.append(el("gridCol",{"w":1920}))
    table.append(grid)
    for row_index in range(5):
        row=el("tr");rp=el("trPr");rp.append(el("trHeight",{"val":height}));row.append(rp)
        for col_index in range(2 if row_index==0 else 3):
            target=row_index==4 and col_index==0
            span=2 if row_index==0 and col_index==0 else 1
            c=el("tc");cp=el("tcPr");cp.append(el("tcW",{"w":1920*span,"type":"dxa"}))
            if span==2:cp.append(el("gridSpan",{"val":2}))
            cp.append(el("hideMark",{"val":int(hide_mark if target else True)}));c.append(cp)
            if target:labels=["TARGETLINE%d"%i for i in range(1,5)]
            elif row_index==4:labels=["SIDE%dLINE%d"%(col_index,i) for i in range(1,3 if col_index==1 else 2)]
            else:labels=["ROW%dCELL%d"%(row_index+1,col_index+1)]
            c.extend(wrap([paragraph(labels,widow if target else False)],1))
            c.append(paragraph([]));row.append(c)
        table.append(row)
    body.append(table);body.append(paragraph(["AFTERTABLE"]))
    section=el("sectPr");section.append(el("pgSz",{"w":7200,"h":7200}))
    section.append(el("pgMar",{"top":720,"bottom":720,"left":720,"right":720,"header":0,"footer":0,"gutter":0}))
    body.append(section);data["word/document.xml"]=xml(doc)
    return data

def generate(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False);rows=[]
    for height,widow,hide_mark in itertools.product([410,650],[False,True],[False,True]):
        name="mc-h%d-widow%d-hide%d"%(height,widow,hide_mark);path=output/(name+".docx")
        with zipfile.ZipFile(path,"w") as package:
            for part,body in sorted(document(height,widow,hide_mark).items()):
                info=zipfile.ZipInfo(part,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
                package.writestr(info,body)
        rows.append({"id":name,"height":height,"heightRule":"omitted","widow":widow,"hideMark":hide_mark,
                     "rows":5,"cellsPerRow":[2,3,3,3,3],"gridSpanCount":1,"sdtPerCell":True,
                     "targetRowIndex":4,"targetCellIndex":0,"targetLines":4,"siblingLines":[2,1],
                     "otherCellsHideMark":True,"bytes":path.stat().st_size,"file":path.name,
                     "sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
    (output/"manifest.json").write_text(json.dumps({"origin":"Original synthetic data; no input documents or external assets",
        "wordReferenceStatus":"unverified: actual Word exports required",
        "boundaryIntent":"Nominal18pt before last row assuming preceding rows honor omitted-rule410/650 minima and hidden trailing markers; actual Word geometry unverified.",
        "cases":rows},indent=2)+"\n")
    return rows
if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("output",type=Path)
    print("Generated",len(generate(parser.parse_args().output)),"public shared-row reference inputs")
