#!/usr/bin/env python3
"""Verify actual synthetic DOCX round-trip values without opening external links."""
from pathlib import Path
import collections, json, sys, zipfile, xml.etree.ElementTree as ET
root = Path(sys.argv[1])
expected = json.loads((root / "expected.json").read_text())
conversion = json.loads((root / "conversion.json").read_text())
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = "{" + ns["w"] + "}"
with zipfile.ZipFile(root / "roundtrip.docx") as z:
    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    document = ET.fromstring(z.read("word/document.xml"))
    styles = ET.fromstring(z.read("word/styles.xml"))
targets = [x.attrib["Target"] for x in rels if x.attrib.get("Type", "").endswith("/hyperlink")]
assert collections.Counter(targets) == collections.Counter(expected["links"])
assert len(targets) == 7
fonts = document.findall(".//w:rPrChange/w:rPr/w:rFonts", ns)
assert any(x.attrib.get(W + "ascii") == expected["font"] for x in fonts)
style_ids = {x.attrib[W + "styleId"] for x in styles.findall("w:style", ns)
             if x.find("w:name", ns) is not None and x.find("w:name", ns).attrib.get(W + "val") == expected["style"]}
assert any(x.attrib.get(W + "val") in style_ids for x in document.findall(".//w:pPrChange/w:pPr/w:pStyle", ns))
proof = dict(runtime=conversion["runtime"], actual_docx_editor_docx_roundtrip=True,
             expected_hyperlinks=7, preserved_hyperlinks=7, tracked_font_preserved=True,
             tracked_style_name_preserved=True, targets=targets,
             scope="Actual pinned wasm round-trip; separate UI sink tests, no complete editor GUI claim")
(root / "verified.json").write_text(json.dumps(proof, indent=2) + "\n")
print("HOSTILE_DOCX_CONTENT_VERIFIED")
