#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Author OOXML fixtures directly: invariant formulas, explicit numeric/text types."""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
ET.register_namespace("", NS)

def column(number):
    value = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        value = chr(65 + remainder) + value
    return value

def create(template, output, task):
    with zipfile.ZipFile(template) as archive:
        content = {item.filename: archive.read(item) for item in archive.infolist()}
    root = ET.fromstring(content["xl/worksheets/sheet1.xml"])
    old = root.find(f"{{{NS}}}sheetData")
    assert old is not None
    position = list(root).index(old)
    root.remove(old)
    data = ET.Element(f"{{{NS}}}sheetData")
    for y, values in enumerate(task["data"], 1):
        row = ET.SubElement(data, f"{{{NS}}}row", {"r": str(y)})
        for x, value in enumerate(values, 1):
            cell = ET.SubElement(row, f"{{{NS}}}c", {"r": column(x) + str(y)})
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cell.set("t", "n")
                ET.SubElement(cell, f"{{{NS}}}v").text = str(value)
            elif isinstance(value, str) and value.startswith("="):
                ET.SubElement(cell, f"{{{NS}}}f").text = value[1:]
            else:
                cell.set("t", "inlineStr")
                text = ET.SubElement(ET.SubElement(cell, f"{{{NS}}}is"), f"{{{NS}}}t")
                text.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
                text.text = str(value)[1:] if isinstance(value, str) and value.startswith("'") else str(value)
    root.insert(position, data)
    dimension = root.find(f"{{{NS}}}dimension")
    if dimension is not None:
        dimension.set("ref", f"A1:{column(max(map(len, task['data'])))}{len(task['data'])}")
    content["xl/worksheets/sheet1.xml"] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in content.items():
            archive.writestr(name, payload)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    tasks = json.loads(Path(__file__).with_name("tasks.json").read_text())
    for task in tasks:
        create(args.template, args.output / (task["id"] + ".xlsx"), task)
    print(f"Created {len(tasks)} authored, locale-independent fixtures.")
