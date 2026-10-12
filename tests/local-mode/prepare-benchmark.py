#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Add explicit pages to a public synthetic DOCX without rewriting its XML."""
import argparse
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("destination", type=Path)
parser.add_argument("--first-page", type=int, default=98)
parser.add_argument("--pages", type=int, default=3)
args = parser.parse_args()
if args.source.resolve() == args.destination.resolve() or args.pages < 1:
    parser.error("use a separate output file and a positive page count")
args.destination.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.source) as source, zipfile.ZipFile(args.destination, "w") as destination:
    for item in source.infolist():
        data = source.read(item.filename)
        if item.filename == "word/document.xml":
            xml = data.decode("utf-8")
            body_end = xml.rfind("</w:body>")
            position = xml.rfind("<w:sectPr", 0, body_end)
            if position < 0:
                position = body_end
            if position < 0:
                raise ValueError("expected synthetic DOCX Word namespace prefix")
            extra = "".join(
                '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>Synthetic benchmark page '
                + str(page) + '</w:t></w:r></w:p>'
                for page in range(args.first_page, args.first_page + args.pages)
            )
            data = (xml[:position] + extra + xml[position:]).encode("utf-8")
        destination.writestr(item, data)
print("prepared", args.destination, "; verify its actual page count in Chromium")
