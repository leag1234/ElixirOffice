#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 ElixirOffice contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Synthetic native converter regression; requires an explicitly configured x2t."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + NS["w"] + "}"
ODF = {"s": "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
       "t": "urn:oasis:names:tc:opendocument:xmlns:table:1.0"}
S = "{" + ODF["s"] + "}"
T = "{" + ODF["t"] + "}"


def read_xml(file, member):
    with zipfile.ZipFile(file) as archive:
        return ET.fromstring(archive.read(member))


def direct_properties(properties):
    result = {}
    if properties is None:
        return result
    for key, tag, attribute in [("rtl", "bidiVisual", "val"), ("jc", "jc", "val"),
                                ("indent", "tblInd", "w")]:
        element = properties.find("w:" + tag, NS)
        if element is None:
            continue
        value = element.get(W + attribute)
        if key == "rtl":
            value = value not in ("0", "false", "off")
        elif key == "indent":
            value = int(value or "0")
        elif value in ("start", "end"):
            value = {"start": "left", "end": "right"}[value]
        result[key] = value
    return result


def read_table(file):
    document = read_xml(file, "word/document.xml")
    styles = {style.get(W + "styleId"): style
              for style in read_xml(file, "word/styles.xml").findall("w:style", NS)}

    def inherited(style_id, visited):
        if style_id not in styles:
            return {}
        if style_id in visited:
            raise AssertionError("Unexpected style cycle")
        visited = visited | {style_id}
        style = styles[style_id]
        parent = style.find("w:basedOn", NS)
        value = inherited(parent.get(W + "val"), visited) if parent is not None else {}
        value.update(direct_properties(style.find("w:tblPr", NS)))
        return value

    tables = document.findall(".//w:tbl", NS)
    assert len(tables) == 1, "Each fixture must retain exactly one table"
    properties = tables[0].find("w:tblPr", NS)
    style = properties.find("w:tblStyle", NS) if properties is not None else None
    effective = {"rtl": False, "jc": "left", "indent": 0}
    if style is not None:
        effective.update(inherited(style.get(W + "val"), set()))
    direct = direct_properties(properties)
    effective.update(direct)
    if effective["jc"] != "left":
        effective["indent"] = 0
    return effective, direct


def odf_alignment(file):
    content = read_xml(file, "content.xml")
    roots = [content]
    try:
        roots.append(read_xml(file, "styles.xml"))
    except KeyError:
        pass  # Valid ODF may keep all relevant styles in content.xml.
    styles = {style.get(S + "name"): style for root in roots
              for style in root.findall(".//s:style", ODF)}

    def inherited(name, visited):
        if name not in styles:
            return {}
        if name in visited:
            raise AssertionError("Unexpected ODF style cycle")
        style = styles[name]
        result = inherited(style.get(S + "parent-style-name"), visited | {name})
        properties = style.find("s:table-properties", ODF)
        if properties is not None:
            result.update(properties.attrib)
        return result

    tables = content.findall(".//t:table", ODF)
    assert len(tables) == 1
    return inherited(tables[0].get(T + "style-name"), set())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--converter", required=True, type=Path,
                        help="Configured native x2t; caller supplies its runtime/SDK/font environment")
    parser.add_argument("--font-dir", type=Path)
    args = parser.parse_args()
    converter = args.converter.resolve(strict=True)
    manifest = json.loads((ROOT / "fixtures.json").read_text())
    results = []
    with tempfile.TemporaryDirectory(prefix="eo-rtl-table-test-") as temporary:
        for case in manifest["cases"]:
            source = ROOT / "fixtures" / case["file"]
            assert hashlib.sha256(source.read_bytes()).hexdigest() == case["sha256"]
            work = Path(temporary) / source.stem
            work.mkdir()
            stages = [("input-bin", source, work / "Editor.bin", 8193),
                      ("bin-docx", work / "Editor.bin", work / "roundtrip.docx", 65),
                      ("bin-odt", work / "Editor.bin", work / "cross.odt", 67),
                      ("odt-bin", work / "cross.odt", work / "odt-Editor.bin", 8193),
                      ("odt-docx", work / "odt-Editor.bin", work / "odt-roundtrip.docx", 65)]
            for index, (name, origin, target, output_format) in enumerate(stages):
                task = ET.Element("TaskQueueDataConvert")
                fields = [("m_sFileFrom", origin), ("m_sFileTo", target),
                          ("m_nFormatTo", output_format)]
                if args.font_dir:
                    fields.append(("m_sFontDir", args.font_dir.resolve(strict=True)))
                for key, value in fields:
                    ET.SubElement(task, key).text = str(value)
                config = work / (str(index) + ".xml")
                config.write_text(ET.tostring(task, encoding="unicode"))
                run = subprocess.run([str(converter), str(config)], stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, timeout=60, check=False)
                assert run.returncode == 0 and target.is_file() and target.stat().st_size > 0, (
                    case["file"], name, run.returncode, run.stdout.decode(errors="replace"))
            for name in ["roundtrip.docx", "odt-roundtrip.docx"]:
                effective, direct = read_table(work / name)
                assert effective == case["expected"], (case["file"], name, effective, case["expected"])
                if case["requireDirectFalse"]:
                    assert direct.get("rtl") is False, (case["file"], name, "explicit false dropped")
            properties = odf_alignment(work / "cross.odt")
            expected = case["expected"]
            assert properties.get(S + "writing-mode") == ("rl-tb" if expected["rtl"] else "lr-tb")
            physical = expected["jc"]
            if expected["rtl"]:
                physical = {"left": "right", "right": "left"}.get(physical, physical)
            assert properties.get(T + "align") == physical, (case["file"], properties, physical)
            results.append({"file": case["file"], "status": "PASS", "conversionSteps": len(stages)})
    print(json.dumps({"status": "PASS", "cases": results}, indent=2))


if __name__ == "__main__":
    main()
