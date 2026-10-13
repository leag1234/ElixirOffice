# SPDX-License-Identifier: AGPL-3.0-only
import sys,zipfile,io
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/desktop'))
from blank_templates import LANGUAGES,localized
source=Path(sys.argv[1])
with zipfile.ZipFile(source) as base:
 for locale,language in LANGUAGES.items():
  first=localized(source,locale)
  assert first==localized(source,locale),'Non-reproducible blank'
  with zipfile.ZipFile(io.BytesIO(first)) as changed:
   assert changed.namelist()==base.namelist()
   for name in base.namelist():
    before,after=base.read(name),changed.read(name)
    if name=='word/styles.xml':
     import re
     assert language.encode() in after
     assert re.sub(rb'<w:lang\b[^>]*/>',b'',before)==re.sub(rb'<w:lang\b[^>]*/>',b'',after),'Changes beyond language'
    else:assert before==after,'Changed pristine content'
print('PASS45 pristine blank variants, language-only changes and reproducible bytes')
