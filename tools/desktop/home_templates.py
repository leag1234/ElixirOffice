#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate CC0 Home examples while retaining the original OOXML layout."""
import html, io, json, re, zipfile
from lxml import etree as XML
from pathlib import Path
from blank_templates import LANGUAGES

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'branding/example/nodejs/public/elixir/brand/templates'
FIELDS = ('person team street city contact skills languages interests role profile experience education community '
          'planning teamwork office meetings documents volunteer assistant certificate qualifications '
          'english spanish hobbies subject request reference attachments greeting body schedule thanks closing '
          'equipment quantity notes tables chairs projector microphone boards confirm fictional letter page').split()

def texts(kind, words):
    w = words
    if kind == 'letterhead':
        return {
            'word/document.xml': [
                w['team'], w['team'], w['contact'], w['street'], w['city'], w['date'],
                w['subject'] + ':', ' ' + w['request'], w['reference'] + ':', ' EXAMPLE-2026-01',
                w['attachments'] + ':', ' ' + w['documents'], w['greeting'], w['body'],
                w['meetings'] + ' — ' + w['date'], w['community'] + ' — ' + w['confirm'], w['schedule'],
                w['equipment'], w['quantity'], w['notes'], w['tables'], '20', w['confirm'],
                w['chairs'], '120', w['boards'], '4', w['teamwork'], w['projector'], '1',
                w['microphone'], w['boards'], '10', w['community'], w['schedule'], w['thanks'],
                w['closing'], w['team'], w['role'], w['person']],
            'word/header1.xml': [w['team'], w['street'] + ' — ' + w['city'],
                                 'contact@example.org — ' + w['phone']],
            'word/header2.xml': [w['team'], w['letter'] + ' — ' + w['date'] + ' — ' + w['page'] + ' ', '2'],
            'word/footer1.xml': [w['fictional']],
        }
    return {'word/document.xml': [
        w['contact'], '☎  ', w['phone'], '✉  ', 'person@example.org', '⌂  ', w['city'], '★  ', w['fictional'],
        w['skills'], w['planning'], w['meetings'], w['documents'], w['teamwork'], w['office'],
        w['languages'], w['english'], w['spanish'], w['languages'] + ' — ' + w['confirm'],
        w['interests'], w['hobbies'], w['person'] + ' ', '', w['role'],
        w['profile'] + ': ' + '; '.join(w[k] for k in ['planning', 'teamwork', 'documents']) + '.',
        w['experience'], w['volunteer'] + ' — ' + w['team'], '2021–2026', w['planning'],
        w['teamwork'], w['community'], w['assistant'] + ' — ' + w['team'], '2014–2025',
        w['meetings'], w['documents'], w['office'], w['assistant'] + ' — ' + w['team'], '2012–2014',
        w['contact'], w['education'], w['certificate'], '2024', w['qualifications'], '2011',
        w['certificate'], '2009', w['community'], w['volunteer'] + ' — ' + w['teamwork']]}

