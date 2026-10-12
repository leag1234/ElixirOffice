# SPDX-License-Identifier: AGPL-3.0-only
import pathlib,sys,zipfile,xml.etree.ElementTree as E,json
root=pathlib.Path(sys.argv[1])
docs=[p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in {'.docx','.xlsx','.pptx','.odt','.ods','.odp','.pdf','.doc','.xls','.ppt'}]
manifest=json.loads((root/'desktop-manifest.json').read_text())
themes={name for name in manifest['files'] if name.startswith('sdkjs/slide/themes/') and name.endswith('.pptx')}
assert len(themes)==22, 'Expected the 22 approved generated/source theme documents'
expected={'templates/new.docx','templates/new.xlsx','templates/new.pptx'} | themes
assert {p.relative_to(root).as_posix() for p in docs}==expected, 'Samples/test artifacts must not be packaged'
for p in docs:
 with zipfile.ZipFile(p) as z:
  for n in z.namelist():
   if not n.endswith('.xml'):continue
   xml=z.read(n)
   assert b'EODESKTOP' not in xml and b'CLOSERACE' not in xml, 'Test marker in packaged document'
   text=' '.join(E.fromstring(xml).itertext()).lower()
   assert 'welcome to onlyoffice' not in text and 'onlyoffice online editors' not in text, 'Old upstream welcome sample'
print('PASS no old sample or test-modified Office payload; three clean new templates and22 approved theme files')
