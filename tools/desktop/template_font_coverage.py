#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Verify public-template glyph coverage against the actual bundled font pack."""
import json,re,struct,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from functools import lru_cache
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS={'w':W}
KEY=bytes([160,102,214,32,20,150,71,250,149,105,184,80,176,65,73,72])
def font_map(assets):
    source=(assets/'sdkjs/common/AllFonts.js').read_text(encoding='utf-8-sig')
    return {name:int(index) for name,index in re.findall(r'\["([^"]+)",\s*(-?\d+),',source) if int(index)>=0}
def font_variants(assets):
    source=(assets/'sdkjs/common/AllFonts.js').read_text(encoding='utf-8-sig')
    result={}
    for name,raw in re.findall(r'\["([^"]+)"\s*,([-\d,\s]+)\]',source):
        numbers=[int(n.strip()) for n in raw.split(',') if n.strip()]
        if len(numbers)==8:
            result[name]={style:(numbers[i*2],numbers[i*2+1]) for i,style in enumerate(['regular','italic','bold','bold-italic'])}
    return result
def cmap(data,face=0):
    """Read Unicode cmap formats 4/12; glyph zero is always missing."""
    u16=lambda p:struct.unpack_from('>H',data,p)[0]
    u32=lambda p:struct.unpack_from('>I',data,p)[0]
    start=0
    if data[:4]==b'ttcf':
        assert face<u32(8),'Invalid font collection face'
        start=u32(12+face*4)
    else:assert face==0,'Non-collection face must be zero'
    tables={data[start+12+i*16:start+16+i*16]:u32(start+20+i*16) for i in range(u16(start+4))}
    base=tables[b'cmap'];result=set()
    for i in range(u16(base+2)):
        record=base+4+8*i;platform,encoding=u16(record),u16(record+2)
        if platform!=0 and not(platform==3 and encoding in [1,10]):continue
        start=base+u32(record+4);fmt=u16(start)
        if fmt==12:
            for j in range(u32(start+12)):
                lo,hi,glyph=struct.unpack_from('>III',data,start+16+j*12)
                result.update(range(lo+(glyph==0),hi+1))
        elif fmt==4:
            count=u16(start+6)//2;ends=start+14;begins=ends+2*count+2;deltas=begins+2*count;ranges=deltas+2*count
            for j in range(count):
                lo,hi=u16(begins+j*2),u16(ends+j*2);delta=u16(deltas+j*2);offset=u16(ranges+j*2)
                for code in range(lo,min(hi,65534)+1):
                    glyph=(code+delta)&65535 if offset==0 else u16(ranges+j*2+offset+2*(code-lo))
                    if offset and glyph:glyph=(glyph+delta)&65535
                    if glyph:result.add(code)
    return result
class Pack:
    def __init__(self,assets):
        self.assets=Path(assets);self.faces=font_map(self.assets);self.variants=font_variants(self.assets)
    @lru_cache(maxsize=None)
    def glyphs(self,family,style='regular'):
        choices={'regular':['regular','italic','bold','bold-italic'],
                 'italic':['italic','bold-italic','regular','bold'],
                 'bold':['bold','bold-italic','regular','italic'],
                 'bold-italic':['bold-italic','bold','italic','regular']}
        variants=self.variants.get(family,{})
        selected=next((variants[c] for c in choices[style] if variants.get(c,(-1,0))[0]>=0),None)
        if selected is None:return set()
        index,face=selected
        data=bytearray((self.assets/'fonts'/str(index).zfill(3)).read_bytes())
        for i in range(min(32,len(data))):data[i]^=KEY[i%16]
        return cmap(bytes(data),face)
    def missing(self,file):
        from template_font_styles import styled_text
        missing=set()
        with zipfile.ZipFile(file) as archive:
            for text,properties in styled_text(archive):
                for c in text:
                    if c.isspace():continue
                    code=ord(c);complex_script=properties.get('cs',False) or 0x590<=code<=0x8ff
                    slot='cs' if complex_script else 'eastAsia' if 0x2e80<=code<=0xd7ff else 'ascii' if code<128 else 'hAnsi'
                    family=properties.get(slot,'DejaVu Sans')
                    bold=properties.get('bCs',properties.get('b',False)) if complex_script else properties.get('b',False)
                    italic=properties.get('iCs',properties.get('i',False)) if complex_script else properties.get('i',False)
                    style='bold-italic' if bold and italic else 'bold' if bold else 'italic' if italic else 'regular'
                    if code not in self.glyphs(family,style):missing.add(code)
        return sorted(missing)
if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('assets',type=Path);parser.add_argument('brand',type=Path);parser.add_argument('--output',type=Path)
    args=parser.parse_args();pack=Pack(args.assets);manifest=json.loads((args.brand/'templates.json').read_text());matrix={}
    for entry in manifest['templates']:
        matrix[entry['id']]={lang:pack.missing((args.brand/lang/entry['file']) if (args.brand/lang/entry['file']).exists() else Path(__file__).resolve().parents[1]/'example/template-layouts/localized'/lang/entry['file']) for lang in entry['title']}
    output={'packFamilies':sorted(pack.faces),'missingCodepoints':matrix}
    data=json.dumps(output,ensure_ascii=False,indent=2)+'\n'
    if args.output:args.output.write_text(data)
    else:print(data)