def school_texts(kind, w, t):
    if kind == 'worksheet-fractions':
        content = [
            t['fractions'], t['remember'], t['fractions']+': ', t['equal_parts'],
            '. ', ' (', '4', ') '+t['denominator'], '', '; (', '3', ') ', t['numerator'], '.',
            '3/4; ', '1/2; ', '1/3; ', '5/8.', t['write'],
            '……', ' / ', '……', '  (= 1/2)', '……', ' / ', '……', '  (= 1/4)',
            '……', ' / ', '……', '  (= 2/3)', '……', ' / ', '……', '  (= 3/8)',
            t['color_fraction'], t['sort'], '    ', '    ', '    ', '    ', ' < ', ' < ', ' < ', ' < ',
            t['problem'], t['problem']+': ', '8 '+t['equal_parts'],
            '. A = 3; B = 2; C = 8 − (3 + 2).',
            t['write']+' A/8 = …', t['write']+' B/8 = …', t['write']+' C/8 = …',
            t['compare']+' A/8 ? C/8. '+t['explain'], t['challenge'], t['compare']+': ',
            ' > ', '? ', t['true'], ' / ', t['false'], '? '+t['explain'],
            t['self_check'], t['skill'], t['read_write'], t['numerator']+' / '+t['denominator'],
            t['color_fraction'], t['compare'], t['teacher']+': '
        ]
        assert len(content)==68
        return {'word/document.xml':content,
                'word/header1.xml':[t['name']+': ', t['date_label']+': '+w['date'], t['mathematics'], t['task']+' 12'],
                'word/footer1.xml':[t['school']+' — 2026', w['page']+' ', '1', ' / ', '2']}
    content = [
        t['school'], t['science']+' — A', t['score'], '/ 20', t['name']+': ', '  '+t['date_label']+': '+w['date'],
        t['assessment']+': '+t['plants'], t['time']+': '+t['duration']+' '+t['explain'],
        t['area'], t['skill'], t['task'], t['not_yet'], t['developing'], t['achieved'], t['advanced'],
        t['science'], t['hypothesis'], '3', t['science'], t['interpret'], '3',
        t['science'], t['label_diagram'], '1', t['science'], t['read_table'], '2',
        t['science'], t['vocabulary'], '1, 2', t['science'], t['explain'], '3',
        t['task']+' 1 — '+t['label_diagram'], '… / 4',
        '; '.join(t[k] for k in ['flower','leaf','stem','roots','pot','soil'])+'.',
        *(['……………………']*10), t['task']+' 2', '… / 6',
        '1. ', t['needs'], '  '+t['light'], '  '+t['sugar'], '  '+t['water'], '  '+t['soil'],
        '2. ', t['absorbs'], '  '+t['leaf'], '  '+t['roots'], '  '+t['flower'],
        '3. ', t['darkness'], '  '+t['growth'], '  '+t['yellow'], '  '+t['unchanged'],
        '4. ', t['gas'], '  O₂', '  CO₂', '  N₂',
        t['task']+' 3 — '+t['explain'], '… / 10', t['plants']+': ',
        'A', ' — '+t['light']+'; ', 'B', ' — '+t['dark']+'; ', 'C', ' — '+t['cold']+'. '+t['read_table'],
        t['pot'], t['place'], t['height']+' (cm)', t['leaf'],
        'A', t['light'], w['numbers']['12.5'], t['green'],
        'B', t['dark'], w['numbers']['15.0'], t['yellow'],
        'C', t['cold'], w['numbers']['1.2'], t['green'],
        'a) '+t['hypothesis'], 'b) '+t['interpret']+' '+t['explain'], 'c) '+t['conclusion'], t['teacher']+': '
    ]
    assert len(content)==98
    return {'word/document.xml':content,
            'word/footer1.xml':[t['assessment']+' — '+t['plants'], '1', '/', '2']}

