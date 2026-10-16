#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Independently compare public annotation/rotation output using Poppler and Pillow."""
import argparse,json,subprocess
from pathlib import Path
from PIL import Image,ImageChops,ImageStat,ImageFilter
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder',type=Path)
root=parser.parse_args().folder
images=[]
for name in ['annotation-baseline','rotation-final']:
    subprocess.run(['pdftoppm','-r','72','-f','1','-singlefile','-png',str(root/(name+'.pdf')),str(root/name)],check=True,stdout=subprocess.DEVNULL)
    images.append(Image.open(root/(name+'.png')).convert('RGB'))
expected=images[0].transpose(Image.Transpose.ROTATE_270)
assert expected.size==images[1].size,(expected.size,images[1].size)
diff=ImageChops.difference(expected,images[1])
means=ImageStat.Stat(diff).mean
assert max(means)<2,means
state=json.loads((root/'annotations-result.json').read_text())
square=next(item['rect'] for item in state['edited'] if item['type']==4)
left,top,right,bottom=square
height=images[0].height
region=(int(height-bottom)-3,int(left)-3,int(height-top)+4,int(right)+4)
expected_roi=expected.crop(region).convert('L').point(lambda pixel:255 if pixel<200 else 0)
actual_roi=images[1].crop(region).convert('L').point(lambda pixel:255 if pixel<200 else 0).filter(ImageFilter.MaxFilter(5))
expected_ink=sum(expected_roi.histogram()[1:])
assert expected_ink>50,'The independently rendered rectangle must have visible ink'
covered_ink=sum(ImageChops.multiply(expected_roi,actual_roi).histogram()[1:])
coverage=covered_ink/expected_ink
assert coverage>0.9,coverage
result={'independentRenderer':'Poppler','expectedClockwiseDegrees':90,'size':images[1].size,'meanAbsoluteChannelDifference':means,'maximumAcceptedMean':2,'rectangleReferenceInkPixels':expected_ink,'rectangleMatchedInkFraction':coverage}
(root/'rotation-pixels.json').write_text(json.dumps(result,indent=2)+'\n')
print('PASS independent Poppler annotation appearance rotates consistently',json.dumps(result))
