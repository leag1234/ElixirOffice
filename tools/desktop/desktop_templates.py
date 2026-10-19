#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate the six desktop-only CC0 Home variants; web template files stay unchanged."""
import argparse, io, json, zipfile
from pathlib import Path
from lxml import etree as XML
from home_templates import localized, ROOT, BRAND, W, NS
from blank_templates import LANGUAGES
from template_font_styles import styled_text, font_request

LOCALES = {"ja": "Noto Sans CJK JP", "zh": "Noto Sans CJK SC",
           "zh-tw": "Noto Sans CJK TC", "ko": "Noto Sans CJK KR",
           "si": "Noto Sans Sinhala", "ur": "Noto Sans Arabic"}
KINDS = ["letterhead", "resume-two-columns", "worksheet-fractions", "assessment-grid"]


def compact_end_mark(root, locale):
    """Keep the mandatory empty end marker from creating a blank trailing page."""
    body=root.find('w:body',NS)
    if body is None or len(body)<2:
        return
    last=list(body)[-2]
    if last.tag=='{'+W+'}tbl':
        last=XML.Element('{'+W+'}p')
        body.insert(len(body)-1,last)
    if last.tag!='{'+W+'}p' or last.findall('.//w:t',NS) or last.findall('.//w:drawing',NS) or last.findall('.//w:br',NS):
        return
    def ensure(parent,name):
        child=parent.find('w:'+name,NS)
        if child is None:child=XML.SubElement(parent,'{'+W+'}'+name)
        return child
    pr=last.find('w:pPr',NS)
    if pr is None:pr=XML.Element('{'+W+'}pPr');last.insert(0,pr)
    spacing=ensure(pr,'spacing')
    for key,value in [('before','0'),('after','0'),('line','20'),('lineRule','exact')]:
        spacing.set('{'+W+'}'+key,value)
    marks=[ensure(pr,'rPr')]+last.findall('w:r/w:rPr',NS)
    for mark in marks:
        for name in ['sz','szCs']:ensure(mark,name).set('{'+W+'}val','2')
    if locale=='ur':ensure(pr,'bidi')


def desktop_variant(source, kind, locale):
    original = localized(source, kind, locale)
    result = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(original)) as archive, zipfile.ZipFile(result, "w") as out:
        for entry in archive.infolist():
            data = archive.read(entry)
            if entry.filename.startswith("word/") and entry.filename.endswith(".xml"):
                root = XML.fromstring(data)
                for fonts in root.findall(".//w:rFonts", NS):
                    if locale in ("ja", "zh", "zh-tw", "ko"):
                        fonts.set("{" + W + "}eastAsia", LOCALES[locale])
                    else:
                        fonts.set("{" + W + "}cs", LOCALES[locale])
                if locale == "si":
                    for run in root.findall(".//w:r", NS):
                        if any(0xd80<=ord(c)<=0xdff for text in run.findall("w:t",NS) for c in (text.text or "")):
                            fonts=run.find("w:rPr/w:rFonts",NS)
                            if fonts is None:
                                raise ValueError("Localized template run lacks explicit fonts")
                            fonts.set("{"+W+"}hAnsi",LOCALES[locale])
                if entry.filename == "word/document.xml":
                    compact_end_mark(root,locale)
                    if kind == "letterhead" and locale != "si":
                        # Bound tall fallback metrics; retain frame geometry and the signature drawing.
                        for paragraph in root.findall(".//w:p",NS):
                            if not paragraph.findall(".//w:t",NS) or paragraph.findall(".//w:drawing",NS):
                                continue
                            pr=paragraph.find("w:pPr",NS)
                            if pr is None:pr=XML.Element("{"+W+"}pPr");paragraph.insert(0,pr)
                            framed=pr.find("w:framePr",NS) is not None
                            if framed and locale!="ur":continue
                            spacing=pr.find("w:spacing",NS)
                            if spacing is None:spacing=XML.SubElement(pr,"{"+W+"}spacing")
                            spacing.set("{"+W+"}line","360" if framed else "300")
                            spacing.set("{"+W+"}lineRule","exact")
                    if kind == 'resume-two-columns':
                        # Leave space for the mandatory end paragraph after the full-page table.
                        for height in root.findall('w:body/w:tbl/w:tr/w:trPr/w:trHeight',NS):
                            value=int(height.get('{'+W+'}val','0'))
                            if value>15000:height.set('{'+W+'}val',str(value-360))
                if kind == "letterhead" and locale == "ur" and entry.filename == "word/header1.xml":
                    # Keep page-wide decoration and the logo clear of RTL header text.
                    drawing_ns={"wp":"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"}
                    for offset in root.findall(".//wp:positionH/wp:posOffset",drawing_ns):
                        offset.text="0"
                if kind == "letterhead" and locale != "si" and entry.filename == "word/styles.xml":
                    # Taller script metrics need tighter paragraph gaps to keep the signature on page one.
                    spacing=root.find("w:docDefaults/w:pPrDefault/w:pPr/w:spacing",NS)
                    spacing.set("{"+W+"}after","80")
                    spacing.set("{"+W+"}line","240")
                if entry.filename == "word/fontTable.xml":
                    node = XML.SubElement(root, "{" + W + "}font")
                    node.set("{" + W + "}name", LOCALES[locale])
                data = XML.tostring(root, encoding="utf-8")
            info = zipfile.ZipInfo(entry.filename, (2026, 3, 9, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data)
    return result.getvalue()


def requirements(data):
    requests = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for text, properties in styled_text(archive):
            for c in text:
                if c.isspace():
                    continue
                family, style = font_request(properties, ord(c))
                requests.setdefault((family, style), set()).add(ord(c))
    return [{"name": name, "style": style, "codepoints": sorted(points)}
            for (name, style), points in sorted(requests.items())]


def generate(out):
    if out.exists():
        raise ValueError("Choose a fresh desktop template output")
    out.mkdir(parents=True)
    catalog = json.loads((BRAND / "templates.json").read_text())
    overlay = {"license": "CC0-1.0", "description": "Desktop-only fictional examples; server availability is unchanged.", "templates": []}
    for entry in catalog["templates"]:
        record = {"id": entry["id"], "languages": list(LOCALES), "fontRequirements": {}, "systemLocales": ["ja", "zh", "zh-tw", "ko"]}
        for locale in LOCALES:
            source = ROOT / "tools/example/template-layouts" / entry["file"]
            data = desktop_variant(source, entry["id"], locale)
            folder = out / locale
            folder.mkdir(exist_ok=True)
            (folder / entry["file"]).write_bytes(data)
            record["fontRequirements"][locale] = requirements(data)
        overlay["templates"].append(record)
    (out / "templates.json").write_text(json.dumps(overlay, ensure_ascii=False, indent=2) + "\n")
    print("PASS 24 desktop-only localized DOCX variants and physical-style requirements")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    generate(parser.parse_args().out)
