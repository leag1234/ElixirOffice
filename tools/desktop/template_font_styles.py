# SPDX-License-Identifier: AGPL-3.0-only
"""Resolve DOCX run font/style inheritance for public-template coverage checks."""
import xml.etree.ElementTree as ET
import bisect,json
from pathlib import Path
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
NS={'w':W,'a':A}
def val(node,key='val',default=None):
    return node.get('{'+W+'}'+key,default) if node is not None else default
def on(value):
    return value not in ['0','false','off']
class Styles:
    def __init__(self,archive):
        self.root=ET.fromstring(archive.read('word/styles.xml'))
        self.styles={val(n,'styleId'):n for n in self.root.findall('w:style',NS)}
        self.defaults={val(n,'type'):val(n,'styleId') for n in self.styles.values() if on(val(n,'default','0'))}
        self.theme={}
        if 'word/theme/theme1.xml' in archive.namelist():
            root=ET.fromstring(archive.read('word/theme/theme1.xml'))
            for role in ['major','minor']:
                font=root.find('.//a:'+role+'Font',NS)
                if font is not None:
                    for slot,name in [('ascii','latin'),('hAnsi','latin'),('eastAsia','ea'),('cs','cs')]:
                        node=font.find('a:'+name,NS)
                        if node is not None and node.get('typeface'):self.theme[(role,slot)]=node.get('typeface')
        self.base=self.merge({},self.root.find('w:docDefaults/w:rPrDefault/w:rPr',NS))
    def merge(self,properties,node,toggle=False):
        result=dict(properties)
        if node is None:return result
        fonts=node.find('w:rFonts',NS)
        if fonts is not None:
            for slot in ['ascii','hAnsi','eastAsia','cs']:
                literal=fonts.get('{'+W+'}'+slot)
                theme=fonts.get('{'+W+'}'+slot+'Theme')
                if slot=='cs':theme=theme or fonts.get('{'+W+'}cstheme')
                if literal is not None:result[slot]=literal
                if theme:
                    role='major' if theme.startswith('major') else 'minor'
                    result[slot]=self.theme.get((role,slot),'Unresolved theme '+theme)
        if fonts is not None and fonts.get('{'+W+'}hint') is not None:
            result['hint']={'eastAsia':2,'cs':1}.get(fonts.get('{'+W+'}hint'),0)
        language=node.find('w:lang',NS)
        if language is not None and language.get('{'+W+'}eastAsia') is not None:
            # Only the neutral Chinese LCID uses the classifier's special lookup table.
            result['langEastAsia']=0x7804 if language.get('{'+W+'}eastAsia').lower()=='zh' else 0
        for key in ['b','i','bCs','iCs','cs','rtl']:
            child=node.find('w:'+key,NS)
            if child is not None:
                enabled=on(val(child,default='1'))
                field="complexScript" if key=="cs" else key
                result[field]=not result.get(field,False) if toggle and enabled else enabled
        return result
    def chain(self,identifier,seen=()):
        if not identifier:return []
        if identifier in seen:raise ValueError('Cyclic document style inheritance')
        node=self.styles.get(identifier)
        if node is None:return []
        return self.chain(val(node.find('w:basedOn',NS)),seen+(identifier,))+[node]
    def apply(self,properties,identifier):
        for style in self.chain(identifier):
            properties=self.merge(properties,style.find('w:rPr',NS),toggle=True)
        return properties
    def table(self,properties,table,row,cell):
        pr=table.find('w:tblPr',NS)
        identifier=val(pr.find('w:tblStyle',NS)) if pr is not None else None
        identifier=identifier or self.defaults.get('table')
        rows=table.findall('w:tr',NS)
        cells=row.findall('w:tc',NS)
        ri,ci=rows.index(row),cells.index(cell)
        look=pr.find('w:tblLook',NS) if pr is not None else None
        mask=int(val(look,default='0000'),16)
        def flag(name,bit):
            explicit=val(look,name)
            return on(explicit) if explicit is not None else bool(mask&bit)
        active=['wholeTable']
        if not flag('noVBand',0x400):active.append('band1Vert' if ci%2==0 else 'band2Vert')
        if not flag('noHBand',0x200):active.append('band1Horz' if ri%2==0 else 'band2Horz')
        first_col=ci==0 and flag('firstColumn',0x80)
        last_col=ci==len(cells)-1 and flag('lastColumn',0x100)
        first_row=ri==0 and flag('firstRow',0x20)
        last_row=ri==len(rows)-1 and flag('lastRow',0x40)
        for condition,name in [(first_col,'firstCol'),(last_col,'lastCol'),(first_row,'firstRow'),(last_row,'lastRow'),
                               (first_row and first_col,'nwCell'),(first_row and last_col,'neCell'),
                               (last_row and first_col,'swCell'),(last_row and last_col,'seCell')]:
            if condition:active.append(name)
        for style in self.chain(identifier):
            properties=self.merge(properties,style.find('w:rPr',NS),toggle=True)
            for name in active:
                for conditional in style.findall('w:tblStylePr',NS):
                    if val(conditional,'type')==name:properties=self.merge(properties,conditional.find('w:rPr',NS),toggle=True)
        return properties
    def paragraph(self,paragraph,parents):
        properties=dict(self.base)
        ancestors=[];current=paragraph
        while current in parents:current=parents[current];ancestors.append(current)
        for table in reversed([n for n in ancestors if n.tag=='{'+W+'}tbl']):
            row=next((n for n in ancestors if n.tag=='{'+W+'}tr' and parents.get(n) is table),None)
            cell=next((n for n in ancestors if n.tag=='{'+W+'}tc' and parents.get(n) is row),None)
            if row is not None and cell is not None:properties=self.table(properties,table,row,cell)
        pr=paragraph.find('w:pPr',NS)
        identifier=val(pr.find('w:pStyle',NS)) if pr is not None else None
        return self.apply(properties,identifier or self.defaults.get('paragraph'))
