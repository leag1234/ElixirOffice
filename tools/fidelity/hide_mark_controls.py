# SPDX-License-Identifier: AGPL-3.0-only
"""Original end-of-cell-marker probes; independent Word results stay separate."""
import argparse
import copy
import hashlib
import itertools
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from floating_tables import W, BASE, el, parts, xml, paragraph, cell
from widow_controls import wrap

def make_table(mode, trailing, marker_size, sdt, scenario):
    table = el("tbl")
    pr = el("tblPr")
    pr.append(el("tblW", {"w": 4800, "type": "dxa"}))
    pr.append(el("tblLayout", {"type": "fixed"}))
    margins = el("tblCellMar")
    for side in ["top", "bottom", "left", "right"]:
        margins.append(el(side, {"w": 100, "type": "dxa"}))
    pr.append(margins)
    borders = el("tblBorders")
    for side in ["top", "bottom", "left", "right", "insideH", "insideV"]:
        borders.append(el(side, {"val": "single", "sz": 4, "color": "404040"}))
    pr.append(borders)
    table.append(pr)
    grid = el("tblGrid")
    grid.append(el("gridCol", {"w": 4800}))
    table.append(grid)
    for index in range(2):
        row = el("tr")
        rp = el("trPr")
        if scenario in ["min", "exact"]:
            rp.append(el("trHeight", {"val": 1100, "hRule": "atLeast" if scenario == "min" else "exact"}))
        row.append(rp)
        text = "HIDEMARKCONTENT" if index == 0 else "AFTERHIDEMARK"
        p = paragraph(text, size=20, after=160, line=259)
        if index == 0:
            p.find("w:pPr/w:rPr/w:sz", {"w": W}).set("{%s}val" % W, str(marker_size * 2))
        if scenario == "split" and index == 0:
            run = p.find("w:r", {"w": W})
            for i in range(5):
                run.append(el("br"))
                run.append(el("t", text="SPLITLINE%d" % (i + 1)))
        contents = wrap([p], int(sdt)) if index == 0 else [p]
        if trailing and index == 0:
            contents.append(paragraph("", size=marker_size * 2, after=160, line=259))
        c = cell(contents, 4800)
        if mode != "omitted" and index == 0:
            c.find("w:tcPr", {"w": W}).append(el("hideMark", {"val": int(mode == "true")}))
        row.append(c)
        table.append(row)
    return table

def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    cases = []
    for scenario, mode, trailing, marker_size, sdt in itertools.product(
            ["auto", "min", "exact", "split", "nested"],
            ["omitted", "true", "false"], [False, True], [10, 12], [False, True]):
        data = parts(copy.deepcopy(BASE))
        doc, body = el("document"), el("body")
        doc.append(body)
        if scenario == "split":
            body.append(paragraph("FILL", size=24, after=0, line=240))
        table = make_table(mode, trailing, marker_size, sdt, scenario)
        if scenario == "nested":
            outer = el("tbl")
            tp = el("tblPr")
            tp.append(el("tblW", {"w": 5000, "type": "dxa"}))
            outer.append(tp)
            grid = el("tblGrid")
            grid.append(el("gridCol", {"w": 5000}))
            outer.append(grid)
            row = el("tr")
            row.append(cell([table, paragraph("", size=2, after=0)], 5000))
            outer.append(row)
            table = outer
        body.append(table)
        body.append(paragraph("DOCUMENTEND", size=20))
        section = el("sectPr")
        section.append(el("pgSz", {"w": 7200, "h": 2400 if scenario == "split" else 7200}))
        section.append(el("pgMar", {"top": 240, "bottom": 240, "left": 720, "right": 720,
                                       "header": 120, "footer": 120, "gutter": 0}))
        body.append(section)
        data["word/document.xml"] = xml(doc)
        name = "%s-%s-empty%d-size%d-sdt%d" % (scenario, mode, trailing, marker_size, sdt)
        file = output / (name + ".docx")
        with zipfile.ZipFile(file, "w") as package:
            for key, value in sorted(data.items()):
                info = zipfile.ZipInfo(key, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                package.writestr(info, value)
        cases.append(dict(id=name, scenario=scenario, mode=mode, trailing=trailing,
                          markerSize=marker_size, sdt=sdt,
                          sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (output / "manifest.json").write_text(json.dumps({
        "origin": "Original synthetic data; no input documents", "cases": cases,
        "wordReferenceStatus": "unverified; do not substitute metamorphic expectations for Word geometry"
    }, indent=2) + "\n")
    return cases


def generate_extra(output):
    """Corner cases for an empty-only cell and guarded printing/break content."""
    output.mkdir(parents=True, exist_ok=True)
    cases = []
    for scenario, mode, marker_size in itertools.product(
            ["empty-only", "border", "page-before"], ["omitted", "true", "false"], [10, 12]):
        data = parts(copy.deepcopy(BASE))
        doc, body = el("document"), el("body")
        doc.append(body)
        table = make_table(mode, scenario != "empty-only", marker_size, False, "auto")
        target = table.find("w:tr/w:tc", {"w": W})
        paragraphs = target.findall("w:p", {"w": W})
        if scenario == "empty-only":
            for run in paragraphs[0].findall("w:r", {"w": W}):
                paragraphs[0].remove(run)
        elif scenario == "border":
            borders = el("pBdr")
            borders.append(el("top", {"val": "single", "sz": 8, "space": 1, "color": "000000"}))
            paragraphs[-1].find("w:pPr", {"w": W}).append(borders)
        else:
            paragraphs[-1].find("w:pPr", {"w": W}).append(el("pageBreakBefore"))
        body.append(table)
        body.append(paragraph("DOCUMENTEND", size=20))
        section = el("sectPr")
        section.append(el("pgSz", {"w": 7200, "h": 7200}))
        section.append(el("pgMar", {"top": 240, "bottom": 240, "left": 720, "right": 720,
                                       "header": 120, "footer": 120, "gutter": 0}))
        body.append(section)
        data["word/document.xml"] = xml(doc)
        name = "%s-%s-size%d" % (scenario, mode, marker_size)
        file = output / (name + ".docx")
        with zipfile.ZipFile(file, "w") as package:
            for key, value in sorted(data.items()):
                info = zipfile.ZipInfo(key, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                package.writestr(info, value)
        cases.append(dict(id=name, scenario=scenario, mode=mode,
                          trailing=scenario != "empty-only", emptyOnly=scenario == "empty-only",
                          markerSize=marker_size, sdt=False,
                          sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (output / "manifest.json").write_text(json.dumps({
        "origin": "Original synthetic data; no input documents", "cases": cases,
        "wordReferenceStatus": "unverified"
    }, indent=2) + "\n")
    return cases

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--extra", action="store_true")
    args = parser.parse_args()
    print("Generated", len((generate_extra if args.extra else generate)(args.output)), "original hideMark probes")
