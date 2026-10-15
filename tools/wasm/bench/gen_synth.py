#!/usr/bin/env python3
"""Generate synthetic benchmark documents (no private data), deterministic.

usage: gen_synth.py OUT_DIR
  OUT_DIR/synth100.docx  ~100 pages: headings, TOC, lists, 14 tables, 18 images
                         (JPEG+PNG), header/footer, footnotes
  OUT_DIR/synth2000.xlsx 2000 rows x 20 columns, formulas, 2 sheets
Needs Pillow; everything else is raw OOXML written with zipfile.
"""
import io, random, sys, zipfile
from pathlib import Path
from xml.sax.saxutils import escape
from PIL import Image, ImageDraw

R = random.Random(42)
WORDS = ("system process document network resource policy budget report quarter measure result "
         "service review project schedule vendor contract risk control audit design release "
         "customer market growth revenue cost margin target forecast analysis plan owner team "
         "update change request approval standard quality incident response capacity storage "
         "platform integration migration timeline milestone dependency benefit outcome").split()

def sent(n=None):
    n = n or R.randint(8, 18)
    s = " ".join(R.choice(WORDS) for _ in range(n))
    return s[0].upper() + s[1:] + "."

def para(k=None):
    return " ".join(sent() for _ in range(k or R.randint(4, 7)))

NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')

def run(t, b=False):
    return f'<w:r>{"<w:rPr><w:b/></w:rPr>" if b else ""}<w:t xml:space="preserve">{escape(t)}</w:t></w:r>'

def p(t, style=None, extra=""):
    st = '<w:pStyle w:val="%s"/>' % style if style else ""
    pp = '<w:pPr>%s%s</w:pPr>' % (st, extra) if (style or extra) else ""
    return f'<w:p>{pp}{run(t)}</w:p>'

def img_xml(rid, i, w_emu, h_emu):
    return (f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
            f'<wp:extent cx="{w_emu}" cy="{h_emu}"/><wp:docPr id="{i}" name="Picture {i}" descr="Figure {i}"/>'
            f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
            f'<pic:nvPicPr><pic:cNvPr id="{i}" name="img{i}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{w_emu}" cy="{h_emu}"/></a:xfrm>'
            f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>'
            f'</wp:inline></w:drawing></w:r></w:p>')

def make_image(i):
    w, h = 1000, 600
    im = Image.new("RGB", (w, h), (240, 240, 240))
    d = ImageDraw.Draw(im)
    for _ in range(260):
        x, y = R.randint(0, w), R.randint(0, h)
        d.ellipse([x, y, x + R.randint(10, 160), y + R.randint(10, 160)],
                  fill=tuple(R.randint(0, 255) for _ in range(3)))
    for k in range(10):  # chart-like bars
        d.rectangle([60 + k * 110, h - R.randint(80, 500), 140 + k * 110, h - 40], fill=(30, 80 + k * 14, 160))
    # noise for realistic compressed size
    noise = Image.effect_noise((w, h), 40).convert("RGB")
    im = Image.blend(im, noise, 0.07)
    b = io.BytesIO()
    if i % 2:
        im.save(b, "JPEG", quality=85); return b.getvalue(), "jpeg"
    im.save(b, "PNG", optimize=False); return b.getvalue(), "png"

SHD = '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>'

