# SPDX-License-Identifier: AGPL-3.0-only
"""Original keep-with-next probes across transparent body content controls."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from floating_tables import W, BASE, el, parts, xml, cell
from widow_controls import paragraph, wrap

def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    for scenario in ["heading-two-lines", "heading-one-line", "widow-backtrack", "keep-chain",
                     "page-before", "manual-page", "section-break", "empty-control", "leading-table", "same-control"]:
        for keep in [False, True]:
            for heading_depth, target_depth in [(0, 0), (0, 1), (0, 2), (1, 1), (2, 2), (1, 0)]:
                if scenario == "same-control" and heading_depth != target_depth:
                    continue
                data = parts(copy.deepcopy(BASE))
                document, body = el("document"), el("body")
                document.append(body)
                fill = 22 if scenario == "heading-one-line" else 20 if scenario in ["widow-backtrack", "keep-chain", "empty-control"] else 21
                heading_lines = 1 if scenario in ["heading-one-line", "widow-backtrack"] else 2
                body.append(paragraph("FILL", fill, False))
                heading = paragraph("HEADING", heading_lines, False)
                heading.find("w:pPr", {"w": W}).append(el("keepNext", {"val": int(keep)}))
                heading.find("w:pPr", {"w": W}).append(el("keepLines"))
                headings = [heading]
                if scenario == "keep-chain":
                    subheading = paragraph("CHAIN", 1, False)
                    subheading.find("w:pPr", {"w": W}).append(el("keepNext"))
                    headings.append(subheading)
                if scenario == "section-break":
                    section_end = el("sectPr")
                    section_end.append(el("type", {"val": "nextPage"}))
                    section_end.append(el("pgSz", {"w": 10000, "h": 7200}))
                    section_end.append(el("pgMar", {"top": 720, "bottom": 720, "left": 720, "right": 720,
                                                   "header": 360, "footer": 360, "gutter": 0}))
                    heading.find("w:pPr", {"w": W}).append(section_end)
                if scenario != "same-control":
                    body.extend(wrap(headings, heading_depth))
                target = paragraph("TARGET", 3 if scenario == "widow-backtrack" else 2, True)
                if scenario == "page-before":
                    target.find("w:pPr", {"w": W}).append(el("pageBreakBefore"))
                if scenario == "manual-page":
                    target.find("w:r", {"w": W}).insert(1, el("br", {"type": "page"}))
                contents = [target]
                if scenario == "empty-control":
                    contents = wrap([paragraph("", 1, False)], target_depth) + contents
                if scenario == "leading-table":
                    table, row = el("tbl"), el("tr")
                    table_props = el("tblPr")
                    table_props.append(el("tblW", {"w": 8560, "type": "dxa"}))
                    table.append(table_props)
                    grid = el("tblGrid")
                    grid.append(el("gridCol", {"w": 8560}))
                    table.append(grid)
                    row_props = el("trPr")
                    row_props.append(el("cantSplit"))
                    row.append(row_props)
                    row.append(cell([target], 8560))
                    table.append(row)
                    contents = [table]
                if scenario == "same-control":
                    contents = headings + contents
                body.extend(wrap(contents, target_depth))
                body.append(paragraph("AFTER", 1, False))
                section = el("sectPr")
                section.append(el("pgSz", {"w": 10000, "h": 7200}))
                section.append(el("pgMar", {"top": 720, "bottom": 720, "left": 720, "right": 720,
                                           "header": 360, "footer": 360, "gutter": 0}))
                body.append(section)
                data["word/document.xml"] = xml(document)
                name = "%s-%s-h%d-t%d" % (scenario, "on" if keep else "off", heading_depth, target_depth)
                file = output / (name + ".docx")
                with zipfile.ZipFile(file, "w") as package:
                    for key, value in sorted(data.items()):
                        info = zipfile.ZipInfo(key, date_time=(2026, 1, 1, 0, 0, 0))
                        info.compress_type = zipfile.ZIP_DEFLATED
                        info.external_attr = 0o100644 << 16
                        package.writestr(info, value)
                rows.append(dict(id=name, scenario=scenario, keep=keep, headingDepth=heading_depth,
                                 targetDepth=target_depth, headingLines=heading_lines,
                                 targetLines=3 if scenario == "widow-backtrack" else 2,
                                 sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (output / "manifest.json").write_text(json.dumps({"origin": "Original synthetic data; no input documents",
        "cases": rows}, indent=2) + "\n")
    return rows

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    print("Generated", len(generate(parser.parse_args().output)), "original keep-with-next probes")
