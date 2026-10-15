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
def cmap(data):
    """Read Unicode cmap formats 4/12; glyph zero is always missing."""
    u16=lambda p:struct.unpack_from('>H',data,p)[0]
    u32=lambda p:struct.unpack_from('>I',data,p)[0]
    tables={data[12+i*16:16+i*16]:u32(20+i*16) for i in range(u16(4))}
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
    def __init__(self,assets):self.assets=Path(assets);self.faces=font_map(self.assets)
    @lru_cache(maxsize=None)
    def glyphs(self,family):
        index=self.faces.get(family)
        if index is None:return set()
        data=bytearray((self.assets/'fonts'/str(index).zfill(3)).read_bytes())
        for i in range(min(32,len(data))):data[i]^=KEY[i%16]
        return cmap(bytes(data))
    def missing(self,file):
        missing=set()
        with zipfile.ZipFile(file) as archive:
            for name in archive.namelist():
                if not(name.startswith('word/') and name.endswith('.xml')):continue
                root=ET.fromstring(archive.read(name))
                for level in root.findall('.//w:lvl',NS):
                    value=level.find('w:lvlText',NS)
                    if value is not None:
                        face=level.find('w:rPr/w:rFonts',NS)
                        for c in value.get('{'+W+'}val',''):
                            code=ord(c);slot='cs' if 0x590<=code<=0x8ff else 'eastAsia' if 0x2e80<=code<=0xd7ff else 'ascii' if code<128 else 'hAnsi'
                            family=face.get('{'+W+'}'+slot,'DejaVu Sans') if face is not None else 'DejaVu Sans'
                            if not c.isspace() and code not in self.glyphs(family):missing.add(code)
                for run in root.findall('.//w:r',NS):
                    fonts=run.find('w:rPr/w:rFonts',NS)
                    for text in run.findall('w:t',NS):
                        for c in text.text or '':
                            code=ord(c)
                            slot='cs' if 0x590<=code<=0x8ff else 'eastAsia' if 0x2e80<=code<=0xd7ff else 'ascii' if code<128 else 'hAnsi'
                            face=fonts.get('{'+W+'}'+slot,'DejaVu Sans') if fonts is not None else 'DejaVu Sans'
                            if not c.isspace() and code not in self.glyphs(face):missing.add(code)
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
