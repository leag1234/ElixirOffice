#!/usr/bin/env python3
"""Generate public synthetic D1/D2 fixtures from pristine public new.* blanks."""
# SPDX-License-Identifier: AGPL-3.0-only
import argparse
import shutil
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("templates", type=Path, help="Public template directory containing new.docx/new.xlsx/new.pptx")
parser.add_argument("output", type=Path)
args = parser.parse_args()
assert "corpus-private" not in args.templates.resolve().parts, "Public templates only"
args.output.mkdir(parents=True, exist_ok=True)
w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
rel = "http://schemas.openxmlformats.org/package/2006/relationships"
ct = "http://schemas.openxmlformats.org/package/2006/content-types"
ET.register_namespace("w", w)
tag = lambda name: "{" + w + "}" + name
with zipfile.ZipFile(args.templates / "new.docx") as source:
    entries = {entry.filename: source.read(entry.filename) for entry in source.infolist()}
document = ET.fromstring(entries["word/document.xml"])
body = document.find(tag("body"))
section = body.find(tag("sectPr"))
for child in list(body):
    body.remove(child)
paragraph = ET.SubElement(body, tag("p"))
ET.SubElement(paragraph, tag("commentRangeStart"), {tag("id"): "0"})
ET.SubElement(ET.SubElement(paragraph, tag("r")), tag("t")).text = "Baseline comment target"
ET.SubElement(paragraph, tag("commentRangeEnd"), {tag("id"): "0"})
ET.SubElement(ET.SubElement(paragraph, tag("r")), tag("commentReference"), {tag("id"): "0"})
paragraph = ET.SubElement(body, tag("p"))
ET.SubElement(ET.SubElement(paragraph, tag("r")), tag("t")).text = "alpha bta gamma"
insertion = ET.SubElement(paragraph, tag("ins"), {tag("id"): "1", tag("author"): "Existing Reviewer", tag("date"): "2026-01-01T00:00:00Z"})
ET.SubElement(ET.SubElement(insertion, tag("r")), tag("t")).text = " tracked insertion"
if section is not None:
    body.append(section)
comments = ET.Element(tag("comments"))
comment = ET.SubElement(comments, tag("comment"), {tag("id"): "0", tag("author"): "Baseline Author", tag("initials"): "BA", tag("date"): "2026-01-01T00:00:00Z"})
ET.SubElement(ET.SubElement(ET.SubElement(comment, tag("p")), tag("r")), tag("t")).text = "Existing imported local comment"
entries["word/document.xml"] = ET.tostring(document, encoding="utf-8", xml_declaration=True)
entries["word/comments.xml"] = ET.tostring(comments, encoding="utf-8", xml_declaration=True)
relationships = ET.fromstring(entries["word/_rels/document.xml.rels"])
comment_type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
for child in list(relationships):
    if child.get("Type") == comment_type:
        relationships.remove(child)
ids = {child.get("Id") for child in relationships}
identifier = "rIdSyntheticComment"
assert identifier not in ids
ET.SubElement(relationships, "{" + rel + "}Relationship", {"Id": identifier, "Type": comment_type, "Target": "comments.xml"})
entries["word/_rels/document.xml.rels"] = ET.tostring(relationships, encoding="utf-8", xml_declaration=True)
types = ET.fromstring(entries["[Content_Types].xml"])
if not any(child.get("PartName") == "/word/comments.xml" for child in types):
    ET.SubElement(types, "{" + ct + "}Override", {"PartName": "/word/comments.xml", "ContentType": "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"})
entries["[Content_Types].xml"] = ET.tostring(types, encoding="utf-8", xml_declaration=True)
with zipfile.ZipFile(args.output / "offline-review.docx", "w", zipfile.ZIP_DEFLATED) as result:
    for name, data in entries.items():
        result.writestr(name, data)
for name in ("new.xlsx", "new.pptx"):
    shutil.copyfile(args.templates / name, args.output / name)
def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
pixels = b"".join(b"\0" + bytes([220, 70, 40]) * 32 for _ in range(24))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 24, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")
(args.output / "image.png").write_bytes(png)
print("Generated public review fixtures:", args.output)