def table(ncols, nrows):
    grid = "".join('<w:gridCol w:w="%d"/>' % (9000 // ncols) for _ in range(ncols))
    rows = []
    for r in range(nrows):
        cells = "".join(
            f'<w:tc><w:tcPr><w:tcW w:w="{9000 // ncols}" w:type="dxa"/>'
            f'{SHD if r == 0 else ""}</w:tcPr>'
            f'<w:p>{run(R.choice(WORDS).title() if r == 0 else (str(R.randint(100, 99999)) if c else sent(3)), r == 0)}</w:p></w:tc>'
            for c in range(ncols))
        rows.append(f'<w:tr>{"<w:trPr><w:tblHeader/></w:trPr>" if r == 0 else ""}{cells}</w:tr>')
    return ('<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9000" w:type="dxa"/>'
            '<w:tblBorders>' + "".join(f'<w:{s} w:val="single" w:sz="4" w:space="0" w:color="808080"/>'
            for s in ("top", "left", "bottom", "right", "insideH", "insideV")) + '</w:tblBorders></w:tblPr>'
            f'<w:tblGrid>{grid}</w:tblGrid>{"".join(rows)}</w:tbl>' + '<w:p/>')

def build_docx(path, chapters=20):
    body, rels, media, notes = [], [], {}, []
    body.append(p("Synthetic Benchmark Report", "Title"))
    body.append(p("Table of Contents", "TOCHeading"))
    body.append('<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>'
                '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Update the field to build the table of contents.</w:t></w:r>'
                '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>')
    body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
    nimg = ntab = 0
    for c in range(1, chapters + 1):
        body.append(p(f"{c}. {sent(4)[:-1]}", "Heading1"))
        for s in range(1, 4):
            body.append(p(f"{c}.{s} {sent(3)[:-1]}", "Heading2"))
            for _ in range(R.randint(3, 4)):
                t = para()
                fn = ""
                if R.random() < 0.35:
                    notes.append(sent(12))
                    fn = f'<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="{len(notes)}"/></w:r>'
                body.append(f'<w:p>{run(t)}{fn}</w:p>')
            if s == 2:
                for _ in range(5):
                    body.append(p(sent(8), "ListBullet", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'))
                for _ in range(4):
                    body.append(p(sent(8), "ListNumber", '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'))
            if s == 3 and ntab < 14 and c % 1 == 0 and c <= 14:
                ntab += 1
                body.append(p(f"Table {ntab}. {sent(5)}", "Caption"))
                body.append(table(R.randint(4, 6), R.randint(14, 24)))
            if s == 1 and nimg < 18 and c % 1 == 0 and (c <= 18):
                nimg += 1
                data, kind = make_image(nimg)
                name = f"image{nimg}.{'jpg' if kind == 'jpeg' else 'png'}"
                media[name] = data
                rels.append(f'<Relationship Id="rIdImg{nimg}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{name}"/>')
                body.append(img_xml(f"rIdImg{nimg}", nimg, 5400000, 3150000))
                body.append(p(f"Figure {nimg}. {sent(6)}", "Caption"))
    sect = ('<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="default" r:id="rIdF"/>'
            '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>')
    doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {NS}><w:body>{"".join(body)}{sect}</w:body></w:document>'
    fnx = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           f'<w:footnotes {NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
           '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
           + "".join(f'<w:footnote w:id="{i}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>{run(" " + t)}</w:p></w:footnote>'
                     for i, t in enumerate(notes, 1)) + '</w:footnotes>')
    hdr = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {NS}>{p("Synthetic Benchmark Report - Confidential sample", "Header")}</w:hdr>'
    ftr = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>'
           '<w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r>'
           '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>')
    def style(i, name, extra="", based="Normal", typ="paragraph"):
        return f'<w:style w:type="{typ}" w:styleId="{i}"><w:name w:val="{name}"/>' + (f'<w:basedOn w:val="{based}"/>' if based else "") + extra + '</w:style>'
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Carlito" w:hAnsi="Carlito"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>'
        '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
        + style("Title", "Title", '<w:rPr><w:sz w:val="56"/></w:rPr>')
        + style("Heading1", "heading 1", '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F3864"/></w:rPr>')
        + style("Heading2", "heading 2", '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="2F5496"/></w:rPr>')
        + style("TOCHeading", "TOC Heading", '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>')
        + style("Caption", "caption", '<w:rPr><w:i/><w:sz w:val="18"/></w:rPr>')
        + style("ListBullet", "List Bullet") + style("ListNumber", "List Number")
        + style("Header", "header") + style("Footer", "footer")
        + style("FootnoteText", "footnote text", '<w:rPr><w:sz w:val="18"/></w:rPr>')
        + style("FootnoteReference", "footnote reference", '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>', None, "character")
        + style("TableGrid", "Table Grid", "", None, "table") + '</w:styles>')
    def lvl(fmt, txt): return f'<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="{txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>'
    numbering = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:abstractNum w:abstractNumId="0">{lvl("bullet", "&#8226;")}</w:abstractNum><w:abstractNum w:abstractNumId="1">{lvl("decimal", "%1.")}</w:abstractNum>'
        '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>')
    RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
    drels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rIdS" Type="{RT}styles" Target="styles.xml"/><Relationship Id="rIdN" Type="{RT}numbering" Target="numbering.xml"/>'
        f'<Relationship Id="rIdFn" Type="{RT}footnotes" Target="footnotes.xml"/><Relationship Id="rIdH" Type="{RT}header" Target="header1.xml"/>'
        f'<Relationship Id="rIdF" Type="{RT}footer" Target="footer1.xml"/>{"".join(rels)}</Relationships>')
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        '<Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
        '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
        '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>')
    root = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{RT}officeDocument" Target="word/document.xml"/></Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct); z.writestr("_rels/.rels", root)
        z.writestr("word/document.xml", doc); z.writestr("word/_rels/document.xml.rels", drels)
        z.writestr("word/styles.xml", styles); z.writestr("word/numbering.xml", numbering)
        z.writestr("word/footnotes.xml", fnx); z.writestr("word/header1.xml", hdr); z.writestr("word/footer1.xml", ftr)
        for n, d in media.items(): z.writestr("word/media/" + n, d)
    return len(" ".join(body).split()), ntab, nimg, len(notes)

