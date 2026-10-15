# -*- coding: utf-8 -*-
"""Mini OOXML library for the ElixirOffice provisional corpus.

python-docx serves as the "package" layer (parts, relations, images, content types);
the content (document.xml, styles, numbering, settings, notes, comments,
charts...) is written directly as WordprocessingML so as to exercise
features python-docx cannot produce (floating anchors,
wps/VML text boxes, columns, fields, revisions, comments, notes,
content controls, legacy form fields, OMML, charts...).

Everything is deterministic: no current date, no unseeded randomness,
fixed zip timestamps.
"""
import io
import re
import zipfile
from xml.sax.saxutils import escape

from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import Part
from docx.oxml import parse_xml
from docx.parts.hdrftr import FooterPart, HeaderPart

NS = {
    'wpc': 'http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'o': 'urn:schemas-microsoft-com:office:office',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'v': 'urn:schemas-microsoft-com:vml',
    'wp14': 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'w10': 'urn:schemas-microsoft-com:office:word',
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
    'wpg': 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
}
NSDECL = ' '.join('xmlns:%s="%s"' % kv for kv in NS.items())
IGNORABLE = 'mc:Ignorable="w14 w15 wp14"'

CT_FOOTNOTES = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml'
CT_ENDNOTES = 'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml'
CT_COMMENTS = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml'
CT_COMMENTS_EX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml'
RT_COMMENTS_EX = 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended'
CT_CHART = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
CT_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

FIXED_ZIP_DATE = (2026, 10, 5, 0, 0, 0)

# --------------------------------------------------------------------------
# units
# --------------------------------------------------------------------------

def cm(x):
    """centimetres -> twips (dxa)"""
    return int(round(x * 567))


def emu(x):
    """centimetres -> EMU"""
    return int(round(x * 360000))


def esc(s):
    return escape(s, {'"': '&quot;'})


# --------------------------------------------------------------------------
# runs and paragraphs
# --------------------------------------------------------------------------

