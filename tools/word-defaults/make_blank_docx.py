#!/usr/bin/env python3
"""Give the blank .docx templates Word's defaults (Word 2016-2021 "Normal" template look).

Usage: make_blank_docx.py <document-templates/new>

For every <locale>/new.docx:
  - document defaults: theme body font (Calibri), 11 pt, 8 pt after, line spacing 1.08 (259/240);
  - theme: Calibri Light / Calibri, Word 2013-2021 colour scheme (accent 1 = 4472C4);
  - explicit Word built-in styles (headings 1-9, Title, Subtitle, Quote, Intense Quote,
    emphasis/reference character styles, List Paragraph, No Spacing, Table Grid), so the
    document looks the same in ElixirOffice and in any version of Word.
Kept from the original template: the language (w:lang), page size and margins (document.xml),
settings.xml, latent styles, right-to-left paragraph default, theme format scheme.
Fonts: Calibri/Calibri Light render with the metric-compatible Carlito (OFL) when absent.
"""
import os
import re
import sys
import zipfile

W = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' \
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' \
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' \
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"'

MAJOR = '<w:rFonts w:asciiTheme="majorHAnsi" w:eastAsiaTheme="majorEastAsia" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi"/>'


def color(val, theme, shade=None, tint=None):
    a = f'<w:color w:val="{val}" w:themeColor="{theme}"'
    if shade:
        a += f' w:themeShade="{shade}"'
    if tint:
        a += f' w:themeTint="{tint}"'
    return a + '/>'


def sz(half):
    return f'<w:sz w:val="{half}"/><w:szCs w:val="{half}"/>'


ITAL = '<w:i/><w:iCs/>'
BOLD = '<w:b/><w:bCs/>'

# (level, before, colour, size, italic)
HEADINGS = [
    (1, 240, color("2F5496", "accent1", shade="BF"), 32, False),
    (2, 40, color("2F5496", "accent1", shade="BF"), 26, False),
    (3, 40, color("1F3763", "accent1", shade="7F"), 24, False),
    (4, 40, color("2F5496", "accent1", shade="BF"), None, True),
    (5, 40, color("2F5496", "accent1", shade="BF"), None, False),
    (6, 40, color("1F3763", "accent1", shade="7F"), None, False),
    (7, 40, color("1F3763", "accent1", shade="7F"), None, True),
    (8, 40, color("272727", "text1", tint="D8"), 21, False),
    (9, 40, color("272727", "text1", tint="D8"), 21, True),
]


def pstyle(sid, name, ppr='', rpr='', prio=None, extra='', based='Normal', nxt='Normal', link=None,
           hidden_until_used=False, qformat=True):
    s = f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/>'
    if based:
        s += f'<w:basedOn w:val="{based}"/>'
    if nxt:
        s += f'<w:next w:val="{nxt}"/>'
    if link:
        s += f'<w:link w:val="{link}"/>'
    if prio is not None:
        s += f'<w:uiPriority w:val="{prio}"/>'
    if hidden_until_used:
        s += '<w:unhideWhenUsed/>'
    if qformat:
        s += '<w:qFormat/>'
    s += extra
    if ppr:
        s += f'<w:pPr>{ppr}</w:pPr>'
    if rpr:
        s += f'<w:rPr>{rpr}</w:rPr>'
    return s + '</w:style>'


def cstyle(sid, name, rpr, prio, link=None, qformat=True):
    s = f'<w:style w:type="character" w:customStyle="0" w:styleId="{sid}"><w:name w:val="{name}"/>' \
        f'<w:basedOn w:val="DefaultParagraphFont"/>'
    if link:
        s += f'<w:link w:val="{link}"/>'
    s += f'<w:uiPriority w:val="{prio}"/>'
    if qformat:
        s += '<w:qFormat/>'
    return s.replace(' w:customStyle="0"', '') + f'<w:rPr>{rpr}</w:rPr></w:style>'


