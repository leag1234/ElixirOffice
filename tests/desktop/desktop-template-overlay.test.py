# SPDX-License-Identifier: AGPL-3.0-only
"""Verify the separate desktop overlay against its source, language and provenance contracts."""
import hashlib,json,sys,zipfile
from pathlib import Path
from lxml import etree as XML
root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'tools/desktop'))
from desktop_templates import desktop_variant,requirements,LOCALES
from blank_templates import LANGUAGES
from home_templates import W,NS
overlay=root/'branding/desktop-templates'
base=root/'branding/example/nodejs/public/elixir/brand/templates'
catalog=json.loads((overlay/'templates.json').read_text())
sources=json.loads((overlay/'template-sources.json').read_text())
assert catalog['license']==sources['license']=='CC0-1.0'
records={r['file']:r for r in sources['files']}
assert len(records)==48
assert len(catalog['templates'])==4
for entry in catalog['templates']:
 assert entry['languages']==list(LOCALES)
 assert entry['systemLocales']==['ja','zh','zh-tw','ko']
 source=root/'tools/example/template-layouts'/(entry['id']+'.docx')
 for locale,family in LOCALES.items():
  doc=overlay/locale/source.name
  assert desktop_variant(source,entry['id'],locale)==doc.read_bytes(),(entry['id'],locale,'reproducibility')
  assert requirements(doc.read_bytes())==entry['fontRequirements'][locale]
  assert not (base/locale).exists(),'Desktop overlay leaked into shared web templates'
  with zipfile.ZipFile(doc) as archive:
   xml=[XML.fromstring(archive.read(n)) for n in archive.namelist() if n.startswith('word/') and n.endswith('.xml')]
   for element in xml:
    for lang in element.findall('.//w:lang',NS):assert lang.get('{'+W+'}val')==LANGUAGES[locale]
    for paragraph in element.findall('.//w:p',NS):
     assert (paragraph.find('w:pPr/w:bidi',NS) is not None)==(locale=='ur')
   if locale=='ur' and entry['id']=='letterhead':
    document=XML.fromstring(archive.read('word/document.xml'))
    framed=[p for p in document.findall('w:body/w:p',NS) if p.find('w:pPr/w:framePr',NS) is not None]
    assert len(framed)==5
    height=int(framed[0].find('w:pPr/w:framePr',NS).get('{'+W+'}h'))
    lines=[p.find('w:pPr/w:spacing',NS) for p in framed]
    assert all(line.get('{'+W+'}lineRule')=='exact' for line in lines)
    assert sum(int(line.get('{'+W+'}line')) for line in lines)<=height,'Recipient lines exceed the fixed frame'
   fonts=[f for element in xml for f in element.findall('.//w:rFonts',NS)]
   assert any(family in f.attrib.values() for f in fonts)
   if locale=='si':assert any(f.get('{'+W+'}hAnsi')==family for f in fonts)
   if locale=='ur':
    for element in xml:
     for table in element.findall('.//w:tbl',NS):assert table.find('w:tblPr/w:bidiVisual',NS) is not None
  for file in [doc,doc.with_suffix('.png')]:
   data=file.read_bytes();record=records[str(file.relative_to(overlay))]
   assert record['bytes']==len(data) and record['sha256']==hashlib.sha256(data).hexdigest()
   assert record['language']==locale and record['languageTag']==LANGUAGES[locale]
   assert record['license']=='CC0-1.0' and record['fictional'] is True
   if file.suffix=='.png':
    assert data[:8]==bytes.fromhex('89504e470d0a1a0a')
    assert int.from_bytes(data[16:20],'big')==264 and int.from_bytes(data[20:24],'big')==374
assert set(records)=={str(p.relative_to(overlay)) for p in overlay.glob('*/*') if p.suffix in ['.png','.docx']}
print('PASS 24 reproducible desktop-only DOCX, language/RTL/slot contracts and 48 CC0 preview/source hashes')