def styled_text(archive):
    styles=Styles(archive)
    for name in archive.namelist():
        if not(name.startswith('word/') and name.endswith('.xml')) or name=='word/styles.xml':continue
        root=ET.fromstring(archive.read(name));parents={child:parent for parent in root.iter() for child in parent}
        if root.findall('.//a:t',NS):raise ValueError('DrawingML text requires explicit font coverage support')
        for run in root.findall('.//w:r',NS):
            current=run
            while current in parents and current.tag!='{'+W+'}p':current=parents[current]
            properties=styles.paragraph(current,parents) if current.tag=='{'+W+'}p' else dict(styles.base)
            pr=run.find('w:rPr',NS)
            properties=styles.apply(properties,val(pr.find('w:rStyle',NS)) if pr is not None else None)
            properties=styles.merge(properties,pr)
            for text in run.findall('w:t',NS):yield text.text or '',properties
            for symbol in run.findall('w:sym',NS):
                family=val(symbol,'font');symbol_props={**properties,**{slot:family for slot in ['ascii','hAnsi','eastAsia','cs']}}
                yield chr(int(val(symbol,'char'),16)),symbol_props
        for level in root.findall('.//w:lvl',NS):
            properties=styles.merge(styles.base,level.find('w:rPr',NS))
            label=level.find('w:lvlText',NS)
            if label is not None:yield val(label,default=''),properties
            fmt=val(level.find('w:numFmt',NS))
            counters={'decimal':'0123456789','decimalZero':'0123456789','lowerRoman':'ivxlcdm','upperRoman':'IVXLCDM',
                      'lowerLetter':'abcdefghijklmnopqrstuvwxyz','upperLetter':'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                      'arabicIndic':'٠١٢٣٤٥٦٧٨٩'}
            if fmt in counters:yield counters[fmt],properties


_SLOT_DATA=json.loads((Path(__file__).with_name('font-slots.json')).read_text())['modes']
_SLOT_STARTS={mode:[row[0] for row in ranges] for mode,ranges in _SLOT_DATA.items()}

def font_slot(codepoint,hint=0,language=0,complex_script=False,rtl=False):
    """Match the pinned SDK GetFontSlot, including its hint and PUA early returns."""
    if not 0<=codepoint<=0x10ffff:
        raise ValueError('Invalid Unicode value')
    if 0xe000<=codepoint<=0xf8ff:
        return 2 if hint==2 else 1
    mode='chinese' if hint==2 and language==0x7804 else 'eastAsia' if hint==2 else 'default'
    index=bisect.bisect_right(_SLOT_STARTS[mode],codepoint)-1
    slot=_SLOT_DATA[mode][index][2]
    if hint==2 and codepoint<=0xffff and slot==2:
        return 2
    return 4 if complex_script or rtl else slot

def font_request(properties,codepoint):
    slot=font_slot(codepoint,properties.get('hint',0),properties.get('langEastAsia',0),
                   properties.get('complexScript',False),properties.get('rtl',False))
    complex_script=slot==4
    family=properties.get({1:'ascii',2:'eastAsia',4:'cs',8:'hAnsi'}[slot],'DejaVu Sans')
    bold=properties.get('bCs',False) if complex_script else properties.get('b',False)
    italic=properties.get('iCs',False) if complex_script else properties.get('i',False)
    return family,int(bool(bold)) | (2 if italic else 0)
