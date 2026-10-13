#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
from pathlib import Path
from PIL import Image
import sys
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
for extension,format in [('png','PNG'),('jpg','JPEG'),('gif','GIF'),('bmp','BMP'),('webp','WEBP')]:
 Image.new('RGB',(12,8),(240,30,20)).save(out/('public.'+extension),format=format)
(out/'public.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="#f01e14"/></svg>')
print('Generated six public12x8picture fixtures')