def rpr(b=False, i=False, u=None, sz=None, color=None, font=None, caps=False,
        smallcaps=False, strike=False, dstrike=False, hl=None, vert=None,
        spacing=None, style=None, vanish=False, shd=None, lang=None,
        pos=None, kern=None, noproof=False, outline=False, shadow=False,
        w14='', change=None, eastasia=None, scale=None, bdr=None, cs_font=None):
    """Build a w:rPr in schema order."""
    x = []
    if style:
        x.append('<w:rStyle w:val="%s"/>' % style)
    if font:
        ea = eastasia or font
        x.append('<w:rFonts w:ascii="{0}" w:hAnsi="{0}" w:eastAsia="{1}" w:cs="{2}"/>'.format(
            esc(font), esc(ea), esc(cs_font or font)))
    if b:
        x.append('<w:b/><w:bCs/>')
    if i:
        x.append('<w:i/><w:iCs/>')
    if caps:
        x.append('<w:caps/>')
    if smallcaps:
        x.append('<w:smallCaps/>')
    if strike:
        x.append('<w:strike/>')
    if dstrike:
        x.append('<w:dstrike/>')
    if outline:
        x.append('<w:outline/>')
    if shadow:
        x.append('<w:shadow/>')
    if noproof:
        x.append('<w:noProof/>')
    if vanish:
        x.append('<w:vanish/>')
    if color:
        x.append('<w:color w:val="%s"/>' % color)
    if spacing is not None:
        x.append('<w:spacing w:val="%d"/>' % spacing)
    if scale is not None:
        x.append('<w:w w:val="%d"/>' % scale)
    if kern is not None:
        x.append('<w:kern w:val="%d"/>' % kern)
    if pos is not None:
        x.append('<w:position w:val="%d"/>' % pos)
    if sz:
        x.append('<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (int(sz * 2), int(sz * 2)))
    if hl:
        x.append('<w:highlight w:val="%s"/>' % hl)
    if u:
        x.append('<w:u w:val="%s"/>' % (u if isinstance(u, str) else 'single'))
    if bdr:
        x.append('<w:bdr w:val="single" w:sz="4" w:space="0" w:color="%s"/>' % bdr)
    if shd:
        x.append('<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % shd)
    if vert:
        x.append('<w:vertAlign w:val="%s"/>' % vert)
    if lang:
        x.append('<w:lang w:val="%s"/>' % lang)
    if w14:
        x.append(w14)
    if change:
        x.append(change)
    return '<w:rPr>%s</w:rPr>' % ''.join(x) if x else ''


_XML_RE = re.compile(r'^\s*<(?:w|m|mc|w14|wps|wp):')


def is_xml(s):
    return bool(_XML_RE.match(s))


def _text_nodes(text, deleted=False):
    out = []
    tag = 'w:delText' if deleted else 'w:t'
    parts = re.split(r'(\t|\n|\f)', text)
    for p in parts:
        if p == '\t':
            out.append('<w:tab/>')
        elif p == '\n':
            out.append('<w:br/>')
        elif p == '\f':
            out.append('<w:br w:type="page"/>')
        elif p:
            out.append('<%s xml:space="preserve">%s</%s>' % (tag, esc(p), tag))
    return ''.join(out)


def R(text='', deleted=False, **kw):
    """A text run. \\t -> tab, \\n -> line break, \\f -> page break."""
    return '<w:r>%s%s</w:r>' % (rpr(**kw), _text_nodes(text, deleted))


def BR(kind=None):
    if kind:
        return '<w:r><w:br w:type="%s"/></w:r>' % kind
    return '<w:r><w:br/></w:r>'


def SYM(char_hex, font='Wingdings', **kw):
    return '<w:r>%s<w:sym w:font="%s" w:char="%s"/></w:r>' % (rpr(**kw), font, char_hex)


_MD = re.compile(r'(\*\*.+?\*\*|__.+?__|\*.+?\*|==.+?==|\^\^.+?\^\^|,,.+?,,)')


def md(text, **base):
    """Mini markup: **bold**, *italic*, __underline__, ==highlight==, ^^superscript^^, ,,subscript,,"""
    out = []
    for tok in _MD.split(text):
        if not tok:
            continue
        kw = dict(base)
        if tok.startswith('**') and tok.endswith('**'):
            kw['b'] = True
            tok = tok[2:-2]
        elif tok.startswith('__') and tok.endswith('__'):
            kw['u'] = 'single'
            tok = tok[2:-2]
        elif tok.startswith('==') and tok.endswith('=='):
            kw['hl'] = 'yellow'
            tok = tok[2:-2]
        elif tok.startswith('^^') and tok.endswith('^^'):
            kw['vert'] = 'superscript'
            tok = tok[2:-2]
        elif tok.startswith(',,') and tok.endswith(',,'):
            kw['vert'] = 'subscript'
            tok = tok[2:-2]
        elif tok.startswith('*') and tok.endswith('*') and len(tok) > 2:
            kw['i'] = True
            tok = tok[1:-1]
        out.append(R(tok, **kw))
    return ''.join(out)


def border(val='single', sz=4, space=0, color='auto'):
    return 'w:val="%s" w:sz="%d" w:space="%d" w:color="%s"' % (val, sz, space, color)


def pbdr(top=None, left=None, bottom=None, right=None, between=None, box=None):
    if box:
        top = left = bottom = right = box
    x = []
    for name, v in (('top', top), ('left', left), ('bottom', bottom), ('right', right), ('between', between)):
        if v:
            x.append('<w:%s %s/>' % (name, v if isinstance(v, str) else border(*v)))
    return '<w:pBdr>%s</w:pBdr>' % ''.join(x)


def ppr(style=None, jc=None, sb=None, sa=None, line=None, rule='auto', ind_left=None,
        ind_right=None, first=None, hanging=None, keepNext=False, keepLines=False,
        pageBreakBefore=False, numId=None, ilvl=0, tabs=None, bdr=None, shd=None,
        framePr=None, outline=None, mark='', sect='', widow=None, contextual=False,
        textAlignment=None, change='', suppressLineNumbers=False, autospace=None,
        textDirection=None, suppressAutoHyphens=False, mirror=False):
    x = []
    if style:
        x.append('<w:pStyle w:val="%s"/>' % style)
    if keepNext:
        x.append('<w:keepNext/>')
    if keepLines:
        x.append('<w:keepLines/>')
    if pageBreakBefore:
        x.append('<w:pageBreakBefore/>')
    if framePr:
        x.append(framePr)
    if widow is not None:
        x.append('<w:widowControl w:val="%d"/>' % (1 if widow else 0))
    if numId is not None:
        x.append('<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>' % (ilvl, numId))
    if suppressLineNumbers:
        x.append('<w:suppressLineNumbers/>')
    if bdr:
        x.append(bdr)
    if shd:
        x.append('<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % shd)
    if tabs:
        t = []
        if style in ('En-tte', 'Pieddepage'):
            # like Word: clear the style's tab stops (centre 8 cm, right 16 cm), replaced by ours
            own = {tb[0] for tb in tabs}
            tabs = [(p_, 'clear') for p_ in (4536, 9072) if p_ not in own] + list(tabs)
            tabs.sort(key=lambda tb: tb[0])
        for tb in tabs:
            pos, val = tb[0], tb[1]
            leader = tb[2] if len(tb) > 2 else None
            t.append('<w:tab w:val="%s"%s w:pos="%d"/>' % (
                val, (' w:leader="%s"' % leader) if leader else '', pos))
        x.append('<w:tabs>%s</w:tabs>' % ''.join(t))
    if suppressAutoHyphens:
        x.append('<w:suppressAutoHyphens/>')
    if any(v is not None for v in (sb, sa, line)):
        s = '<w:spacing'
        if sb is not None:
            s += ' w:before="%d"' % sb
        if sa is not None:
            s += ' w:after="%d"' % sa
        if line is not None:
            s += ' w:line="%d" w:lineRule="%s"' % (line, rule)
        x.append(s + '/>')
    if any(v is not None for v in (ind_left, ind_right, first, hanging)):
        s = '<w:ind'
        if ind_left is not None:
            s += ' w:left="%d"' % ind_left
        if ind_right is not None:
            s += ' w:right="%d"' % ind_right
        if first is not None:
            s += ' w:firstLine="%d"' % first
        if hanging is not None:
            s += ' w:hanging="%d"' % hanging
        x.append(s + '/>')
    if contextual:
        x.append('<w:contextualSpacing/>')
    if mirror:
        x.append('<w:mirrorIndents/>')
    if jc:
        x.append('<w:jc w:val="%s"/>' % jc)
    if textDirection:
        x.append('<w:textDirection w:val="%s"/>' % textDirection)
    if textAlignment:
        x.append('<w:textAlignment w:val="%s"/>' % textAlignment)
    if outline is not None:
        x.append('<w:outlineLvl w:val="%d"/>' % outline)
    if mark:
        x.append(mark)
    if sect:
        x.append(sect)
    if change:
        x.append(change)
    return '<w:pPr>%s</w:pPr>' % ''.join(x) if x else ''


def P(content='', **kw):
    """Paragraph. content: plain text (converted to a run) or runs XML.
    The rpr keys (b, i, sz, font, color...) passed here apply to plain text."""
    rkeys = {k: kw.pop(k) for k in list(kw) if k in RPR_KEYS}
    if content and not is_xml(content):
        content = R(content, **rkeys)
    return '<w:p>%s%s</w:p>' % (ppr(**kw), content)


RPR_KEYS = {'b', 'i', 'u', 'sz', 'color', 'font', 'caps', 'smallcaps', 'strike', 'dstrike', 'hl',
            'vert', 'spacing', 'vanish', 'lang', 'pos', 'kern', 'noproof', 'w14', 'scale'}


def PM(text, **kw):
    """Paragraph with md() mini markup."""
    rkeys = {k: kw.pop(k) for k in list(kw) if k in RPR_KEYS}
    return P(md(text, **rkeys), **kw)


def PAGEBREAK():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


# --------------------------------------------------------------------------
# fields
# --------------------------------------------------------------------------

def FLD(instr, result='1', dirty=False, **kw):
    rp = rpr(**kw)
    return ('<w:r>%s<w:fldChar w:fldCharType="begin"%s/></w:r>'
            '<w:r>%s<w:instrText xml:space="preserve"> %s </w:instrText></w:r>'
            '<w:r>%s<w:fldChar w:fldCharType="separate"/></w:r>'
            '<w:r>%s%s</w:r>'
            '<w:r>%s<w:fldChar w:fldCharType="end"/></w:r>') % (
        rp, ' w:dirty="true"' if dirty else '', rp, esc(instr), rp, rp,
        _text_nodes(result), rp)


def FLDSIMPLE(instr, result='1', **kw):
    return '<w:fldSimple w:instr=" %s ">%s</w:fldSimple>' % (esc(instr), R(result, **kw))


def FLD_BEGIN(instr, **kw):
    rp = rpr(**kw)
    return ('<w:r>%s<w:fldChar w:fldCharType="begin"/></w:r>'
            '<w:r>%s<w:instrText xml:space="preserve"> %s </w:instrText></w:r>'
            '<w:r>%s<w:fldChar w:fldCharType="separate"/></w:r>') % (rp, rp, esc(instr), rp)


def FLD_END(**kw):
    return '<w:r>%s<w:fldChar w:fldCharType="end"/></w:r>' % rpr(**kw)


# --------------------------------------------------------------------------
# tables
# --------------------------------------------------------------------------

def tc_borders(spec):
    """spec: dict side -> (val, sz, color) or 'nil'"""
    x = []
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV', 'tl2br', 'tr2bl'):
        if side in spec:
            v = spec[side]
            if v == 'nil':
                x.append('<w:%s w:val="nil"/>' % side)
            else:
                val, sz, color = v
                x.append('<w:%s w:val="%s" w:sz="%d" w:space="0" w:color="%s"/>' % (side, val, sz, color))
    return ''.join(x)


def C(content='', span=1, vmerge=None, shd=None, valign=None, textDir=None, borders=None,
      mar=None, noWrap=False, w=None, hmerge=None, **pkw):
    """Cell. content: plain text, paragraph XML, or a list of paragraph XML."""
    return dict(content=content, span=span, vmerge=vmerge, shd=shd, valign=valign,
                textDir=textDir, borders=borders, mar=mar, noWrap=noWrap, w=w, pkw=pkw)


def TROW(cells, height=None, rule='atLeast', header=False, cantSplit=False, trpr_extra='',
         ins=None):
    return dict(cells=cells, height=height, rule=rule, header=header, cantSplit=cantSplit,
                extra=trpr_extra, ins=ins)


def TBL(rows, widths, style=None, borders='all', jc=None, layout='fixed', tblpPr=None,
        cellMar=None, ind=None, look='04A0', bcolor='auto', bsz=4, caption=None,
        width_pct=None, overlap=None):
    grid = ''.join('<w:gridCol w:w="%d"/>' % wd for wd in widths)
    total = sum(widths)
    tp = []
    if style:
        tp.append('<w:tblStyle w:val="%s"/>' % style)
    if tblpPr:
        tp.append(tblpPr)
    if overlap:
        tp.append('<w:tblOverlap w:val="%s"/>' % overlap)
    if width_pct:
        tp.append('<w:tblW w:w="%d" w:type="pct"/>' % int(width_pct * 50))
    else:
        tp.append('<w:tblW w:w="%d" w:type="dxa"/>' % total)
    if jc:
        tp.append('<w:jc w:val="%s"/>' % jc)
    if ind is not None:
        tp.append('<w:tblInd w:w="%d" w:type="dxa"/>' % ind)
    if borders == 'all':
        b = '<w:{0} w:val="single" w:sz="%d" w:space="0" w:color="%s"/>' % (bsz, bcolor)
        tp.append('<w:tblBorders>%s</w:tblBorders>' % ''.join(
            b.format(s) for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')))
    elif borders == 'none':
        tp.append('<w:tblBorders>%s</w:tblBorders>' % ''.join(
            '<w:%s w:val="nil"/>' % s for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')))
    elif borders == 'h':
        b = '<w:{0} w:val="single" w:sz="%d" w:space="0" w:color="%s"/>' % (bsz, bcolor)
        tp.append('<w:tblBorders>%s%s%s</w:tblBorders>' % (
            b.format('top'), b.format('bottom'), b.format('insideH')))
    elif borders:
        tp.append(borders)
    tp.append('<w:tblLayout w:type="%s"/>' % layout)
    if cellMar:
        tp.append('<w:tblCellMar><w:top w:w="%d" w:type="dxa"/><w:left w:w="%d" w:type="dxa"/>'
                  '<w:bottom w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/></w:tblCellMar>' % cellMar)
    lk = int(look, 16)
    tp.append('<w:tblLook w:val="%s" w:firstRow="%d" w:lastRow="%d" w:firstColumn="%d" w:lastColumn="%d" '
              'w:noHBand="%d" w:noVBand="%d"/>' % (look, bool(lk & 0x20), bool(lk & 0x40), bool(lk & 0x80),
                                                   bool(lk & 0x100), bool(lk & 0x200), bool(lk & 0x400)))
    if caption:
        tp.append('<w:tblCaption w:val="%s"/>' % esc(caption))
    out = ['<w:tbl><w:tblPr>%s</w:tblPr><w:tblGrid>%s</w:tblGrid>' % (''.join(tp), grid)]
    for row in rows:
        if isinstance(row, list):
            row = TROW(row)
        trp = []
        if row['cantSplit']:
            trp.append('<w:cantSplit/>')
        if row['height']:
            trp.append('<w:trHeight w:val="%d" w:hRule="%s"/>' % (row['height'], row['rule']))
        if row['header']:
            trp.append('<w:tblHeader/>')
        if row['extra']:
            trp.append(row['extra'])
        if row['ins']:
            trp.append(row['ins'])
        out.append('<w:tr>%s' % ('<w:trPr>%s</w:trPr>' % ''.join(trp) if trp else ''))
        col = 0
        for cell in row['cells']:
            if not isinstance(cell, dict):
                cell = C(cell)
            span = cell['span']
            wd = cell['w'] or sum(widths[col:col + span])
            col += span
            tcp = ['<w:tcW w:w="%d" w:type="dxa"/>' % wd]
            if span > 1:
                tcp.append('<w:gridSpan w:val="%d"/>' % span)
            if cell['vmerge'] == 'restart':
                tcp.append('<w:vMerge w:val="restart"/>')
            elif cell['vmerge']:
                tcp.append('<w:vMerge/>')
            if cell['borders']:
                tcp.append('<w:tcBorders>%s</w:tcBorders>' % tc_borders(cell['borders']))
            if cell['shd']:
                tcp.append('<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % cell['shd'])
            if cell['noWrap']:
                tcp.append('<w:noWrap/>')
            if cell['mar']:
                tcp.append('<w:tcMar><w:top w:w="%d" w:type="dxa"/><w:left w:w="%d" w:type="dxa"/>'
                           '<w:bottom w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/></w:tcMar>' % cell['mar'])
            if cell['textDir']:
                tcp.append('<w:textDirection w:val="%s"/>' % cell['textDir'])
            if cell['valign']:
                tcp.append('<w:vAlign w:val="%s"/>' % cell['valign'])
            content = cell['content']
            if isinstance(content, (list, tuple)):
                content = ''.join(content)
            if not is_xml(content):
                content = P(content, **cell['pkw'])
            if not content.rstrip().endswith('</w:p>'):
                content += '<w:p>%s</w:p>' % ppr(sa=0, line=240)
            out.append('<w:tc><w:tcPr>%s</w:tcPr>%s</w:tc>' % (''.join(tcp), content))
        out.append('</w:tr>')
    out.append('</w:tbl>')
    return ''.join(out)


# --------------------------------------------------------------------------
# sections
# --------------------------------------------------------------------------
A4 = (11906, 16838)
A3 = (16838, 23811)


def SECT(size=A4, landscape=False, margins=(1417, 1417, 1417, 1417, 708, 708, 0), cols=None,
         kind=None, headers=None, footers=None, titlePg=False, pgNum=None, lnNum=None,
         pgBorders='', vAlign=None, docGrid=360, footnotePr='', endnotePr='', rtlGutter=False):
    """margins = (top, right, bottom, left, header, footer, gutter) in twips.
    cols = (count, space) or (count, space, separator) or ('custom', [(w, space),...], sep)"""
    x = []
    for kind_, rid in (headers or {}).items():
        x.append('<w:headerReference w:type="%s" r:id="%s"/>' % (kind_, rid))
    for kind_, rid in (footers or {}).items():
        x.append('<w:footerReference w:type="%s" r:id="%s"/>' % (kind_, rid))
    if footnotePr:
        x.append(footnotePr)
    if endnotePr:
        x.append(endnotePr)
    if kind:
        x.append('<w:type w:val="%s"/>' % kind)
    w, h = size
    if landscape:
        x.append('<w:pgSz w:w="%d" w:h="%d" w:orient="landscape"/>' % (h, w))
    else:
        x.append('<w:pgSz w:w="%d" w:h="%d"/>' % (w, h))
    t, r, b, l, hd, ft, g = margins
    x.append('<w:pgMar w:top="%d" w:right="%d" w:bottom="%d" w:left="%d" w:header="%d" '
             'w:footer="%d" w:gutter="%d"/>' % (t, r, b, l, hd, ft, g))
    if pgBorders:
        x.append(pgBorders)
    if lnNum:
        countBy, restart, dist = lnNum
        x.append('<w:lnNumType w:countBy="%d" w:distance="%d" w:restart="%s"/>' % (countBy, dist, restart))
    if pgNum:
        fmt, start = pgNum
        s = '<w:pgNumType'
        if fmt:
            s += ' w:fmt="%s"' % fmt
        if start is not None:
            s += ' w:start="%d"' % start
        x.append(s + '/>')
    if cols:
        if cols[0] == 'custom':
            _, spec, sep = cols
            inner = ''.join('<w:col w:w="%d" w:space="%d"/>' % cs for cs in spec)
            x.append('<w:cols w:num="%d"%s w:equalWidth="0">%s</w:cols>' % (
                len(spec), ' w:sep="1"' if sep else '', inner))
        else:
            num, space = cols[0], cols[1]
            sep = len(cols) > 2 and cols[2]
            x.append('<w:cols w:num="%d" w:space="%d"%s/>' % (num, space, ' w:sep="1"' if sep else ''))
    else:
        x.append('<w:cols w:space="708"/>')
    if vAlign:
        x.append('<w:vAlign w:val="%s"/>' % vAlign)
    if titlePg:
        x.append('<w:titlePg/>')
    if rtlGutter:
        x.append('<w:rtlGutter/>')
    if docGrid:
        x.append('<w:docGrid w:linePitch="%d"/>' % docGrid)
    return '<w:sectPr>%s</w:sectPr>' % ''.join(x)


def SECTBREAK(sect, **pkw):
    """Paragraph carrying the section end (sectPr in pPr)."""
    return '<w:p>%s</w:p>' % ppr(sect=sect, **pkw)


def page_borders(val='single', sz=12, space=24, color='auto', offset='page', art=False):
    a = 'w:val="%s" w:sz="%d" w:space="%d" w:color="%s"' % (val, sz, space, color)
    return ('<w:pgBorders w:offsetFrom="%s"><w:top %s/><w:left %s/><w:bottom %s/><w:right %s/>'
            '</w:pgBorders>') % (offset, a, a, a, a)


# --------------------------------------------------------------------------
# drawings: images, shapes, text boxes
# --------------------------------------------------------------------------

def _pic(rid, cx, cy, pid, name, crop=None, geom='rect', line=None, rot=0, descr=''):
    src = ''
    if crop:
        l, t, r, b = crop
        src = '<a:srcRect l="%d" t="%d" r="%d" b="%d"/>' % (l, t, r, b)
    ln = ''
    if line:
        color, wpt = line
        ln = '<a:ln w="%d"><a:solidFill><a:srgbClr val="%s"/></a:solidFill></a:ln>' % (int(wpt * 12700), color)
    rot_attr = ' rot="%d"' % int(rot * 60000) if rot else ''
    return ('<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            '<pic:pic><pic:nvPicPr><pic:cNvPr id="%d" name="%s" descr="%s"/><pic:cNvPicPr>'
            '<a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr>'
            '<pic:blipFill><a:blip r:embed="%s"/>%s<a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            '<pic:spPr bwMode="auto"><a:xfrm%s><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
            '<a:prstGeom prst="%s"><a:avLst/></a:prstGeom><a:noFill/>%s</pic:spPr></pic:pic>'
            '</a:graphicData></a:graphic>') % (
        pid, esc(name), esc(descr), rid, src, rot_attr, cx, cy, geom, ln)


def _wrap(wrap, side='bothSides', polygon=None):
    if wrap == 'square':
        return '<wp:wrapSquare wrapText="%s"/>' % side
    if wrap == 'topAndBottom':
        return '<wp:wrapTopAndBottom/>'
    if wrap in ('tight', 'through'):
        pts = polygon or [(0, 0), (0, 21600), (21600, 21600), (21600, 0), (0, 0)]
        poly = '<wp:wrapPolygon edited="0"><wp:start x="%d" y="%d"/>%s</wp:wrapPolygon>' % (
            pts[0][0], pts[0][1], ''.join('<wp:lineTo x="%d" y="%d"/>' % p for p in pts[1:]))
        tag = 'wrapTight' if wrap == 'tight' else 'wrapThrough'
        return '<wp:%s wrapText="%s">%s</wp:%s>' % (tag, side, poly, tag)
    return '<wp:wrapNone/>'


def octagon_polygon():
    """Wrap polygon approximating a disc (21600 units)."""
    return [(6300, 0), (0, 6300), (0, 15300), (6300, 21600), (15300, 21600),
            (21600, 15300), (21600, 6300), (15300, 0), (6300, 0)]


def _pos(axis, rel, off=None, align=None):
    tag = 'positionH' if axis == 'h' else 'positionV'
    if align:
        return '<wp:%s relativeFrom="%s"><wp:align>%s</wp:align></wp:%s>' % (tag, rel, align, tag)
    return '<wp:%s relativeFrom="%s"><wp:posOffset>%d</wp:posOffset></wp:%s>' % (tag, rel, emu(off or 0), tag)


def _anchor_open(w, h, x, y, relH, relV, wrap, side, behind, z, alignH, alignV, polygon,
                 dist=(0, 0, 114300, 114300), layoutInCell=1, allowOverlap=1):
    dT, dB, dL, dR = dist
    return ('<wp:anchor distT="%d" distB="%d" distL="%d" distR="%d" simplePos="0" relativeHeight="%d" '
            'behindDoc="%d" locked="0" layoutInCell="%d" allowOverlap="%d"><wp:simplePos x="0" y="0"/>%s%s'
            '<wp:extent cx="%d" cy="%d"/><wp:effectExtent l="0" t="0" r="0" b="0"/>%s') % (
        dT, dB, dL, dR, z, 1 if behind else 0, layoutInCell, allowOverlap,
        _pos('h', relH, x, alignH), _pos('v', relV, y, alignV), emu(w), emu(h),
        _wrap(wrap, side, polygon))


class Drawer(object):
    """Factory of drawn objects; shares the document's identifier counter."""

    def __init__(self, doc):
        self.doc = doc

    def inline(self, rid, w, h, name='Image', crop=None, geom='rect', line=None, descr=''):
        i = self.doc.next_id()
        return ('<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
                '<wp:extent cx="%d" cy="%d"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
                '<wp:docPr id="%d" name="%s %d" descr="%s"/><wp:cNvGraphicFramePr>'
                '<a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>%s'
                '</wp:inline></w:drawing></w:r>') % (
            emu(w), emu(h), i, name, i, esc(descr),
            _pic(rid, emu(w), emu(h), i, '%s %d' % (name, i), crop, geom, line, descr=descr))

    def anchor(self, rid, w, h, x=0, y=0, relH='column', relV='paragraph', wrap='square',
               side='bothSides', behind=False, alignH=None, alignV=None, polygon=None, name='Image',
               crop=None, geom='rect', line=None, rot=0, dist=(0, 0, 114300, 114300), descr=''):
        i = self.doc.next_id()
        z = self.doc.next_z()
        return ('<w:r><w:drawing>%s<wp:docPr id="%d" name="%s %d" descr="%s"/><wp:cNvGraphicFramePr>'
                '<a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>%s</wp:anchor>'
                '</w:drawing></w:r>') % (
            _anchor_open(w, h, x, y, relH, relV, wrap, side, behind, z, alignH, alignV, polygon, dist),
            i, name, i, esc(descr),
            _pic(rid, emu(w), emu(h), i, '%s %d' % (name, i), crop, geom, line, rot, descr))

    @staticmethod
    def _sppr(w, h, geom, fill, line, line_w, dash, rot, adj, flipV=False, flipH=False, arrow=None,
              grad=None, shadow=False):
        attrs = ''
        if rot:
            attrs += ' rot="%d"' % int(rot * 60000)
        if flipH:
            attrs += ' flipH="1"'
        if flipV:
            attrs += ' flipV="1"'
        av = ''.join('<a:gd name="%s" fmla="val %d"/>' % kv for kv in (adj or []))
        if grad:
            c1, c2 = grad
            f = ('<a:gradFill flip="none" rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="%s"/></a:gs>'
                 '<a:gs pos="100000"><a:srgbClr val="%s"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/>'
                 '</a:gradFill>') % (c1, c2)
        elif fill:
            f = '<a:solidFill><a:srgbClr val="%s"/></a:solidFill>' % fill
        else:
            f = '<a:noFill/>'
        if line:
            ln = '<a:ln w="%d"><a:solidFill><a:srgbClr val="%s"/></a:solidFill>%s%s</a:ln>' % (
                int(line_w * 12700), line, '<a:prstDash val="%s"/>' % dash if dash else '',
                ('<a:tailEnd type="%s"/>' % arrow) if arrow else '')
        else:
            ln = '<a:ln><a:noFill/></a:ln>'
        eff = ''
        if shadow:
            eff = ('<a:effectLst><a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0">'
                   '<a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw></a:effectLst>')
        return ('<wps:spPr><a:xfrm%s><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
                '<a:prstGeom prst="%s"><a:avLst>%s</a:avLst></a:prstGeom>%s%s%s</wps:spPr>') % (
            attrs, emu(w), emu(h), geom, av, f, ln, eff)

    @staticmethod
    def _bodypr(ins=(0.25, 0.13, 0.25, 0.13), anchor='t', vert='horz', autofit=False, wrap='square'):
        l, t, r, b = ins
        return ('<wps:bodyPr rot="0" vert="%s" wrap="%s" lIns="%d" tIns="%d" rIns="%d" bIns="%d" '
                'anchor="%s" anchorCtr="0">%s</wps:bodyPr>') % (
            vert, wrap, emu(l), emu(t), emu(r), emu(b), anchor,
            '<a:spAutoFit/>' if autofit else '<a:noAutofit/>')

    def shape(self, w, h, x=0, y=0, relH='column', relV='paragraph', geom='rect', fill='FFFFFF',
              line='000000', line_w=0.75, dash=None, text=None, wrap='square', side='bothSides',
              behind=False, alignH=None, alignV=None, rot=0, adj=None, anchor='t', vert='horz',
              ins=(0.25, 0.13, 0.25, 0.13), autofit=False, name=None, flipV=False, flipH=False,
              arrow=None, grad=None, shadow=False, vml=True, dist=(45720, 45720, 114300, 114300),
              inline=False):
        """DrawingML shape (wps), with a text box if text (paragraph XML) is given.
        VML fallback (mc:Fallback) generated for rectangular/rounded/ellipse text boxes."""
        i = self.doc.next_id()
        z = self.doc.next_z()
        is_cx = geom in ('straightConnector1', 'line')
        name = name or ('Zone de texte' if text else ('Connecteur droit' if is_cx else 'Forme'))
        cnv = '<wps:cNvCnPr/>' if is_cx else ('<wps:cNvSpPr txBox="1"/>' if text and geom == 'rect' else '<wps:cNvSpPr/>')
        txbx = '<wps:txbx><w:txbxContent>%s</w:txbxContent></wps:txbx>' % text if text else ''
        wsp = ('<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
               '<wps:wsp>%s%s%s%s</wps:wsp></a:graphicData></a:graphic>') % (
            cnv, self._sppr(w, h, geom, fill, line, line_w, dash, rot, adj, flipV, flipH, arrow, grad, shadow),
            txbx, self._bodypr(ins, anchor, vert, autofit))
        if inline:
            frame = ('<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="%d" cy="%d"/>'
                     '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="%d" name="%s %d"/>'
                     '<wp:cNvGraphicFramePr/>%s</wp:inline>') % (emu(w), emu(h), i, name, i, wsp)
        else:
            frame = ('%s<wp:docPr id="%d" name="%s %d"/><wp:cNvGraphicFramePr/>%s</wp:anchor>') % (
                _anchor_open(w, h, x, y, relH, relV, wrap, side, behind, z, alignH, alignV, None, dist),
                i, name, i, wsp)
        fallback = ''
        if vml and not inline and geom in ('rect', 'roundRect', 'ellipse') and not rot:
            # the content is duplicated in the VML fallback: renumber the drawings it contains
            ftext = re.sub(r'(<wp:docPr id=")(\d+)', lambda m: m.group(1) + str(self.doc.next_id()), text) if text else text
            ftext = re.sub(r'(<pic:cNvPr id=")(\d+)', lambda m: m.group(1) + str(self.doc._id), ftext) if text else text
            fallback = '<mc:Fallback>%s</mc:Fallback>' % self._vml(
                i, w, h, x, y, relH, relV, geom, fill, line, line_w, ftext, wrap, behind, z, alignH, alignV)
        return ('<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>%s</w:drawing></mc:Choice>'
                '%s</mc:AlternateContent></w:r>') % (frame, fallback)

    @staticmethod
    def _vml(i, w, h, x, y, relH, relV, geom, fill, line, line_w, text, wrap, behind, z, alignH, alignV):
        pt = lambda c: '%.1fpt' % (c / 2.54 * 72)
        tag = {'rect': 'rect', 'roundRect': 'roundrect', 'ellipse': 'oval'}[geom]
        relmap = {'column': 'text', 'paragraph': 'text', 'line': 'line', 'margin': 'margin', 'page': 'page',
                  'character': 'char', 'leftMargin': 'left-margin-area', 'rightMargin': 'right-margin-area',
                  'topMargin': 'top-margin-area', 'bottomMargin': 'bottom-margin-area'}
        style = 'position:absolute;margin-left:%s;margin-top:%s;width:%s;height:%s;z-index:%d;' % (
            pt(x or 0), pt(y or 0), pt(w), pt(h), (-z if behind else z))
        if alignH:
            style += 'mso-position-horizontal:%s;' % alignH
        style += 'mso-position-horizontal-relative:%s;' % relmap.get(relH, 'text')
        if alignV:
            style += 'mso-position-vertical:%s;' % alignV
        style += 'mso-position-vertical-relative:%s;' % relmap.get(relV, 'text')
        style += 'mso-wrap-style:square;v-text-anchor:top'
        fillattr = ('fillcolor="#%s"' % fill) if fill else 'filled="f"'
        strokeattr = ('strokecolor="#%s" strokeweight="%.2fpt"' % (line, line_w)) if line else 'stroked="f"'
        tb = '<v:textbox><w:txbxContent>%s</w:txbxContent></v:textbox>' % text if text else ''
        wraptype = {'square': 'square', 'topAndBottom': 'topAndBottom', 'tight': 'tight',
                    'through': 'through'}.get(wrap)
        wr = '<w10:wrap type="%s"/>' % wraptype if wraptype else ''
        return '<w:pict><v:%s id="_x0000_s%d" style="%s" %s %s>%s%s</v:%s></w:pict>' % (
            tag, 1025 + i, style, fillattr, strokeattr, tb, wr, tag)

    def group(self, w, h, children, x=0, y=0, relH='column', relV='paragraph', wrap='square',
              behind=False, alignH=None, alignV=None):
        """Shape group (wpg:wgp). children: list of dicts (x,y,w,h,geom,fill,line,text) in cm
        relative to the group."""
        i = self.doc.next_id()
        z = self.doc.next_z()
        kids = []
        for k in children:
            ci = self.doc.next_id()
            text = k.get('text')
            geom = k.get('geom', 'rect')
            sppr = self._sppr(k['w'], k['h'], geom, k.get('fill', 'FFFFFF'), k.get('line', '000000'),
                              k.get('line_w', 0.75), k.get('dash'), 0, k.get('adj'), arrow=k.get('arrow'))
            sppr = sppr.replace('<a:off x="0" y="0"/>', '<a:off x="%d" y="%d"/>' % (emu(k['x']), emu(k['y'])), 1)
            is_cx = geom in ('straightConnector1', 'line')
            kids.append('<wps:wsp><wps:cNvPr id="%d" name="Forme %d"/>%s%s%s%s</wps:wsp>' % (
                ci, ci, '<wps:cNvCnPr/>' if is_cx else '<wps:cNvSpPr/>', sppr,
                '<wps:txbx><w:txbxContent>%s</w:txbxContent></wps:txbx>' % text if text else '',
                self._bodypr(k.get('ins', (0.1, 0.05, 0.1, 0.05)), k.get('anchor', 'ctr'))))
        grp = ('<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">'
               '<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/>'
               '<a:chOff x="0" y="0"/><a:chExt cx="%d" cy="%d"/></a:xfrm></wpg:grpSpPr>%s</wpg:wgp>'
               '</a:graphicData></a:graphic>') % (emu(w), emu(h), emu(w), emu(h), ''.join(kids))
        frame = '%s<wp:docPr id="%d" name="Groupe %d"/><wp:cNvGraphicFramePr/>%s</wp:anchor>' % (
            _anchor_open(w, h, x, y, relH, relV, wrap, 'bothSides', behind, z, alignH, alignV, None),
            i, i, grp)
        return ('<w:r><mc:AlternateContent><mc:Choice Requires="wpg"><w:drawing>%s</w:drawing></mc:Choice>'
                '</mc:AlternateContent></w:r>') % frame

    def watermark(self, text, font='Calibri', color='C0C0C0', w=15.0, h=5.0, rot=315):
        """Classic VML text watermark (WordArt of Word's 'Watermark' box)."""
        i = self.doc.next_id()
        pt = lambda c: '%.1fpt' % (c / 2.54 * 72)
        return ('<w:r><w:rPr><w:noProof/></w:rPr><w:pict>'
                '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" '
                'path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/>'
                '<v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/>'
                '<v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/>'
                '<v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/>'
                '<v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/>'
                '<v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" '
                'o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>'
                '<v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/>'
                '</v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>'
                '<v:shape id="PowerPlusWaterMarkObject%d" o:spid="_x0000_s%d" type="#_x0000_t136" '
                'style="position:absolute;margin-left:0;margin-top:0;width:%s;height:%s;rotation:%d;'
                'z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;'
                'mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" '
                'fillcolor="#%s" stroked="f"><v:fill opacity=".5"/><v:textpath style="font-family:&quot;%s&quot;;'
                'font-size:1pt" string="%s"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape>'
                '</w:pict></w:r>') % (i, 2048 + i, pt(w), pt(h), rot, color, esc(font), esc(text))

    def chart_inline(self, rid, w, h, name='Graphique'):
        i = self.doc.next_id()
        return ('<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
                '<wp:extent cx="%d" cy="%d"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
                '<wp:docPr id="%d" name="%s %d"/><wp:cNvGraphicFramePr/>'
                '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
                '<c:chart r:id="%s"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>') % (
            emu(w), emu(h), i, name, i, rid)


def FRAME(w, h=None, x=0, y=0, hAnchor='page', vAnchor='page', wrap='around', hRule='exact', xAlign=None):
    s = '<w:framePr w:w="%d"' % w
    if h:
        s += ' w:h="%d" w:hRule="%s"' % (h, hRule)
    s += ' w:hSpace="141" w:wrap="%s" w:vAnchor="%s" w:hAnchor="%s"' % (wrap, vAnchor, hAnchor)
    if xAlign:
        s += ' w:xAlign="%s"' % xAlign
    else:
        s += ' w:x="%d"' % x
    s += ' w:y="%d"/>' % y
    return s


def DROPCAP(letter, lines=3, font=None, sz=None, color=None):
    """'In text' drop cap as Word writes it (dropCap frame paragraph)."""
    line = {2: 552, 3: 827, 4: 1104}[lines]
    size = sz or {2: 50, 3: 55.5, 4: 74}[lines]
    return ('<w:p><w:pPr><w:keepNext/><w:framePr w:dropCap="drop" w:lines="%d" w:wrap="around" '
            'w:vAnchor="text" w:hAnchor="text"/><w:spacing w:after="0" w:line="%d" w:lineRule="exact"/>'
            '<w:textAlignment w:val="baseline"/></w:pPr>%s</w:p>') % (
        lines, line, R(letter, font=font, sz=size, color=color, pos=-7))


# --------------------------------------------------------------------------
# OMML
# --------------------------------------------------------------------------

def MR(t, plain=False):
    return '<m:r>%s<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">%s</m:t></m:r>' % (
        '<m:rPr><m:sty m:val="p"/></m:rPr>' if plain else '', esc(t))


def MF(num, den, kind=None):
    pr = '<m:fPr><m:type m:val="%s"/></m:fPr>' % kind if kind else ''
    return '<m:f>%s<m:num>%s</m:num><m:den>%s</m:den></m:f>' % (pr, MR(num) if not is_xml(num) else num,
                                                                 MR(den) if not is_xml(den) else den)


def OMATH(*parts):
    return '<m:oMath>%s</m:oMath>' % ''.join(MR(p) if not is_xml(p) else p for p in parts)


def OMATHPARA(*parts):
    return '<w:p><m:oMathPara><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>%s</m:oMathPara></w:p>' % OMATH(*parts)


# --------------------------------------------------------------------------
# charts (DrawingML chart) + embedded minimal Excel workbook
# --------------------------------------------------------------------------

def _col(i):
    return chr(ord('A') + i)


def xlsx_bytes(categories, series):
    """Minimal workbook (sheet Feuil1) holding the chart data."""
    rows = ['<row r="1"><c r="A1" t="inlineStr"><is><t></t></is></c>%s</row>' % ''.join(
        '<c r="%s1" t="inlineStr"><is><t>%s</t></is></c>' % (_col(j + 1), esc(n)) for j, (n, _) in enumerate(series))]
    for k, cat in enumerate(categories):
        r = k + 2
        cells = '<c r="A%d" t="inlineStr"><is><t>%s</t></is></c>' % (r, esc(cat))
        for j, (_, vals) in enumerate(series):
            cells += '<c r="%s%d"><v>%s</v></c>' % (_col(j + 1), r, vals[k])
        rows.append('<row r="%d">%s</row>' % (r, cells))
    files = {
        '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>',
        '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>',
        'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Feuil1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>',
        'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
        '</styleSheet>',
        'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>%s</sheetData></worksheet>' % ''.join(rows),
    }
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            zi = zipfile.ZipInfo(name, FIXED_ZIP_DATE)
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, data.encode('utf-8'))
    return bio.getvalue()


def _strcache(ref, vals):
    return '<c:strRef><c:f>%s</c:f><c:strCache><c:ptCount val="%d"/>%s</c:strCache></c:strRef>' % (
        ref, len(vals), ''.join('<c:pt idx="%d"><c:v>%s</c:v></c:pt>' % (k, esc(v)) for k, v in enumerate(vals)))


def _numcache(ref, vals, fmt='General'):
    return '<c:numRef><c:f>%s</c:f><c:numCache><c:formatCode>%s</c:formatCode><c:ptCount val="%d"/>%s</c:numCache></c:numRef>' % (
        ref, fmt, len(vals), ''.join('<c:pt idx="%d"><c:v>%s</c:v></c:pt>' % (k, v) for k, v in enumerate(vals)))


def _txpr(sz=900, color='595959'):
    return ('<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="%d"><a:solidFill><a:srgbClr val="%s"/>'
            '</a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>') % (sz, color)


def chart_xml(kind, title, categories, series, colors, rid_pkg, bar_dir='col', grouping='clustered'):
    n = len(categories)
    title_x = ('<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr>'
               '<a:r><a:rPr lang="fr-FR" sz="1200" b="1"/><a:t>%s</a:t></a:r></a:p></c:rich></c:tx>'
               '<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>') % esc(title)
    sers = []
    for j, (name, vals) in enumerate(series):
        colref = _col(j + 1)
        tx = '<c:tx>%s</c:tx>' % _strcache('Feuil1!$%s$1' % colref, [name])
        cat = '<c:cat>%s</c:cat>' % _strcache('Feuil1!$A$2:$A$%d' % (n + 1), categories)
        val = '<c:val>%s</c:val>' % _numcache('Feuil1!$%s$2:$%s$%d' % (colref, colref, n + 1), vals)
        if kind == 'pie':
            dpts = ''.join('<c:dPt><c:idx val="%d"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="%s"/>'
                           '</a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>'
                           '</c:spPr></c:dPt>' % (k, colors[k % len(colors)]) for k in range(n))
            dl = ('<c:dLbls><c:numFmt formatCode="0%%" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>%s'
                  '<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/>'
                  '<c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/>'
                  '<c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>') % _txpr(900, '404040')
            sers.append('<c:ser><c:idx val="%d"/><c:order val="%d"/>%s%s%s%s%s</c:ser>' % (j, j, tx, dpts, dl, cat, val))
        elif kind == 'line':
            sp = ('<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="%s"/></a:solidFill><a:round/></a:ln></c:spPr>'
                  '<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="%s"/></a:solidFill></c:spPr></c:marker>') % (
                colors[j], colors[j])
            sers.append('<c:ser><c:idx val="%d"/><c:order val="%d"/>%s%s%s%s<c:smooth val="0"/></c:ser>' % (j, j, tx, sp, cat, val))
        else:
            sp = '<c:spPr><a:solidFill><a:srgbClr val="%s"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>' % colors[j]
            sers.append('<c:ser><c:idx val="%d"/><c:order val="%d"/>%s%s%s%s</c:ser>' % (j, j, tx, sp, cat, val))
    axes_ids = '<c:axId val="50010001"/><c:axId val="50010002"/>'
    if kind == 'pie':
        plot = '<c:pieChart><c:varyColors val="1"/>%s<c:firstSliceAng val="0"/></c:pieChart>' % ''.join(sers)
        axes = ''
    elif kind == 'line':
        plot = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>%s<c:marker val="1"/>%s</c:lineChart>' % (
            ''.join(sers), axes_ids)
    else:
        plot = ('<c:barChart><c:barDir val="%s"/><c:grouping val="%s"/><c:varyColors val="0"/>%s'
                '<c:gapWidth val="150"/>%s%s</c:barChart>') % (
            bar_dir, grouping, ''.join(sers), '<c:overlap val="100"/>' if grouping == 'stacked' else '', axes_ids)
    if kind != 'pie':
        catpos, valpos = ('l', 'b') if bar_dir == 'bar' else ('b', 'l')
        axes = ('<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling>'
                '<c:delete val="0"/><c:axPos val="%s"/><c:numFmt formatCode="General" sourceLinked="1"/>'
                '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>%s'
                '<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/>'
                '<c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
                '<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling>'
                '<c:delete val="0"/><c:axPos val="%s"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill>'
                '<a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>'
                '<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/>'
                '<c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>%s<c:crossAx val="50010001"/>'
                '<c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>') % (
            catpos, _txpr(), valpos, _txpr())
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<c:chartSpace xmlns:c="%s" xmlns:a="%s" xmlns:r="%s"><c:date1904 val="0"/><c:lang val="fr-FR"/>'
            '<c:roundedCorners val="0"/><c:chart>%s<c:plotArea><c:layout/>%s%s</c:plotArea>'
            '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>%s</c:legend><c:plotVisOnly val="1"/>'
            '<c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>'
            '<a:ln><a:noFill/></a:ln></c:spPr>%s<c:externalData r:id="%s"><c:autoUpdate val="0"/></c:externalData>'
            '</c:chartSpace>') % (NS['c'], NS['a'], NS['r'], title_x, plot, axes, _txpr(900),
                                  _txpr(1000, '404040').replace('c:txPr', 'c:txPr'), rid_pkg)


# --------------------------------------------------------------------------
# styles, numbering, settings, fonts
# --------------------------------------------------------------------------

def _style(stype, sid, name, based=None, nxt=None, link=None, ppr_='', rpr_='', ui=None, q=False,
           default=False, extra='', hidden=False):
    x = '<w:style w:type="%s"%s w:styleId="%s"><w:name w:val="%s"/>' % (
        stype, ' w:default="1"' if default else '', sid, name)
    if based:
        x += '<w:basedOn w:val="%s"/>' % based
    if nxt:
        x += '<w:next w:val="%s"/>' % nxt
    if link:
        x += '<w:link w:val="%s"/>' % link
    if ui is not None:
        x += '<w:uiPriority w:val="%d"/>' % ui
    if hidden:
        x += '<w:semiHidden/><w:unhideWhenUsed/>'
    if q:
        x += '<w:qFormat/>'
    x += extra + ppr_ + rpr_ + '</w:style>'
    return x


def heading_rpr(font=None, sz=16, color='2F5496', b=False, i=False, caps=False, theme=None):
    return rpr(font=font, sz=sz, color=color, b=b, i=i, caps=caps) if not theme else (
        '<w:rPr><w:rFonts w:asciiTheme="%s" w:hAnsiTheme="%s" w:eastAsiaTheme="%s" w:cstheme="%s"/>%s%s'
        '<w:color w:val="%s"/><w:sz w:val="%d"/><w:szCs w:val="%d"/></w:rPr>') % (
        theme, theme, 'majorEastAsia' if 'major' in theme else 'minorEastAsia',
        'majorBidi' if 'major' in theme else 'minorBidi', '<w:b/><w:bCs/>' if b else '',
        '<w:caps/>' if caps else '', color, sz * 2, sz * 2)


def styles_xml(body_font=None, body_sz=11, after=160, line=259, lang='fr-FR',
               h=None, title=None, extra='', table_styles=True, normal_color=None):
    """body_font None => theme fonts (minorHAnsi), like Word by default."""
    if body_font:
        rf = '<w:rFonts w:ascii="{0}" w:eastAsia="{0}" w:hAnsi="{0}" w:cs="{0}"/>'.format(esc(body_font))
    else:
        rf = ('<w:rFonts w:asciiTheme="minorHAnsi" w:eastAsiaTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" '
              'w:cstheme="minorBidi"/>')
    defaults = ('<w:docDefaults><w:rPrDefault><w:rPr>%s<w:kern w:val="2"/><w:sz w:val="%d"/><w:szCs w:val="%d"/>'
                '<w:lang w:val="%s" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
                '<w:pPrDefault><w:pPr><w:spacing w:after="%d" w:line="%d" w:lineRule="auto"/></w:pPr>'
                '</w:pPrDefault></w:docDefaults>') % (rf, body_sz * 2, body_sz * 2, lang, after, line)
    latent = ('<w:latentStyles w:defLockedState="0" w:defUIPriority="99" w:defSemiHidden="0" '
              'w:defUnhideWhenUsed="0" w:defQFormat="0" w:count="376">'
              '<w:lsdException w:name="Normal" w:uiPriority="0" w:qFormat="1"/>'
              '<w:lsdException w:name="heading 1" w:uiPriority="9" w:qFormat="1"/>'
              '<w:lsdException w:name="heading 2" w:semiHidden="1" w:uiPriority="9" w:unhideWhenUsed="1" w:qFormat="1"/>'
              '<w:lsdException w:name="heading 3" w:semiHidden="1" w:uiPriority="9" w:unhideWhenUsed="1" w:qFormat="1"/>'
              '<w:lsdException w:name="Title" w:uiPriority="10" w:qFormat="1"/>'
              '<w:lsdException w:name="Table Grid" w:uiPriority="39"/></w:latentStyles>')
    h = h or {}
    hd = {1: dict(sz=16, color='2F5496', theme='majorHAnsi', sb=240, sa=0),
          2: dict(sz=13, color='2F5496', theme='majorHAnsi', sb=40, sa=0),
          3: dict(sz=12, color='1F3763', theme='majorHAnsi', sb=40, sa=0)}
    for k, v in h.items():
        hd[k].update(v)
    st = []
    st.append(_style('paragraph', 'Normal', 'Normal', q=True, default=True,
                     rpr_=rpr(color=normal_color) if normal_color else ''))
    st.append(_style('character', 'Policepardfaut', 'Default Paragraph Font', ui=1, default=True, hidden=True))
    st.append(_style('table', 'TableauNormal', 'Normal Table', ui=99, default=True, hidden=True,
                     extra='<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
                           '<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/>'
                           '<w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>'))
    st.append(_style('numbering', 'Aucuneliste', 'No List', ui=99, default=True, hidden=True))
    for lvl in (1, 2, 3):
        d = hd[lvl]
        num = d.get('numId')
        pp = ('<w:pPr><w:keepNext/><w:keepLines/>%s%s<w:spacing w:before="%d" w:after="%d"/>%s'
              '<w:outlineLvl w:val="%d"/></w:pPr>') % (
            ('<w:numPr><w:numId w:val="%d"/></w:numPr>' % num) if num and lvl == 1 else
            (('<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>' % (lvl - 1, num)) if num else ''),
            d.get('pextra', ''), d['sb'], d['sa'], ('<w:jc w:val="%s"/>' % d['jc']) if d.get('jc') else '', lvl - 1)
        rp = heading_rpr(d.get('font'), d['sz'], d['color'], d.get('b', False), d.get('i', False),
                         d.get('caps', False), None if d.get('font') else d['theme'])
        st.append(_style('paragraph', 'Titre%d' % lvl, 'heading %d' % lvl, 'Normal', 'Normal',
                         'Titre%dCar' % lvl, pp, rp, ui=9, q=True))
        st.append(_style('character', 'Titre%dCar' % lvl, 'Titre %d Car' % lvl, 'Policepardfaut',
                         link='Titre%d' % lvl, ui=9, rpr_=rp))
    t = dict(sz=28, color=None, font=None, sa=0, b=False)
    t.update(title or {})
    trp = heading_rpr(t['font'], t['sz'], t['color'] or '000000', t['b'], theme=None if t['font'] else 'majorHAnsi')
    trp = trp.replace('<w:sz', '<w:spacing w:val="-10"/><w:kern w:val="28"/><w:sz')
    st.append(_style('paragraph', 'Titre', 'Title', 'Normal', 'Normal', 'TitreCar',
                     '<w:pPr><w:spacing w:after="%d" w:line="240" w:lineRule="auto"/><w:contextualSpacing/>%s</w:pPr>' % (
                         t['sa'], ('<w:jc w:val="%s"/>' % t['jc']) if t.get('jc') else ''), trp, ui=10, q=True))
    st.append(_style('character', 'TitreCar', 'Titre Car', 'Policepardfaut', link='Titre', ui=10, rpr_=trp))
    st.append(_style('paragraph', 'Sous-titre', 'Subtitle', 'Normal', 'Normal', None,
                     '<w:pPr><w:numPr><w:ilvl w:val="1"/></w:numPr></w:pPr>',
                     '<w:rPr><w:color w:val="5A5A5A"/><w:spacing w:val="15"/></w:rPr>', ui=11, q=True))
    st.append(_style('paragraph', 'Paragraphedeliste', 'List Paragraph', 'Normal', None, None,
                     '<w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr>', ui=34, q=True))
    st.append(_style('paragraph', 'Sansinterligne', 'No Spacing', None, None, None,
                     '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>', ui=1, q=True))
    st.append(_style('paragraph', 'En-tte', 'header', 'Normal', None, 'En-tteCar',
                     '<w:pPr><w:tabs><w:tab w:val="center" w:pos="4536"/><w:tab w:val="right" w:pos="9072"/></w:tabs>'
                     '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>', ui=99, hidden=True))
    st.append(_style('character', 'En-tteCar', 'En-tête Car', 'Policepardfaut', link='En-tte', ui=99))
    st.append(_style('paragraph', 'Pieddepage', 'footer', 'Normal', None, 'PieddepageCar',
                     '<w:pPr><w:tabs><w:tab w:val="center" w:pos="4536"/><w:tab w:val="right" w:pos="9072"/></w:tabs>'
                     '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>', ui=99, hidden=True))
    st.append(_style('character', 'PieddepageCar', 'Pied de page Car', 'Policepardfaut', link='Pieddepage', ui=99))
    st.append(_style('paragraph', 'Lgende', 'caption', 'Normal', 'Normal', None,
                     '<w:pPr><w:spacing w:after="200" w:line="240" w:lineRule="auto"/></w:pPr>',
                     '<w:rPr><w:i/><w:iCs/><w:color w:val="44546A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>',
                     ui=35, q=True, hidden=True))
    for k, ind in ((1, 0), (2, 220), (3, 440)):
        st.append(_style('paragraph', 'TM%d' % k, 'toc %d' % k, 'Normal', 'Normal', None,
                         '<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9062"/></w:tabs>'
                         '<w:spacing w:after="100"/>%s</w:pPr>' % ('<w:ind w:left="%d"/>' % ind if ind else ''),
                         ui=39, hidden=True))
    st.append(_style('paragraph', 'Tabledesillustrations', 'table of figures', 'Normal', 'Normal', None,
                     '<w:pPr><w:spacing w:after="0"/></w:pPr>', ui=99, hidden=True))
    st.append(_style('paragraph', 'En-ttedetabledesmatires', 'TOC Heading', 'Titre1', 'Normal', None,
                     '<w:pPr><w:numPr><w:numId w:val="0"/></w:numPr><w:outlineLvl w:val="9"/></w:pPr>', ui=39, q=True, hidden=True))
    st.append(_style('paragraph', 'Notedebasdepage', 'footnote text', 'Normal', None, 'NotedebasdepageCar',
                     '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>',
                     '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>', ui=99, hidden=True))
    st.append(_style('character', 'NotedebasdepageCar', 'Note de bas de page Car', 'Policepardfaut',
                     link='Notedebasdepage', ui=99, rpr_='<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'))
    st.append(_style('character', 'Appelnotedebasdep', 'footnote reference', 'Policepardfaut', ui=99, hidden=True,
                     rpr_='<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'))
    st.append(_style('paragraph', 'Notedefin', 'endnote text', 'Normal', None, 'NotedefinCar',
                     '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>',
                     '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>', ui=99, hidden=True))
    st.append(_style('character', 'NotedefinCar', 'Note de fin Car', 'Policepardfaut', link='Notedefin', ui=99,
                     rpr_='<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'))
    st.append(_style('character', 'Appeldenotedefin', 'endnote reference', 'Policepardfaut', ui=99, hidden=True,
                     rpr_='<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'))
    st.append(_style('character', 'Marquedecommentaire', 'annotation reference', 'Policepardfaut', ui=99, hidden=True,
                     rpr_='<w:rPr><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>'))
    st.append(_style('paragraph', 'Commentaire', 'annotation text', 'Normal', None, 'CommentaireCar',
                     '<w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>',
                     '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>', ui=99, hidden=True))
    st.append(_style('character', 'CommentaireCar', 'Commentaire Car', 'Policepardfaut', link='Commentaire', ui=99,
                     rpr_='<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'))
    st.append(_style('character', 'Lienhypertexte', 'Hyperlink', 'Policepardfaut', ui=99, hidden=True,
                     rpr_='<w:rPr><w:color w:val="0563C1" w:themeColor="hyperlink"/><w:u w:val="single"/></w:rPr>'))
    st.append(_style('character', 'Textedelespacerserv', 'Placeholder Text', 'Policepardfaut', ui=99, hidden=True,
                     rpr_='<w:rPr><w:color w:val="808080"/></w:rPr>'))
    st.append(_style('character', 'lev', 'Strong', 'Policepardfaut', ui=22, q=True, rpr_='<w:rPr><w:b/><w:bCs/></w:rPr>'))
    st.append(_style('paragraph', 'Citation', 'Quote', 'Normal', 'Normal', None,
                     '<w:pPr><w:spacing w:before="200" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/></w:pPr>',
                     '<w:rPr><w:i/><w:iCs/><w:color w:val="404040"/></w:rPr>', ui=29, q=True))
    if table_styles:
        bd = '<w:{0} w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        st.append(_style('table', 'Grilledutableau', 'Table Grid', 'TableauNormal', ui=39,
                         extra='<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
                               '<w:tblPr><w:tblBorders>%s</w:tblBorders></w:tblPr>' % ''.join(
                                   bd.format(s) for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))))
        # Grid Table 4 - Accent 1 (modern Word 2013+ style with conditional formatting)
        c1, c2, c3 = '4472C4', '8EAADB', 'D9E2F3'
        b2 = '<w:{0} w:val="single" w:sz="4" w:space="0" w:color="%s" w:themeColor="accent1" w:themeTint="99"/>' % c2
        st.append(_style('table', 'Tableausimple4-Accentuation1', 'Grid Table 4 Accent 1', 'TableauNormal', ui=49,
                         extra='<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
                               '<w:tblPr><w:tblStyleRowBandSize w:val="1"/><w:tblStyleColBandSize w:val="1"/>'
                               '<w:tblBorders>%s</w:tblBorders></w:tblPr>'
                               '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/><w:color w:val="FFFFFF" w:themeColor="background1"/></w:rPr>'
                               '<w:tblPr/><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
                               '<w:left w:val="single" w:sz="4" w:space="0" w:color="%s"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="%s"/>'
                               '<w:right w:val="single" w:sz="4" w:space="0" w:color="%s"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tcBorders>'
                               '<w:shd w:val="clear" w:color="auto" w:fill="%s"/></w:tcPr></w:tblStylePr>'
                               '<w:tblStylePr w:type="lastRow"><w:rPr><w:b/><w:bCs/></w:rPr><w:tblPr/><w:tcPr><w:tcBorders>'
                               '<w:top w:val="double" w:sz="4" w:space="0" w:color="%s"/></w:tcBorders></w:tcPr></w:tblStylePr>'
                               '<w:tblStylePr w:type="firstCol"><w:rPr><w:b/><w:bCs/></w:rPr></w:tblStylePr>'
                               '<w:tblStylePr w:type="band1Horz"><w:tblPr/><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="%s"/></w:tcPr></w:tblStylePr>'
                               % (''.join(b2.format(s) for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')),
                                  c1, c1, c1, c1, c1, c1, c3)))
        st.append(_style('table', 'Tableaulistelgre-Accentuation2', 'List Table 2 Accent 2', 'TableauNormal', ui=47,
                         extra='<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>'
                               '<w:tblPr><w:tblStyleRowBandSize w:val="1"/><w:tblBorders>'
                               '<w:top w:val="single" w:sz="4" w:space="0" w:color="F4B083"/>'
                               '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="F4B083"/>'
                               '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="F4B083"/></w:tblBorders></w:tblPr>'
                               '<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr></w:tblStylePr>'
                               '<w:tblStylePr w:type="band1Horz"><w:tblPr/><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="FBE4D5"/></w:tcPr></w:tblStylePr>'))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles %s %s>%s%s%s%s</w:styles>' % (
        NSDECL, IGNORABLE, defaults, latent, ''.join(st), extra))


BULLETS = {
    'disc': [('', 'Symbol'), ('o', 'Courier New'), ('', 'Wingdings')],
    'check': [('', 'Wingdings'), ('', 'Wingdings'), ('', 'Symbol')],
    'arrow': [('', 'Wingdings'), ('–', 'Calibri'), ('', 'Wingdings')],
    'dash': [('–', 'Calibri'), ('–', 'Calibri'), ('–', 'Calibri')],
    'star': [('', 'Wingdings'), ('', 'Symbol'), ('o', 'Courier New')],
    'box': [('', 'Wingdings'), ('', 'Wingdings'), ('', 'Wingdings')],
    'pencil': [('', 'Wingdings'), ('', 'Symbol'), ('o', 'Courier New')],
}


class Numbering(object):
    def __init__(self):
        self.abstract = []
        self.nums = []

    def _lvl(self, ilvl, fmt, text, left, hanging, start=1, font=None, pstyle=None, isLgl=False,
             rpr_='', suff=None, jc='left'):
        x = '<w:lvl w:ilvl="%d"><w:start w:val="%d"/><w:numFmt w:val="%s"/>' % (ilvl, start, fmt)
        if pstyle:
            x += '<w:pStyle w:val="%s"/>' % pstyle
        if isLgl:
            x += '<w:isLgl/>'
        if suff:
            x += '<w:suff w:val="%s"/>' % suff
        x += '<w:lvlText w:val="%s"/><w:lvlJc w:val="%s"/>' % (esc(text), jc)
        x += '<w:pPr><w:ind w:left="%d" w:hanging="%d"/></w:pPr>' % (left, hanging)
        r = ''
        if font:
            r += '<w:rFonts w:ascii="{0}" w:hAnsi="{0}" w:hint="default"/>'.format(font)
        r += rpr_
        if r:
            x += '<w:rPr>%s</w:rPr>' % r
        return x + '</w:lvl>'

    def _add_abstract(self, lvls, multi='hybridMultilevel'):
        aid = len(self.abstract)
        nsid = '%08X' % (0x1A2B0000 + aid * 7919)
        tmpl = '%08X' % (0x5C3D0000 + aid * 104729)
        self.abstract.append('<w:abstractNum w:abstractNumId="%d" w15:restartNumberingAfterBreak="0">'
                             '<w:nsid w:val="%s"/><w:multiLevelType w:val="%s"/><w:tmpl w:val="%s"/>%s'
                             '</w:abstractNum>' % (aid, nsid, multi, tmpl, ''.join(lvls)))
        return aid

    def _add_num(self, aid, start_override=None):
        nid = len(self.nums) + 1
        ov = ''
        if start_override is not None:
            ov = '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="%d"/></w:lvlOverride>' % start_override
        self.nums.append('<w:num w:numId="%d"><w:abstractNumId w:val="%d"/>%s</w:num>' % (nid, aid, ov))
        return nid

    def bullet(self, kind='disc', indent=720, step=720, hanging=360, color=None):
        syms = BULLETS[kind]
        lvls = []
        for k in range(9):
            ch, font = syms[k % 3]
            lvls.append(self._lvl(k, 'bullet', ch, indent + k * step, hanging, font=font,
                                  rpr_=('<w:color w:val="%s"/>' % color) if color else ''))
        return self._add_num(self._add_abstract(lvls))

    def decimal(self, fmts=None, indent=720, step=720, hanging=360, start=1, bold=False, color=None,
                lvl0_text=None, multi='hybridMultilevel'):
        fmts = fmts or [('decimal', '%1.'), ('lowerLetter', '%2)'), ('lowerRoman', '%3.')]
        lvls = []
        extra = ('<w:b/><w:bCs/>' if bold else '') + (('<w:color w:val="%s"/>' % color) if color else '')
        for k in range(9):
            fmt, text = fmts[k] if k < len(fmts) else ('decimal', '%%%d.' % (k + 1))
            if k == 0 and lvl0_text:
                text = lvl0_text
            lvls.append(self._lvl(k, fmt, text, indent + k * step, hanging, start=start if k == 0 else 1,
                                  rpr_=extra if k == 0 else ''))
        return self._add_num(self._add_abstract(lvls, multi))

    def outline(self, styles, fmts, indents=None, hanging=None, bold0=False, suff=None):
        """Hierarchical numbering linked to the heading styles (e.g. 1. / 1.1. / 1.1.1.)."""
        lvls = []
        for k in range(9):
            fmt, text = fmts[k] if k < len(fmts) else ('decimal', '')
            left = (indents[k] if indents and k < len(indents) else 432 + 144 * k)
            hg = (hanging[k] if hanging and k < len(hanging) else 432 + 144 * k)
            lvls.append(self._lvl(k, fmt, text, left, hg, pstyle=styles[k] if k < len(styles) else None,
                                  isLgl=(k > 0 and fmt == 'decimal'), suff=suff,
                                  rpr_='<w:b/><w:bCs/>' if (bold0 and k == 0) else ''))
        return self._add_num(self._add_abstract(lvls, 'multilevel'))

    def restart(self, numId, start=1):
        """New instance of the same list that restarts at start."""
        m = re.search(r'<w:abstractNumId w:val="(\d+)"/>', self.nums[numId - 1])
        return self._add_num(int(m.group(1)), start)

    def xml(self):
        return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering %s %s>%s%s</w:numbering>' % (
            NSDECL, IGNORABLE, ''.join(self.abstract), ''.join(self.nums)))


