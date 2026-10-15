# SPDX-License-Identifier: AGPL-3.0-only
import pathlib,sys,zipfile,xml.etree.ElementTree as E,json
root=pathlib.Path(sys.argv[1])
docs=[p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in {'.docx','.xlsx','.pptx','.odt','.ods','.odp','.pdf','.doc','.xls','.ppt'}]
manifest=json.loads((root/'desktop-manifest.json').read_text())
themes={name for name in manifest['files'] if name.startswith('sdkjs/slide/themes/') and name.endswith('.pptx')}
assert len(themes)==22, 'Expected the 22 approved generated/source theme documents'
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'tools/desktop'))
from blank_templates import LANGUAGES,localized
for language in LANGUAGES:
 p=root/'desktop-home/blanks'/(language+'.docx')
 assert p.read_bytes()==localized(root/'templates/new.docx',language),'Localized blank differs beyond approved language default'
localized_blanks={'desktop-home/blanks/'+language+'.docx' for language in LANGUAGES}
brand=pathlib.Path(__file__).resolve().parents[2]/'branding/example/nodejs/public/elixir/brand/templates'
catalog=json.loads((brand/'templates.json').read_text())['templates']
assert {entry['id'] for entry in catalog}=={'letterhead','resume-two-columns','worksheet-fractions','assessment-grid'}, 'Unexpected Home template kind'
approved_languages=set(LANGUAGES)-{'ja','zh','zh-tw','ko','si','ur'}
assert len(approved_languages)==39
home_templates=set()
for entry in catalog:
 assert entry['file']==entry['id']+'.docx' and entry['license']=='CC0-1.0', 'Invalid Home template declaration'
 assert len(entry['languages'])==39 and set(entry['languages'])==approved_languages, 'Expected each Home template in all 39 supported languages'
 for language in entry['languages']:
  relative='desktop-home/templates/'+language+'/'+entry['file']
  assert (root/relative).read_bytes()==(brand/language/entry['file']).read_bytes(), 'Home template differs from approved source'
  home_templates.add(relative)
assert len(home_templates)==156, 'Expected four Home templates in 39 supported languages'
expected={'templates/new.docx','templates/new.xlsx','templates/new.pptx'} | themes | localized_blanks | home_templates
assert {p.relative_to(root).as_posix() for p in docs}==expected, 'Samples/test artifacts must not be packaged'
for p in docs:
 with zipfile.ZipFile(p) as z:
  for n in z.namelist():
   if not n.endswith('.xml'):continue
   xml=z.read(n)
   assert b'EODESKTOP' not in xml and b'CLOSERACE' not in xml, 'Test marker in packaged document'
   text=' '.join(E.fromstring(xml).itertext()).lower()
   assert 'welcome to onlyoffice' not in text and 'onlyoffice online editors' not in text, 'Old upstream welcome sample'
print('PASS no old sample or test-modified Office payload; three clean blank templates,45 exact language-only blank variants, 156 exact approved localized home templates and22 approved theme files')
