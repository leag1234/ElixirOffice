# SPDX-License-Identifier: AGPL-3.0-only
"""Generate a fictional Nimbus Sans DOCX for the isolated desktop regression."""
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
target = Path(sys.argv[1])
target.parent.mkdir(parents=True, exist_ok=True)
parts = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/_rels/document.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>',
    "word/fontTable.xml": '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Nimbus Sans"/></w:fonts>',
    "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Nimbus Sans" w:hAnsi="Nimbus Sans"/><w:sz w:val="24"/></w:rPr><w:t>PUBLIC SYSTEM FONT NIMBUS SAVE CHECK</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
}
with ZipFile(target, "w", ZIP_DEFLATED) as output:
    for name, content in parts.items():
        output.writestr(name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+content)
