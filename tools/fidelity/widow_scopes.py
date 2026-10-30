# SPDX-License-Identifier: AGPL-3.0-only
"""Original controls for body SDT pagination boundaries and excluded owners."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from floating_tables import W, REL, OFFICE, CT, BASE, el, parts, xml, cell, table
from widow_controls import paragraph, wrap

for prefix, namespace in [
    ("wp", "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"),
    ("a", "http://schemas.openxmlformats.org/drawingml/2006/main"),
    ("wps", "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"),
    ("r", OFFICE),
]:
    ET.register_namespace(prefix, namespace)

def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for scope in ["previous-inside", "keep-lines", "keep-next", "manual-break", "columns",
                  "floating-table", "frame", "cell", "header", "footer", "footnote", "shape"]:
        for depth in [0, 2]:
            data = parts(copy.deepcopy(BASE))
            document, body, section = el("document"), el("body"), el("sectPr")
            document.append(body)
            section.append(el("pgSz", {"w": 10000, "h": 7200}))
            section.append(el("pgMar", {"top": 720, "bottom": 720, "left": 720, "right": 720,
                                       "header": 360, "footer": 360, "gutter": 0}))
            target = paragraph("TARGET", 3, True, keep="keepLines" if scope == "keep-lines" else None,
                               manual=scope == "manual-break")
            filler = paragraph("FILL", 21, False)
            wrapped = wrap([target], depth)
            owner_body = scope not in ["cell", "header", "footer", "footnote", "shape"]
            if scope == "previous-inside":
                body.extend(wrap([filler, target], depth))
            elif scope in ["header", "footer", "footnote"]:
                kind = {"header": "hdr", "footer": "ftr", "footnote": "footnotes"}[scope]
                external = el(kind)
                if scope == "footnote":
                    note = el("footnote", {"id": 1})
                    note.extend(wrapped)
                    external.append(note)
                    ref = paragraph("NOTE", 1, False)
                    ref.find("{%s}r" % W).append(el("footnoteReference", {"id": 1}))
                    body.append(ref)
                else:
                    external.extend(wrapped)
                    section.append(el(scope + "Reference", {"type": "default"}))
                    section[-1].set("{%s}id" % OFFICE, "rId3")
                filename = scope + ("s" if scope == "footnote" else "") + ".xml"
                data["word/" + filename] = xml(external)
                rels = ET.fromstring(data["word/_rels/document.xml.rels"])
                ET.SubElement(rels, "{%s}Relationship" % REL, Id="rId3", Type=OFFICE + "/" +
                              ("footnotes" if scope == "footnote" else scope), Target=filename)
                data["word/_rels/document.xml.rels"] = xml(rels)
                types = ET.fromstring(data["[Content_Types].xml"])
                ET.SubElement(types, "{%s}Override" % CT, PartName="/word/" + filename,
                              ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml." +
                              ("footnotes" if scope == "footnote" else scope) + "+xml")
                data["[Content_Types].xml"] = xml(types)
                body.append(paragraph("BODY", 1, False))
            elif scope == "cell":
                t, row = el("tbl"), el("tr")
                pr = el("tblPr")
                pr.append(el("tblW", {"w": 8560, "type": "dxa"}))
                t.append(pr)
                grid = el("tblGrid")
                grid.append(el("gridCol", {"w": 8560}))
                t.append(grid)
                row.append(cell([filler] + wrapped, 8560))
                t.append(row)
                body.append(t)
            elif scope == "shape":
                p, r, drawing = el("p"), el("r"), el("drawing")
                p.append(r)
                r.append(drawing)
                # A real OOXML text box, rather than an untyped VML shape that
                # x2t is allowed to discard as unsupported geometry.
                wp = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                a = "http://schemas.openxmlformats.org/drawingml/2006/main"
                wps = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
                inline = ET.SubElement(drawing, "{%s}anchor" % wp, distT="0", distB="0",
                    distL="0", distR="0", simplePos="0", relativeHeight="0", behindDoc="0",
                    locked="0", layoutInCell="1", allowOverlap="1")
                ET.SubElement(inline, "{%s}simplePos" % wp, x="0", y="0")
                for direction, relative in [("H", "column"), ("V", "paragraph")]:
                    pos = ET.SubElement(inline, "{%s}position" % wp + direction, relativeFrom=relative)
                    ET.SubElement(pos, "{%s}posOffset" % wp).text = "0"
                ET.SubElement(inline, "{%s}extent" % wp, cx="2540000", cy="1270000")
                ET.SubElement(inline, "{%s}effectExtent" % wp, l="0", t="0", r="0", b="0")
                ET.SubElement(inline, "{%s}wrapNone" % wp)
                ET.SubElement(inline, "{%s}docPr" % wp, id="1", name="Original widow scope probe")
                graphic = ET.SubElement(inline, "{%s}graphic" % a)
                graphic_data = ET.SubElement(graphic, "{%s}graphicData" % a, uri=wps)
                shape = ET.SubElement(graphic_data, "{%s}wsp" % wps)
                ET.SubElement(shape, "{%s}cNvSpPr" % wps, txBox="1")
                props = ET.SubElement(shape, "{%s}spPr" % wps)
                xfrm = ET.SubElement(props, "{%s}xfrm" % a)
                ET.SubElement(xfrm, "{%s}off" % a, x="0", y="0")
                ET.SubElement(xfrm, "{%s}ext" % a, cx="2540000", cy="1270000")
                geometry = ET.SubElement(props, "{%s}prstGeom" % a, prst="rect")
                ET.SubElement(geometry, "{%s}avLst" % a)
                box = ET.SubElement(shape, "{%s}txbx" % wps)
                content = el("txbxContent")
                content.extend(wrapped)
                box.append(content)
                ET.SubElement(shape, "{%s}bodyPr" % wps)
                body.append(p)
            else:
                if scope == "keep-next":
                    filler.find("{%s}pPr" % W).append(el("keepNext"))
                if scope == "frame":
                    target.find("{%s}pPr" % W).append(el("framePr", {"w": 6000, "h": 1440,
                        "hAnchor": "margin", "vAnchor": "text", "wrap": "around"}))
                if scope == "columns":
                    section.append(el("cols", {"num": 2, "space": 360}))
                if scope == "floating-table":
                    config = copy.deepcopy(BASE)
                    config.update(row_height=240, nested=False, offset=0)
                    body.append(table(config))
                body.append(filler)
                body.extend(wrapped)
            body.append(paragraph("AFTER", 1, False))
            body.append(section)
            data["word/document.xml"] = xml(document)
            name = scope + "-sdt" + str(depth)
            file = output / (name + ".docx")
            with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_DEFLATED) as package:
                for key, value in sorted(data.items()):
                    info = zipfile.ZipInfo(key, date_time=(2026, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    package.writestr(info, value)
            rows.append(dict(id=name, scope=scope, depth=depth, mode="on", lines=3,
                ownerBody=owner_body, directBody=depth == 0 and owner_body,
                sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (output / "manifest.json").write_text(json.dumps({"origin": "Original synthetic data; no input documents",
        "cases": rows}, indent=2) + "\n")
    return rows

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print("Generated", len(generate(parser.parse_args().output)), "original scope controls")
