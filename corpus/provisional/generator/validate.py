# -*- coding: utf-8 -*-
"""Structural validation of the corpus .docx files.

Checks: valid zip, well-formed XML for each part, content types, relation
targets, uniqueness of drawing identifiers, element order (pPr, rPr, sectPr,
tblPr, tcPr, settings, wp:anchor) per the ECMA-376 schema, style,
numbering, note and comment references, bookmark pairing.
Usage: python3 validate.py file.docx [...]
"""
import posixpath
import re
import sys
import zipfile

from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'


def q(t):
    return '{%s}%s' % (W, t)


ORDER = {
    'pPr': ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr',
            'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap',
            'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
            'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc',
            'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr',
            'sectPr', 'pPrChange'],
    'rPr': ['ins', 'del', 'moveFrom', 'moveTo', 'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps',
            'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish',
            'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect',
            'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish',
            'oMath', 'rPrChange'],
    'sectPr': ['headerReference|footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc',
               'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg',
               'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'],
    'tblPr': ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize',
              'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook',
              'tblCaption', 'tblDescription', 'tblPrChange'],
    'tcPr': ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar',
             'textDirection', 'tcFitText', 'vAlign', 'hideMark', 'headers', 'cellIns', 'cellDel', 'cellMerge',
             'tcPrChange'],
}
SETTINGS_ORDER = ['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime',
                  'doNotDisplayPageBoundaries', 'displayBackgroundShape', 'printPostScriptOverText',
                  'printFractionalCharacterWidth', 'printFormsData', 'embedTrueTypeFonts', 'embedSystemFonts',
                  'saveSubsetFonts', 'saveFormsData', 'mirrorMargins', 'alignBordersAndEdges',
                  'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter', 'gutterAtTop', 'hideSpellingErrors',
                  'hideGrammaticalErrors', 'activeWritingStyle', 'proofState', 'formsDesign', 'attachedTemplate',
                  'linkStyles', 'stylePaneFormatFilter', 'stylePaneSortMethod', 'documentType', 'mailMerge',
                  'revisionView', 'trackRevisions', 'doNotTrackMoves', 'doNotTrackFormatting', 'documentProtection',
                  'autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop', 'autoHyphenation',
                  'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope',
                  'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle', 'evenAndOddHeaders',
                  'bookFoldRevPrinting', 'bookFoldPrinting', 'bookFoldPrintingSheets',
                  'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing', 'displayHorizontalDrawingGridEvery',
                  'displayVerticalDrawingGridEvery', 'doNotUseMarginsForDrawingGridOrigin',
                  'drawingGridHorizontalOrigin', 'drawingGridVerticalOrigin', 'doNotShadeFormData',
                  'noPunctuationKerning', 'characterSpacingControl', 'printTwoOnOne', 'strictFirstAndLastChars',
                  'noLineBreaksAfter', 'noLineBreaksBefore', 'savePreviewPicture', 'doNotValidateAgainstSchema',
                  'saveInvalidXml', 'ignoreMixedContent', 'alwaysShowPlaceholderText', 'doNotDemarcateInvalidXml',
                  'saveXmlDataOnly', 'useXSLTWhenSaving', 'saveThroughXslt', 'showXMLTags',
                  'alwaysMergeEmptyNamespace', 'updateFields', 'hdrShapeDefaults', 'footnotePr', 'endnotePr',
                  'compat', 'docVars', 'rsids', 'mathPr', 'attachedSchema', 'themeFontLang', 'clrSchemeMapping',
                  'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions',
                  'readModeInkLockDown', 'smartTagType', 'schemaLibrary', 'shapeDefaults',
                  'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator']
ANCHOR_ORDER = ['simplePos', 'positionH', 'positionV', 'extent', 'effectExtent',
                'wrapNone|wrapSquare|wrapTight|wrapThrough|wrapTopAndBottom', 'docPr', 'cNvGraphicFramePr',
                'graphic', 'sizeRelH', 'sizeRelV']


def _rank(order, local):
    for k, o in enumerate(order):
        if local in o.split('|'):
            return k
    return None


