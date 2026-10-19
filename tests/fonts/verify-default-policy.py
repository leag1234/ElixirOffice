# SPDX-License-Identifier: AGPL-3.0-only
"""Verify release review default-only variable policy in actual selected-FS PDFs."""
import hashlib,json,re,sys,zlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image,ImageChops
root=Path(sys.argv[1]);results=[]
for key in ['variable-regular','variable-medium-policy','variable-bold-policy']:
 directory=root/key;meta=json.loads((directory/'metadata.json').read_text())
 assert meta['faceIndex']==0
 source=TTFont(directory/meta['path'].lstrip('/'))
 defaults={axis.axisTag:axis.defaultValue for axis in source['fvar'].axes}
 assert meta['axes']==defaults
 pdf=(directory/'output.pdf').read_bytes()
 ref=re.search(rb'/FontFile2\s+(\d+)\s+0\s+R',pdf);assert ref
 obj=re.search(rb'(?:^|\n)'+ref[1]+rb' 0 obj\b([\s\S]*?)endobj',pdf)[1]
 payload=re.search(rb'stream\r?\n([\s\S]*?)\r?\nendstream',obj)[1]
 if b'/FlateDecode' in obj:payload=zlib.decompress(payload)
 embeddedPath=directory/'embedded-default.ttf';embeddedPath.write_bytes(payload);embedded=TTFont(embeddedPath)
 gid=json.loads((directory/'shaped.json').read_text())['glyphs'][0]['gid']
 def outline(font):
  pen=RecordingPen();font.getGlyphSet()[font.getGlyphOrder()[gid]].draw(pen);return pen.value
 assert outline(source)==outline(embedded),key+' embedded contours differ from eligible default'
 image=Image.open(directory/'render.png').convert('L')
 ink=sum(255-value for value in image.getdata());assert ink>0
 row={'case':key,'face':0,'axes':defaults,'needBold':meta['needBold'],'embeddedSha256':hashlib.sha256(payload).hexdigest(),'defaultOutlineExact':True,'ink':ink}
 results.append(row)
regular=Image.open(root/'variable-regular/render.png')
medium=Image.open(root/'variable-medium-policy/render.png')
assert ImageChops.difference(regular,medium).getbbox() is None,'Medium fallback must use the same eligible default'
assert not results[0]['needBold'] and not results[1]['needBold'] and results[2]['needBold']
assert results[2]['ink']>results[0]['ink']*1.05,'Explicit synthetic bold must visibly change ink'
(root.parent/'default-policy-outline.json').write_text(json.dumps(results,indent=2)+'\n')
print('PASS exact default-instance embedded contours; Medium uses same eligible default; Bold explicitly synthetic')