FONT_INFO = {
    # name: (panose, family, charset, pitch)
    'Calibri': ('020F0502020204030204', 'swiss', '00', 'variable'),
    'Calibri Light': ('020F0302020204030204', 'swiss', '00', 'variable'),
    'Cambria': ('02040503050406030204', 'roman', '00', 'variable'),
    'Cambria Math': ('02040503050406030204', 'roman', '00', 'variable'),
    'Arial': ('020B0604020202020204', 'swiss', '00', 'variable'),
    'Arial Black': ('020B0A04020102020204', 'swiss', '00', 'variable'),
    'Arial Narrow': ('020B0606020202030204', 'swiss', '00', 'variable'),
    'Times New Roman': ('02020603050405020304', 'roman', '00', 'variable'),
    'Comic Sans MS': ('030F0702030302020204', 'script', '00', 'variable'),
    'Georgia': ('02040502050405020303', 'roman', '00', 'variable'),
    'Verdana': ('020B0604030504040204', 'swiss', '00', 'variable'),
    'Tahoma': ('020B0604030504040204', 'swiss', '00', 'variable'),
    'Trebuchet MS': ('020B0603020202020204', 'swiss', '00', 'variable'),
    'Segoe UI': ('020B0502040204020203', 'swiss', '00', 'variable'),
    'Century Gothic': ('020B0502020202020204', 'swiss', '00', 'variable'),
    'Garamond': ('02020404030301010803', 'roman', '00', 'variable'),
    'Impact': ('020B0806030902050204', 'swiss', '00', 'variable'),
    'Courier New': ('02070309020205020404', 'modern', '00', 'fixed'),
    'Symbol': ('05050102010706020507', 'roman', '02', 'variable'),
    'Wingdings': ('05000000000000000000', 'auto', '02', 'variable'),
    'MS Gothic': ('020B0609070205080204', 'modern', '80', 'fixed'),
    'Aptos': ('020B0004020202020204', 'swiss', '00', 'variable'),
    'Aptos Display': ('020B0004020202020204', 'swiss', '00', 'variable'),
    'Palatino Linotype': ('02040502050505030304', 'roman', '00', 'variable'),
    'Book Antiqua': ('02040602050305030304', 'roman', '00', 'variable'),
    'Segoe UI Symbol': ('020B0502040204020203', 'swiss', '00', 'variable'),
    # "school" or institutional fonts usually ABSENT from workstations: panose unknown
    'Cursive standard': (None, 'script', '00', 'variable'),
    'Belle Allure CM': (None, 'script', '00', 'variable'),
    'Belle Allure GS': (None, 'script', '00', 'variable'),
    'Andika': (None, 'swiss', '00', 'variable'),
    'OpenDyslexic': (None, 'swiss', '00', 'variable'),
    'Marianne': (None, 'swiss', '00', 'variable'),
    'Seyes': (None, 'auto', '00', 'variable'),
    'KG Primary Penmanship': (None, 'script', '00', 'variable'),
}