def check_order(el, order, errs, label, only_w=True):
    last = -1
    lastname = None
    for ch in el:
        if not isinstance(ch.tag, str):
            continue
        ns, local = ch.tag[1:].split('}')
        if only_w and ns != W:
            continue
        r = _rank(order, local)
        if r is None:
            if only_w:
                errs.append('%s: unexpected element w:%s' % (label, local))
            continue
        if r < last:
            errs.append('%s: w:%s after w:%s (schema order)' % (label, local, lastname))
        last, lastname = r, local


def validate(path):
    errs = []
    warns = []
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile as e:
        return ['zip invalide: %s' % e], []
    bad = z.testzip()
    if bad:
        errs.append('invalid CRC: %s' % bad)
    names = set(z.namelist())
    trees = {}
    for n in names:
        if n.endswith('.xml') or n.endswith('.rels'):
            try:
                trees[n] = etree.fromstring(z.read(n))
            except etree.XMLSyntaxError as e:
                errs.append('malformed XML %s: %s' % (n, e))
    if errs:
        return errs, warns
    # content types
    ct = trees.get('[Content_Types].xml')
    defaults = {e.get('Extension').lower() for e in ct if e.tag.endswith('Default')}
    overrides = {e.get('PartName') for e in ct if e.tag.endswith('Override')}
    for n in names:
        if n.endswith('/'):
            continue
        if n == '[Content_Types].xml':
            continue
        if '/' + n not in overrides and n.rsplit('.', 1)[-1].lower() not in defaults:
            errs.append('no content type for %s' % n)
    for o in overrides:
        if o[1:] not in names:
            errs.append('Override to missing part %s' % o)
    # relations
    rels_of = {}
    for n in names:
        if n.endswith('.rels'):
            base = posixpath.dirname(posixpath.dirname(n))
            src = posixpath.join(base, posixpath.basename(n)[:-5])
            rels_of[src] = {}
            for r in trees[n]:
                rels_of[src][r.get('Id')] = r
                if r.get('TargetMode') == 'External':
                    continue
                tgt = posixpath.normpath(posixpath.join(base, r.get('Target'))).lstrip('/')
                if r.get('Target').startswith('/'):
                    tgt = r.get('Target')[1:]
                if tgt not in names:
                    errs.append('relation %s of %s to missing part %s' % (r.get('Id'), n, tgt))
    doc = 'word/document.xml'
    stories = [doc] + [n for n in names if re.match(r'word/(header|footer)\d+\.xml$', n)] + \
        [n for n in ('word/footnotes.xml', 'word/endnotes.xml', 'word/comments.xml') if n in names]
    # r:id references
    RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
    for s in stories:
        rel = rels_of.get(s, {})
        for el in trees[s].iter():
            for att in ('id', 'embed', 'link'):
                v = el.get(RNS + att)
                if v and v not in rel:
                    errs.append('%s: r:%s=%s without relation' % (s, att, v))
    # styles
    st = trees.get('word/styles.xml')
    sids = {e.get(q('styleId')): e.get(q('type')) for e in st.iter(q('style'))}
    # numbering
    nums = set()
    if 'word/numbering.xml' in trees:
        nums = {e.get(q('numId')) for e in trees['word/numbering.xml'].iter(q('num'))}
        aids = {e.get(q('abstractNumId')) for e in trees['word/numbering.xml'].iter(q('abstractNum'))}
        for e in trees['word/numbering.xml'].iter(q('num')):
            a = e.find(q('abstractNumId')).get(q('val'))
            if a not in aids:
                errs.append('num %s -> abstractNum %s missing' % (e.get(q('numId')), a))
    docpr = {}
    for s in stories:
        t = trees[s]
        for tag, typ in (('pStyle', 'paragraph'), ('rStyle', 'character'), ('tblStyle', 'table')):
            for e in t.iter(q(tag)):
                v = e.get(q('val'))
                if v not in sids:
                    errs.append('%s: style %s not found (%s)' % (s, v, tag))
                elif sids[v] != typ:
                    errs.append('%s: style %s of type %s used as %s' % (s, v, sids[v], typ))
        for e in t.iter(q('numId')):
            v = e.get(q('val'))
            if v != '0' and v not in nums:
                errs.append('%s: numId %s missing' % (s, v))
        for e in t.iter('{%s}docPr' % WP):
            i = e.get('id')
            if i in docpr:
                errs.append('duplicate docPr id %s (%s and %s)' % (i, docpr[i], s))
            docpr[i] = s
        for name, order in ORDER.items():
            for e in t.iter(q(name)):
                if name == 'rPr' and e.getparent() is not None and e.getparent().tag == q('pPr'):
                    pass
                check_order(e, order, errs, '%s %s' % (s, name))
        for e in t.iter('{%s}anchor' % WP):
            check_order(e, ANCHOR_ORDER, errs, '%s wp:anchor' % s, only_w=False) if False else None
            last = -1
            for ch in e:
                local = ch.tag.split('}')[1]
                r = _rank(ANCHOR_ORDER, local)
                if r is None:
                    errs.append('%s wp:anchor: unexpected child %s' % (s, local))
                elif r < last:
                    errs.append('%s wp:anchor: %s out of order' % (s, local))
                else:
                    last = r
        # bookmarks
        starts = {e.get(q('id')) for e in t.iter(q('bookmarkStart'))}
        ends = {e.get(q('id')) for e in t.iter(q('bookmarkEnd'))}
        if starts != ends:
            errs.append('%s: unpaired bookmarks %s' % (s, starts ^ ends))
        # every cell ends with a paragraph
        for tc in t.iter(q('tc')):
            kids = [k for k in tc if k.tag != q('tcPr')]
            if not kids or kids[-1].tag not in (q('p'), q('sdt')):
                errs.append('%s: cell does not end with a paragraph' % s)
        # balanced complex fields
        depth = 0
        for e in t.iter(q('fldChar')):
            ty = e.get(q('fldCharType'))
            depth += 1 if ty == 'begin' else (-1 if ty == 'end' else 0)
            if depth < 0:
                errs.append('%s: fldChar end without begin' % s)
                depth = 0
        if depth:
            errs.append('%s: %d unclosed field(s)' % (s, depth))
    # notes / comments
    for kind in ('footnote', 'endnote'):
        part = 'word/%ss.xml' % kind
        ids = set()
        if part in trees:
            ids = {e.get(q('id')) for e in trees[part].iter(q(kind))}
        for s in stories:
            for e in trees[s].iter(q(kind + 'Reference')):
                if e.get(q('id')) not in ids:
                    errs.append('%s: %sReference %s without note' % (s, kind, e.get(q('id'))))
    cids = set()
    if 'word/comments.xml' in trees:
        cids = {e.get(q('id')) for e in trees['word/comments.xml'].iter(q('comment'))}
    refs = {e.get(q('id')) for e in trees[doc].iter(q('commentReference'))}
    if refs != cids:
        errs.append('comments: references %s / defined %s' % (sorted(refs), sorted(cids)))
    rs = {e.get(q('id')) for e in trees[doc].iter(q('commentRangeStart'))}
    re_ = {e.get(q('id')) for e in trees[doc].iter(q('commentRangeEnd'))}
    if rs != re_:
        errs.append('comments: unpaired ranges')
    # settings
    check_order(trees['word/settings.xml'], SETTINGS_ORDER, errs, 'settings', only_w=False) if False else None
    last = -1
    for ch in trees['word/settings.xml']:
        local = ch.tag.split('}')[1]
        r = _rank(SETTINGS_ORDER, local)
        if r is None:
            warns.append('settings: unknown element %s' % local)
        elif r < last:
            errs.append('settings: %s out of order' % local)
        else:
            last = r
    # mc:Ignorable
    for n, t in trees.items():
        ig = t.get('{%s}Ignorable' % MC)
        if ig:
            for pfx in ig.split():
                if pfx not in (t.nsmap or {}):
                    errs.append('%s: Ignorable prefix %s not declared' % (n, pfx))
    return errs, warns


if __name__ == '__main__':
    bad = 0
    for p in sys.argv[1:]:
        e, w = validate(p)
        status = 'OK' if not e else 'ERROR'
        print('%-60s %s' % (p, status))
        for x in e[:30]:
            print('    - ' + x)
        bad += bool(e)
    sys.exit(1 if bad else 0)