def styles_xml(lang, rpr_extra, ppr_extra, latent):
    out = [f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}>']
    out.append('<w:docDefaults><w:rPrDefault><w:rPr>'
               '<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/>'
               f'<w:sz w:val="22"/><w:szCs w:val="22"/>{lang}{rpr_extra}</w:rPr></w:rPrDefault>'
               f'<w:pPrDefault><w:pPr>{ppr_extra}<w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
               '</w:docDefaults>')
    out.append(latent)
    out.append('<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>')
    for lvl, before, col, size, ital in HEADINGS:
        rpr = MAJOR + (ITAL if ital else '') + col + (sz(size) if size else '')
        ppr = f'<w:keepNext/><w:keepLines/><w:spacing w:before="{before}" w:after="0"/><w:outlineLvl w:val="{lvl - 1}"/>'
        out.append(pstyle(f'Heading{lvl}', f'heading {lvl}', ppr, rpr, prio=9, link=f'Heading{lvl}Char',
                          hidden_until_used=lvl > 1))
    out.append('<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/>'
               '<w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>')
    out.append('<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/>'
               '<w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
               '<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>')
    out.append('<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/>'
               '<w:semiHidden/><w:unhideWhenUsed/></w:style>')
    for lvl, before, col, size, ital in HEADINGS:
        rpr = MAJOR + (ITAL if ital else '') + col + (sz(size) if size else '')
        out.append(f'<w:style w:type="character" w:customStyle="1" w:styleId="Heading{lvl}Char"><w:name w:val="Heading {lvl} Char"/>'
                   f'<w:basedOn w:val="DefaultParagraphFont"/><w:link w:val="Heading{lvl}"/><w:uiPriority w:val="9"/>'
                   f'<w:rPr>{rpr}</w:rPr></w:style>')
    out.append(pstyle('Title', 'Title', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:contextualSpacing/>',
                      MAJOR + '<w:spacing w:val="-10"/><w:kern w:val="28"/>' + sz(56), prio=10, link='TitleChar'))
    out.append('<w:style w:type="character" w:customStyle="1" w:styleId="TitleChar"><w:name w:val="Title Char"/>'
               '<w:basedOn w:val="DefaultParagraphFont"/><w:link w:val="Title"/><w:uiPriority w:val="10"/>'
               f'<w:rPr>{MAJOR}<w:spacing w:val="-10"/><w:kern w:val="28"/>{sz(56)}</w:rPr></w:style>')
    sub_rpr = '<w:rFonts w:eastAsiaTheme="minorEastAsia"/>' + color("5A5A5A", "text1", tint="A5") + '<w:spacing w:val="15"/>'
    out.append(pstyle('Subtitle', 'Subtitle', '<w:spacing w:after="160"/>', sub_rpr, prio=11, link='SubtitleChar'))
    out.append('<w:style w:type="character" w:customStyle="1" w:styleId="SubtitleChar"><w:name w:val="Subtitle Char"/>'
               '<w:basedOn w:val="DefaultParagraphFont"/><w:link w:val="Subtitle"/><w:uiPriority w:val="11"/>'
               f'<w:rPr>{sub_rpr}</w:rPr></w:style>')
    out.append(cstyle('SubtleEmphasis', 'Subtle Emphasis', ITAL + color("404040", "text1", tint="BF"), 19))
    out.append(cstyle('Emphasis', 'Emphasis', ITAL, 20))
    out.append(cstyle('IntenseEmphasis', 'Intense Emphasis', ITAL + color("4472C4", "accent1"), 21))
    out.append(cstyle('Strong', 'Strong', BOLD, 22))
    q_rpr = ITAL + color("404040", "text1", tint="BF")
    out.append(pstyle('Quote', 'Quote', '<w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/>',
                      q_rpr, prio=29, link='QuoteChar'))
    out.append('<w:style w:type="character" w:customStyle="1" w:styleId="QuoteChar"><w:name w:val="Quote Char"/>'
               '<w:basedOn w:val="DefaultParagraphFont"/><w:link w:val="Quote"/><w:uiPriority w:val="29"/>'
               f'<w:rPr>{q_rpr}</w:rPr></w:style>')
    iq_rpr = ITAL + color("4472C4", "accent1")
    bdr = '<w:{s} w:val="single" w:sz="4" w:space="10" w:color="4472C4" w:themeColor="accent1"/>'
    out.append(pstyle('IntenseQuote', 'Intense Quote',
                      '<w:pBdr>' + bdr.format(s='top') + bdr.format(s='bottom') + '</w:pBdr>'
                      '<w:spacing w:before="360" w:after="360"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/>',
                      iq_rpr, prio=30, link='IntenseQuoteChar'))
    out.append('<w:style w:type="character" w:customStyle="1" w:styleId="IntenseQuoteChar"><w:name w:val="Intense Quote Char"/>'
               '<w:basedOn w:val="DefaultParagraphFont"/><w:link w:val="IntenseQuote"/><w:uiPriority w:val="30"/>'
               f'<w:rPr>{iq_rpr}</w:rPr></w:style>')
    out.append(cstyle('SubtleReference', 'Subtle Reference', '<w:smallCaps/>' + color("5A5A5A", "text1", tint="A5"), 31))
    out.append(cstyle('IntenseReference', 'Intense Reference', BOLD + '<w:smallCaps/>' + color("4472C4", "accent1") + '<w:spacing w:val="5"/>', 32))
    out.append(cstyle('BookTitle', 'Book Title', BOLD + ITAL + '<w:spacing w:val="5"/>', 33))
    out.append(pstyle('ListParagraph', 'List Paragraph', '<w:ind w:left="720"/><w:contextualSpacing/>', prio=34, nxt=None))
    out.append(pstyle('NoSpacing', 'No Spacing', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', prio=1, based=None, nxt=None))
    out.append('<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/>'
               '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>'
               + ''.join(f'<w:{b} w:val="single" w:sz="4" w:space="0" w:color="auto"/>' for b in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
               + '</w:tblBorders></w:tblPr></w:style>')
    out.append('</w:styles>')
    return ''.join(out)


CLR_SCHEME = ('<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
              '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2>'
              '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1>'
              '<a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>'
              '<a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>'
              '<a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink>'
              '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>')

# Per-script fallbacks of the Office font scheme (font names only).
SCRIPTS_MAJOR = [("Jpan", "游ゴシック Light"), ("Hang", "맑은 고딕"), ("Hans", "等线 Light"), ("Hant", "新細明體"),
                 ("Arab", "Times New Roman"), ("Hebr", "Times New Roman"), ("Thai", "Angsana New"), ("Ethi", "Nyala"),
                 ("Beng", "Vrinda"), ("Gujr", "Shruti"), ("Khmr", "MoolBoran"), ("Knda", "Tunga"), ("Guru", "Raavi"),
                 ("Cans", "Euphemia"), ("Cher", "Plantagenet Cherokee"), ("Yiii", "Microsoft Yi Baiti"),
                 ("Tibt", "Microsoft Himalaya"), ("Thaa", "MV Boli"), ("Deva", "Mangal"), ("Telu", "Gautami"),
                 ("Taml", "Latha"), ("Syrc", "Estrangelo Edessa"), ("Orya", "Kalinga"), ("Mlym", "Kartika"),
                 ("Laoo", "DokChampa"), ("Sinh", "Iskoola Pota"), ("Mong", "Mongolian Baiti"), ("Viet", "Times New Roman"),
                 ("Uigh", "Microsoft Uighur"), ("Geor", "Sylfaen"), ("Armn", "Arial"), ("Bugi", "Leelawadee UI"),
                 ("Bopo", "Microsoft JhengHei"), ("Java", "Javanese Text"), ("Lisu", "Segoe UI"),
                 ("Mymr", "Myanmar Text"), ("Nkoo", "Ebrima"), ("Olck", "Nirmala UI"), ("Osma", "Ebrima"),
                 ("Phag", "Phagspa"), ("Syrn", "Estrangelo Edessa"), ("Syrj", "Estrangelo Edessa"),
                 ("Syre", "Estrangelo Edessa"), ("Sora", "Nirmala UI"), ("Tale", "Microsoft Tai Le"),
                 ("Talu", "Microsoft New Tai Lue"), ("Tfng", "Ebrima")]
SCRIPTS_MINOR = {"Jpan": "游明朝", "Hans": "等线", "Arab": "Arial", "Hebr": "Arial", "Thai": "Cordia New",
                 "Viet": "Arial"}


def font_scheme():
    def block(tag, latin):
        s = f'<a:{tag}><a:latin typeface="{latin}" panose="{"020F0302020204030204" if tag == "majorFont" else "020F0502020204030204"}"/>' \
            '<a:ea typeface=""/><a:cs typeface=""/>'
        for script, face in SCRIPTS_MAJOR:
            if tag == "minorFont":
                face = SCRIPTS_MINOR.get(script, face)
            s += f'<a:font script="{script}" typeface="{face}"/>'
        return s + f'</a:{tag}>'
    return '<a:fontScheme name="Office">' + block("majorFont", "Calibri Light") + block("minorFont", "Calibri") + '</a:fontScheme>'


FONT_TABLE = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts {W}>'
              '<w:font w:name="Calibri"><w:panose1 w:val="020F0502020204030204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'
              '<w:font w:name="Times New Roman"><w:panose1 w:val="02020603050405020304"/><w:charset w:val="00"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>'
              '<w:font w:name="Calibri Light"><w:panose1 w:val="020F0302020204030204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'
              '<w:font w:name="Arial"><w:panose1 w:val="020B0604020202020204"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>'
              '</w:fonts>')


def convert(path):
    with zipfile.ZipFile(path) as z:
        items = [(i, z.read(i.filename)) for i in z.infolist()]
    files = {i.filename: d for i, d in items}
    st = files['word/styles.xml'].decode('utf-8')
    lang = re.search(r'<w:lang [^>]*/>', st)
    lang = lang.group(0) if lang else '<w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>'
    rpr_default = re.search(r'<w:rPrDefault>(.*?)</w:rPrDefault>', st, re.S)
    rpr_extra = ''
    if rpr_default and 'w14:ligatures' in rpr_default.group(1):
        rpr_extra = re.search(r'<w14:ligatures [^>]*/>', rpr_default.group(1)).group(0)
    ppr_default = re.search(r'<w:pPrDefault>(.*?)</w:pPrDefault>', st, re.S)
    ppr_extra = '<w:bidi/>' if ppr_default and '<w:bidi/>' in ppr_default.group(1) else ''
    latent = re.search(r'<w:latentStyles.*?</w:latentStyles>', st, re.S)
    latent = latent.group(0) if latent else ''
    files['word/styles.xml'] = styles_xml(lang, rpr_extra, ppr_extra, latent).encode('utf-8')

    th = files['word/theme/theme1.xml'].decode('utf-8')
    th = re.sub(r'<a:clrScheme .*?</a:clrScheme>', CLR_SCHEME, th, flags=re.S)
    th = re.sub(r'<a:fontScheme .*?</a:fontScheme>', font_scheme(), th, flags=re.S)
    th = re.sub(r'(<a:theme [^>]*name=")[^"]*(")', r'\1Office Theme\2', th)
    files['word/theme/theme1.xml'] = th.encode('utf-8')
    files['word/fontTable.xml'] = FONT_TABLE.encode('utf-8')

    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
        for info, _ in items:
            zi = zipfile.ZipInfo(info.filename, date_time=(2026, 10, 5, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_STORED if info.filename.endswith('/') else zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            z.writestr(zi, files[info.filename])
    os.replace(tmp, path)


def main():
    root = sys.argv[1]
    n = 0
    for loc in sorted(os.listdir(root)):
        p = os.path.join(root, loc, 'new.docx')
        if os.path.isfile(p):
            convert(p)
            n += 1
    print(f'{n} templates updated')


if __name__ == '__main__':
    main()