def font_table_xml(fonts):
    x = []
    for f in sorted(set(fonts)):
        pan, fam, cs, pitch = FONT_INFO.get(f, (None, 'auto', '00', 'variable'))
        x.append('<w:font w:name="%s">%s<w:charset w:val="%s"/><w:family w:val="%s"/><w:pitch w:val="%s"/></w:font>' % (
            esc(f), ('<w:panose1 w:val="%s"/>' % pan) if pan else '', cs, fam, pitch))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts %s %s>%s</w:fonts>' % (
        NSDECL, IGNORABLE, ''.join(x)))


def settings_xml(compat=15, track=False, hyphen=False, even_odd=False, mirror=False, footnotes=False,
                 endnotes=False, protect_forms=False, tab=708, extra_compat='', no_shade_forms=False):
    x = ['<w:zoom w:percent="100"/>']
    if mirror:
        x.append('<w:mirrorMargins/>')
    x.append('<w:proofState w:spelling="clean" w:grammar="clean"/>')
    if track:
        x.append('<w:trackRevisions/>')
    if protect_forms:
        x.append('<w:documentProtection w:edit="forms" w:enforcement="0"/>')
    x.append('<w:defaultTabStop w:val="%d"/>' % tab)
    if hyphen:
        x.append('<w:autoHyphenation/><w:hyphenationZone w:val="425"/>')
    else:
        x.append('<w:hyphenationZone w:val="425"/>')
    if even_odd:
        x.append('<w:evenAndOddHeaders/>')
    if no_shade_forms:
        x.append('<w:doNotShadeFormData/>')
    x.append('<w:characterSpacingControl w:val="doNotCompress"/>')
    if footnotes:
        x.append('<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>')
    if endnotes:
        x.append('<w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>')
    cs = ('<w:compat>%s<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="%d"/>'
          '<w:compatSetting w:name="overrideTableStyleFontSizeAndJustification" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
          '<w:compatSetting w:name="enableOpenTypeFeatures" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
          '<w:compatSetting w:name="doNotFlipMirrorIndents" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
          '%s</w:compat>') % (extra_compat, compat,
                              '<w:compatSetting w:name="differentiateMultirowTableHeaders" w:uri="http://schemas.microsoft.com/office/word" w:val="1"/>'
                              '<w:compatSetting w:name="useWord2013TrackBottomHyphenation" w:uri="http://schemas.microsoft.com/office/word" w:val="0"/>'
                              if compat >= 15 else '')
    x.append(cs)
    x.append('<m:mathPr><m:mathFont m:val="Cambria Math"/><m:brkBin m:val="before"/><m:brkBinSub m:val="--"/>'
             '<m:smallFrac m:val="0"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/>'
             '<m:defJc m:val="centerGroup"/><m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/>'
             '<m:naryLim m:val="undOvr"/></m:mathPr>')
    x.append('<w:themeFontLang w:val="fr-FR"/>')
    x.append('<w:clrSchemeMapping w:bg1="light1" w:t1="dark1" w:bg2="light2" w:t2="dark2" w:accent1="accent1" '
             'w:accent2="accent2" w:accent3="accent3" w:accent4="accent4" w:accent5="accent5" w:accent6="accent6" '
             'w:hyperlink="hyperlink" w:followedHyperlink="followedHyperlink"/>')
    x.append('<w:shapeDefaults><o:shapedefaults v:ext="edit" spidmax="2049"/><o:shapelayout v:ext="edit">'
             '<o:idmap v:ext="edit" data="1"/></o:shapelayout></w:shapeDefaults>')
    x.append('<w:decimalSymbol w:val=","/><w:listSeparator w:val=";"/>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings %s %s>%s</w:settings>' % (
        NSDECL, IGNORABLE, ''.join(x)))