def col(n):
    s = ""
    while n: n, r = divmod(n - 1, 26); s = chr(65 + r) + s
    return s

def build_xlsx(path, rows=2000, cols=20):
    sst, idx = [], {}
    def si(t):
        if t not in idx: idx[t] = len(sst); sst.append(t)
        return idx[t]
    out = []
    hdr = "".join(f'<c r="{col(c)}1" t="s"><v>{si("Metric " + str(c))}</v></c>' for c in range(1, cols + 1))
    out.append(f'<row r="1">{hdr}</row>')
    for r in range(2, rows + 2):
        cells = []
        for c in range(1, cols + 1):
            ref = f"{col(c)}{r}"
            if c == 1: cells.append(f'<c r="{ref}" t="s"><v>{si("Item " + str(r - 1))}</v></c>')
            elif c <= 12: cells.append(f'<c r="{ref}"><v>{R.randint(1, 100000) / 100}</v></c>')
            elif c == 13: cells.append(f'<c r="{ref}"><f>SUM(B{r}:L{r})</f></c>')
            elif c == 14: cells.append(f'<c r="{ref}"><f>AVERAGE(B{r}:L{r})</f></c>')
            elif c == 15: cells.append(f'<c r="{ref}"><f>IF(M{r}&gt;500000,"high","low")</f></c>')
            elif c == 16: cells.append(f'<c r="{ref}"><f>MAX(B{r}:L{r})-MIN(B{r}:L{r})</f></c>')
            elif c == 17: cells.append(f'<c r="{ref}"><f>ROUND(B{r}*C{r}/100,2)</f></c>')
            elif c == 18: cells.append(f'<c r="{ref}"><f>IF(A{r}="",0,B{r}+D{r})</f></c>')
            elif c == 19: cells.append(f'<c r="{ref}"><f>SUMIF(B$2:B${rows+1},"&gt;"&amp;B{r},C$2:C${rows+1})</f></c>' if r % 50 == 0 else f'<c r="{ref}"><f>N{r}*2</f></c>')
            else: cells.append(f'<c r="{ref}"><f>VLOOKUP(A{r},A$2:B${rows+1},2,FALSE)</f></c>' if r % 10 == 0 else f'<c r="{ref}"><f>E{r}+F{r}</f></c>')
        out.append(f'<row r="{r}">{"".join(cells)}</row>')
    tot = "".join(f'<c r="{col(c)}{rows+2}"><f>SUM({col(c)}2:{col(c)}{rows+1})</f></c>' for c in range(2, cols + 1))
    out.append(f'<row r="{rows+2}">{tot}</row>')
    X = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    sheet1 = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {X}><sheetData>{"".join(out)}</sheetData></worksheet>'
    s2 = "".join(f'<row r="{r}"><c r="A{r}" t="s"><v>{si("Summary " + str(r))}</v></c><c r="B{r}"><f>SUM(Data!{col(r+1)}2:{col(r+1)}{rows+1})</f></c></row>' for r in range(1, 19))
    sheet2 = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet {X}><sheetData>{s2}</sheetData></worksheet>'
    sstx = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst {X} count="{len(sst)}" uniqueCount="{len(sst)}">' + "".join(f'<si><t>{escape(t)}</t></si>' for t in sst) + '</sst>'
    wb = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook {X}><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets></workbook>')
    RT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
    wrels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{RT}worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{RT}worksheet" Target="worksheets/sheet2.xml"/>'
        f'<Relationship Id="rId3" Type="{RT}sharedStrings" Target="sharedStrings.xml"/></Relationships>')
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
    root = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="{RT}officeDocument" Target="xl/workbook.xml"/></Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct); z.writestr("_rels/.rels", root)
        z.writestr("xl/workbook.xml", wb); z.writestr("xl/_rels/workbook.xml.rels", wrels)
        z.writestr("xl/worksheets/sheet1.xml", sheet1); z.writestr("xl/worksheets/sheet2.xml", sheet2)
        z.writestr("xl/sharedStrings.xml", sstx)

if __name__ == "__main__":
    out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    chapters = int(sys.argv[2]) if len(sys.argv) > 2 else 33
    print("docx words/tables/images/footnotes:", build_docx(out / "synth100.docx", chapters))
    build_xlsx(out / "synth2000.xlsx")
    for f in sorted(out.iterdir()): print(f.name, f.stat().st_size)