ARABIC_SCRIPT = {'ar', 'ur', 'fa'}
RTL = ARABIC_SCRIPT | {'he'}
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
def direction_and_fonts(value, locale):
    root = XML.fromstring(value.encode())
    def ensure(parent, name):
        found = parent.find('w:'+name, NS)
        if found is None:
            found = XML.SubElement(parent, '{'+W+'}'+name)
        return found
    def mirror(node):
        for key in ['left', 'right', 'start', 'end']:
            other = {'left':'right','right':'left','start':'end','end':'start'}[key]
            if key in ['right','end']:
                continue
            a,b = node.get('{'+W+'}'+key),node.get('{'+W+'}'+other)
            for k,v in [(key,b),(other,a)]:
                attr='{'+W+'}'+k
                if v is None: node.attrib.pop(attr,None)
                else: node.set(attr,v)
    face = 'DejaVu Sans'
    # Replace legacy symbol-encoded values with ordinary Unicode text.
    symbols={0xF04A:0x263A,0xF04B:0x1F610,0xF04C:0x2639,
             0xF0A8:0x2610,0xF06C:0x25CF,0xF0A1:0x25CB}
    for run in root.findall('.//w:r',NS):
        converted=False
        for symbol in list(run.findall('w:sym',NS)):
            code=int(symbol.get('{'+W+'}char'),16)
            if code not in symbols: raise ValueError('Unmapped template symbol')
            text=XML.Element('{'+W+'}t');text.text=chr(symbols[code])
            run.replace(symbol,text);converted=True
        if converted:
            pr=run.find('w:rPr',NS)
            if pr is None:pr=XML.Element('{'+W+'}rPr');run.insert(0,pr)
            fonts=ensure(pr,'rFonts')
            for slot in ['ascii','hAnsi','eastAsia','cs']:fonts.set('{'+W+'}'+slot,face)
            # The symbol font used a single regular face; do not inherit italics.
            for key in ['b','bCs','i','iCs']:ensure(pr,key).set('{'+W+'}val','0')
    for run in root.findall('.//w:r',NS):
        pr=run.find('w:rPr',NS)
        if pr is None: pr=XML.Element('{'+W+'}rPr');run.insert(0,pr)
        fonts=ensure(pr,'rFonts')
        if locale!='fr':
            fonts.set('{'+W+'}ascii',face);fonts.set('{'+W+'}hAnsi',face)
            fonts.attrib.pop('{'+W+'}asciiTheme',None);fonts.attrib.pop('{'+W+'}hAnsiTheme',None)
    for fonts in root.findall('.//w:rFonts', NS):
        fonts.set('{'+W+'}eastAsia',face)
        fonts.set('{'+W+'}cs',face)
        fonts.attrib.pop('{'+W+'}eastAsiaTheme',None)
        fonts.attrib.pop('{'+W+'}cstheme',None)
        fonts.attrib.pop('{'+W+'}csTheme',None)
    default=root.find('.//w:rPrDefault/w:rPr',NS)
    if default is not None:
        fonts=ensure(default,'rFonts')
        fonts.set('{'+W+'}eastAsia',face);fonts.set('{'+W+'}cs',face)
    if locale not in RTL:
        return XML.tostring(root,encoding='unicode')
    for p in root.findall('.//w:p',NS):
        pr=p.find('w:pPr',NS)
        if pr is None: pr=XML.Element('{'+W+'}pPr');p.insert(0,pr)
        ensure(pr,'bidi')
        if pr.find('w:jc',NS) is None: ensure(pr,'jc').set('{'+W+'}val','left')
    for pr in root.findall('.//w:pPr',NS):
        ensure(pr,'bidi')
    if default is not None: ensure(default,'rtl')
    for run in root.findall('.//w:r',NS):
        text=''.join(run.itertext())
        pr=run.find('w:rPr',NS)
        if pr is None: pr=XML.Element('{'+W+'}rPr');run.insert(0,pr)
        if locale in ARABIC_SCRIPT and re.search('[\u0600-\u08ff]',text):
            italic=[pr.find('w:'+key,NS) for key in ['i','iCs']]
            if any(node is not None and node.get('{'+W+'}val','1') not in ['0','false','off'] for node in italic):
                ensure(pr,'i').set('{'+W+'}val','0');ensure(pr,'iCs').set('{'+W+'}val','0')
        rtl=ensure(pr,'rtl')
        rtl.set('{'+W+'}val','1' if re.search('[\u0590-\u08ff]',text) else '0')
        fonts=ensure(pr,'rFonts')
        fonts.set('{'+W+'}cs',face);fonts.set('{'+W+'}eastAsia',face)
    for pr in root.findall('.//w:tblPr',NS): ensure(pr,'bidiVisual')
    for pr in root.findall('.//w:sectPr',NS): ensure(pr,'rtlGutter')
    for jc in root.findall('.//w:jc',NS)+root.findall('.//w:lvlJc',NS):
        val=jc.get('{'+W+'}val')
        if val in ['left','right','start','end']:
            jc.set('{'+W+'}val',{'left':'right','right':'left','start':'end','end':'start'}[val])
    for node in root.findall('.//w:ind',NS)+root.findall('.//w:pgMar',NS):
        mirror(node)
    # Tab positions are measured from the paragraph's leading edge.
    section=root.find('.//w:sectPr',NS)
    width=9360
    if section is not None:
        size=section.find('w:pgSz',NS);margins=section.find('w:pgMar',NS)
        if size is not None and margins is not None:
            width=int(size.get('{'+W+'}w','12240'))-int(margins.get('{'+W+'}left','1440'))-int(margins.get('{'+W+'}right','1440'))
    for tab in root.findall('.//w:tab',NS):
        pos=tab.get('{'+W+'}pos')
        if pos is not None: tab.set('{'+W+'}pos',str(max(0,width-int(pos))))
        val=tab.get('{'+W+'}val')
        if val in ['left','right']:tab.set('{'+W+'}val','right' if val=='left' else 'left')
    wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
    for anchor in root.findall('.//{'+wp+'}anchor'):
        position=anchor.find('{'+wp+'}positionH')
        extent=anchor.find('{'+wp+'}extent')
        if position is not None:
            align=position.find('{'+wp+'}align')
            if align is not None and align.text in ['left','right']:
                align.text='right' if align.text=='left' else 'left'
            offset=position.find('{'+wp+'}posOffset')
            reference=position.get('relativeFrom')
            if offset is not None and extent is not None and reference in ['margin','column','page']:
                full=width
                if reference=='page' and section is not None:
                    size=section.find('w:pgSz',NS)
                    if size is not None: full=int(size.get('{'+W+'}w','12240'))
                offset.text=str(full*635-int(offset.text)-int(extent.get('cx','0')))
    # bidiVisual reverses visual columns; reversing XML cells too would undo it.
    return XML.tostring(root,encoding='unicode')

