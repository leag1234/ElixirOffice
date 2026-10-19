# SPDX-License-Identifier: AGPL-3.0-only
"""Compare the first actual PDF glyph against independently instantiated source outlines."""
import hashlib,json,re,struct,sys,zlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image
root=Path(sys.argv[1])
results=[]
for case in ['variable-regular','variable-medium-alias','variable-bold']:
 d=root/case;meta=json.loads((d/'metadata.json').read_text());source=TTFont(d/'fonts/font0.ttf')
 source=instantiateVariableFont(source,meta['axes'],inplace=True)
 gid=json.loads((d/'shaped.json').read_text())['glyphs'][0]['gid']
 def drawing(font,glyph):
  pen=RecordingPen();font.getGlyphSet()[font.getGlyphOrder()[glyph]].draw(pen);return pen.value
 expected=drawing(source,gid)
 row={'case':case,'expectedWeight':meta['axes']['wght'],'sourceGid':gid}
 for backend,file,embeddedGid in [('wasm','output.pdf',gid),('js','js-output.pdf',1)]:
  pdf=(d/file).read_bytes();ref=re.search(rb'/FontFile2\s+(\d+)\s+0\s+R',pdf);assert ref
  obj=re.search(rb'(?:^|\n)'+ref[1]+rb' 0 obj\b([\s\S]*?)endobj',pdf)[1]
  payload=re.search(rb'stream\r?\n([\s\S]*?)\r?\nendstream',obj)[1]
  if b'/FlateDecode' in obj:payload=zlib.decompress(payload)
  output=d/(backend+'-embedded.ttf');output.write_bytes(payload)
  embedded=TTFont(output);actual=drawing(embedded,embeddedGid)
  # Fontkit rounds instantiated variation coordinates to integers when serializing TrueType.
  def rounded(path):
   return [(op,tuple(tuple(round(v) for v in point) if point is not None else None for point in points)) for op,points in path]
  row[backend]={'embeddedSha256':hashlib.sha256(payload).hexdigest(),'outlineExact':actual==expected,
    'outlineRounded':rounded(actual)==rounded(expected),'glyph':embeddedGid,'outlineNonempty':bool(actual)}
  print(case,backend,'expected',expected[:2],'actual',actual[:2],'match',row[backend]['outlineRounded'],flush=True)
 results.append(row)
(root.parent/'s2-variable-outline-oracle.json').write_text(json.dumps(results,indent=2)+'\n')
failed=[(r['case'],backend) for r in results for backend in ['wasm','js'] if not r[backend]['outlineRounded']]
print('Variable contour parity:', 'FAIL' if failed else 'PASS', failed)
sys.exit(1 if failed else 0)
