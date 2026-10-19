#!/usr/bin/env python3
"""Check actual EPUB/SVG rendering using synthetic sentinel pixels (requires Pillow)."""
import base64
import io
import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path
from PIL import Image

binary = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]).resolve()
root.mkdir(parents=True, exist_ok=False)
buffer = io.BytesIO()
Image.new("RGB", (16, 16), (239, 17, 29)).save(buffer, format="PNG")
png = buffer.getvalue()
buffer = io.BytesIO()
Image.new("RGB", (16, 16), (239, 17, 29)).save(buffer, format="JPEG")
jpeg = buffer.getvalue()
cases = [
    ("inline-png", "data:image/png;base64," + base64.b64encode(png).decode(), True),
    ("inline-jpeg", "data:image/jpeg;base64," + base64.b64encode(jpeg).decode(), True),
    ("same-document-fragment", "#r", True),
    ("nested-traversal", "a/../../../outside.png", False),
    ("entity-encoded-traversal", "a/../../../outside&#46;png", False),
    ("network-url", "https://example.invalid/outside.png", False),
    ("network-relative", "//example.invalid/outside.png", False),
    ("file-url", "file:///synthetic/outside.png", False),
]
results = []
for name, href, positive in cases:
    case = root / name
    case.mkdir()
    outside = case / "outside.png"
    outside.write_bytes(png)
    destination = case / "unpacked"
    destination.mkdir()
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'width="16" height="16"><image width="16" height="16" xlink:href="' + href + '"/></svg>')
    if href == "#r":
        svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="16" height="16"><defs><rect id="r" width="16" height="16" fill="#ef111d"/>'
            '</defs><use xlink:href="#r"/></svg>')
    data = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
    body = ('<html xmlns="http://www.w3.org/1999/xhtml"><head/><body>'
        '<p>PUBLIC_NESTED_FIXTURE</p><img src="' + data + '"/></body></html>')
    opf = ('<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest>'
        '<item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/>'
        '</manifest><spine><itemref idref="chapter"/></spine></package>')
    entries = {
        "META-INF/container.xml": '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
        "OEBPS/content.opf": opf,
        "OEBPS/Text/chapter.xhtml": body,
    }
    with zipfile.ZipFile(case / "input.epub", "w", zipfile.ZIP_DEFLATED) as archive:
        for path, value in entries.items():
            archive.writestr(path, value)
    command = [str(binary), "epub", str(case / "input.epub"), str(destination), str(case / "output.docx")]
    run = subprocess.run(command, capture_output=True, text=True, timeout=30)
    red_pixels = 0
    media = []
    valid = run.returncode == 0 and outside.read_bytes() == png
    try:
        with zipfile.ZipFile(case / "output.docx") as archive:
            valid = valid and b"PUBLIC_NESTED_FIXTURE" in archive.read("word/document.xml")
            for path in archive.namelist():
                if path.startswith("word/media/"):
                    image = Image.open(io.BytesIO(archive.read(path))).convert("RGB")
                    red_pixels += sum(1 for r, g, b in image.getdata() if r > 200 and g < 60 and b < 70)
                    media.append(path)
    except Exception as error:
        valid = False
    valid = valid and (red_pixels == 256 if positive else not media)
    results.append(dict(name=name, passed=valid, exit=run.returncode,
        red_pixels=red_pixels, media=media, stdout=run.stdout, stderr=run.stderr))
    print(("PASS " if valid else "FAIL ") + name, flush=True)
(root / "results.json").write_text(json.dumps(results, indent=2) + "\n")
sys.exit(0 if all(row["passed"] for row in results) else 1)