def localized(source, kind, locale, catalog=None):
    catalog = catalog or json.loads((BRAND / 'localized-content.json').read_text())
    chosen = locale if locale in catalog else 'en'
    words = catalog[chosen]
    language = LANGUAGES[chosen]
    replacements = texts(kind, words) if kind in ['letterhead','resume-two-columns'] else school_texts(kind,words,json.loads((BRAND/'school-content.json').read_text())[chosen])
    target = io.BytesIO()
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as out:
        for entry in original.infolist():
            data = original.read(entry)
            if entry.filename.endswith('.xml'):
                value = data.decode('utf-8')
                if entry.filename in replacements:
                    items = iter(replacements[entry.filename])
                    count = len(re.findall(r'<w:t(?:\s[^>]*)?>.*?</w:t>', value, re.S))
                    assert count == len(replacements[entry.filename]), (entry.filename, count)
                    value = re.sub(r'(<w:t(?:\s[^>]*)?>).*?(</w:t>)',
                                   lambda m: m[1] + html.escape(next(items), quote=False) + m[2], value, flags=re.S)
                if entry.filename.startswith('word/'):
                    if kind=='worksheet-fractions':
                        task=json.loads((BRAND/'school-content.json').read_text())[chosen]['task']
                        value=value.replace('Exercice',html.escape(task,quote=True))
                    value = re.sub(r'<w:lang\b[^>]*/>', '<w:lang w:val="' + language + '" w:bidi="' +
                                   language + '" w:eastAsia="' + language + '"/>', value)
                    if entry.filename == 'word/styles.xml' and '<w:lang ' not in value:
                        value = value.replace('<w:rPrDefault><w:rPr>', '<w:rPrDefault><w:rPr><w:lang w:val="' +
                                              language + '" w:bidi="' + language + '" w:eastAsia="' + language + '"/>')
                    # Explicitly name the same bundled free metric-compatible substitutes.
                    value = value.replace(chr(34)+'Symbol'+chr(34),chr(34)+'DejaVu Sans'+chr(34)).replace('Courier New','Liberation Mono').replace('\uf0b7','•').replace('Wingdings','DejaVu Sans').replace('\uf0d8','▸').replace('\uf0a7','▪').replace('Aptos Display','Carlito').replace('Aptos','Carlito').replace('Segoe UI Symbol','DejaVu Sans').replace('Andika','Carlito').replace('Century Gothic','URW Gothic Metric').replace('Cambria Math','DejaVu Math TeX Gyre').replace('Calibri','Carlito').replace('Cambria','Caladea').replace('Arial','Liberation Sans')
                    if chosen!='fr':
                        for family in ['Cursive standard','Marelle','Playwrite Seyes Metric','Playwrite FR Moderne Metric','Playwrite FR Trad','Playwrite FR Moderne']:
                            value=value.replace(family,'Carlito')
                    value = direction_and_fonts(value, chosen)
                elif entry.filename == 'docProps/core.xml':
                    for tag in ['dc:title', 'dc:subject', 'dc:creator', 'cp:keywords', 'dc:description', 'cp:lastModifiedBy']:
                        value = re.sub(r'(<'+tag+r'\b[^>]*>).*?(</'+tag+r'>)', r'\1ElixirOffice CC0 example\2', value, flags=re.S)
                data = value.encode('utf-8')
            # Stable ZIP metadata and bytes, independent of generation time.
            info = zipfile.ZipInfo(entry.filename, (2026, 3, 9, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data)
    return target.getvalue()

def generate():
    for kind in ['letterhead','resume-two-columns','worksheet-fractions','assessment-grid']:
        source = ROOT / 'tools/example/template-layouts' / (kind + '.docx')
        entry=next(t for t in json.loads((BRAND/'templates.json').read_text())['templates'] if t['id']==kind)
        for locale in LANGUAGES:
            destination=BRAND if locale in entry['languages'] else ROOT/'tools/example/template-layouts/localized'
            folder = destination / locale
            folder.mkdir(parents=True, exist_ok=True)
            (folder / (kind + '.docx')).write_bytes(localized(source, kind, locale))

if __name__ == '__main__':
    generate()
