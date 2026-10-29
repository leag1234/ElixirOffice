# SPDX-License-Identifier: AGPL-3.0-only
"""Generate original public DOCX probes; no input documents or external assets."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("w", W)
BASE = dict(vertical="text", horizontal="margin", offset=720, floating=True,
            row_rule="atLeast", row_height=2800, nested=True, anchor_after=0,
            anchor_line=240, end_size=24, no_break=None, cant_split=False,
            overlap="never", profile="main", anchor_size=24,
            following_before=0, following_break=False, following_size=24)
CASES = [
    ("f00-base", None, {}, "Baseline: fixed-width floating table, minimum rows, nested cells."),
    ("f01-inline", "f00-base", {"floating": False}, "Separate floating-table flow from inline flow."),
    ("f02-spill", "f00-base", {"offset": 2160}, "Move the same table down to force a page boundary."),
    ("f03-zero-offset", "f00-base", {"offset": 0}, "Zero text-relative offset."),
    ("f04-negative-offset", "f00-base", {"offset": -720}, "Signed offset: record Word normalization, if any."),
    ("f05-page-anchor", "f00-base", {"vertical": "page"}, "Change vertical reference, not numeric offset."),
    ("f06-margin-anchor", "f00-base", {"vertical": "margin"}, "Separate page and margin references."),
    ("f07-text-horizontal", "f00-base", {"horizontal": "text"}, "Horizontal anchor reference only."),
    ("f08-anchor-after", "f00-base", {"anchor_after": 160}, "Does anchor after-spacing change table origin?"),
    ("f09-anchor-line", "f00-base", {"anchor_line": 259}, "Does anchor line spacing reserve extra height?"),
    ("f10-anchor-size", "f00-base", {"anchor_size": 4}, "Anchor paragraph font/end-mark reservation."),
    ("f11-flat-cells", "f00-base", {"nested": False}, "Same marker text, flat paragraphs instead of nested table."),
    ("f12-small-end-mark", "f00-base", {"end_size": 4}, "Only the mandatory paragraph after nested table shrinks."),
    ("f13-omitted-height-rule", "f00-base", {"row_rule": None}, "Omitted hRule versus explicit atLeast."),
    ("f14-cant-split", "f02-spill", {"cant_split": True}, "Row-level no-split differs from whole floating-table policy."),
    ("f15-no-break-wrapped", "f02-spill", {"no_break": True}, "Whole floating table must not split when enabled."),
    ("f16-explicit-break-allowed", "f02-spill", {"no_break": False}, "Explicit false versus absent compatibility flag."),
    ("f17-following-before", "f00-base", {"following_before": 480}, "Change only the next regular paragraph's space before."),
    ("f18-following-break", "f00-base", {"following_break": True}, "Does the floating table follow its next regular paragraph onto a new page?"),
    ("f19-following-size", "f00-base", {"following_size": 72}, "Change only the next regular paragraph's font/end-mark size."),
    ("o00-collision-never", None, {"profile": "collision"}, "Independent short-table collision context."),
    ("o01-collision-allowed", "o00-collision-never", {"overlap": "overlap"}, "Only the table overlap policy changes."),
]

def el(tag, attrs=None, text=None):
    node = ET.Element("{%s}%s" % (W, tag), {"{%s}%s" % (W, k): str(v) for k, v in (attrs or {}).items()})
    node.text = text
    return node

def paragraph(text="", size=24, after=0, line=240, before=0, page_break=False):
    p = el("p")
    pr = ET.SubElement(p, "{%s}pPr" % W)
    if page_break:
        pr.append(el("pageBreakBefore"))
    pr.append(el("spacing", {"before": before, "after": after, "line": line, "lineRule": "auto"}))
    end = ET.SubElement(pr, "{%s}rPr" % W)
    end.append(el("rFonts", {"ascii": "Arial", "hAnsi": "Arial", "cs": "Arial"}))
    end.append(el("sz", {"val": size}))
    if text:
        run = ET.SubElement(p, "{%s}r" % W)
        rp = ET.SubElement(run, "{%s}rPr" % W)
        rp.append(el("rFonts", {"ascii": "Arial", "hAnsi": "Arial", "cs": "Arial"}))
        rp.append(el("sz", {"val": size}))
        run.append(el("t", text=text))
    return p

def cell(contents, width):
    c = el("tc")
    pr = ET.SubElement(c, "{%s}tcPr" % W)
    pr.append(el("tcW", {"w": width, "type": "dxa"}))
    for content in contents:
        c.append(content)
    return c

def table(config, label="TABLE", inner=False):
    t = el("tbl")
    pr = ET.SubElement(t, "{%s}tblPr" % W)
    collision = config["profile"] == "collision"
    if not inner and config["floating"]:
        pr.append(el("tblpPr", {"leftFromText": 120, "rightFromText": 120,
                               "topFromText": 0, "bottomFromText": 0,
                               "vertAnchor": "margin" if collision else config["vertical"],
                               "horzAnchor": config["horizontal"], "tblpX": 1,
                               "tblpY": 720 if collision else config["offset"]}))
        pr.append(el("tblOverlap", {"val": config["overlap"]}))
    width = 7440 if inner else 15360
    pr.append(el("tblW", {"w": width, "type": "dxa"}))
    borders = ET.SubElement(pr, "{%s}tblBorders" % W)
    for edge in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        borders.append(el(edge, {"val": "single", "sz": 4, "space": 0, "color": "404040"}))
    pr.append(el("tblLayout", {"type": "fixed"}))
    margins = ET.SubElement(pr, "{%s}tblCellMar" % W)
    for side in ["top", "left", "bottom", "right"]:
        margins.append(el(side, {"w": 0 if side in ["top", "bottom"] else 108, "type": "dxa"}))
    grid = ET.SubElement(t, "{%s}tblGrid" % W)
    columns = 1 if inner else 2
    for _ in range(columns):
        grid.append(el("gridCol", {"w": width // columns}))
    for row in range(2 if inner else 3):
        tr = ET.SubElement(t, "{%s}tr" % W)
        rp = ET.SubElement(tr, "{%s}trPr" % W)
        height = 1350 if inner else 600 if collision else config["row_height"]
        rule = "atLeast" if inner else config["row_rule"]
        attrs = {"val": height}
        if rule is not None:
            attrs["hRule"] = rule
        rp.append(el("trHeight", attrs))
        if not inner and config["cant_split"]:
            rp.append(el("cantSplit"))
        for col in range(columns):
            if not inner and not collision and row == 2 and col == 1:
                if config["nested"]:
                    contents = [table(config, label + "-NESTED", inner=True),
                                paragraph(size=config["end_size"])]
                else:
                    contents = [paragraph(label + "-NESTED-ROW-1"),
                                paragraph(label + "-NESTED-ROW-2"),
                                paragraph(size=config["end_size"])]
            else:
                marker = label + "-ROW-" + str(row + 1)
                if not inner:
                    marker += "-CELL-" + str(col + 1)
                contents = [paragraph(marker)]
            tr.append(cell(contents, width // columns))
    return t

def xml(node):
    return ET.tostring(node, encoding="utf-8", xml_declaration=True)

def parts(config):
    document = el("document")
    body = ET.SubElement(document, "{%s}body" % W)
    body.append(paragraph("ANCHOR", size=config["anchor_size"],
                          after=config["anchor_after"], line=config["anchor_line"]))
    body.append(table(config, "TABLE-A"))
    if config["profile"] == "collision":
        body.append(paragraph("SECOND-ANCHOR"))
        body.append(table(config, "TABLE-B"))
    body.append(paragraph("FOLLOW-01: public layout marker.", size=config["following_size"],
                          before=config["following_before"], page_break=config["following_break"]))
    body.append(paragraph("FOLLOW-02: final public layout marker."))
    sect = ET.SubElement(body, "{%s}sectPr" % W)
    sect.append(el("pgSz", {"w": 16838, "h": 11906, "orient": "landscape"}))
    sect.append(el("pgMar", {"top": 720, "right": 720, "bottom": 720,
                            "left": 720, "header": 360, "footer": 360, "gutter": 0}))
    settings = el("settings")
    compat = ET.SubElement(settings, "{%s}compat" % W)
    if config["no_break"] is not None:
        compat.append(el("doNotBreakWrappedTables", {"val": "1" if config["no_break"] else "0"}))
    compat.append(el("compatSetting", {"name": "compatibilityMode",
                                     "uri": "http://schemas.microsoft.com/office/word", "val": "15"}))
    styles = el("styles")
    defaults = ET.SubElement(styles, "{%s}docDefaults" % W)
    rd = ET.SubElement(defaults, "{%s}rPrDefault" % W)
    rr = ET.SubElement(rd, "{%s}rPr" % W)
    rr.append(el("rFonts", {"ascii": "Arial", "hAnsi": "Arial", "cs": "Arial"}))
    rr.append(el("sz", {"val": 24}))
    pd = ET.SubElement(defaults, "{%s}pPrDefault" % W)
    pp = ET.SubElement(pd, "{%s}pPr" % W)
    pp.append(el("spacing", {"before": 0, "after": 0, "line": 240, "lineRule": "auto"}))
    normal = el("style", {"type": "paragraph", "default": "1", "styleId": "Normal"})
    normal.append(el("name", {"val": "Normal"}))
    styles.append(normal)
    types = ET.Element("{%s}Types" % CT)
    for ext, content in [("rels", "application/vnd.openxmlformats-package.relationships+xml"),
                         ("xml", "application/xml")]:
        ET.SubElement(types, "{%s}Default" % CT, Extension=ext, ContentType=content)
    for name, content in [("document", "document.main"), ("styles", "styles"), ("settings", "settings")]:
        ET.SubElement(types, "{%s}Override" % CT, PartName="/word/" + name + ".xml",
                      ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml." + content + "+xml")
    root_rels = ET.Element("{%s}Relationships" % REL)
    ET.SubElement(root_rels, "{%s}Relationship" % REL, Id="rId1", Type=OFFICE + "/officeDocument", Target="word/document.xml")
    doc_rels = ET.Element("{%s}Relationships" % REL)
    for index, name in enumerate(["styles", "settings"], 1):
        ET.SubElement(doc_rels, "{%s}Relationship" % REL, Id="rId" + str(index), Type=OFFICE + "/" + name, Target=name + ".xml")
    return {"[Content_Types].xml": xml(types), "_rels/.rels": xml(root_rels),
            "word/document.xml": xml(document), "word/styles.xml": xml(styles),
            "word/settings.xml": xml(settings), "word/_rels/document.xml.rels": xml(doc_rels)}

def configurations():
    configs, rows = {}, []
    for name, parent, changes, question in CASES:
        config = copy.deepcopy(configs[parent] if parent else BASE)
        config.update(changes)
        if parent:
            delta = {k: v for k, v in config.items() if configs[parent][k] != v}
            if len(delta) != 1:
                raise ValueError("Each pair must change exactly one parameter: " + name)
        else:
            delta = changes
        configs[name] = config
        rows.append(dict(id=name, parent=parent, change=delta, question=question, config=config))
    return rows

def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    rows = configurations()
    for row in rows:
        target = output / (row["id"] + ".docx")
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as package:
            for name, data in sorted(parts(row["config"]).items()):
                info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                package.writestr(info, data)
        row["sha256"] = hashlib.sha256(target.read_bytes()).hexdigest()
        row["bytes"] = target.stat().st_size
        row["wordResult"] = "unverified: awaiting Word PDF export"
    (output / "manifest.json").write_text(json.dumps({"schema": 1, "origin": "Original synthetic data; no input documents", "cases": rows}, indent=2) + "\n")
    (output / "SHA256SUMS").write_text("".join(row["sha256"] + "  " + row["id"] + ".docx\n" for row in rows))
    return rows

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print("Generated", len(generate(args.output)), "original public DOCX probes")
