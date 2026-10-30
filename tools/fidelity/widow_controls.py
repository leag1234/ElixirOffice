# SPDX-License-Identifier: AGPL-3.0-only
"""Original body-flow widow/orphan probes; independent Word results stay separate."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from floating_tables import W, BASE, el, parts, xml

def paragraph(prefix, lines, widow=None, style=None, keep=None, manual=False):
    p = el("p")
    pr = el("pPr")
    p.append(pr)
    if style:
        pr.append(el("pStyle", {"val": style}))
    pr.append(el("spacing", {"before": 0, "after": 0, "line": 240, "lineRule": "exact"}))
    if widow is not None:
        pr.append(el("widowControl", {"val": int(widow)}))
    if keep:
        pr.append(el(keep))
    r = el("r")
    p.append(r)
    rp = el("rPr")
    r.append(rp)
    rp.append(el("rFonts", {"ascii": "Arial", "hAnsi": "Arial"}))
    rp.append(el("sz", {"val": 20}))
    for i in range(lines):
        if i:
            r.append(el("br", {"type": "page"} if manual else {}))
        r.append(el("t", text=prefix + str(i + 1)))
    return p

def wrap(nodes, depth):
    for _ in range(depth):
        sdt = el("sdt")
        sdt.append(el("sdtPr"))
        content = el("sdtContent")
        sdt.append(content)
        content.extend(nodes)
        nodes = [sdt]
    return nodes

def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for mode in ["default", "on", "off", "inherited"]:
        for fill, lines in [(21, 3), (22, 3), (23, 3), (21, 4), (22, 4)]:
            for depth in [0, 1, 2]:
                name = "%s-%d-%d-sdt%d" % (mode, fill, lines, depth)
                data = parts(copy.deepcopy(BASE))
                doc = el("document")
                body = el("body")
                doc.append(body)
                body.append(paragraph("FILL", fill, False))
                body.extend(wrap([paragraph("TARGET", lines,
                    {"on": True, "off": False}.get(mode),
                    "WidowInherited" if mode == "inherited" else None)], depth))
                body.append(paragraph("AFTER", 1, False))
                section = el("sectPr")
                section.append(el("pgSz", {"w": 10000, "h": 7200}))
                section.append(el("pgMar", {"top": 720, "bottom": 720, "left": 720, "right": 720,
                                          "header": 360, "footer": 360, "gutter": 0}))
                body.append(section)
                styles = ET.fromstring(data["word/styles.xml"])
                style = el("style", {"type": "paragraph", "styleId": "WidowInherited"})
                style.append(el("basedOn", {"val": "Normal"}))
                pp = el("pPr")
                pp.append(el("widowControl"))
                style.append(pp)
                styles.append(style)
                data["word/styles.xml"] = xml(styles)
                data["word/document.xml"] = xml(doc)
                file = output / (name + ".docx")
                with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_DEFLATED) as z:
                    for key, value in sorted(data.items()):
                        info = zipfile.ZipInfo(key, date_time=(2026, 1, 1, 0, 0, 0))
                        info.compress_type = zipfile.ZIP_DEFLATED
                        info.external_attr = 0o100644 << 16
                        z.writestr(info, value)
                rows.append(dict(id=name, depth=depth, lines=lines, fill=fill, mode=mode,
                                 sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (output / "manifest.json").write_text(json.dumps({"origin": "Original synthetic data; no input documents",
        "cases": rows}, indent=2) + "\n")
    return rows

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print("Generated", len(generate(parser.parse_args().output)), "original probes")
