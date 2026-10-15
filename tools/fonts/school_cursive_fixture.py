#!/usr/bin/env python3
"""Synthetic .docx fixtures and checks for the French school cursive substitutes (no real content).

  school_cursive_fixture.py gen DIR            write DIR/sc01.docx and DIR/manifest.csv (harness corpus)
  school_cursive_fixture.py check OURS_DIR     check the PDF produced by the harness (ours/sc01.pdf)

The fixture has three paragraphs in "Cursif & Lignes" (Seyes lines drawn in the glyphs, line height about
2.5 em in Word), one in a font that the font table declares as script (with an alternate name) and one in a font declared as swiss.
Checks (pdffonts / pdftotext -bbox): the ruled font is substituted by "Playwrite Seyes Metric", the pitch of
the lines is that of the original font (not Carlito's 1.22 em), a script-declared unknown font gets
"Playwrite FR Moderne Compact", a swiss unknown font gets Carlito.
"""
import os, re, subprocess, sys, zipfile

CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>'
RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
DRELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>'
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
FONTS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts %s>'
         '<w:font w:name="Cursif &amp; Lignes"><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'
         '<w:font w:name="Zzz Test Hand"><w:altName w:val="Zzz Hand Alt"/><w:charset w:val="00"/><w:family w:val="script"/><w:pitch w:val="variable"/></w:font>'
         '<w:font w:name="Zzz Test Sans"><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'
         '</w:fonts>') % NS


def para(font, size, text):
    rpr = '<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s"/><w:sz w:val="%d"/></w:rPr>' % (font, font, size * 2)
    return '<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>%s</w:pPr><w:r>%s<w:t>%s</w:t></w:r></w:p>' % (rpr, rpr, text)


def gen(d):
    os.makedirs(d, exist_ok=True)
    body = "".join([para("Cursif &amp; Lignes", 36, "Le petit chat"), para("Cursif &amp; Lignes", 36, "grogne"),
                    para("Cursif &amp; Lignes", 36, "dans le jardin"),
                    para("Zzz Test Hand", 20, "Unknown script font"), para("Zzz Test Sans", 20, "Unknown sans font")])
    doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document %s><w:body>%s<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>' % (NS, body)
    with zipfile.ZipFile(os.path.join(d, "sc01.docx"), "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT); z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", doc); z.writestr("word/fontTable.xml", FONTS)
        z.writestr("word/_rels/document.xml.rels", DRELS)
    open(os.path.join(d, "manifest.csv"), "w").write("id,file,category,origin,source_url,license,retrieved,pages_estimate,features,notes\n"
                                                      "sc01,sc01.docx,synthetic,generated,,CC0,,1,,school cursive fixture\n")


def check(ours):
    pdf = os.path.join(ours, "sc01.pdf")
    fonts = subprocess.run(["pdffonts", pdf], capture_output=True, text=True, check=True).stdout
    xml = subprocess.run(["pdftotext", "-bbox", pdf, "-"], capture_output=True, text=True, check=True).stdout
    words = [(float(m.group(2)), float(m.group(4)), m.group(5)) for m in
             re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', xml)]
    ok = True

    def expect(cond, msg):
        nonlocal ok
        print(("ok   " if cond else "FAIL ") + msg)
        ok = ok and cond
    expect("PlaywriteSeyesMetric" in fonts.replace(" ", ""), "ruled school font -> Playwrite Seyes Metric")
    expect("PlaywriteFRModerneCompact" in fonts.replace(" ", ""), "font declared script by the document -> Playwrite FR Moderne Compact")
    expect("Carlito" in fonts, "font declared swiss (unknown) -> Carlito")
    # lines of the ruled font are the tall ones (a word box is as high as the font line height)
    ys = sorted({round(w[0], 1) for w in words if w[1] - w[0] > 80})
    expect(len(ys) == 3, "three ruled lines found")
    if len(ys) == 3:
        pitch = ys[1] - ys[0]
        expect(abs(pitch - 36 * 2.5) < 4, "line pitch %.1f pt = 36 pt x about 2.5 (Carlito would give %.1f)" % (pitch, 36 * 1.22))
    return ok


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "gen":
        gen(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "check":
        sys.exit(0 if check(sys.argv[2]) else 1)
    else:
        sys.exit(__doc__)
