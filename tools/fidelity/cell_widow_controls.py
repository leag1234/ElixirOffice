# SPDX-License-Identifier: AGPL-3.0-only
"""Original public cell/SDT widow reference inputs; no engine or Word oracle."""
import argparse
import copy
import hashlib
import itertools
import json
import zipfile
from pathlib import Path
from floating_tables import BASE, el, parts, xml
from widow_controls import wrap

def paragraph(labels, widow=False):
    p=el("p")
    pr=el("pPr")
    p.append(pr)
    for tag,value in [("keepNext",False),("keepLines",False),("widowControl",widow)]:
        pr.append(el(tag,{"val":int(value)}))
    pr.append(el("spacing",{"before":0,"after":0,"line":300,"lineRule":"exact"}))
    end=el("rPr")
    end.append(el("rFonts",{"ascii":"Arial","hAnsi":"Arial","cs":"Arial"}))
    end.append(el("sz",{"val":24}))
    pr.append(end)
    if labels:
        run=el("r")
        run.append(copy.deepcopy(end))
        for i,label in enumerate(labels):
            if i:
                run.append(el("br"))
            run.append(el("t",text=label))
        p.append(run)
    return p

def document(lines,widow,sdt,hide_mark):
    data=parts(copy.deepcopy(BASE))
    doc,body=el("document"),el("body")
    doc.append(body)
    body.append(paragraph(["FILL%02d"%i for i in range(1,19)]))
    table=el("tbl")
    pr=el("tblPr")
    pr.append(el("tblW",{"w":5760,"type":"dxa"}))
    borders=el("tblBorders")
    for side in ["top","left","bottom","right","insideH","insideV"]:
        borders.append(el(side,{"val":"nil"}))
    pr.append(borders)
    pr.append(el("tblLayout",{"type":"fixed"}))
    margins=el("tblCellMar")
    for side in ["top","bottom","left","right"]:
        margins.append(el(side,{"w":0,"type":"dxa"}))
    pr.append(margins)
    table.append(pr)
    grid=el("tblGrid")
    grid.append(el("gridCol",{"w":5760}))
    table.append(grid)
    row,cell=el("tr"),el("tc")
    cp=el("tcPr")
    cp.append(el("tcW",{"w":5760,"type":"dxa"}))
    cp.append(el("hideMark",{"val":int(hide_mark)}))
    cell.append(cp)
    target=paragraph(["TARGETLINE%d"%i for i in range(1,lines+1)],widow)
    cell.extend(wrap([target],int(sdt)))
    cell.append(paragraph([]))
    row.append(cell)
    table.append(row)
    body.append(table)
    body.append(paragraph(["AFTERTABLE"]))
    section=el("sectPr")
    section.append(el("pgSz",{"w":7200,"h":7200}))
    section.append(el("pgMar",{"top":720,"bottom":720,"left":720,"right":720,
                              "header":0,"footer":0,"gutter":0}))
    body.append(section)
    data["word/document.xml"]=xml(doc)
    return data

def generate(output):
    output=Path(output)
    output.mkdir(parents=True,exist_ok=False)
    rows=[]
    for lines,widow,sdt,hide_mark in itertools.product([2,3,4],[False,True],[False,True],[False,True]):
        name="cw-n%d-widow%d-sdt%d-hide%d"%(lines,widow,sdt,hide_mark)
        path=output/(name+".docx")
        with zipfile.ZipFile(path,"w") as z:
            for key,value in sorted(document(lines,widow,sdt,hide_mark).items()):
                info=zipfile.ZipInfo(key,date_time=(2026,1,1,0,0,0))
                info.compress_type=zipfile.ZIP_DEFLATED
                info.external_attr=0o100644<<16
                z.writestr(info,value)
        rows.append({"id":name,"lines":lines,"widow":widow,"sdt":sdt,"hideMark":hide_mark,
                     "sha256":hashlib.sha256(path.read_bytes()).hexdigest(),"bytes":path.stat().st_size,
                     "file":path.name})
    (output/"manifest.json").write_text(json.dumps({
        "origin":"Original synthetic data; no input documents or external assets",
        "wordReferenceStatus":"unverified: actual Word exports required",
        "geometryTwips":{"page":[7200,7200],"margins":[720,720,720,720],"contentHeight":5760,
                         "fillerLines":18,"lineHeight":300,"remainingBeforeTable":360,"cellMargins":0},
        "question":"Record actual target line pages, row boundaries and trailing-marker effects; no expected Word geometry is asserted.",
        "cases":rows},indent=2)+"\n")
    return rows

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    print("Generated",len(generate(parser.parse_args().output)),"public cell-widow reference inputs")
