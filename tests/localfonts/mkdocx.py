#!/usr/bin/env python3
"""Synthetic test document for tests/localfonts: paragraphs in a font the server does not have (Fira Sans,
installed on the test machine only), in Calibri, and in a font installed nowhere. No font file is involved.
usage: mkdocx.py out.docx [font-name]"""
import sys, zipfile

out = sys.argv[1]
fira = sys.argv[2] if len(sys.argv) > 2 else "Fira Sans"
LOREM = ("Les enfants de la classe de CM1 ont lu le texte, puis ils ont repondu aux questions "
         "sur les fractions: un demi, un tiers, trois quarts. ") * 6

def run(text, font, bold=False, italic=False, sz=26):
    rpr = '<w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>' % (font, font, font)
    if bold: rpr += "<w:b/>"
    if italic: rpr += "<w:i/>"
    rpr += '<w:sz w:val="%d"/>' % sz
    return '<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r>' % (rpr, text)

body = "".join("<w:p>%s</w:p>" % r for r in [
    run(LOREM, fira),
    run("Texte en gras italique. " * 8, fira, True, True),
    run(LOREM, "Calibri"),
    run(LOREM, "Cursive standard"),
    # short lines (no wrapping): the width of each style of the test font
    run("Les enfants de la classe de CM1", fira),
    run("Les enfants de la classe de CM1", fira, bold=True),
    run("Les enfants de la classe de CM1", fira, italic=True),
    run("Les enfants de la classe de CM1", fira, True, True),
])
doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
       '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s'
       '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" '
       'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>') % body

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr("word/document.xml", doc)
