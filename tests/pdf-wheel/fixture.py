#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate the public 12-page hosted wheel input and copy its real DocsAPI page."""
import argparse
from pathlib import Path
import shutil

def pdf():
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        ("<< /Type /Pages /Count 12 /Kids [" + " ".join(str(4 + 2 * n) + " 0 R" for n in range(12)) + "] >>").encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for page in range(1, 13):
        stream = ("BT /F1 28 Tf 100 1000 Td (Public Z5 wheel page " + str(page) + ") Tj" +
                  "".join(" 0 -35 Td (Public line " + str(line) + " - vertical and horizontal scrolling) Tj" for line in range(1, 21)) +
                  " ET 0.2 0.4 0.7 RG 100 100 1200 850 re S").encode()
        contents = len(objects) + 2
        objects.append(("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1400 1100] /Resources << /Font << /F1 3 0 R >> >> /Contents " + str(contents) + " 0 R >>").encode())
        objects.append(("<< /Length " + str(len(stream)) + " >>\nstream\n").encode() + stream + b"\nendstream")
    result = bytearray(b"%PDF-1.7\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend((str(index) + " 0 obj\n").encode() + obj + b"\nendobj\n")
    xref = len(result)
    result.extend(("xref\n0 " + str(len(offsets)) + "\n0000000000 65535 f \n").encode())
    for offset in offsets[1:]:
        result.extend(("%010d 00000 n \n" % offset).encode())
    result.extend(("trailer\n<< /Size " + str(len(offsets)) + " /Root 1 0 R >>\nstartxref\n" + str(xref) + "\n%%EOF\n").encode())
    return bytes(result)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new caller-owned public fixture directory")
    out = parser.parse_args().output
    out.mkdir()
    (out / "wheel.pdf").write_bytes(pdf())
    shutil.copyfile(Path(__file__).with_name("index.html"), out / "index.html")
