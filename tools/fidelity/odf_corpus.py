#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate the synthetic OpenDocument corpus (flat ODF) for the odf-roundtrip gate.

Every file is written by this script: no third-party documents. Each document exercises one
feature group so that a loss can be attributed to a feature. LibreOffice then normalises the flat
files to .odt/.ods/.odp (see odf-roundtrip.sh).

usage: odf_corpus.py OUT_DIR       writes <id>.fodt / .fods / .fodp and manifest.json
"""
import base64, json, struct, sys, zlib
from pathlib import Path

NS = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
      'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
      'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
      'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
      'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
      'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" '
      'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" '
      'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" '
      'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
      'xmlns:chart="urn:oasis:names:tc:opendocument:xmlns:chart:1.0" '
      'xmlns:dr3d="urn:oasis:names:tc:opendocument:xmlns:dr3d:1.0" '
      'xmlns:math="http://www.w3.org/1998/Math/MathML" '
      'xmlns:form="urn:oasis:names:tc:opendocument:xmlns:form:1.0" '
      'xmlns:script="urn:oasis:names:tc:opendocument:xmlns:script:1.0" '
      'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0" '
      'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" '
      'xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0" '
      'xmlns:smil="urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0" '
      'xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" '
      'xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" '
      'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0" '
      'xmlns:field="urn:openoffice:names:experimental:ooo-ms-interop:xmlns:field:1.0" '
      'xmlns:ooo="http://openoffice.org/2004/office" xmlns:grddl="http://www.w3.org/2003/g/data-view#" '
      'xmlns:xhtml="http://www.w3.org/1999/xhtml"')
MIME = {'t': 'text', 's': 'spreadsheet', 'p': 'presentation'}


def png(w=96, h=64, seed=0):
    rows = b''.join(b'\0' + bytes(v for x in range(w) for v in ((x * 255 // w + seed * 40) % 256, y * 255 // h, (seed * 90 + 60) % 256)) for y in range(h))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


def image(w, h, seed=0, extra='', frame_attrs=''):
    b = base64.b64encode(png(seed=seed)).decode()
    return (f'<draw:frame draw:name="img{seed}" svg:width="{w}" svg:height="{h}" {frame_attrs}>'
            f'<draw:image {extra}><office:binary-data>{b}</office:binary-data></draw:image></draw:frame>')


def flat(kind, body, auto='', styles='', settings=''):
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<office:document {NS} office:version="1.3" '
            f'office:mimetype="application/vnd.oasis.opendocument.{MIME[kind]}">'
            '<office:meta><dc:title>ODF gate corpus</dc:title><meta:initial-creator>odf-gate</meta:initial-creator></office:meta>'
            f'{settings}<office:font-face-decls><style:font-face style:name="Liberation Serif" svg:font-family="\'Liberation Serif\'"/>'
            '<style:font-face style:name="Liberation Sans" svg:font-family="\'Liberation Sans\'"/></office:font-face-decls>'
            f'<office:styles>{styles}</office:styles><office:automatic-styles>{auto}</office:automatic-styles>'
            f'{body}</office:document>')


def lorem(n=1):
    s = ('The quick brown fox jumps over the lazy dog while the committee reviews the quarterly plan. ')
    return (s * n).strip()


# --------------------------------------------------------------------------- Writer
PAGE_A4 = ('<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" '
           'fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/>'
           '<style:header-style/><style:footer-style/></style:page-layout>')
BASE_STYLES = ('<style:default-style style:family="paragraph"><style:paragraph-properties fo:orphans="2" fo:widows="2"/>'
               '<style:text-properties style:font-name="Liberation Serif" fo:font-size="12pt" fo:language="en" fo:country="US"/></style:default-style>'
               '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>'
               '<style:style style:name="Heading" style:family="paragraph" style:next-style-name="Text_20_body" style:class="text">'
               '<style:paragraph-properties fo:margin-top="0.4cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/>'
               '<style:text-properties style:font-name="Liberation Sans" fo:font-size="14pt"/></style:style>'
               '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text">'
               '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.2cm"/></style:style>'
               + ''.join(f'<style:style style:name="Heading_20_{i}" style:display-name="Heading {i}" style:family="paragraph" style:parent-style-name="Heading" '
                         f'style:next-style-name="Text_20_body" style:default-outline-level="{i}" style:class="text"><style:text-properties fo:font-size="{20-2*i}pt" fo:font-weight="bold"/></style:style>'
                         for i in (1, 2, 3))
               + '<text:outline-style style:name="Outline">' + ''.join(
                   f'<text:outline-level-style text:level="{i}" style:num-format="1" text:display-levels="{i}"/>' for i in range(1, 4)) + '</text:outline-style>'
               '<style:style style:name="Header" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"/>'
               '<style:style style:name="Footer" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"/>'
               '<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard"/>'
               '<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-style="italic" fo:font-size="10pt"/></style:style>'
               '<style:style style:name="Hyperlink" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#0000ee" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>'
               '<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="10pt"/></style:style>'
               '<text:notes-configuration text:note-class="footnote" style:num-format="1" text:start-value="0" text:footnotes-position="page"/>'
               '<text:notes-configuration text:note-class="endnote" style:num-format="i" text:start-value="0"/>')
MASTER = '<style:master-page style:name="Standard" style:page-layout-name="pm1"/>'


def writer(body, auto='', styles='', master=MASTER, layout=PAGE_A4):
    return flat('t', f'<office:body><office:text>{body}</office:text></office:body>',
                auto=auto + layout if layout not in auto else auto, styles=BASE_STYLES + styles + '')\
        .replace('</office:styles>', f'</office:styles><office:master-styles>{master}</office:master-styles>', 1) \
        if False else _writer(body, auto, styles, master, layout)


def _writer(body, auto, styles, master, layout):
    x = flat('t', f'<office:body><office:text>{body}</office:text></office:body>', auto=layout + auto, styles=BASE_STYLES + styles)
    return x.replace('<office:body>', f'<office:master-styles>{master}</office:master-styles><office:body>', 1)


def P(t, s='Text_20_body'):
    return f'<text:p text:style-name="{s}">{t}</text:p>'


def H(t, n=1):
    return f'<text:h text:style-name="Heading_20_{n}" text:outline-level="{n}">{t}</text:h>'


W = {}

W['w01_styles'] = writer(
    H('Paragraph and character styles') + P('Normal body text with ' + '<text:span text:style-name="B">bold</text:span>, <text:span text:style-name="I">italic</text:span>, '
      '<text:span text:style-name="U">underline</text:span>, <text:span text:style-name="Col">coloured</text:span>, <text:span text:style-name="Big">large</text:span> and '
      '<text:span text:style-name="Emph">a named character style</text:span>.')
    + P(lorem(3), 'Quote') + P(lorem(2), 'Boxed') + P('Right aligned', 'Right') + P('Centered', 'Center') + P(lorem(2), 'Justified') + P(lorem(2), 'Indented')
    + P('Double spacing. ' + lorem(2), 'Double') + P('Tabs:<text:tab/>one<text:tab/>two<text:tab/>three', 'Tabbed') + H('Level two', 2) + H('Level three', 3)
    + P('Subscript H<text:span text:style-name="Sub">2</text:span>O, superscript x<text:span text:style-name="Sup">2</text:span>, '
        '<text:span text:style-name="Strike">struck</text:span>, <text:span text:style-name="Caps">small caps</text:span>, <text:span text:style-name="Spaced">spaced</text:span>.'),
    auto='<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>'
         '<style:style style:name="I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>'
         '<style:style style:name="U" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>'
         '<style:style style:name="Col" style:family="text"><style:text-properties fo:color="#c00000" fo:background-color="#ffff99"/></style:style>'
         '<style:style style:name="Big" style:family="text"><style:text-properties fo:font-size="20pt" style:font-name="Liberation Sans"/></style:style>'
         '<style:style style:name="Sub" style:family="text"><style:text-properties style:text-position="sub 58%"/></style:style>'
         '<style:style style:name="Sup" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>'
         '<style:style style:name="Strike" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>'
         '<style:style style:name="Caps" style:family="text"><style:text-properties fo:font-variant="small-caps"/></style:style>'
         '<style:style style:name="Spaced" style:family="text"><style:text-properties fo:letter-spacing="0.1cm"/></style:style>',
    styles='<style:style style:name="Emph" style:family="text"><style:text-properties fo:font-weight="bold" fo:color="#1f4e79" fo:font-style="italic"/></style:style>'
           '<style:style style:name="Quote" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:margin-left="1.5cm" fo:margin-right="1.5cm" fo:border-left="1.5pt solid #888888" fo:padding-left="0.3cm"/><style:text-properties fo:font-style="italic"/></style:style>'
           '<style:style style:name="Boxed" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:background-color="#e8f0fa" fo:border="1pt solid #1f4e79" fo:padding="0.15cm"/></style:style>'
           '<style:style style:name="Right" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="end"/></style:style>'
           '<style:style style:name="Center" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="center"/></style:style>'
           '<style:style style:name="Justified" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="justify"/></style:style>'
           '<style:style style:name="Indented" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:margin-left="2cm" fo:text-indent="-1cm"/></style:style>'
           '<style:style style:name="Double" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:line-height="200%"/></style:style>'
           '<style:style style:name="Tabbed" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties><style:tab-stops><style:tab-stop style:position="3cm"/><style:tab-stop style:position="7cm" style:type="center"/><style:tab-stop style:position="12cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties></style:style>')

LISTSTYLES = ('<text:list-style style:name="LBullet">' + ''.join(
    f'<text:list-level-style-bullet text:level="{i}" text:bullet-char="{["•","◦","▪"][(i-1)%3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="{0.6*i+0.6}cm" fo:text-indent="-0.6cm" fo:margin-left="{0.6*i+0.6}cm"/></style:list-level-properties></text:list-level-style-bullet>' for i in range(1, 5)) + '</text:list-style>'
    '<text:list-style style:name="LNum">' + ''.join(
    f'<text:list-level-style-number text:level="{i}" style:num-format="{["1","a","i","A"][i-1]}" style:num-suffix="." text:display-levels="1"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="{0.8*i+0.6}cm" fo:text-indent="-0.8cm" fo:margin-left="{0.8*i+0.6}cm"/></style:list-level-properties></text:list-level-style-number>' for i in range(1, 5)) + '</text:list-style>'
    '<text:list-style style:name="LOutline">' + ''.join(
    f'<text:list-level-style-number text:level="{i}" style:num-format="1" text:display-levels="{i}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="{1.0*i+0.5}cm" fo:text-indent="-1cm" fo:margin-left="{1.0*i+0.5}cm"/></style:list-level-properties></text:list-level-style-number>' for i in range(1, 5)) + '</text:list-style>')


def lst(style, items, extra=''):
    def rec(items):
        out = ''
        for it in items:
            if isinstance(it, list):
                out += f'<text:list-item><text:list>{rec(it)}</text:list></text:list-item>'
            else:
                out += f'<text:list-item><text:p text:style-name="Text_20_body">{it}</text:p></text:list-item>'
        return out
    return f'<text:list text:style-name="{style}"{extra}>{rec(items)}</text:list>'


W['w02_lists'] = writer(
    H('Lists') + P('Bulleted:') + lst('LBullet', ['Apples', ['Granny Smith', ['Green', 'Tart'], 'Gala'], 'Pears', 'Plums'])
    + P('Numbered:') + lst('LNum', ['First', ['Sub a', 'Sub b', ['Deep i', 'Deep ii']], 'Second', 'Third'])
    + P('Outline numbering:') + lst('LOutline', ['Scope', ['Goals', 'Non-goals'], 'Design', ['Data', ['Model', 'Storage']], 'Risks'])
    + P('Restarted numbering:') + lst('LNum', ['Alpha', 'Beta'], ' text:continue-numbering="false"')
    + lst('LNum', ['Gamma restarts at one', 'Delta'], ' text:continue-numbering="false"'), styles=LISTSTYLES)

cell = lambda t, st='TC', extra='': f'<table:table-cell table:style-name="{st}" office:value-type="string"{extra}><text:p text:style-name="Table_20_Contents">{t}</text:p></table:table-cell>'
covered = '<table:covered-table-cell/>'
TBL_AUTO = ('<style:style style:name="Tab1" style:family="table"><style:table-properties style:width="16cm" table:align="left" fo:margin-bottom="0.3cm"/></style:style>'
            + ''.join(f'<style:style style:name="Tab1.{c}" style:family="table-column"><style:table-column-properties style:column-width="{w}cm"/></style:style>' for c, w in zip('ABCD', (3, 5, 4, 4)))
            + '<style:style style:name="TC" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>'
            '<style:style style:name="TH" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000" fo:background-color="#1f4e79"/><style:text-properties fo:color="#ffffff" fo:font-weight="bold"/></style:style>'
            '<style:style style:name="TS" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border-top="2pt solid #c00000" fo:border-bottom="2pt double #00aa00" fo:border-left="0.5pt dashed #000000" fo:border-right="none" fo:background-color="#ffe699" style:vertical-align="middle"/></style:style>'
            '<style:style style:name="Tab2" style:family="table"><style:table-properties style:width="10cm" table:align="center" fo:margin-top="0.3cm"/></style:style>'
            '<style:style style:name="Tab2.A" style:family="table-column"><style:table-column-properties style:column-width="5cm"/></style:style>'
            '<style:style style:name="Tab2.B" style:family="table-column"><style:table-column-properties style:column-width="5cm"/></style:style>')
t1 = ('<table:table table:name="Table1" table:style-name="Tab1">' + ''.join(f'<table:table-column table:style-name="Tab1.{c}"/>' for c in 'ABCD')
      + '<table:table-header-rows><table:table-row>' + ''.join(cell(h, 'TH') for h in ('Name', 'Description', 'Qty', 'Total')) + '</table:table-row></table:table-header-rows>'
      + '<table:table-row>' + cell('Merged across', 'TS', ' table:number-columns-spanned="2"') + covered + cell('3') + cell('30') + '</table:table-row>'
      + '<table:table-row>' + cell('Merged down', 'TS', ' table:number-rows-spanned="2"') + cell('x') + cell('1') + cell('10') + '</table:table-row>'
      + '<table:table-row>' + covered + cell('y') + cell('2') + cell('20') + '</table:table-row>'
      + ''.join('<table:table-row>' + ''.join(cell(f'r{i}c{j}') for j in range(4)) + '</table:table-row>' for i in range(4, 9)) + '</table:table>')
t2 = ('<table:table table:name="Table2" table:style-name="Tab2"><table:table-column table:style-name="Tab2.A"/><table:table-column table:style-name="Tab2.B"/>'
      '<table:table-row><table:table-cell table:style-name="TC" office:value-type="string"><text:p>Outer</text:p><table:table table:name="Nested"><table:table-column/><table:table-row>'
      + cell('nested') + '</table:table-row></table:table></table:table-cell>' + cell('plain') + '</table:table-row></table:table>')
W['w03_tables'] = writer(H('Tables') + t1 + P('Second table with a nested table:') + t2, auto=TBL_AUTO)

IMG_AUTO = ('<style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:wrap="none" style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="center" style:horizontal-rel="paragraph"/></style:style>'
            '<style:style style:name="fr2" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:wrap="parallel" style:number-wrapped-paragraphs="no-limit" style:wrap-contour="false" style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="right" style:horizontal-rel="paragraph" fo:margin-left="0.3cm" fo:margin-bottom="0.2cm" fo:border="1pt solid #000000"/></style:style>'
            '<style:style style:name="fr3" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:wrap="run-through" style:vertical-pos="from-top" style:vertical-rel="page" style:horizontal-pos="from-left" style:horizontal-rel="page" svg:x="10cm" svg:y="20cm"/></style:style>')
GR_STYLE = '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="paragraph" svg:x="0cm" svg:y="0cm" style:wrap="none"/></style:style><style:style style:name="Text_20_frame" style:family="graphic"/>'
W['w04_images'] = writer(
    H('Images') + P('Inline image: ' + image('3cm', '2cm', 1, frame_attrs='text:anchor-type="as-char"')) .replace('<draw:frame ', '<draw:frame draw:style-name="fr1" ', 1)
    + P('Wrapped image on the right. ' + image('4cm', '3cm', 2, frame_attrs='draw:style-name="fr2" text:anchor-type="paragraph"') + lorem(8))
    + P(image('3cm', '3cm', 3, frame_attrs='draw:style-name="fr3" text:anchor-type="page" text:anchor-page-number="1"') + 'Paragraph with an image anchored to the page.')
    + P('Image with caption: ' + '<draw:frame draw:style-name="fr1" draw:name="capframe" text:anchor-type="as-char" svg:width="5cm"><draw:text-box fo:min-height="1cm">'
        + P(image('4cm', '2.5cm', 4, frame_attrs='text:anchor-type="as-char"') + '<text:line-break/>Figure <text:sequence text:ref-name="refFigure0" text:name="Figure" style:num-format="1" text:formula="ooow:Figure+1">1</text:sequence>: caption', 'Caption') + '</draw:text-box></draw:frame>'),
    auto=IMG_AUTO, styles=GR_STYLE)

W['w05_frames'] = writer(
    H('Frames, text boxes and shapes')
    + P('Text box: <draw:frame draw:style-name="fr1" draw:name="TextBox1" text:anchor-type="as-char" svg:width="6cm" fo:min-height="2cm"><draw:text-box>'
        + P('Text inside a frame, with <text:span text:style-name="Col">colour</text:span>.') + '</draw:text-box></draw:frame>')
    + P('Shapes follow.<draw:rect draw:style-name="shp" draw:name="Rect1" text:anchor-type="paragraph" svg:x="1cm" svg:y="1cm" svg:width="4cm" svg:height="2cm"><text:p>Rectangle</text:p></draw:rect>'
        '<draw:ellipse draw:style-name="shp" draw:name="Ell1" text:anchor-type="paragraph" svg:x="6cm" svg:y="1cm" svg:width="3cm" svg:height="2cm"/>'
        '<draw:line draw:style-name="shp" text:anchor-type="paragraph" svg:x1="10cm" svg:y1="1cm" svg:x2="14cm" svg:y2="3cm"/>')
    + P('Group: <draw:g text:anchor-type="paragraph" draw:style-name="shp"><draw:rect draw:style-name="shp" svg:x="1cm" svg:y="4cm" svg:width="2cm" svg:height="1cm"/><draw:rect draw:style-name="shp" svg:x="2cm" svg:y="4.5cm" svg:width="2cm" svg:height="1cm"/></draw:g>')
    + P(lorem(6)),
    auto=IMG_AUTO + '<style:style style:name="shp" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#9dc3e6" draw:stroke="solid" svg:stroke-color="#1f4e79" svg:stroke-width="0.05cm" style:wrap="none"/></style:style>'
         '<style:style style:name="Col" style:family="text"><style:text-properties fo:color="#c00000"/></style:style>', styles=GR_STYLE)

HF_LAYOUT = ('<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="1cm" fo:margin-bottom="1cm" fo:margin-left="2cm" fo:margin-right="2cm"/>'
             '<style:header-style><style:header-footer-properties fo:min-height="0.8cm" fo:margin-bottom="0.3cm"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height="0.8cm" fo:margin-top="0.3cm"/></style:footer-style></style:page-layout>'
             '<style:page-layout style:name="pm2"><style:page-layout-properties fo:page-width="29.7cm" fo:page-height="21cm" style:print-orientation="landscape" fo:margin-top="1cm" fo:margin-bottom="1cm" fo:margin-left="2cm" fo:margin-right="2cm"/>'
             '<style:header-style><style:header-footer-properties fo:min-height="0.8cm"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height="0.8cm"/></style:footer-style></style:page-layout>')
HF_MASTER = ('<style:master-page style:name="Standard" style:page-layout-name="pm1"><style:header><text:p text:style-name="Header">Portrait header</text:p></style:header>'
             '<style:footer><text:p text:style-name="Footer">Page <text:page-number text:select-page="current">1</text:page-number> of <text:page-count>3</text:page-count></text:p></style:footer></style:master-page>'
             '<style:master-page style:name="Landscape" style:page-layout-name="pm2" style:next-style-name="Standard"><style:header><text:p text:style-name="Header">Landscape header</text:p></style:header>'
             '<style:footer><text:p text:style-name="Footer">Landscape footer <text:title>t</text:title></text:p></style:footer></style:master-page>')
W['w06_headers_footers'] = _writer(
    H('Headers and footers per page style') + P(lorem(8)) + '<text:p text:style-name="BreakLandscape">Landscape page starts here. ' + lorem(3) + '</text:p>' + P(lorem(10)) + '<text:p text:style-name="BreakStd">Back to portrait.</text:p>' + P(lorem(4)),
    '<style:style style:name="BreakLandscape" style:family="paragraph" style:parent-style-name="Text_20_body" style:master-page-name="Landscape"><style:paragraph-properties style:page-number="auto"/></style:style>'
    '<style:style style:name="BreakStd" style:family="paragraph" style:parent-style-name="Text_20_body" style:master-page-name="Standard"><style:paragraph-properties style:page-number="auto"/></style:style>',
    '', HF_MASTER, HF_LAYOUT)

W['w07_sections_columns'] = writer(
    H('Sections and columns') + P(lorem(3))
    + '<text:section text:style-name="Sect2" text:name="TwoCols">' + P(lorem(12)) + P(lorem(12)) + '</text:section>'
    + '<text:section text:style-name="Sect3" text:name="ThreeCols">' + P(lorem(15)) + '</text:section>'
    + '<text:section text:style-name="SectProt" text:name="Protected" text:protected="true">' + P('A protected section.') + '</text:section>'
    + '<text:section text:style-name="SectBg" text:name="Shaded">' + P('A section with a background and a margin.') + '</text:section>' + P(lorem(2)),
    auto='<style:style style:name="Sect2" style:family="section"><style:section-properties><style:columns fo:column-count="2" fo:column-gap="0.8cm"><style:column-sep style:width="0.5pt" style:color="#000000" style:height="100%"/><style:column style:rel-width="5000*" fo:start-indent="0cm" fo:end-indent="0.4cm"/><style:column style:rel-width="5000*" fo:start-indent="0.4cm" fo:end-indent="0cm"/></style:columns></style:section-properties></style:style>'
         '<style:style style:name="Sect3" style:family="section"><style:section-properties><style:columns fo:column-count="3" fo:column-gap="0.5cm"><style:column style:rel-width="3333*" fo:start-indent="0cm" fo:end-indent="0.25cm"/><style:column style:rel-width="3333*" fo:start-indent="0.25cm" fo:end-indent="0.25cm"/><style:column style:rel-width="3334*" fo:start-indent="0.25cm" fo:end-indent="0cm"/></style:columns></style:section-properties></style:style>'
         '<style:style style:name="SectProt" style:family="section"><style:section-properties style:editable="false"><style:columns fo:column-count="1" fo:column-gap="0cm"/></style:section-properties></style:style>'
         '<style:style style:name="SectBg" style:family="section"><style:section-properties fo:background-color="#eeeeee" fo:margin-left="1cm" fo:margin-right="1cm"><style:columns fo:column-count="1" fo:column-gap="0cm"/></style:section-properties></style:style>')

W['w08_notes'] = writer(
    H('Footnotes and endnotes') + P('A sentence with a footnote.<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body>' + P('The footnote text, with <text:span text:style-name="B">bold</text:span>.', 'Footnote') + '</text:note-body></text:note> More text.'
                                  '<text:note text:id="ftn2" text:note-class="footnote"><text:note-citation>2</text:note-citation><text:note-body>' + P('Second footnote.', 'Footnote') + '</text:note-body></text:note>')
    + P('A sentence with an endnote.<text:note text:id="edn1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body>' + P('The endnote text.', 'Footnote') + '</text:note-body></text:note>') + P(lorem(10)),
    auto='<style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>')

toc_entries = ''.join(f'<text:p text:style-name="Contents_20_{lv}"><text:a xlink:type="simple" xlink:href="#{h}{i}|outline">{h} {i}<text:tab/>{i}</text:a></text:p>' for lv, h, i in ((1, 'Chapter', 1), (1, 'Chapter', 2), (2, 'Section', 3)))
W['w09_toc'] = writer(
    H('Table of contents') + '<text:table-of-content text:style-name="Sect1" text:protected="true" text:name="Table of Contents1"><text:table-of-content-source text:outline-level="3"><text:index-title-template text:style-name="Contents_20_Heading">Contents</text:index-title-template>'
    + ''.join(f'<text:table-of-content-entry-template text:outline-level="{i}" text:style-name="Contents_20_{i}"><text:index-entry-link-start text:style-name="Index_20_Link"/><text:index-entry-chapter/><text:index-entry-text/><text:index-entry-tab-stop style:type="right" style:leader-char="."/><text:index-entry-page-number/><text:index-entry-link-end/></text:table-of-content-entry-template>' for i in (1, 2, 3))
    + '</text:table-of-content-source><text:index-body><text:index-title text:style-name="Sect1" text:name="Table of Contents1_Head"><text:p text:style-name="Contents_20_Heading">Contents</text:p></text:index-title>' + toc_entries + '</text:index-body></text:table-of-content>'
    + '<text:p text:style-name="PB"/>' + H('Chapter 1') + P(lorem(5)) + H('Chapter 2') + P(lorem(5)) + H('Section 3', 2) + P(lorem(5)),
    auto='<style:style style:name="Sect1" style:family="section"/><style:style style:name="PB" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-after="page"/></style:style>',
    styles='<style:style style:name="Contents_20_Heading" style:family="paragraph" style:parent-style-name="Heading"><style:text-properties fo:font-size="16pt"/></style:style>'
           '<style:style style:name="Contents_20_1" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties><style:tab-stops><style:tab-stop style:position="16cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties></style:style>'
           '<style:style style:name="Contents_20_2" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="0.5cm"><style:tab-stops><style:tab-stop style:position="16cm" style:type="right" style:leader-style="dotted" style:leader-text="."/></style:tab-stops></style:paragraph-properties></style:style>'
           '<style:style style:name="Contents_20_3" style:family="paragraph" style:parent-style-name="Standard"/><style:style style:name="Index_20_Link" style:family="text"/>')

W['w10_fields'] = writer(
    H('Fields') + P('Page <text:page-number text:select-page="current">1</text:page-number> of <text:page-count>1</text:page-count>. Date: <text:date style:data-style-name="N1" text:date-value="2026-03-15" text:fixed="true">2026-03-15</text:date>. Time: <text:time text:time-value="10:30:00" text:fixed="true">10:30</text:time>.')
    + P('Title: <text:title>ODF gate corpus</text:title>. Author: <text:initial-creator>odf-gate</text:initial-creator>. File: <text:file-name text:display="name">x</text:file-name>. Words: <text:word-count>9</text:word-count>.')
    + P('See <text:bookmark-ref text:reference-format="text" text:ref-name="target1">the target</text:bookmark-ref> on page <text:bookmark-ref text:reference-format="page" text:ref-name="target1">1</text:bookmark-ref>, '
        'and <text:sequence-ref text:reference-format="value" text:ref-name="refTable0">Table 1</text:sequence-ref>.')
    + P('<text:bookmark text:name="target1"/>This is the target paragraph.')
    + P('Table <text:sequence text:ref-name="refTable0" text:name="Table" style:num-format="1" text:formula="ooow:Table+1">1</text:sequence>: first caption; Table <text:sequence text:name="Table" style:num-format="1" text:formula="ooow:Table+1">2</text:sequence>: second.', 'Caption')
    + P('User field: <text:user-field-get text:name="Project">Alpha</text:user-field-get>. Variable: <text:variable-set text:name="Counter" office:value-type="float" office:value="5">5</text:variable-set> then <text:variable-get text:name="Counter">5</text:variable-get>.')
    + P('Hidden-text field and conditional text: <text:conditional-text text:condition="1=1" text:string-value-if-true="yes" text:string-value-if-false="no" text:current-value="true">yes</text:conditional-text>.')
    + P('Document property: <text:user-defined text:name="Mood">happy</text:user-defined>.'),
    auto='<number:date-style style:name="N1"><number:day number:style="long"/><number:text>/</number:text><number:month number:style="long"/><number:text>/</number:text><number:year number:style="long"/></number:date-style>')
W['w10_fields'] = W['w10_fields'].replace('<text:user-defined text:name="Mood">happy</text:user-defined>', 'n/a').replace('<office:text>', '<office:text><text:variable-decls><text:variable-decl office:value-type="float" text:name="Counter"/></text:variable-decls><text:user-field-decls><text:user-field-decl office:value-type="string" office:string-value="Alpha" text:name="Project"/></text:user-field-decls><text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:separation-character="." text:name="Table"/><text:sequence-decl text:display-outline-level="0" text:separation-character="." text:name="Figure"/></text:sequence-decls>', 1)

W['w11_comments'] = writer(
    H('Comments') + P('A sentence with a <office:annotation office:name="c1"><dc:creator>Reviewer One</dc:creator><dc:date>2026-03-01T10:00:00</dc:date><text:p>First comment.</text:p><text:p>Second paragraph of it.</text:p></office:annotation>commented range<office:annotation-end office:name="c1"/> and more text.')
    + P('Another<office:annotation><dc:creator>Reviewer Two</dc:creator><dc:date>2026-03-02T11:30:00</dc:date><text:p>Point comment without a range.</text:p></office:annotation> paragraph.') + P(lorem(4)))

W['w12_tracked'] = _writer(
    H('Tracked changes') + P('Unchanged text, <text:change-start text:change-id="ct1"/>inserted words<text:change-end text:change-id="ct1"/>, and <text:change text:change-id="ct2"/>after a deletion.')
    + P('A <text:change-start text:change-id="ct3"/>formatted<text:change-end text:change-id="ct3"/> word.') + P(lorem(3)),
    '', '', MASTER, PAGE_A4).replace('<office:text>', '<office:text><text:tracked-changes text:track-changes="true">'
    '<text:changed-region text:id="ct1"><text:insertion><office:change-info><dc:creator>Alice</dc:creator><dc:date>2026-03-01T09:00:00</dc:date></office:change-info></text:insertion></text:changed-region>'
    '<text:changed-region text:id="ct2"><text:deletion><office:change-info><dc:creator>Bob</dc:creator><dc:date>2026-03-02T09:00:00</dc:date></office:change-info><text:p text:style-name="Text_20_body">deleted sentence</text:p></text:deletion></text:changed-region>'
    '<text:changed-region text:id="ct3"><text:format-change><office:change-info><dc:creator>Alice</dc:creator><dc:date>2026-03-03T09:00:00</dc:date></office:change-info></text:format-change></text:changed-region>'
    '</text:tracked-changes>', 1)

W['w13_bookmarks_links'] = writer(
    H('Bookmarks and hyperlinks') + P('<text:bookmark text:name="Top"/>Start. External: <text:a xlink:type="simple" xlink:href="https://example.org/page?q=1" office:name="site" office:target-frame-name="_blank" text:style-name="Hyperlink">example.org</text:a>. '
                                   'Mail: <text:a xlink:type="simple" xlink:href="mailto:test@example.org" text:style-name="Hyperlink">test@example.org</text:a>. Internal: <text:a xlink:type="simple" xlink:href="#Spanned" text:style-name="Hyperlink">jump to spanned bookmark</text:a>.')
    + P(lorem(3)) + P('Before <text:bookmark-start text:name="Spanned"/>a spanned bookmark across words<text:bookmark-end text:name="Spanned"/> after. Reference mark: <text:reference-mark text:name="RM1"/>here.'), styles='')

MATH = ('<draw:frame draw:name="Formula1" text:anchor-type="as-char" svg:width="4cm" svg:height="1cm"><draw:object><math:math xmlns:math="http://www.w3.org/1998/Math/MathML"><math:semantics><math:mrow>'
        '<math:msup><math:mi>x</math:mi><math:mn>2</math:mn></math:msup><math:mo>+</math:mo><math:msup><math:mi>y</math:mi><math:mn>2</math:mn></math:msup><math:mo>=</math:mo><math:msup><math:mi>z</math:mi><math:mn>2</math:mn></math:msup></math:mrow>'
        '<math:annotation math:encoding="StarMath 5.0">x^2 + y^2 = z^2</math:annotation></math:semantics></math:math></draw:object></draw:frame>')
W['w14_math'] = writer(H('Formula object') + P('Pythagoras: ' + MATH + ' and more.') + P(lorem(2)))


def chart_obj(w='12cm', h='7cm', kind='chart:bar', anchor='as-char', name='Chart1', local=True, cats=('Q1', 'Q2', 'Q3', 'Q4'), vals=((10, 20, 15, 30), (12, 18, 22, 25)), ranges=None, extra_frame=''):
    n = len(vals)
    rows = ''.join('<table:table-row><table:table-cell office:value-type="string"><text:p>%s</text:p></table:table-cell>' % c + ''.join(f'<table:table-cell office:value-type="float" office:value="{v[i]}"><text:p>{v[i]}</text:p></table:table-cell>' for v in vals) + '</table:table-row>' for i, c in enumerate(cats))
    head = '<table:table-header-rows><table:table-row><table:table-cell/>' + ''.join(f'<table:table-cell office:value-type="string"><text:p>Series {j+1}</text:p></table:table-cell>' for j in range(n)) + '</table:table-row></table:table-header-rows>'
    series = ''.join(f'<chart:series chart:style-name="cs{j}" chart:values-cell-range-address="local-table.{chr(66+j)}2:.{chr(66+j)}{len(cats)+1}" chart:label-cell-address="local-table.{chr(66+j)}1" chart:class="{kind}"><chart:data-point chart:repeated="{len(cats)}"/></chart:series>' for j in range(n))
    if ranges:
        series = ''.join(f'<chart:series chart:style-name="cs{j}" chart:values-cell-range-address="{r}" chart:class="{kind}"><chart:data-point chart:repeated="{len(cats)}"/></chart:series>' for j, r in enumerate(ranges))
    doc = (f'<office:document office:mimetype="application/vnd.oasis.opendocument.chart" office:version="1.3"><office:automatic-styles>'
           + ''.join(f'<style:style style:name="cs{j}" style:family="chart"><style:graphic-properties draw:stroke="none" draw:fill-color="{["#1f4e79", "#c55a11", "#548235"][j%3]}"/></style:style>' for j in range(n))
           + f'</office:automatic-styles><office:body><office:chart><chart:chart svg:width="{w}" svg:height="{h}" chart:class="{kind}"><chart:title><text:p>Quarterly results</text:p></chart:title>'
           f'<chart:legend chart:legend-position="end"/><chart:plot-area chart:data-source-has-labels="both"><chart:axis chart:dimension="x" chart:name="primary-x"><chart:categories table:cell-range-address="local-table.A2:.A{len(cats)+1}"/></chart:axis>'
           f'<chart:axis chart:dimension="y" chart:name="primary-y"><chart:title><text:p>Units</text:p></chart:title><chart:grid chart:class="major"/></chart:axis>{series}</chart:plot-area>'
           f'<table:table table:name="local-table"><table:table-header-columns><table:table-column/></table:table-header-columns><table:table-columns><table:table-column table:number-columns-repeated="{n}"/></table:table-columns>{head}<table:table-rows>{rows}</table:table-rows></table:table>'
           '</chart:chart></office:chart></office:body></office:document>')
    dim = '' if 'svg:width' in extra_frame else f'svg:width="{w}" svg:height="{h}" '
    return (f'<draw:frame draw:name="{name}" {dim}{extra_frame if extra_frame else "text:anchor-type=" + chr(34) + anchor + chr(34)}><draw:object>{doc}</draw:object></draw:frame>')


W['w15_chart'] = writer(H('Chart object') + P('Bar chart: ' + chart_obj()) + P('Pie chart:') + P(chart_obj(kind='chart:circle', name='Chart2', vals=((40, 30, 20, 10),), w='9cm', h='7cm')))

FORMS = ('<office:forms form:automatic-focus="false" form:apply-design-mode="false"><form:form form:name="Form1" office:target-frame="" xlink:href="" form:control-implementation="ooo:com.sun.star.form.component.Form">'
         '<form:text form:name="TextBox1" form:id="control1" form:control-implementation="ooo:com.sun.star.form.component.TextField" form:value="hello"/>'
         '<form:checkbox form:name="Check1" form:id="control2" form:control-implementation="ooo:com.sun.star.form.component.CheckBox" form:label="Tick me" form:current-state="checked"/>'
         '<form:listbox form:name="List1" form:id="control3" form:control-implementation="ooo:com.sun.star.form.component.ListBox" form:dropdown="true"><form:option form:label="One" form:value="1"/><form:option form:label="Two" form:value="2" form:selected="true"/></form:listbox>'
         '<form:button form:name="Btn1" form:id="control4" form:control-implementation="ooo:com.sun.star.form.component.CommandButton" form:label="Press" form:button-type="push"/>'
         '</form:form></office:forms>')
CTRL = lambda n, i, w='4cm': f'<draw:frame draw:name="{n}" text:anchor-type="as-char" svg:width="{w}" svg:height="0.7cm"><draw:control draw:control="control{i}"/></draw:frame>'
W['w16_forms'] = writer(H('Form controls') + P('Text: ' + CTRL('c1', 1) + ' Check: ' + CTRL('c2', 2) + ' List: ' + CTRL('c3', 3) + ' Button: ' + CTRL('c4', 4, '2cm')) + P(
    'Content controls: <text:drop-down text:name="dd" text:selected-item-index="1"><text:label text:value="a">Alpha</text:label><text:label text:value="b">Beta</text:label>Beta</text:drop-down> and <text:text-input text:description="type here">typed</text:text-input>.')
    ).replace('<office:text>', '<office:text>' + FORMS, 1)

PS_LAYOUTS = ''.join(
    f'<style:page-layout style:name="pm{i}"><style:page-layout-properties fo:page-width="{w}" fo:page-height="{h}" fo:margin-top="{m}" fo:margin-bottom="{m}" fo:margin-left="{m}" fo:margin-right="{m}" fo:background-color="{bg}" {bd}/><style:header-style/><style:footer-style/></style:page-layout>'
    for i, (w, h, m, bg, bd) in enumerate((('21cm', '29.7cm', '2cm', 'transparent', ''), ('14.8cm', '21cm', '1cm', '#fff8e0', 'fo:border="2pt solid #c00000" fo:padding="0.2cm"'), ('21.59cm', '27.94cm', '2.54cm', 'transparent', ''), ('29.7cm', '42cm', '3cm', 'transparent', '')), 1))
PS_MASTER = ('<style:master-page style:name="Standard" style:page-layout-name="pm1"/><style:master-page style:name="Small" style:page-layout-name="pm2" style:next-style-name="Letter"/>'
             '<style:master-page style:name="Letter" style:page-layout-name="pm3" style:next-style-name="Standard"/><style:master-page style:name="A3" style:page-layout-name="pm4"/>')
W['w17_pagestyles'] = _writer(
    H('Multiple page styles') + P(lorem(3)) + ''.join(f'<text:p text:style-name="{s}">Page using style {s}. {lorem(2)}</text:p>' for s in ('PSmall', 'PLetter', 'PA3', 'PStd')),
    ''.join(f'<style:style style:name="P{n}" style:family="paragraph" style:parent-style-name="Text_20_body" style:master-page-name="{m}"/>' for n, m in (('Small', 'Small'), ('Letter', 'Letter'), ('A3', 'A3'), ('Std', 'Standard'))),
    '', PS_MASTER, PS_LAYOUTS)

W['w18_text_features'] = writer(
    H('Assorted text features') + P('Line<text:line-break/>break, non<text:s/>breaking and multiple<text:s text:c="4"/>spaces, soft<text:soft-page-break/>hyphen&#173;ation.')
    + P('Hidden text:<text:span text:style-name="Hid">this should be hidden</text:span> visible again.')
    + P(lorem(4), 'DropCap') + P('Language span: <text:span text:style-name="Fr">Ceci est du français.</text:span> and <text:span text:style-name="Ja">日本語のテキスト</text:span> and <text:span text:style-name="Ar">نص عربي</text:span>.')
    + P('Page break follows.', 'BreakBefore') + P('First line after a page break. ' + lorem(2))
    + P('Keep together and with next paragraph.', 'Keep') + P('Emoji and symbols: ☀ ✓ © ® ™ € ½ ± ≤ ∑'),
    auto='<style:style style:name="Hid" style:family="text"><style:text-properties text:display="none"/></style:style>'
         '<style:style style:name="Fr" style:family="text"><style:text-properties fo:language="fr" fo:country="FR"/></style:style>'
         '<style:style style:name="Ja" style:family="text"><style:text-properties style:font-name-asian="Liberation Sans" style:language-asian="ja" style:country-asian="JP"/></style:style>'
         '<style:style style:name="Ar" style:family="text"><style:text-properties style:language-complex="ar" style:country-complex="SA"/></style:style>',
    styles='<style:style style:name="DropCap" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties><style:drop-cap style:lines="3" style:length="1" style:distance="0.2cm"/></style:paragraph-properties></style:style>'
           '<style:style style:name="BreakBefore" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:break-before="page"/></style:style>'
           '<style:style style:name="Keep" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:keep-together="always" fo:keep-with-next="always"/></style:style>')

W['w19_line_numbering_misc'] = writer(
    H('Line numbering, paragraph borders, shadows') + ''.join(P(lorem(2)) for _ in range(6)) + P('Shadowed box', 'Shad') + P('Widow control off', 'NoWid') + P('Vertical text alignment and automatic hyphenation. ' + lorem(3), 'Hyph'),
    styles='<style:style style:name="Shad" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:border="1pt solid #000000" style:shadow="#808080 0.1cm 0.1cm"/></style:style>'
           '<style:style style:name="NoWid" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:widows="0" fo:orphans="0"/></style:style>'
           '<style:style style:name="Hyph" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:hyphenate="true" fo:text-align="justify"/></style:style>'
           '<text:linenumbering-configuration text:number-lines="true" text:offset="0.5cm" style:num-format="1" text:number-position="left" text:increment="1"/>')

# --------------------------------------------------------------------------- Calc
def cs(c='', v=None, f=None, st=None, extra='', t='float'):
    a = f' table:style-name="{st}"' if st else ''
    if f:
        a += ' table:formula="%s"' % f.replace('&','&amp;').replace('"','&quot;').replace('<','&lt;')
    if v is None and not c:
        return f'<table:table-cell{a}{extra}/>'
    if t == 'string':
        return f'<table:table-cell{a} office:value-type="string"{extra}><text:p>{c or v}</text:p></table:table-cell>'
    return f'<table:table-cell{a} office:value-type="{t}" office:value="{v}"{extra}><text:p>{c or v}</text:p></table:table-cell>'


def S(s, st=None, extra=''):
    return cs(s, t='string', st=st, extra=extra)


def row(*cells, extra=''):
    return f'<table:table-row{extra}>' + ''.join(cells) + '</table:table-row>'


def sheet(name, rows, cols=4, extra='', colxml=None, post=''):
    return f'<table:table table:name="{name}"{extra}>{post}' + (colxml or f'<table:table-column table:number-columns-repeated="{cols}"/>') + ''.join(rows) + '</table:table>'


def calc(sheets, auto='', styles='', named='', settings='', dbranges='', extra_body='', decls=''):
    body = f'<office:body><office:spreadsheet>{decls}{sheets}{named}{dbranges}{extra_body}</office:spreadsheet></office:body>'
    return flat('s', body, auto=auto, styles='<style:style style:name="Default" style:family="table-cell"/>' + styles, settings=settings)


C = {}
C['c01_formulas'] = calc(
    sheet('Data', [row(S('n'), S('sq'), S('text'), S('date')), *[row(cs(i, i), cs(i * i, i * i, f=f'of:=[.A{i+1}]*[.A{i+1}]'), S('t%d' % i), cs('2026-01-%02d' % i, '2026-01-%02d' % i, t='date')) for i in range(1, 11)],
                   row(S('sum'), cs(385, 385, f='of:=SUM([.B2:.B11])'), cs('', None, f='of:=IF([.B12]>300;"big";"small")', extra=' office:value-type="string" office:string-value="big"'), S('')),
                   row(S('lookup'), cs(9, 9, f='of:=VLOOKUP(3;[.A2:.B11];2;0)'), cs('', None, f='of:=CONCATENATE([.C2];"-";[.C3])', extra=' office:value-type="string" office:string-value="t1-t2"'), S('')),
                   row(S('xsheet'), cs(100, 100, f="of:=[Other.A1]*2"), cs(3, 3, f='of:=SUM(Scores)'), cs('', None, f='of:=MAX(TaxRate;0.1)', extra=' office:value-type="float" office:value="0.2"')),
                   row(S('array'), cs(1, 1, f='of:=SUM(ABS([.A2:.A4]))', extra=' table:number-matrix-columns-spanned="1" table:number-matrix-rows-spanned="1"'), cs(1, 1, f='of:=TODAY()-[.D2]'), S('')),
                   ]) + sheet('Other', [row(cs(50, 50), cs(60, 60)), row(cs(70, 70), cs(80, 80))], cols=2),
    named='<table:named-expressions><table:named-range table:name="Scores" table:base-cell-address="$Other.$A$1" table:cell-range-address="$Other.$A$1:.$B$2"/><table:named-expression table:name="TaxRate" table:base-cell-address="$Data.$A$1" table:expression="0.2"/></table:named-expressions>')

NUMF = ('<number:currency-style style:name="NCur"><number:currency-symbol number:language="en" number:country="US">$</number:currency-symbol><number:number number:decimal-places="2" number:min-integer-digits="1" number:grouping="true"/></number:currency-style>'
        '<number:percentage-style style:name="NPct"><number:number number:decimal-places="1" number:min-integer-digits="1"/><number:text>%</number:text></number:percentage-style>'
        '<number:date-style style:name="NDate"><number:day-of-week number:style="long"/><number:text>, </number:text><number:month number:textual="true"/><number:text> </number:text><number:day/><number:text>, </number:text><number:year number:style="long"/></number:date-style>'
        '<number:time-style style:name="NTime"><number:hours number:style="long"/><number:text>:</number:text><number:minutes number:style="long"/><number:text>:</number:text><number:seconds number:style="long"/><number:text> </number:text><number:am-pm/></number:time-style>'
        '<number:number-style style:name="NSci"><number:scientific-number number:decimal-places="3" number:min-exponent-digits="2"/></number:number-style>'
        '<number:number-style style:name="NFrac"><number:fraction number:min-integer-digits="0" number:min-numerator-digits="1" number:min-denominator-digits="2"/></number:number-style>'
        '<number:number-style style:name="NNegRed"><style:text-properties fo:color="#ff0000"/><number:text>-</number:text><number:number number:decimal-places="2" number:min-integer-digits="1"/><style:map style:condition="value()&gt;=0" style:apply-style-name="NNegRedP"/></number:number-style>'
        '<number:number-style style:name="NNegRedP"><number:number number:decimal-places="2" number:min-integer-digits="1"/></number:number-style>'
        '<number:number-style style:name="NText"><number:text>Qty: </number:text><number:number number:decimal-places="0" number:min-integer-digits="3"/><number:text> pcs</number:text></number:number-style>'
        '<number:boolean-style style:name="NBool"><number:boolean/></number:boolean-style>'
        + ''.join(f'<style:style style:name="s{n}" style:family="table-cell" style:data-style-name="N{n}"/>' for n in ('Cur', 'Pct', 'Date', 'Time', 'Sci', 'Frac', 'NegRed', 'Text', 'Bool')))
C['c02_numfmt'] = calc(sheet('Formats', [
    row(S('currency'), cs('$1,234.50', 1234.5, st='sCur')), row(S('percent'), cs('12.5%', 0.125, st='sPct', t='percentage')),
    row(S('date'), cs('x', '2026-03-15', st='sDate', t='date')), row(S('time'), cs('x', 'PT15H30M05S', st='sTime', t='time')),
    row(S('sci'), cs('1.235E+04', 12345.6789, st='sSci')), row(S('fraction'), cs('3/4', 0.75, st='sFrac')),
    row(S('negative red'), cs('-5.00', -5, st='sNegRed')), row(S('text format'), cs('Qty: 007 pcs', 7, st='sText')), row(S('boolean'), cs('TRUE', 'true', st='sBool', t='boolean'))], cols=2), auto=NUMF)

C['c03_condfmt'] = calc(
    sheet('CF', [row(cs(i * 7 % 50, i * 7 % 50), cs(i, i), cs(i * 10, i * 10)) for i in range(1, 16)], cols=3),
    auto='<style:style style:name="cfRed" style:family="table-cell"><style:text-properties fo:color="#9c0006"/><style:table-cell-properties fo:background-color="#ffc7ce"/></style:style>'
         '<style:style style:name="cfGreen" style:family="table-cell"><style:text-properties fo:color="#006100"/><style:table-cell-properties fo:background-color="#c6efce"/></style:style>',
    styles='<style:style style:name="cfRed" style:family="table-cell"><style:text-properties fo:color="#9c0006"/><style:table-cell-properties fo:background-color="#ffc7ce"/></style:style>'
           '<style:style style:name="cfGreen" style:family="table-cell"><style:text-properties fo:color="#006100"/><style:table-cell-properties fo:background-color="#c6efce"/></style:style>',
    extra_body='').replace('<table:table-column table:number-columns-repeated="3"/>', '<table:table-column table:number-columns-repeated="3"/>', 1)
CF_XML = ('<calcext:conditional-formats>'
          '<calcext:conditional-format calcext:target-range-address="CF.A1:CF.A15"><calcext:condition calcext:apply-style-name="cfRed" calcext:value="&gt;25" calcext:base-cell-address="CF.A1"/><calcext:condition calcext:apply-style-name="cfGreen" calcext:value="between(5,10)" calcext:base-cell-address="CF.A1"/></calcext:conditional-format>'
          '<calcext:conditional-format calcext:target-range-address="CF.B1:CF.B15"><calcext:color-scale calcext:show-value="true"><calcext:color-scale-entry calcext:value="0" calcext:type="minimum" calcext:color="#f8696b"/><calcext:color-scale-entry calcext:value="50" calcext:type="percentile" calcext:color="#ffeb84"/><calcext:color-scale-entry calcext:value="0" calcext:type="maximum" calcext:color="#63be7b"/></calcext:color-scale></calcext:conditional-format>'
          '<calcext:conditional-format calcext:target-range-address="CF.C1:CF.C15"><calcext:data-bar calcext:positive-color="#638ec6" calcext:negative-color="#ff0000" calcext:show-value="true"><calcext:formatting-entry calcext:type="minimum"/><calcext:formatting-entry calcext:type="maximum"/></calcext:data-bar></calcext:conditional-format>'
          '</calcext:conditional-formats>')
C['c03_condfmt'] = C['c03_condfmt'].replace('</table:table>', CF_XML + '</table:table>', 1)

C['c04_validation'] = calc(
    sheet('DV', [row(S('list'), cs('', None, st='', extra='')), row(S('whole 1-10'), cs('', None)), row(S('date'), cs('', None)), row(S('text length'), cs('', None))], cols=2)
    .replace('<table:table-row><table:table-cell office:value-type="string"><text:p>list', '<table:table-row><table:table-cell office:value-type="string"><text:p>list', 1),
    decls='<table:content-validations>'
          '<table:content-validation table:name="val1" table:condition="of:cell-content-is-in-list(&quot;Red&quot;;&quot;Green&quot;;&quot;Blue&quot;)" table:allow-empty-cell="false" table:display-list="unsorted" table:base-cell-address="DV.B1"><table:help-message table:title="Pick" table:display="true"><text:p>Choose a colour</text:p></table:help-message><table:error-message table:message-type="stop" table:title="Bad" table:display="true"><text:p>Not allowed</text:p></table:error-message></table:content-validation>'
          '<table:content-validation table:name="val2" table:condition="of:cell-content-is-between(1;10) and cell-content-is-whole-number()" table:allow-empty-cell="true" table:base-cell-address="DV.B2"><table:error-message table:message-type="warning" table:title="Range" table:display="true"><text:p>Use 1 to 10</text:p></table:error-message></table:content-validation>'
          '<table:content-validation table:name="val3" table:condition="of:cell-content-is-date() and cell-content-is-greater-than(DATE(2020;1;1))" table:allow-empty-cell="true" table:base-cell-address="DV.B3"/>'
          '<table:content-validation table:name="val4" table:condition="of:cell-content-text-length-is-between(2;5)" table:allow-empty-cell="true" table:base-cell-address="DV.B4"><table:error-message table:message-type="information" table:display="true"><text:p>2 to 5 characters</text:p></table:error-message></table:content-validation>'
          '</table:content-validations>')
for i, v in enumerate(('val1', 'val2', 'val3', 'val4')):
    C['c04_validation'] = C['c04_validation'].replace('<table:table-cell/>', f'<table:table-cell table:content-validation-name="{v}"/>', 1)

C['c05_layout'] = calc(
    sheet('Layout', [row(S('merged header', st='ch', extra=' table:number-columns-spanned="3" table:number-rows-spanned="2"'), covered, covered, S('x')), row(covered, covered, covered, S('y')),
                     row(S('hidden row below')), row(S('secret'), extra=' table:visibility="collapse"'), row(S('tall'), extra=' table:style-name="rTall"'),
                     *[row(S('filter'), cs(i % 3, i % 3), cs(i, i)) for i in range(1, 12)]],
          colxml='<table:table-column table:style-name="cW" table:default-cell-style-name="Default"/><table:table-column table:style-name="cHid" table:visibility="collapse"/><table:table-column table:number-columns-repeated="2"/>'),
    auto='<style:style style:name="cW" style:family="table-column"><style:table-column-properties style:column-width="5cm"/></style:style><style:style style:name="cHid" style:family="table-column"><style:table-column-properties style:column-width="2cm"/></style:style>'
         '<style:style style:name="rTall" style:family="table-row"><style:table-row-properties style:row-height="1.5cm" style:use-optimal-row-height="false"/></style:style>'
         '<style:style style:name="ch" style:family="table-cell"><style:table-cell-properties fo:background-color="#dddddd" style:vertical-align="middle"/><style:paragraph-properties fo:text-align="center"/></style:style>',
    dbranges='<table:database-ranges><table:database-range table:name="__Anonymous_Sheet_DB__0" table:target-range-address="Layout.A6:Layout.C17" table:display-filter-buttons="true"><table:filter><table:filter-condition table:condition-source="self" table:field-number="1" table:value="1" table:operator="="/></table:filter></table:database-range></table:database-ranges>',
    settings='<office:settings><config:config-item-set config:name="ooo:view-settings"><config:config-item-map-indexed config:name="Views"><config:config-item-map-entry><config:config-item config:name="ViewId" config:type="string">view1</config:config-item><config:config-item-map-named config:name="Tables"><config:config-item-map-entry config:name="Layout">'
             '<config:config-item config:name="HorizontalSplitMode" config:type="short">2</config:config-item><config:config-item config:name="VerticalSplitMode" config:type="short">2</config:config-item><config:config-item config:name="HorizontalSplitPosition" config:type="int">1</config:config-item><config:config-item config:name="VerticalSplitPosition" config:type="int">2</config:config-item>'
             '<config:config-item config:name="ActiveSplitRange" config:type="short">2</config:config-item><config:config-item config:name="PositionLeft" config:type="int">0</config:config-item><config:config-item config:name="PositionRight" config:type="int">1</config:config-item><config:config-item config:name="PositionTop" config:type="int">0</config:config-item><config:config-item config:name="PositionBottom" config:type="int">2</config:config-item>'
             '</config:config-item-map-entry></config:config-item-map-named><config:config-item config:name="ActiveTable" config:type="string">Layout</config:config-item></config:config-item-map-entry></config:config-item-map-indexed></config:config-item-set></office:settings>')

CHART_SHEET = lambda rng, **k: chart_obj(extra_frame='table:end-cell-address="Charts.F12" table:end-x="0cm" table:end-y="0cm" svg:x="8cm" svg:y="0.5cm"', **k)
C['c06_charts'] = calc(
    '<table:table table:name="Charts"><table:table-column table:number-columns-repeated="12"/>' + ''.join(
        row(S(c), cs(a, a), cs(b, b)) for c, a, b in (('Q1', 10, 12), ('Q2', 20, 18), ('Q3', 15, 22), ('Q4', 30, 25))) +
    '</table:table>'.replace('</table:table>', '') + '<table:shapes>'
    + chart_obj(extra_frame='table:end-cell-address="Charts.J12" table:end-x="0cm" table:end-y="0cm" svg:x="6cm" svg:y="0.3cm" svg:width="12cm" svg:height="6cm"', name='C1', ranges=('Charts.B1:.B4', 'Charts.C1:.C4'))
    + chart_obj(extra_frame='table:end-cell-address="Charts.J30" table:end-x="0cm" table:end-y="0cm" svg:x="6cm" svg:y="8cm" svg:width="10cm" svg:height="6cm"', kind='chart:line', name='C2', ranges=('Charts.B1:.B4',))
    + '</table:shapes></table:table>')
C['c06_charts'] = C['c06_charts'].replace('<table:shapes>', '<table:shapes>', 1)
# the sheet above closed its table before shapes: rebuild properly
C['c06_charts'] = calc(
    '<table:table table:name="Charts"><table:shapes>'
    + chart_obj(extra_frame='table:end-cell-address="Charts.J12" table:end-x="0cm" table:end-y="0cm" svg:x="6cm" svg:y="0.3cm" svg:width="12cm" svg:height="6cm"', name='C1', ranges=('Charts.B1:.B4', 'Charts.C1:.C4'))
    + chart_obj(extra_frame='table:end-cell-address="Charts.J30" table:end-x="0cm" table:end-y="0cm" svg:x="6cm" svg:y="8cm" svg:width="10cm" svg:height="6cm"', kind='chart:line', name='C2', ranges=('Charts.B1:.B4',))
    + '</table:shapes><table:table-column table:number-columns-repeated="12"/>'
    + ''.join(row(S(c), cs(a, a), cs(b, b)) for c, a, b in (('Q1', 10, 12), ('Q2', 20, 18), ('Q3', 15, 22), ('Q4', 30, 25))) + '</table:table>')

C['c07_comments'] = calc(sheet('Notes', [row(cs('text', t='string', v='x', extra='').replace('<text:p>text</text:p>', '<office:annotation><dc:creator>Ann</dc:creator><dc:date>2026-03-01T10:00:00</dc:date><text:p>A cell note.</text:p></office:annotation><text:p>text</text:p>'), cs(5, 5)),
                                       row(cs(6, 6, extra='').replace('<text:p>6</text:p>', '<office:annotation office:display="true" svg:width="5cm" svg:height="2cm"><dc:creator>Ben</dc:creator><text:p>Always visible note.</text:p></office:annotation><text:p>6</text:p>'), S('b'))], cols=2))

C['c08_pivot'] = calc(
    sheet('Source', [row(S('Region'), S('Product'), S('Sales')), *[row(S(r), S(p), cs(s, s)) for r, p, s in (('North', 'A', 10), ('North', 'B', 20), ('South', 'A', 30), ('South', 'B', 40), ('East', 'A', 15), ('East', 'B', 25))]], cols=3)
    + sheet('Pivot', [row(S(''))], cols=5),
    dbranges='', decls='')
PIVOT = ('<table:data-pilot-tables><table:data-pilot-table table:name="PT1" table:application-data="" table:grand-total="both" table:target-range-address="Pivot.A1:Pivot.D6">'
         '<table:source-cell-range table:cell-range-address="Source.A1:Source.C7"/>'
         '<table:data-pilot-field table:source-field-name="Region" table:orientation="row"><table:data-pilot-level table:show-empty="false"/></table:data-pilot-field>'
         '<table:data-pilot-field table:source-field-name="Product" table:orientation="column"><table:data-pilot-level table:show-empty="false"/></table:data-pilot-field>'
         '<table:data-pilot-field table:source-field-name="Sales" table:orientation="data" table:function="sum"/></table:data-pilot-table></table:data-pilot-tables>')
C['c08_pivot'] = C['c08_pivot'].replace('</office:spreadsheet>', PIVOT + '</office:spreadsheet>', 1)

C['c09_multisheets'] = calc(''.join(
    sheet(n, [row(S(f'Sheet {n}'), cs(i, i, f='of:=[.B2]*2' if i == 2 else None)) for i in range(3)], cols=2, extra=f' table:style-name="ta{i}"')
    for i, n in enumerate(('Alpha', 'Beta Sheet', 'Gamma #3', 'Hidden one', 'Prot'))),
    auto=''.join(f'<style:style style:name="ta{i}" style:family="table"><style:table-properties table:display="{"false" if i == 3 else "true"}" tableooo:tab-color="{["#ff0000","#00ff00","#0000ff","#ffff00","#ff00ff"][i]}" xmlns:tableooo="http://openoffice.org/2009/table"/></style:style>' for i in range(5)))
C['c09_multisheets'] = C['c09_multisheets'].replace('<table:table table:name="Prot" ', '<table:table table:name="Prot" table:protected="true" ', 1)

C['c10_cellstyles'] = calc(
    sheet('Styles', [row(S('Title', st='Title'), S('Good', st='Good'), S('Bad', st='Bad'), S('Heading', st='H1')), row(S('rot', st='Rot'), S('wrap long long long long text here', st='Wrap'), S('indent', st='Ind'), cs(1, 1, st='Bord')),
                     row(S('hcenter', st='HC'), S('shrink', st='Shr'), S('mono', st='Mono'), S('locked', st='Lock'))], cols=4),
    styles='<style:style style:name="Title" style:family="table-cell" style:parent-style-name="Default"><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/></style:style>'
           '<style:style style:name="Good" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:background-color="#ccffcc"/><style:text-properties fo:color="#006600"/></style:style>'
           '<style:style style:name="Bad" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:background-color="#ffcccc"/><style:text-properties fo:color="#cc0000"/></style:style>'
           '<style:style style:name="H1" style:family="table-cell" style:parent-style-name="Title"><style:table-cell-properties fo:border-bottom="2pt solid #000000"/></style:style>'
           '<style:style style:name="Rot" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties style:rotation-angle="45"/></style:style>'
           '<style:style style:name="Wrap" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:wrap-option="wrap" style:vertical-align="top"/></style:style>'
           '<style:style style:name="Ind" style:family="table-cell" style:parent-style-name="Default"><style:paragraph-properties fo:margin-left="0.8cm"/></style:style>'
           '<style:style style:name="Bord" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties fo:border="1.5pt solid #1f4e79" style:diagonal-bl-tr="0.5pt solid #ff0000"/></style:style>'
           '<style:style style:name="HC" style:family="table-cell" style:parent-style-name="Default"><style:paragraph-properties fo:text-align="center"/></style:style>'
           '<style:style style:name="Shr" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties style:shrink-to-fit="true"/></style:style>'
           '<style:style style:name="Mono" style:family="table-cell" style:parent-style-name="Default"><style:text-properties style:font-name="Liberation Mono" fo:font-style="italic" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>'
           '<style:style style:name="Lock" style:family="table-cell" style:parent-style-name="Default"><style:table-cell-properties style:cell-protect="protected formula-hidden"/></style:style>')

C['c11_images_shapes'] = calc(
    '<table:table table:name="Draw"><table:shapes>'
    + image('3cm', '2cm', 2, frame_attrs='svg:x="1cm" svg:y="1cm" table:end-cell-address="Draw.C4" table:end-x="0.1cm" table:end-y="0.1cm"')
    + '<draw:rect draw:style-name="shp" svg:x="6cm" svg:y="1cm" svg:width="3cm" svg:height="1.5cm" table:end-cell-address="Draw.F3" table:end-x="0cm" table:end-y="0cm"><text:p>Shape text</text:p></draw:rect>'
    + '</table:shapes><table:table-column table:number-columns-repeated="8"/>' + row(S('cells under shapes')) + '</table:table>',
    auto='<style:style style:name="shp" style:family="graphic"><style:graphic-properties draw:fill="solid" draw:fill-color="#ffd966" draw:stroke="solid"/></style:style>')

big = [row(cs(i, i), cs(i * 2, i * 2, f=f'of:=[.A{i+1}]*2'), S(f'row {i}'), cs(i * 0.5, i * 0.5, f=f'of:=SUM([.A$2:.A{i+1}])')) for i in range(1, 3001)]
C['c12_bigdata'] = calc(sheet('Big', [row(S('n'), S('x2'), S('label'), S('cum')), *big], cols=4))

# --------------------------------------------------------------------------- Impress
DRAW_STYLES = ('<style:style style:name="standard" style:family="graphic"><style:graphic-properties draw:stroke="solid" draw:fill="solid" draw:fill-color="#729fcf"/></style:style>'
               '<style:style style:name="Title" style:family="presentation"><style:graphic-properties draw:stroke="none" draw:fill="none"/><style:text-properties fo:font-size="32pt" fo:font-weight="bold"/></style:style>'
               '<style:style style:name="Outline1" style:family="presentation"><style:graphic-properties draw:stroke="none" draw:fill="none"/><style:text-properties fo:font-size="24pt"/></style:style>'
               '<style:style style:name="Notes" style:family="presentation"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:style>'
               '<text:list-style style:name="LS1"><text:list-level-style-bullet text:level="1" text:bullet-char="●"><style:list-level-properties text:space-before="0.3cm" text:min-label-width="0.6cm"/></text:list-level-style-bullet>'
               '<text:list-level-style-bullet text:level="2" text:bullet-char="–"><style:list-level-properties text:space-before="1.2cm" text:min-label-width="0.6cm"/></text:list-level-style-bullet>'
               '<text:list-level-style-number text:level="3" style:num-format="1" style:num-suffix="."><style:list-level-properties text:space-before="2cm" text:min-label-width="0.8cm"/></text:list-level-style-number></text:list-style>')
PG_LAYOUT = '<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="28cm" fo:page-height="15.75cm" style:print-orientation="landscape"/></style:page-layout>'
PG_AUTO = ('<style:style style:name="dp1" style:family="drawing-page"><style:drawing-page-properties presentation:background-visible="true" presentation:background-objects-visible="true" draw:fill="solid" draw:fill-color="#ffffff"/></style:style>'
           '<style:style style:name="dpG" style:family="drawing-page"><style:drawing-page-properties draw:fill="gradient" draw:fill-gradient-name="grad1"/></style:style>')


def impress(master, pages, auto='', extra_decls='', styles='', settings=''):
    body = f'<office:body><office:presentation>{extra_decls}{pages}</office:presentation></office:body>'
    x = flat('p', body, auto=PG_LAYOUT + PG_AUTO + auto, styles=DRAW_STYLES + styles, settings=settings)
    return x.replace('<office:body>', f'<office:master-styles>{master}</office:master-styles><office:body>', 1)


def pframe(cls, x, y, w, h, inner, name='', style=None):
    st = style or {'title': 'Title', 'outline': 'Outline1', 'subtitle': 'Outline1', 'notes': 'Notes'}.get(cls, 'standard')
    return (f'<draw:frame presentation:style-name="{st}" draw:layer="layout" svg:width="{w}" svg:height="{h}" svg:x="{x}" svg:y="{y}" presentation:class="{cls}" {"presentation:placeholder=" + chr(34) + "true" + chr(34) if False else ""}>'
            f'<draw:text-box>{inner}</draw:text-box></draw:frame>')


def pmaster(name, bg='#ffffff', extra='', title_y='0.8cm'):
    return (f'<style:master-page style:name="{name}" style:page-layout-name="PM1" draw:style-name="dp1">'
            + pframe('title', '1.4cm', title_y, '25.2cm', '3cm', '<text:p>Master title</text:p>')
            + pframe('outline', '1.4cm', '4.1cm', '25.2cm', '9.5cm', '<text:list><text:list-item><text:p>Master outline</text:p></text:list-item></text:list>') + extra
            + '<presentation:notes style:page-layout-name="PM1">' + pframe('page', '1cm', '1cm', '10cm', '7cm', '').replace('<draw:text-box></draw:text-box>', '') + '</presentation:notes></style:master-page>')


def slide(name, master, inner, style='dp1', extra='', notes=''):
    n = f'<presentation:notes>{notes}</presentation:notes>' if notes else ''
    return f'<draw:page draw:name="{name}" draw:style-name="{style}" draw:master-page-name="{master}" presentation:presentation-page-layout-name="AL1">{inner}{n}{extra}</draw:page>'


PL = '<style:presentation-page-layout style:name="AL1"><presentation:placeholder presentation:object="title" svg:x="1.4cm" svg:y="0.8cm" svg:width="25.2cm" svg:height="3cm"/><presentation:placeholder presentation:object="outline" svg:x="1.4cm" svg:y="4.1cm" svg:width="25.2cm" svg:height="9.5cm"/></style:presentation-page-layout>'
LIST_BULLETS = '<text:list text:style-name="LS1"><text:list-item><text:p>First point</text:p><text:list><text:list-item><text:p>Sub point A</text:p><text:list><text:list-item><text:p>Numbered deep</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p>Sub point B</text:p></text:list-item></text:list></text:list-item><text:list-item><text:p>Second point</text:p></text:list-item></text:list>'
P_ = {}
P_['p01_masters_layouts'] = impress(
    pmaster('Default') + pmaster('Dark', extra='<draw:rect draw:style-name="standard" svg:x="0cm" svg:y="14.5cm" svg:width="28cm" svg:height="1.25cm" draw:layer="backgroundobjects"/>', title_y='1.2cm'),
    slide('Title slide', 'Default', pframe('title', '1.4cm', '5cm', '25.2cm', '3cm', '<text:p>Welcome</text:p>', style='Title'))
    + slide('Content', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>Agenda</text:p>') + pframe('outline', '1.4cm', '4.1cm', '25.2cm', '9.5cm', LIST_BULLETS))
    + slide('Dark one', 'Dark', pframe('title', '1.4cm', '1.2cm', '25.2cm', '3cm', '<text:p>Second master</text:p>')),
    styles=PL)

P_['p02_text_bullets'] = impress(
    pmaster('Default'),
    slide('Bullets', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>Bullets</text:p>') + pframe('outline', '1.4cm', '4.1cm', '25.2cm', '9.5cm', LIST_BULLETS))
    + slide('Formatted', 'Default', '<draw:frame draw:style-name="standard" svg:x="2cm" svg:y="2cm" svg:width="20cm" svg:height="6cm"><draw:text-box><text:p><text:span text:style-name="tb">bold</text:span> <text:span text:style-name="ti">italic red</text:span> <text:span text:style-name="ts">big</text:span></text:p><text:p text:style-name="pc">centered paragraph</text:p></draw:text-box></draw:frame>'),
    auto='<style:style style:name="tb" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style><style:style style:name="ti" style:family="text"><style:text-properties fo:font-style="italic" fo:color="#cc0000"/></style:style><style:style style:name="ts" style:family="text"><style:text-properties fo:font-size="40pt"/></style:style>'
         '<style:style style:name="pc" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/></style:style>', styles=PL)

SH = ('<style:style style:name="shRect" style:family="graphic" style:parent-style-name="standard"><style:graphic-properties draw:fill="solid" draw:fill-color="#c00000" svg:stroke-color="#000000" svg:stroke-width="0.1cm" draw:shadow="visible" draw:shadow-offset-x="0.2cm" draw:shadow-offset-y="0.2cm"/></style:style>'
      '<style:style style:name="shGrad" style:family="graphic" style:parent-style-name="standard"><style:graphic-properties draw:fill="gradient" draw:fill-gradient-name="grad1"/></style:style>'
      '<style:style style:name="shLine" style:family="graphic" style:parent-style-name="standard"><style:graphic-properties draw:stroke="dash" draw:stroke-dash="Dash" svg:stroke-width="0.1cm" svg:stroke-color="#0000ff" draw:marker-end="Arrow" draw:marker-end-width="0.4cm"/></style:style>')
GRAD = '<draw:gradient draw:name="grad1" draw:style="linear" draw:start-color="#ffffff" draw:end-color="#1f4e79" draw:angle="90deg" draw:border="0%"/><draw:marker draw:name="Arrow" svg:viewBox="0 0 20 30" svg:d="M10 0l-10 30h20z"/><draw:stroke-dash draw:name="Dash" draw:style="rect" draw:dots1="4" draw:dots1-length="0.2cm" draw:distance="0.15cm"/>'
P_['p03_shapes'] = impress(
    pmaster('Default'),
    slide('Shapes', 'Default',
          '<draw:rect draw:style-name="shRect" svg:x="1cm" svg:y="1cm" svg:width="6cm" svg:height="3cm" draw:transform="rotate(0.3) translate(0cm 0cm)"><text:p>Rect</text:p></draw:rect>'
          '<draw:ellipse draw:style-name="shGrad" svg:x="9cm" svg:y="1cm" svg:width="5cm" svg:height="3cm"/>'
          '<draw:line draw:style-name="shLine" svg:x1="1cm" svg:y1="6cm" svg:x2="12cm" svg:y2="8cm"/>'
          '<draw:polygon draw:style-name="standard" svg:x="15cm" svg:y="1cm" svg:width="4cm" svg:height="4cm" svg:viewBox="0 0 100 100" draw:points="50,0 100,100 0,100"/>'
          '<draw:custom-shape draw:style-name="shGrad" svg:x="1cm" svg:y="9cm" svg:width="5cm" svg:height="4cm"><text:p>Star</text:p><draw:enhanced-geometry draw:type="star5" draw:enhanced-path="M 10800 0 L 8259 7637 L 0 7637 L 6637 12363 L 4096 21600 L 10800 16874 L 17504 21600 L 14963 12363 L 21600 7637 L 13341 7637 Z N" svg:viewBox="0 0 21600 21600"/></draw:custom-shape>'
          '<draw:connector draw:style-name="shLine" draw:type="standard" svg:x1="7cm" svg:y1="10cm" svg:x2="14cm" svg:y2="12cm"/>'
          '<draw:g><draw:rect draw:style-name="standard" svg:x="16cm" svg:y="8cm" svg:width="2cm" svg:height="2cm"/><draw:ellipse draw:style-name="standard" svg:x="17cm" svg:y="9cm" svg:width="2cm" svg:height="2cm"/></draw:g>'),
    auto=SH, extra_decls='', styles=PL + GRAD)

P_['p04_images'] = impress(
    pmaster('Default'),
    slide('Pictures', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>Pictures</text:p>') + image('8cm', '5cm', 1, frame_attrs='draw:style-name="standard" svg:x="1cm" svg:y="1cm"') + image('6cm', '4cm', 2, frame_attrs='draw:style-name="standard" svg:x="12cm" svg:y="3cm" draw:transform="rotate(0.3) translate(0cm 0cm)"')
          + image('5cm', '5cm', 3, frame_attrs='draw:style-name="standard" svg:x="20cm" svg:y="8cm"')), styles=PL)

TABLE_PG = ('<draw:frame draw:style-name="standard" svg:x="2cm" svg:y="2cm" svg:width="20cm" svg:height="6cm"><table:table table:name="PTable"><table:table-column table:number-columns-repeated="3"/>'
            '<table:table-row><table:table-cell office:value-type="string"><text:p>H1</text:p></table:table-cell><table:table-cell office:value-type="string" table:number-columns-spanned="2"><text:p>Merged</text:p></table:table-cell><table:covered-table-cell/></table:table-row>'
            '<table:table-row><table:table-cell office:value-type="string"><text:p>a</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>b</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>c</text:p></table:table-cell></table:table-row></table:table></draw:frame>')
P_['p05_tables'] = impress(pmaster('Default'), slide('Table', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>Table</text:p>') + TABLE_PG), styles=PL)

P_['p06_charts'] = impress(pmaster('Default'), slide('Chart', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>Chart</text:p>') + chart_obj(w='14cm', h='9cm', extra_frame='svg:x="2cm" svg:y="2cm" svg:width="14cm" svg:height="9cm" draw:style-name="standard"')), styles=PL)

ANIM = ('<anim:par presentation:node-type="timing-root"><anim:seq presentation:node-type="main-sequence"><anim:par smil:begin="next"><anim:par smil:begin="0s" smil:fill="hold"><anim:par smil:begin="0s" smil:fill="hold" presentation:node-type="on-click" presentation:preset-id="ooo-entrance-fade-in" presentation:preset-class="entrance">'
        '<anim:set smil:begin="0s" smil:dur="0.001s" smil:fill="hold" smil:targetElement="shA" anim:sub-item="whole" smil:attributeName="visibility" smil:to="visible"/>'
        '<anim:animate smil:dur="0.5s" smil:fill="hold" smil:targetElement="shA" smil:attributeName="opacity" smil:values="0;1" smil:keyTimes="0;1"/></anim:par></anim:par></anim:par></anim:seq></anim:par>')
P_['p07_transitions_anim'] = impress(
    pmaster('Default'),
    slide('Fade', 'Default', '<draw:rect xml:id="shA" draw:id="shA" draw:style-name="standard" svg:x="3cm" svg:y="3cm" svg:width="6cm" svg:height="3cm"><text:p>Animated</text:p></draw:rect>', style='dpFade', extra=f'<anim:par presentation:node-type="timing-root">{ANIM[len("<anim:par presentation:node-type=" + chr(34) + "timing-root" + chr(34) + ">"):]}')
    + slide('Push', 'Default', '<draw:rect draw:style-name="standard" svg:x="3cm" svg:y="3cm" svg:width="6cm" svg:height="3cm"/>', style='dpPush')
    + slide('Auto', 'Default', '<draw:rect draw:style-name="standard" svg:x="3cm" svg:y="3cm" svg:width="6cm" svg:height="3cm"/>', style='dpAuto'),
    auto='<style:style style:name="dpFade" style:family="drawing-page"><style:drawing-page-properties presentation:transition-type="automatic" presentation:transition-speed="slow" smil:type="fade" smil:subtype="crossfade" presentation:duration="PT00H00M05S"/></style:style>'
         '<style:style style:name="dpPush" style:family="drawing-page"><style:drawing-page-properties smil:type="slideWipe" smil:subtype="fromLeft" presentation:transition-speed="medium"/></style:style>'
         '<style:style style:name="dpAuto" style:family="drawing-page"><style:drawing-page-properties presentation:transition-type="automatic" presentation:duration="PT00H00M03S" smil:type="barWipe" smil:subtype="topToBottom"/></style:style>', styles=PL)

P_['p08_notes'] = impress(
    pmaster('Default'),
    slide('One', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>First</text:p>'), notes='<draw:page-thumbnail presentation:class="page" draw:layer="layout" svg:width="14cm" svg:height="7.9cm" svg:x="3.5cm" svg:y="2cm"/>' + pframe('notes', '2cm', '10cm', '17cm', '12cm', '<text:p>Speaker note for slide one.</text:p><text:p>Second note paragraph.</text:p>'))
    + slide('Two', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', '<text:p>Second</text:p>'), notes=pframe('notes', '2cm', '10cm', '17cm', '12cm', '<text:p>Notes for slide two only.</text:p>')), styles=PL)

P_['p09_custom_shows'] = impress(
    pmaster('Default'),
    ''.join(slide(f'S{i}', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', f'<text:p>Slide {i}</text:p>')) for i in range(1, 5)),
    extra_decls='<presentation:settings presentation:start-with-navigator="false" presentation:endless="true" presentation:full-screen="true" presentation:force-manual="false" presentation:show="Short"><presentation:show presentation:name="Short" presentation:pages="S1,S3"/><presentation:show presentation:name="Long" presentation:pages="S1,S2,S3,S4"/></presentation:settings>', styles=PL)

P_['p10_header_footer'] = impress(
    pmaster('Default', extra='<draw:frame presentation:style-name="standard" draw:layer="backgroundobjects" svg:width="8cm" svg:height="1cm" svg:x="1cm" svg:y="14.5cm" presentation:class="footer"><draw:text-box><text:p><presentation:footer/></text:p></draw:text-box></draw:frame>'
           '<draw:frame presentation:style-name="standard" draw:layer="backgroundobjects" svg:width="4cm" svg:height="1cm" svg:x="22cm" svg:y="14.5cm" presentation:class="page-number"><draw:text-box><text:p><text:page-number>1</text:page-number></text:p></draw:text-box></draw:frame>'),
    ''.join(slide(f'S{i}', 'Default', pframe('title', '1.4cm', '0.8cm', '25.2cm', '3cm', f'<text:p>Slide {i}</text:p>')) for i in range(1, 4)),
    styles=PL, extra_decls='<presentation:footer-decl presentation:name="ft1">Company confidential</presentation:footer-decl><presentation:date-time-decl presentation:name="dt1" presentation:source="fixed">2026-03-15</presentation:date-time-decl>')

KINDS = [('t', W, '.fodt'), ('s', C, '.fods'), ('p', P_, '.fodp')]


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = []
    for kind, table, ext in KINDS:
        for name, xml in sorted(table.items()):
            (out / (name + ext)).write_text(xml, encoding='utf-8')
            manifest.append({'id': name, 'kind': kind, 'flat': name + ext, 'ext': ext[2:4] + ext[4:]})
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1))
    print(len(manifest), 'flat documents written to', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'corpus-flat')
