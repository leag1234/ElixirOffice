#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Compare every reordered public page independently with Poppler and Pillow."""
import argparse,json,subprocess
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder',type=Path);root=parser.parse_args().folder
def render(stem):
    subprocess.run(['pdftoppm','-r','72','-png',str(root/(stem+'.pdf')),str(root/stem)],check=True,stdout=subprocess.DEVNULL)
    return [Image.open(root/(stem+'-'+str(i)+'.png')).convert('RGB') for i in range(1,6)]
rows=[]
for variant in ['classic','compressed','inherited','inherited-compressed','nested','nested-compressed']:
    baseline=render(variant+'-baseline')
    for suffix,logical in [('single',[5,1,2,3,4]),('group',[5,2,4,1,3]),('repeated',[2,4,1,3,5])]:
        actual=render(variant+'-'+suffix);means=[]
        for index,original in enumerate(logical):
            expected=baseline[original-1]
            assert expected.size==actual[index].size,(variant,suffix,index,expected.size,actual[index].size)
            mean=ImageStat.Stat(ImageChops.difference(expected,actual[index])).mean
            assert max(mean)<2,(variant,suffix,index,mean)
            means.append(mean)
        # Original page4 contains a visible red raster image; verify the reference
        # actually renders it before accepting whole-page similarity as evidence.
        image=baseline[3];red=sum(1 for r,g,b in image.getdata() if r>220 and g<30 and b<30)
        assert red>2500,red
        rows.append({'variant':variant,'output':suffix,'logicalPages':logical,'pageMeanAbsoluteChannels':means,'referenceImageRedPixels':red})
result={'renderer':'Poppler72dpi','maximumAcceptedMean':2,'rows':rows}
(root/'page-order-pixels.json').write_text(json.dumps(result,indent=2)+'\n')
print('PASS 90 independent reordered pages incl raster image, annotation/form appearance and exact dimensions; max mean',max(max(ch) for row in rows for ch in row['pageMeanAbsoluteChannels']))