THEMES = {
    'office2013': ('Calibri Light', 'Calibri'),
    'office2023': ('Aptos Display', 'Aptos'),
    'office2007': ('Cambria', 'Calibri'),
}


# --------------------------------------------------------------------------
# Document
# --------------------------------------------------------------------------

class Doc(object):
    def __init__(self, title, theme='office2013', compat=15, styles=None, settings=None, subject='',
                 keywords='', created='2026-03-02T09:00:00Z'):
        self.d = Document()
        self.title = title
        self._id = 0
        self._z = 251658240
        self._bm = 0
        self._rev = 100
        self._sdt = -1700000000
        self.body = []
        self.footnotes = []
        self.endnotes = []
        self.comments = []
        self.numbering = Numbering()
        self.fonts = set(['Calibri', 'Times New Roman', 'Symbol', 'Wingdings', 'Courier New', 'Cambria Math'])
        self.theme = theme
        self.compat = compat
        self.styles_kw = styles or {}
        self.settings_kw = settings or {}
        self.draw = Drawer(self)
        self.subject = subject
        self.keywords = keywords
        self.created = created
        self.charts = 0
        self.final_sect = SECT()
        self._cleanup_template()

    # --- identifiers
    def next_id(self):
        self._id += 1
        return self._id

    def next_z(self):
        self._z += 1024
        return self._z

    def next_rev(self):
        self._rev += 1
        return self._rev

    def next_sdt(self):
        self._sdt += 7919
        return self._sdt

    def bm(self, name, content):
        self._bm += 1
        return '<w:bookmarkStart w:id="%d" w:name="%s"/>%s<w:bookmarkEnd w:id="%d"/>' % (
            self._bm, name, content, self._bm)

    # --- clean up the python-docx template (Word Mac 2010 en-US template, Letter)
    def _cleanup_template(self):
        part = self.d.part
        for rId, rel in list(part.rels.items()):
            if rel.reltype in (RT.CUSTOM_XML, 'http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects'):
                del part.rels[rId]
        pkg = part.package
        for rId, rel in list(pkg.rels.items()):
            if rel.reltype == RT.THUMBNAIL:
                del pkg.rels[rId]

    # --- content
    def add(self, *xml):
        for x in xml:
            self.body.append(x)

    def img(self, path, part=None):
        part = part or self.d.part
        rid, _ = part.get_or_add_image(path)
        return rid

    def link(self, url, text, part=None, **kw):
        part = part or self.d.part
        rid = part.relate_to(url, RT.HYPERLINK, is_external=True)
        kw.setdefault('style', 'Lienhypertexte')
        return '<w:hyperlink r:id="%s" w:history="1">%s</w:hyperlink>' % (rid, R(text, **kw))

    @staticmethod
    def anchor_link(anchor, text, **kw):
        kw.setdefault('style', 'Lienhypertexte')
        return '<w:hyperlink w:anchor="%s" w:history="1">%s</w:hyperlink>' % (anchor, R(text, **kw))

    def _story(self, cls, reltype, builder):
        part = cls.new(self.d.part.package)
        rid = self.d.part.relate_to(part, reltype)
        inner = builder(part) if callable(builder) else builder
        tag = 'w:hdr' if cls is HeaderPart else 'w:ftr'
        part._element = parse_xml('<%s %s %s>%s</%s>' % (tag, NSDECL, IGNORABLE, inner, tag))
        return rid

    def header(self, builder):
        return self._story(HeaderPart, RT.HEADER, builder)

    def footer(self, builder):
        return self._story(FooterPart, RT.FOOTER, builder)

    # notes
    def footnote(self, text_xml, mark_style='Appelnotedebasdep'):
        fid = len(self.footnotes) + 1
        if not is_xml(text_xml):
            text_xml = md(text_xml)
        self.footnotes.append(
            '<w:footnote w:id="%d"><w:p><w:pPr><w:pStyle w:val="Notedebasdepage"/></w:pPr>'
            '<w:r><w:rPr><w:rStyle w:val="%s"/></w:rPr><w:footnoteRef/></w:r>%s%s</w:p></w:footnote>' % (
                fid, mark_style, R(' '), text_xml))
        return '<w:r><w:rPr><w:rStyle w:val="%s"/></w:rPr><w:footnoteReference w:id="%d"/></w:r>' % (mark_style, fid)

    def endnote(self, text_xml):
        eid = len(self.endnotes) + 1
        if not is_xml(text_xml):
            text_xml = md(text_xml)
        self.endnotes.append(
            '<w:endnote w:id="%d"><w:p><w:pPr><w:pStyle w:val="Notedefin"/></w:pPr>'
            '<w:r><w:rPr><w:rStyle w:val="Appeldenotedefin"/></w:rPr><w:endnoteRef/></w:r>%s%s</w:p></w:endnote>' % (
                eid, R(' '), text_xml))
        return '<w:r><w:rPr><w:rStyle w:val="Appeldenotedefin"/></w:rPr><w:endnoteReference w:id="%d"/></w:r>' % eid

    # comments
    def comment(self, author, initials, date, text, parent=None, done=False):
        cid = len(self.comments)
        para_id = '%08X' % (0x1C000000 + cid * 4099)
        self.comments.append(dict(id=cid, author=author, initials=initials, date=date, text=text,
                                  parent=parent, done=done, para=para_id))
        return cid

    @staticmethod
    def cstart(cid):
        return '<w:commentRangeStart w:id="%d"/>' % cid

    @staticmethod
    def cend(cid):
        return ('<w:commentRangeEnd w:id="%d"/><w:r><w:rPr><w:rStyle w:val="Marquedecommentaire"/></w:rPr>'
                '<w:commentReference w:id="%d"/></w:r>') % (cid, cid)

    # revisions
    def ins(self, runs, author, date):
        return '<w:ins w:id="%d" w:author="%s" w:date="%s">%s</w:ins>' % (self.next_rev(), esc(author), date, runs)

    def dele(self, text, author, date, **kw):
        return '<w:del w:id="%d" w:author="%s" w:date="%s">%s</w:del>' % (
            self.next_rev(), esc(author), date, R(text, deleted=True, **kw))

    def rpr_change(self, author, date, old_rpr=''):
        return '<w:rPrChange w:id="%d" w:author="%s" w:date="%s"><w:rPr>%s</w:rPr></w:rPrChange>' % (
            self.next_rev(), esc(author), date, old_rpr)

    def mark_ins(self, author, date):
        return '<w:rPr><w:ins w:id="%d" w:author="%s" w:date="%s"/></w:rPr>' % (self.next_rev(), esc(author), date)

    def mark_del(self, author, date):
        return '<w:rPr><w:del w:id="%d" w:author="%s" w:date="%s"/></w:rPr>' % (self.next_rev(), esc(author), date)

    def row_ins(self, author, date):
        return '<w:ins w:id="%d" w:author="%s" w:date="%s"/>' % (self.next_rev(), esc(author), date)

    def move(self, name, text, author, date, to=False, **kw):
        tag = 'moveTo' if to else 'moveFrom'
        self._bm += 1
        bid = self._bm
        return ('<w:%sRangeStart w:id="%d" w:author="%s" w:date="%s" w:name="%s"/>'
                '<w:%s w:id="%d" w:author="%s" w:date="%s">%s</w:%s><w:%sRangeEnd w:id="%d"/>') % (
            tag, bid, esc(author), date, name, tag, self.next_rev(), esc(author), date,
            R(text, deleted=not to and False, **kw), tag, tag, bid)

    def ppr_change(self, author, date, old_ppr=''):
        return '<w:pPrChange w:id="%d" w:author="%s" w:date="%s"><w:pPr>%s</w:pPr></w:pPrChange>' % (
            self.next_rev(), esc(author), date, old_ppr)

    # content controls
    def sdt_text(self, alias, placeholder='Cliquez ou appuyez ici pour entrer du texte.', value=None, font=None, sz=None,
                 multiline=False):
        sid = self.next_sdt()
        show = '' if value else '<w:showingPlcHdr/>'
        run = R(value, font=font, sz=sz) if value else R(placeholder, style='Textedelespacerserv', font=font, sz=sz)
        return ('<w:sdt><w:sdtPr><w:alias w:val="%s"/><w:tag w:val="%s"/><w:id w:val="%d"/>%s<w:text%s/></w:sdtPr>'
                '<w:sdtContent>%s</w:sdtContent></w:sdt>') % (
            esc(alias), esc(alias.lower().replace(' ', '_')), sid, show,
            ' w:multiLine="1"' if multiline else '', run)

    def sdt_check(self, alias, checked=False, sz=None):
        sid = self.next_sdt()
        return ('<w:sdt><w:sdtPr><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic"/>%s</w:rPr>'
                '<w:alias w:val="%s"/><w:tag w:val="%s"/><w:id w:val="%d"/><w14:checkbox><w14:checked w14:val="%d"/>'
                '<w14:checkedState w14:val="2612" w14:font="MS Gothic"/><w14:uncheckedState w14:val="2610" '
                'w14:font="MS Gothic"/></w14:checkbox></w:sdtPr><w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" '
                'w:eastAsia="MS Gothic" w:hAnsi="MS Gothic" w:hint="eastAsia"/>%s</w:rPr><w:t>%s</w:t></w:r>'
                '</w:sdtContent></w:sdt>') % (
            ('<w:sz w:val="%d"/>' % (sz * 2)) if sz else '', esc(alias), esc(alias.lower().replace(' ', '_')), sid,
            1 if checked else 0, ('<w:sz w:val="%d"/>' % (sz * 2)) if sz else '', '☒' if checked else '☐')

    def sdt_drop(self, alias, items, placeholder='Choisissez un élément.', combo=False):
        sid = self.next_sdt()
        li = '<w:listItem w:displayText="%s" w:value=""/>' % esc(placeholder) + ''.join(
            '<w:listItem w:displayText="%s" w:value="%s"/>' % (esc(i), esc(i)) for i in items)
        tag = 'w:comboBox' if combo else 'w:dropDownList'
        return ('<w:sdt><w:sdtPr><w:alias w:val="%s"/><w:tag w:val="%s"/><w:id w:val="%d"/><w:showingPlcHdr/>'
                '<%s>%s</%s></w:sdtPr><w:sdtContent>%s</w:sdtContent></w:sdt>') % (
            esc(alias), esc(alias.lower().replace(' ', '_')), sid, tag, li, tag,
            R(placeholder, style='Textedelespacerserv'))

    def sdt_date(self, alias, placeholder='Cliquez ou appuyez ici pour entrer une date.', fmt='dd/MM/yyyy'):
        sid = self.next_sdt()
        return ('<w:sdt><w:sdtPr><w:alias w:val="%s"/><w:tag w:val="%s"/><w:id w:val="%d"/><w:showingPlcHdr/>'
                '<w:date><w:dateFormat w:val="%s"/><w:lid w:val="fr-FR"/><w:storeMappedDataAs w:val="dateTime"/>'
                '<w:calendar w:val="gregorian"/></w:date></w:sdtPr><w:sdtContent>%s</w:sdtContent></w:sdt>') % (
            esc(alias), esc(alias.lower().replace(' ', '_')), sid, fmt, R(placeholder, style='Textedelespacerserv'))

    def sdt_block(self, alias, paragraphs):
        sid = self.next_sdt()
        return ('<w:sdt><w:sdtPr><w:alias w:val="%s"/><w:tag w:val="%s"/><w:id w:val="%d"/><w:richText/></w:sdtPr>'
                '<w:sdtContent>%s</w:sdtContent></w:sdt>') % (esc(alias), esc(alias.lower()), sid, paragraphs)

    # legacy form fields ("Forms" toolbar of Word 97-2003)
    def ff_text(self, name, default='', maxlen=0, size=None):
        self._bm += 1
        bid = self._bm
        res = default or ' ' * 5
        ml = '<w:maxLength w:val="%d"/>' % maxlen if maxlen else ''
        dflt = '<w:default w:val="%s"/>' % esc(default) if default else ''
        return ('<w:bookmarkStart w:id="%d" w:name="%s"/><w:r><w:fldChar w:fldCharType="begin"><w:ffData>'
                '<w:name w:val="%s"/><w:enabled/><w:calcOnExit w:val="0"/><w:textInput>%s%s</w:textInput></w:ffData>'
                '</w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r>'
                '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:noProof/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r>'
                '<w:r><w:fldChar w:fldCharType="end"/></w:r><w:bookmarkEnd w:id="%d"/>') % (
            bid, name, name, dflt, ml, esc(res), bid)

    def ff_check(self, name, checked=False, size=None):
        self._bm += 1
        bid = self._bm
        sz = '<w:size w:val="%d"/>' % (size * 2) if size else '<w:sizeAuto/>'
        return ('<w:bookmarkStart w:id="%d" w:name="%s"/><w:r><w:fldChar w:fldCharType="begin"><w:ffData>'
                '<w:name w:val="%s"/><w:enabled/><w:calcOnExit w:val="0"/><w:checkBox>%s<w:default w:val="%d"/>'
                '</w:checkBox></w:ffData></w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> FORMCHECKBOX </w:instrText>'
                '</w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:bookmarkEnd w:id="%d"/>') % (
            bid, name, name, sz, 1 if checked else 0, bid)

    def ff_drop(self, name, entries):
        self._bm += 1
        bid = self._bm
        le = ''.join('<w:listEntry w:val="%s"/>' % esc(e) for e in entries)
        return ('<w:bookmarkStart w:id="%d" w:name="%s"/><w:r><w:fldChar w:fldCharType="begin"><w:ffData>'
                '<w:name w:val="%s"/><w:enabled/><w:calcOnExit w:val="0"/><w:ddList>%s</w:ddList></w:ffData>'
                '</w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> FORMDROPDOWN </w:instrText></w:r>'
                '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>%s</w:t></w:r>'
                '<w:r><w:fldChar w:fldCharType="end"/></w:r><w:bookmarkEnd w:id="%d"/>') % (
            bid, name, name, le, esc(entries[0]), bid)

    # charts
    def chart(self, kind, title, categories, series, colors=('4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'),
              w=15.0, h=7.5, **kw):
        self.charts += 1
        n = self.charts
        pkg = self.d.part.package
        xl = Part(PackURI('/word/embeddings/Microsoft_Excel_Worksheet%s.xlsx' % ('' if n == 1 else n - 1)),
                  CT_XLSX, xlsx_bytes(categories, series), pkg)
        cp = Part(PackURI('/word/charts/chart%d.xml' % n), CT_CHART, b'', pkg)
        rid_pkg = cp.relate_to(xl, RT.PACKAGE)
        cp._blob = chart_xml(kind, title, categories, series, list(colors), rid_pkg, **kw).encode('utf-8')
        rid = self.d.part.relate_to(cp, RT.CHART)
        return self.draw.chart_inline(rid, w, h)

    # --- finalisation
    def _scan_fonts(self, xml):
        for f in re.findall(r'w:(?:ascii|hAnsi)="([^"]+)"', xml):
            self.fonts.add(f)
        for f in re.findall(r'w:font="([^"]+)"', xml):
            self.fonts.add(f)
        for f in re.findall(r'font-family:&quot;([^&]+)&quot;', xml):
            self.fonts.add(f)

    def save(self, path, pages=1, words=None):
        part = self.d.part
        body = ''.join(self.body)
        doc_xml = '<w:document %s %s><w:body>%s%s</w:body></w:document>' % (NSDECL, IGNORABLE, body, self.final_sect)
        part._element = parse_xml(doc_xml)

        styles = styles_xml(**self.styles_kw)
        part._styles_part._element = parse_xml(styles.encode('utf-8'))
        part.numbering_part._element = parse_xml(self.numbering.xml().encode('utf-8'))
        skw = dict(self.settings_kw)
        skw.setdefault('compat', self.compat)
        skw['footnotes'] = bool(self.footnotes)
        skw['endnotes'] = bool(self.endnotes)
        part._settings_part._element = parse_xml(settings_xml(**skw).encode('utf-8'))

        if self.footnotes:
            self._add_notes('footnote', self.footnotes, CT_FOOTNOTES, RT.FOOTNOTES)
        if self.endnotes:
            self._add_notes('endnote', self.endnotes, CT_ENDNOTES, RT.ENDNOTES)
        if self.comments:
            self._add_comments()

        # fonts
        self._scan_fonts(body)
        self._scan_fonts(styles)
        for rel in part.rels.values():
            if not rel.is_external and rel.reltype in (RT.HEADER, RT.FOOTER):
                self._scan_fonts(rel.target_part.blob.decode('utf-8'))
        major, minor = THEMES[self.theme]
        self.fonts |= {major, minor}
        ftp = part.part_related_by(RT.FONT_TABLE)
        ft = font_table_xml(self.fonts).encode('utf-8')
        if hasattr(ftp, '_element'):
            ftp._element = parse_xml(ft)
        else:
            ftp._blob = ft

        # theme: major / minor fonts
        th = part.part_related_by(RT.THEME)
        t = th.blob.decode('utf-8')
        t = re.sub(r'(<a:majorFont>\s*<a:latin typeface=")[^"]*(")', r'\g<1>%s\2' % major, t)
        t = re.sub(r'(<a:minorFont>\s*<a:latin typeface=")[^"]*(")', r'\g<1>%s\2' % minor, t)
        t = t.replace('<a:srgbClr val="4F81BD"/>', '<a:srgbClr val="4472C4"/>')
        th._blob = t.encode('utf-8')

        # properties
        cp = self.d.core_properties
        import datetime as _dt
        dt = _dt.datetime.strptime(self.created, '%Y-%m-%dT%H:%M:%SZ')
        cp.title = self.title
        cp.subject = self.subject
        cp.author = 'Corpus provisoire ElixirOffice (contenu fictif)'
        cp.last_modified_by = 'Corpus provisoire ElixirOffice'
        cp.keywords = self.keywords or 'corpus provisoire; fidelite de mise en page'
        cp.comments = 'Document genere - corpus provisoire, a remplacer par les documents reels.'
        cp.language = 'fr-FR'
        cp.created = dt
        cp.modified = dt
        cp.last_printed = dt
        cp.revision = 3
        cp.category = ''
        app = part.package.part_related_by(RT.EXTENDED_PROPERTIES)
        app._blob = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                     '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
                     'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
                     '<Template>Normal.dotm</Template><TotalTime>42</TotalTime><Pages>%d</Pages>'
                     '<Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity>'
                     '<ScaleCrop>false</ScaleCrop><Company></Company><LinksUpToDate>false</LinksUpToDate>'
                     '<SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>'
                     '<AppVersion>16.0000</AppVersion></Properties>') % pages
        app._blob = app._blob.encode('utf-8')

        bio = io.BytesIO()
        self.d.save(bio)
        write_normalized(bio.getvalue(), path)

    def _add_notes(self, kind, notes, ct, rt):
        sep = ('<w:{0} w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>'
               '</w:pPr><w:r><w:separator/></w:r></w:p></w:{0}><w:{0} w:type="continuationSeparator" w:id="0"><w:p>'
               '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/>'
               '</w:r></w:p></w:{0}>').format(kind)
        xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:%ss %s %s>%s%s</w:%ss>' % (
            kind, NSDECL, IGNORABLE, sep, ''.join(notes), kind)
        p = Part(PackURI('/word/%ss.xml' % kind), ct, xml.encode('utf-8'), self.d.part.package)
        self.d.part.relate_to(p, rt)
        self._scan_fonts(xml)

    def _add_comments(self):
        cs = []
        ex = []
        for c in self.comments:
            paras = c['text'] if isinstance(c['text'], list) else [c['text']]
            px = []
            for k, t in enumerate(paras):
                pid = c['para'] if k == len(paras) - 1 else '%08X' % (int(c['para'], 16) + 1 + k)
                ref = ('<w:r><w:rPr><w:rStyle w:val="Marquedecommentaire"/></w:rPr><w:annotationRef/></w:r>'
                       if k == 0 else '')
                px.append('<w:p w14:paraId="%s" w14:textId="77777777"><w:pPr><w:pStyle w:val="Commentaire"/></w:pPr>%s%s</w:p>' % (
                    pid, ref, R(t)))
            cs.append('<w:comment w:id="%d" w:author="%s" w:date="%s" w:initials="%s">%s</w:comment>' % (
                c['id'], esc(c['author']), c['date'], esc(c['initials']), ''.join(px)))
            parent = ''
            if c['parent'] is not None:
                parent = ' w15:paraIdParent="%s"' % self.comments[c['parent']]['para']
            ex.append('<w15:commentEx w15:paraId="%s"%s w15:done="%d"/>' % (c['para'], parent, 1 if c['done'] else 0))
        xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments %s %s>%s</w:comments>' % (
            NSDECL, IGNORABLE, ''.join(cs))
        p = Part(PackURI('/word/comments.xml'), CT_COMMENTS, xml.encode('utf-8'), self.d.part.package)
        self.d.part.relate_to(p, RT.COMMENTS)
        xml2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w15:commentsEx %s %s>%s</w15:commentsEx>' % (
            NSDECL, IGNORABLE, ''.join(ex))
        p2 = Part(PackURI('/word/commentsExtended.xml'), CT_COMMENTS_EX, xml2.encode('utf-8'), self.d.part.package)
        self.d.part.relate_to(p2, RT_COMMENTS_EX)


