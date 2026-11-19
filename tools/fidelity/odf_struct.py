#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Structural inventory of an OpenDocument package, by feature category.

usage: odf_struct.py file.odt            prints the inventory as JSON
       odf_struct.py ORIG RT [--json]    compares two packages and prints the feature table

Counts are taken from the parsed XML, not from the byte stream, so renamed automatic styles and
re-ordered attributes do not count as a change.
"""
import json, re, sys, zipfile
from collections import Counter
import xml.etree.ElementTree as ET

NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'draw': 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', 'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'xlink': 'http://www.w3.org/1999/xlink', 'dc': 'http://purl.org/dc/elements/1.1/', 'meta': 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
    'number': 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0', 'svg': 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    'chart': 'urn:oasis:names:tc:opendocument:xmlns:chart:1.0', 'math': 'http://www.w3.org/1998/Math/MathML',
    'form': 'urn:oasis:names:tc:opendocument:xmlns:form:1.0', 'config': 'urn:oasis:names:tc:opendocument:xmlns:config:1.0',
    'presentation': 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0', 'anim': 'urn:oasis:names:tc:opendocument:xmlns:animation:1.0',
    'smil': 'urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0', 'calcext': 'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
    'loext': 'urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0', 'of': 'urn:oasis:names:tc:opendocument:xmlns:of:1.2',
}
REV = {v: k for k, v in NS.items()}
MARKER = 'EODESKTOP'


def q(name):
    p, l = name.split(':')
    return '{%s}%s' % (NS[p], l)


def short(tag):
    if tag.startswith('{'):
        ns, l = tag[1:].split('}')
        return REV.get(ns, ns) + ':' + l
    return tag


def attr(e, name, default=None):
    return e.get(q(name), default)


def length_mm(v):
    m = re.fullmatch(r'(-?[\d.]+)(cm|mm|in|pt|pc|px)?', v or '')
    if not m:
        return v
    n = float(m.group(1)); u = m.group(2) or ''
    n = n * {'cm': 10, 'mm': 1, 'in': 25.4, 'pt': 25.4 / 72, 'pc': 25.4 / 6, 'px': 25.4 / 96, '': 1}[u]
    return f'{round(n, 0):g}mm' if u else v


class Doc:
    def __init__(self, path):
        z = zipfile.ZipFile(path)
        self.names = z.namelist()
        def parse(n):
            try:
                return ET.fromstring(z.read(n))
            except (KeyError, ET.ParseError):
                return None
        self.c, self.s, self.st, self.meta = parse('content.xml'), parse('styles.xml'), parse('settings.xml'), parse('meta.xml')
        self.mimetype = z.read('mimetype').decode() if 'mimetype' in self.names else ''
        self.kind = {'text': 't', 'spreadsheet': 's', 'presentation': 'p'}.get(self.mimetype.rsplit('.', 1)[-1], '?')
        self.objects = {}
        for n in self.names:
            m = re.fullmatch(r'(Object[^/]*)/content\.xml', n)
            if m:
                self.objects[m.group(1)] = parse(n)
        self.pictures = [n for n in self.names if n.startswith('Pictures/') and not n.endswith('/')]

    def iter(self, tag, roots=None):
        t = q(tag)
        for r in roots or [self.c]:
            if r is not None:
                yield from r.iter(t)

    def n(self, tag, roots=None):
        return sum(1 for _ in self.iter(tag, roots))


SKIP = {q('office:annotation'), q('office:annotation-end'), q('office:change-info'), q('text:tracked-changes'), q('text:note-citation'), q('text:index-title-template'), q('text:sequence-decls'), q('text:user-field-decls'), q('text:variable-decls'), q('text:bibliography-configuration')}
PARA = {q('text:p'), q('text:h')}
SPACE = {q('text:tab'), q('text:line-break'), q('text:s')}


def para_text(e):
    out = e.text or ''
    for c in e:
        if c.tag in SKIP:
            pass
        elif c.tag in SPACE:
            out += ' '
        elif c.tag in PARA or c.tag.startswith('{%s}' % NS['draw']) or c.tag in (q('text:note'), q('table:table')):
            out += ' '
        else:
            out += para_text(c)
        out += c.tail or ''
    return out


def words(root):
    out = Counter()
    if root is None:
        return out
    def walk(e):
        if e.tag in SKIP:
            return
        if e.tag in PARA:
            out.update(w for w in re.findall(r'\w+', para_text(e).lower().replace('\u00ad', '')) if MARKER.lower() not in w)
        for c in e:
            walk(c)
    walk(root)
    return out


def style_name(e):
    return (attr(e, 'style:display-name') or attr(e, 'style:name') or '').replace('_20_', ' ')


def prop_inventory(d):
    out = set()
    for root in (d.s, d.c):
        if root is None:
            continue
        for e in root.iter():
            t = short(e.tag)
            if t.startswith('style:') and t.endswith('-properties') and t != 'style:page-layout-properties':
                for k, v in e.attrib.items():
                    k = short(k)
                    if k in ('style:font-name', 'style:font-name-asian', 'style:font-name-complex', 'fo:language', 'fo:country', 'style:language-asian', 'style:country-asian', 'style:language-complex', 'style:country-complex') or 'name' in k:
                        continue
                    out.add(f'{t[6:-11]}:{k}={length_mm(v)}')
    return out


def list_formats(d):
    out = set()
    for root in (d.s, d.c):
        if root is None:
            continue
        for e in root.iter():
            t = short(e.tag)
            if t.startswith('text:list-level-style-'):
                out.add(f'L{attr(e, "text:level")}:{t[22:]}:{attr(e, "style:num-format") or attr(e, "text:bullet-char") or ""}')
    return out


def numfmt_sigs(d):
    out = set()
    used = {attr(e, 'style:data-style-name') for r in (d.c, d.s) if r is not None for e in r.iter(q('style:style')) if attr(e, 'style:data-style-name')}
    for root in (d.c, d.s):
        if root is None:
            continue
        for e in root.iter():
            t = short(e.tag)
            if t.startswith('number:') and t.endswith('-style') and attr(e, 'style:name') in used:
                sig = t[7:-6] + ':' + ','.join(sorted(short(x.tag)[7:] + ''.join(f'[{short(k)[7:]}={v}]' for k, v in sorted(x.attrib.items()) if short(k) in ('number:decimal-places', 'number:grouping', 'number:style', 'number:textual', 'number:min-integer-digits')) + ('=' + ''.join(x.itertext()) if short(x.tag) in ('number:text', 'number:currency-symbol') else '') for x in e if short(x.tag).startswith('number:')))
                out.add(sig)
    return out


def formulas(d):
    out = Counter()
    for e in d.iter('table:table-cell'):
        f = attr(e, 'table:formula')
        if f:
            out[re.sub(r'\s+', '', f.replace('of:=', '').replace('oooc:=', '').replace('$', '')).lower()] += 1
    return out


def cell_values(d):
    out = Counter()
    for sheet in d.iter('table:table'):
        for row in sheet.iter(q('table:table-row')):
            rr = int(attr(row, 'table:number-rows-repeated', '1'))
            if rr > 100:
                continue
            for c in row.findall(q('table:table-cell')):
                v = attr(c, 'office:value') or attr(c, 'office:string-value') or attr(c, 'office:date-value') or attr(c, 'office:boolean-value')
                if v is None and attr(c, 'office:value-type') == 'string':
                    v = ''.join(c.itertext())
                if v not in (None, '') and MARKER not in str(v):
                    out[f'{attr(sheet, "table:name")}:{str(v).strip()}'] += min(int(attr(c, 'table:number-columns-repeated', '1')), 50) * rr
    return out


def settings_items(d):
    out = {}
    if d.st is None:
        return out
    for e in d.st.iter(q('config:config-item')):
        out[attr(e, 'config:name')] = out.get(attr(e, 'config:name'), []) + [e.text]
    return out


def frozen(d):
    it = settings_items(d)
    return sorted({f'{k}={v}' for k, vals in it.items() if k in ('HorizontalSplitMode', 'VerticalSplitMode', 'HorizontalSplitPosition', 'VerticalSplitPosition') for v in vals if v not in ('0', None)})


def anim_count(d):
    return sum(1 for e in d.c.iter() if short(e.tag).startswith('anim:') and short(e.tag) != 'anim:par' or short(e.tag) == 'anim:par') if d.c is not None else 0


def transitions(d):
    out = Counter()
    for root in (d.c, d.s):
        if root is None:
            continue
        for e in root.iter(q('style:drawing-page-properties')):
            t = attr(e, 'smil:type')
            if t:
                out[f'{t}/{attr(e, "smil:subtype")}'] += 1
            if attr(e, 'presentation:transition-type') == 'automatic':
                out['auto-advance'] += 1
    return out


def inventory(path):
    d = Doc(path)
    inv = {}
    def add(cat, label, val):
        inv[f'{cat}|{label}'] = val
    def S(x):
        return sorted(x) if not isinstance(x, (int, float)) else x
    objs = [r for r in d.objects.values()]
    obj_types = Counter(short(r[0].tag) if len(r) and r is not None else '?' for r in (list(o.find(q('office:body')) for o in objs if o is not None) or []) if r is not None) if objs else Counter()
    # --- common
    tw = words(d.c)
    add('Text', 'words (multiset)', tw)
    add('Styles', 'named paragraph styles', {style_name(e) for r in [d.s] if r is not None for e in r.iter(q('style:style')) if attr(e, 'style:family') == 'paragraph'} if d.s is not None else set())
    add('Styles', 'named character styles', {style_name(e) for e in d.s.iter(q('style:style')) if attr(e, 'style:family') == 'text'} if d.s is not None else set())
    add('Styles', 'named cell styles', {style_name(e) for e in d.s.iter(q('style:style')) if attr(e, 'style:family') == 'table-cell'} if d.s is not None else set())
    add('Styles', 'formatting properties (attr=value pairs)', prop_inventory(d))
    add('Document', 'title / creator metadata', sorted(filter(None, [(d.meta.findtext('.//' + q('dc:title')) if d.meta is not None else None), (d.meta.findtext('.//' + q('meta:initial-creator')) if d.meta is not None else None)])))
    add('Objects', 'embedded objects (Object N)', len([o for o in objs if o is not None]))
    add('Objects', 'charts', sum(1 for o in objs if o is not None and o.find('.//' + q('chart:chart')) is not None))
    add('Objects', 'formulas (math)', sum(1 for o in objs if o is not None and (o.tag == '{%s}math' % NS['math'] or o.find('.//' + '{%s}math' % NS['math']) is not None)) + d.n('math:math'))
    add('Graphics', 'images (embedded pictures)', sum(1 for e in d.iter('draw:image') if (attr(e, 'xlink:href') or '').startswith('Pictures/') or len(e)))
    add('Graphics', 'text boxes', d.n('draw:text-box'))
    add('Graphics', 'shapes (rect/ellipse/line/polygon/custom/connector)', sum(d.n('draw:' + t) for t in ('rect', 'ellipse', 'line', 'polygon', 'polyline', 'custom-shape', 'connector', 'path', 'circle')))
    add('Graphics', 'shape groups', d.n('draw:g'))
    # --- writer
    if d.kind == 't':
        add('Writer', 'paragraphs', d.n('text:p'))
        add('Writer', 'headings (levels)', sorted(Counter(attr(e, 'text:outline-level') for e in d.iter('text:h')).items()))
        add('Writer', 'list items', d.n('text:list-item'))
        add('Writer', 'list nesting depth', max([len([a for a in [0]]) and 0] + [sum(1 for _ in e.iter(q('text:list'))) for e in d.iter('text:list')] or [0]) if False else max([0] + [len(list(e.iter(q('text:list')))) for e in d.iter('text:list')]))
        add('Writer', 'list formats (bullet/number per level)', list_formats(d))
        add('Tables', 'tables', len([t for t in d.iter('table:table')]))
        add('Tables', 'table rows', d.n('table:table-row'))
        add('Tables', 'merged cells (spans)', sum(1 for c in d.iter('table:table-cell') if attr(c, 'table:number-columns-spanned') or attr(c, 'table:number-rows-spanned')))
        add('Tables', 'header rows', d.n('table:table-header-rows'))
        add('Page', 'master pages', d.n('style:master-page', [d.s]))
        add('Page', 'headers/footers', sum(d.n('style:' + t, [d.s]) for t in ('header', 'footer', 'header-left', 'footer-left', 'header-first', 'footer-first')))
        add('Page', 'page sizes (mm)', {f'{length_mm(attr(e, "fo:page-width"))}x{length_mm(attr(e, "fo:page-height"))}' for e in d.iter('style:page-layout-properties', [d.s])})
        add('Page', 'page margins', {length_mm(attr(e, 'fo:margin-left')) for e in d.iter('style:page-layout-properties', [d.s])})
        add('Page', 'page backgrounds/borders', {'bg=' + (attr(e, 'fo:background-color') or '') + ' border=' + (attr(e, 'fo:border') or '') for e in d.iter('style:page-layout-properties', [d.s]) if attr(e, 'fo:background-color') not in (None, 'transparent') or attr(e, 'fo:border')})
        add('Page', 'sections', d.n('text:section'))
        add('Page', 'column counts', {attr(e, 'fo:column-count') for e in d.iter('style:columns', [d.c, d.s])})
        add('Notes', 'footnotes', sum(1 for e in d.iter('text:note') if attr(e, 'text:note-class') == 'footnote'))
        add('Notes', 'endnotes', sum(1 for e in d.iter('text:note') if attr(e, 'text:note-class') == 'endnote'))
        add('Index', 'table of contents', d.n('text:table-of-content'))
        add('Index', 'TOC entries', sum(1 for p in d.iter('text:table-of-content') for _ in p.iter(q('text:index-body'))) and sum(1 for p in d.iter('text:index-body') for _ in p.iter(q('text:a'))))
        for f in ('page-number', 'page-count', 'date', 'time', 'title', 'initial-creator', 'file-name', 'word-count', 'bookmark-ref', 'sequence-ref', 'sequence', 'user-field-get', 'variable-set', 'variable-get', 'conditional-text', 'drop-down', 'text-input', 'reference-ref'):
            add('Fields', f, d.n('text:' + f))
        add('Comments', 'comments (annotations)', d.n('office:annotation'))
        add('Comments', 'comment authors', {e.text for e in d.iter('dc:creator') if e is not None and e.text} if False else {(e.findtext(q('dc:creator')) or '') for e in d.iter('office:annotation')})
        add('Tracked changes', 'changed regions', d.n('text:changed-region'))
        add('Tracked changes', 'kinds (insertion/deletion/format)', Counter(short(x.tag) for r in d.iter('text:changed-region') for x in r if short(x.tag) in ('text:insertion', 'text:deletion', 'text:format-change')))
        add('Links', 'bookmarks', d.n('text:bookmark') + d.n('text:bookmark-start'))
        add('Links', 'hyperlinks (targets)', Counter(attr(e, 'xlink:href') for e in d.iter('text:a') if not (attr(e, 'xlink:href') or '').endswith('|outline')))
        add('Links', 'reference marks', d.n('text:reference-mark') + d.n('text:reference-mark-start'))
        add('Forms', 'form controls', sum(1 for e in d.iter('form:form') for c in e if short(c.tag).startswith('form:')) + d.n('draw:control'))
        add('Layout', 'line numbering enabled', {'on' for e in d.iter('text:linenumbering-configuration', [d.s]) if attr(e, 'text:number-lines') == 'true'})
        add('Layout', 'drop caps', d.n('style:drop-cap', [d.s, d.c]))
        add('Layout', 'hidden text spans', sum(1 for r in (d.c, d.s) if r is not None for e in r.iter(q('style:text-properties')) if attr(e, 'text:display') == 'none'))
    # --- calc
    if d.kind == 's':
        add('Calc', 'sheets', [attr(e, 'table:name') for e in d.c.find(q('office:body')).find(q('office:spreadsheet')).findall(q('table:table'))])
        add('Calc', 'cell values (sheet:value multiset)', cell_values(d))
        add('Calc', 'formulas (normalised text)', formulas(d))
        add('Calc', 'named ranges / expressions', {attr(e, 'table:name') for e in list(d.iter('table:named-range')) + list(d.iter('table:named-expression'))})
        add('Calc', 'number formats (signatures)', numfmt_sigs(d))
        add('Calc', 'conditional formats', d.n('table:conditional-format') + d.n('calcext:conditional-format'))
        add('Calc', 'conditional format rules (kinds)', Counter(short(x.tag) + ':' + (re.sub(r'[\d.]+', 'N', attr(x, 'table:value') or '') ) for e in d.iter('table:conditional-format') for x in e))
        add('Calc', 'data validations', d.n('table:content-validation'))
        add('Calc', 'validation conditions', Counter(re.sub(r'[\d.]+', 'N', (attr(e, 'table:condition') or '').replace('of:', '')) for e in d.iter('table:content-validation')))
        add('Calc', 'validation messages (help/error)', d.n('table:help-message') + d.n('table:error-message'))
        add('Calc', 'merged cells', sum(1 for c in d.iter('table:table-cell') if attr(c, 'table:number-columns-spanned') not in (None, '1') or attr(c, 'table:number-rows-spanned') not in (None, '1')))
        add('Calc', 'hidden rows', sum(1 for r in d.iter('table:table-row') if attr(r, 'table:visibility') in ('collapse', 'filter')))
        add('Calc', 'hidden columns', sum(1 for r in d.iter('table:table-column') if attr(r, 'table:visibility') in ('collapse', 'filter')))
        add('Calc', 'frozen panes (settings)', frozen(d))
        add('Calc', 'autofilter / database ranges', d.n('table:database-range'))
        add('Calc', 'pivot tables', d.n('table:data-pilot-table'))
        add('Calc', 'cell comments', d.n('office:annotation'))
        add('Calc', 'protected sheets', sum(1 for e in d.iter('table:table') if attr(e, 'table:protected') == 'true'))
        add('Calc', 'tab colours', Counter(v for e in d.iter('style:table-properties', [d.c]) for k, v in e.attrib.items() if k.endswith('tab-color')))
        add('Calc', 'hidden sheets', sum(1 for e in d.iter('style:table-properties', [d.c]) if attr(e, 'table:display') == 'false'))
        add('Calc', 'column widths (mm)', {length_mm(attr(e, 'style:column-width')) for e in d.iter('style:table-column-properties', [d.c])})
        add('Calc', 'row heights (mm)', {length_mm(attr(e, 'style:row-height')) for e in d.iter('style:table-row-properties', [d.c])})
        add('Calc', 'cell protection / rotation / wrap', {k + '=' + v for e in d.iter('style:table-cell-properties', [d.c, d.s]) for k, v in ((short(k), v) for k, v in e.attrib.items()) if (k in ('style:cell-protect', 'style:rotation-angle', 'fo:wrap-option', 'style:shrink-to-fit')) and v not in ('no-wrap', 'false', '0', 'none')})
    # --- impress
    if d.kind == 'p':
        add('Impress', 'slides', d.n('draw:page'))
        add('Impress', 'master pages', d.n('style:master-page', [d.s]))
        add('Impress', 'layout placeholders (classes)', Counter(attr(e, 'presentation:class') for e in d.iter('draw:frame') if attr(e, 'presentation:class') and attr(e, 'presentation:class') not in ('page', 'notes')))
        add('Impress', 'bullet / list items', d.n('text:list-item'))
        add('Impress', 'tables', len(list(d.iter('table:table'))))
        add('Impress', 'transitions', transitions(d))
        add('Impress', 'animation nodes', sum(1 for e in d.c.iter() if short(e.tag).startswith('anim:')))
        add('Impress', 'speaker notes (text)', words(ET.Element('x')) if False else Counter(w for n in d.iter('presentation:notes') for w in re.findall(r'\w+', ' '.join(n.itertext()).lower())))
        add('Impress', 'custom shows', d.n('presentation:show'))
        add('Impress', 'footers / date-time declarations', d.n('presentation:footer-decl') + d.n('presentation:date-time-decl') + d.n('presentation:footer') + d.n('presentation:date-time'))
        add('Impress', 'gradients/dashes/markers defined', d.n('draw:gradient', [d.s, d.c]) + d.n('draw:stroke-dash', [d.s, d.c]) + d.n('draw:marker', [d.s, d.c]))
    return inv


def norm(v):
    if isinstance(v, Counter):
        return v
    if isinstance(v, (set, frozenset)):
        return set(v)
    return v


def compare(a, b):
    rows = []
    for key in a:
        va, vb = norm(a[key]), norm(b.get(key))
        cat, label = key.split('|')
        status, detail = 'kept', ''
        if isinstance(va, Counter):
            lost, gained = va - (vb or Counter()), (vb or Counter()) - va
            na, nb = sum(va.values()), sum((vb or Counter()).values())
            if not va and not vb:
                continue
            if lost or gained:
                keep = sum((va & (vb or Counter())).values())
                status = 'lost' if na and keep == 0 else 'changed'
                detail = f'{na} -> {nb}; lost {sum(lost.values())}: ' + ', '.join(f'{k}' for k in list(lost)[:6]) + ('; gained: ' + ', '.join(list(gained)[:4]) if gained else '')
            else:
                detail = str(na)
        elif isinstance(va, set):
            if not va and not vb:
                continue
            lost, gained = va - (vb or set()), (vb or set()) - va
            if lost or gained:
                status = 'lost' if va and not (va & (vb or set())) else 'changed'
                detail = f'{len(va)} -> {len(vb or ())}; lost: ' + ', '.join(sorted(map(str, lost))[:6]) + ('; gained: ' + ', '.join(sorted(map(str, gained))[:4]) if gained else '')
            else:
                detail = str(len(va))
        else:
            if va == vb:
                if not va:
                    continue
                detail = str(va)
            else:
                if not va and not vb:
                    continue
                if isinstance(va, (int, float)) and not va:
                    status, detail = 'added', f'0 -> {vb}'
                else:
                    status = 'lost' if (not vb and va) else 'changed'
                    detail = f'{va} -> {vb}'
        rows.append({'category': cat, 'feature': label, 'status': status, 'detail': detail[:300]})
    return rows


if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    if len(args) == 1:
        print(json.dumps(inventory(args[0]), default=lambda o: dict(o) if isinstance(o, Counter) else sorted(o), indent=1))
    else:
        rows = compare(inventory(args[0]), inventory(args[1]))
        if '--json' in sys.argv:
            print(json.dumps(rows, indent=1))
        else:
            for r in rows:
                print(f"{r['status']:8} {r['category']:15} {r['feature']:45} {r['detail']}")
