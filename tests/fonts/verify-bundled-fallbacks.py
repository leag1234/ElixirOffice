# SPDX-License-Identifier: AGPL-3.0-only
"""Verify all emitted glyph contours, actual PDF italic matrices and public-sample rasters."""
import hashlib, json, re, subprocess, sys, zlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image, ImageChops
root = Path(sys.argv[1])
results = []
for directory in sorted(root.iterdir()):
    if not directory.is_dir():
        continue
    meta = json.loads((directory / "metadata.json").read_text())
    source = TTFont(directory / meta["path"].lstrip("/"))
    assert "fvar" not in source and "gvar" not in source
    pdf = (directory / "output.pdf").read_bytes()
    reference = re.search(rb"/FontFile2\s+(\d+)\s+0\s+R", pdf)
    assert reference, "No embedded TrueType font"
    obj = re.search(rb"(?:^|\n)" + reference[1] + rb" 0 obj\b([\s\S]*?)endobj", pdf)[1]
    payload = re.search(rb"stream\r?\n([\s\S]*?)\r?\nendstream", obj)[1]
    if b"/FlateDecode" in obj:
        payload = zlib.decompress(payload)
    target = directory / "embedded.ttf"
    target.write_bytes(payload)
    embedded = TTFont(target)
    shaped = json.loads((directory / "shaped.json").read_text())["glyphs"]
    glyphs = {glyph["gid"] for glyph in shaped}
    assert glyphs and 0 not in glyphs
    def outline(font, gid):
        pen = RecordingPen()
        font.getGlyphSet()[font.getGlyphOrder()[gid]].draw(pen)
        return pen.value
    for gid in glyphs:
        assert outline(source, gid) == outline(embedded, gid), (directory.name, gid)
    # Read actual PDF drawing operators, independently of metadata/needItalic.
    matrices = []
    for obj in re.findall(rb"\d+ 0 obj\b([\s\S]*?)endobj", pdf):
        stream = re.search(rb"stream\r?\n([\s\S]*?)\r?\nendstream", obj)
        if not stream:
            continue
        data = stream[1]
        if b"/FlateDecode" in obj:
            data = zlib.decompress(data)
        for matrix in re.findall(rb"([-+0-9. ]+)\s+Tm\b", data):
            values = [float(v) for v in matrix.split()]
            if len(values) == 6:
                matrices.append(values)
    # A regular text object uses the PDF default identity matrix without Tm.
    if meta["style"] & 2:
        assert matrices, "No explicit italic text matrix"
    shear = any(abs(m[1]) > 0.01 or abs(m[2]) > 0.01 for m in matrices)
    assert shear == bool(meta["style"] & 2), (directory.name, "actual italic transform", matrices[:2])
    image = Image.open(directory / "render.png").convert("L")
    ink = sum(255 - value for value in image.getdata())
    assert ink > 10000
    extracted = subprocess.check_output(["pdftotext", str(directory / "output.pdf"), "-"], text=True).strip()
    exact = extracted == meta["text"]
    results.append({"case": directory.name, "allEmittedContoursExact": True,
                    "glyphs": len(glyphs), "actualItalicMatrix": shear,
                    "embeddedSha256": hashlib.sha256(payload).hexdigest(),
                    "ink": ink, "textExtraction": "PASS" if exact else "FAIL",
                    "requestedText": meta["text"], "extractedText": extracted})
for script in ("arabic", "sinhala"):
    regular = Image.open(root / (script + "-regular") / "render.png").convert("RGB")
    italic = Image.open(root / (script + "-italic") / "render.png").convert("RGB")
    assert ImageChops.difference(regular, italic).getbbox(), script + " italic raster unchanged"
(root.parent / "bundled-outline-render.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
print("PASS all emitted static contours, actual italic PDF matrices, nonblank and distinct slanted rasters")
print("Text extraction:", {row["case"]: row["textExtraction"] for row in results})