def write_normalized(data, path):
    """Rewrite the zip with fixed timestamps and [Content_Types].xml first -> reproducible bytes."""
    src = zipfile.ZipFile(io.BytesIO(data))
    names = src.namelist()
    names.sort(key=lambda n: (n != '[Content_Types].xml', n != '_rels/.rels', n))
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for n in names:
            zi = zipfile.ZipInfo(n, FIXED_ZIP_DATE)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o600 << 16
            z.writestr(zi, src.read(n))


STYLE = _style


def TOC(entries, instr='TOC \\o "1-3" \\h \\z \\u', width=9062, styles=('TM1', 'TM2', 'TM3'),
        num_tabs=(440, 880, 1320)):
    """Pre-computed table of contents (field result already present, as after F9 in Word).
    entries: (level, text, bookmark, page). Each entry = internal link + nested PAGEREF field."""
    out = []
    n = len(entries)
    for k, (lvl, text, bm, page) in enumerate(entries):
        pre = FLD_BEGIN(instr) if k == 0 else ''
        link = '<w:hyperlink w:anchor="%s" w:history="1">%s%s%s%s%s</w:hyperlink>' % (
            bm, R(text, noproof=True), R('\t', noproof=True),
            FLD_BEGIN('PAGEREF %s \\h' % bm, noproof=True), R(str(page), noproof=True), FLD_END(noproof=True))
        post = FLD_END() if k == n - 1 else ''
        st = styles[lvl - 1] if isinstance(lvl, int) else lvl
        tabs = [(width, 'right', 'dot')]
        if '\t' in text and isinstance(lvl, int):
            tabs.insert(0, (num_tabs[lvl - 1], 'left'))
        out.append('<w:p>%s%s%s%s</w:p>' % (ppr(style=st, tabs=tabs), pre, link, post))
    return ''.join(out)


def money(x):
    """French money format with a non-breaking space for thousands: 1 840,00"""
    s = '%.2f' % x
    ent, dec = s.split('.')
    groups = []
    while len(ent) > 3:
        groups.insert(0, ent[-3:])
        ent = ent[:-3]
    groups.insert(0, ent)
    return ' '.join(groups) + ',' + dec
