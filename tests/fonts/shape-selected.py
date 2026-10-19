# SPDX-License-Identifier: AGPL-3.0-only
"""Build shaped native drawing input from the exact production-selected font."""
import json, struct, sys
from pathlib import Path
import uharfbuzz as hb
from fontTools.ttLib import TTFont
root=Path(sys.argv[1])
for directory in sorted(p for p in root.iterdir() if p.is_dir()):
    meta=json.loads((directory/'metadata.json').read_text())
    data=(directory/meta['path'].lstrip('/')).read_bytes()
    encoded=meta['faceIndex']
    face=hb.Face(data,encoded & 65535)
    font=hb.Font(face);font.scale=(face.upem,face.upem)
    hb.ot_font_set_funcs(font)
    if meta['axes']:font.set_variations(meta['axes'])
    points=list(map(ord,meta['text']))
    buf=hb.Buffer();buf.add_codepoints(points);buf.guess_segment_properties()
    hb.shape(font,buf,{})
    infos=buf.glyph_infos;positions=buf.glyph_positions
    assert infos and all(info.codepoint for info in infos), 'Missing shaped glyph'
    clusters=sorted(set(info.cluster for info in infos)|{len(points)})
    chunks=[]
    def integer(n):return struct.pack('<i',round(n))
    def dbl(n):return integer(n*100000)
    def cmd(n,*values):chunks.append(bytes([n])+b''.join(values))
    def string(s):return struct.pack('<H',len(s.encode('utf-16le'))//2)+s.encode('utf-16le')
    cmd(202);cmd(200,dbl(210));cmd(201,dbl(100))
    cmd(41,string(meta['name']));cmd(42,dbl(30));cmd(43,integer(meta['style']))
    # Solid black text brush.
    cmd(22,integer(0));cmd(24,bytes([255]))
    x=20;y=35;scale=30*25.4/72/face.upem;seen=set()
    shaped=[]
    for info,pos in zip(infos,positions):
        cp=points[info.cluster:clusters[clusters.index(info.cluster)+1]] if info.cluster not in seen else []
        seen.add(info.cluster)
        cmd(83,integer(info.codepoint),dbl(x+pos.x_offset*scale),dbl(y-pos.y_offset*scale),integer(len(cp)),*(integer(c) for c in cp))
        shaped.append({'gid':info.codepoint,'cluster':info.cluster,'unicode':cp,'advance':pos.x_advance})
        x+=pos.x_advance*scale;y-=pos.y_advance*scale
    cmd(203)
    (directory/'drawing.bin').write_bytes(b''.join(chunks))
    (directory/'shaped.json').write_text(json.dumps({'upem':face.upem,'direction':str(buf.direction),'glyphs':shaped},indent=2)+'\n')
print('PASS exact selected face/instance HarfBuzz shaping: zero .notdef glyphs')
