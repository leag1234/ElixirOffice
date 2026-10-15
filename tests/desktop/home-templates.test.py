# SPDX-License-Identifier: AGPL-3.0-only
import hashlib,json,sys,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'tools/desktop'))
from blank_templates import LANGUAGES
from home_templates import localized, direction_and_fonts, RTL
from template_font_coverage import Pack
pack=Pack(root/'desktop/assets')
brand=root/'branding/example/nodejs/public/elixir/brand/templates'
catalog=json.loads((brand/'templates.json').read_text());words=json.loads((brand/'localized-content.json').read_text())
sources=json.loads((brand/'template-sources.json').read_text())
assert set(words)==set(LANGUAGES);assert sources['license']=='CC0-1.0'
records={item['file']:item for item in sources['files']};assert len(records)==sum(len(t['languages'])*2 for t in catalog['templates'])
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
originals=['Monsieur le Maire','Mairie de','préfecture','SIRET','Valmont-sur-Ourse','Chargée de projets','Baccalauréat','jardins-du-moulin','Odile Ferrand','Camille Fournier','Trois-Rivières','Tilleuls','CM1','6e B','Kenza','Léa','Paul dit']
french=['À retenir','parts égales','Observation de l’enseignant','Sciences et technologie','Courrier du','Compétences','Langues','Anglais :','Expérience professionnelle']
for item in catalog['templates']:
 assert set(item['languages'])<=set(LANGUAGES) and 'en' in item['languages'];assert item['license']=='CC0-1.0'
 layout=root/'tools/example/template-layouts'/(item['id']+'.docx')
 for locale,language in LANGUAGES.items():
  shipped=locale in item['languages']
  folder=brand/locale if shipped else root/'tools/example/template-layouts/localized'/locale
  file=folder/item['file'];assert file.stat().st_size<40000
  missing=pack.missing(file)
  assert bool(missing)!=shipped,(locale,item['id'],'font coverage disagrees with manifest')
  if not shipped: assert not (brand/locale/item['file']).exists()
  for key in ['file','thumb']:
   if not shipped: continue
   relative=locale+'/'+item[key];data=(brand/relative).read_bytes();record=records[relative]
   assert record['license']=='CC0-1.0' and record['fictional'] is True
   assert record['language']==locale and record['languageTag']==language and record['bytes']==len(data)
   assert record['sha256']==hashlib.sha256(data).hexdigest()
  with zipfile.ZipFile(file) as z,zipfile.ZipFile(layout) as base:
   xml=[z.read(name).decode() for name in z.namelist() if name.endswith('.xml')]
   visible=' '.join(n.text or '' for value in xml for n in ET.fromstring(value).findall('.//w:t',ns))
   visible+=' '.join(n.get('{'+ns['w']+'}val','') for value in xml for n in ET.fromstring(value).findall('.//w:lvlText',ns))
   assert all(s not in visible for s in originals),(locale,item['id'],'French source retained')
   if locale!='fr':
    assert 'Exercice' not in visible
    assert all(s.casefold() not in visible.casefold() for s in french),(locale,item['id'],'French words')
    assert all(f not in ' '.join(xml) for f in ['Marelle','Seyes','Cursive standard','Playwrite FR'])
   for name in z.namelist():
    if name.startswith('word/') and name.endswith('.xml'):
     element=ET.fromstring(z.read(name))
     for lang in element.findall('.//w:lang',ns):assert lang.attrib.get('{'+ns['w']+'}val')==language
     if locale in RTL:
      for paragraph in element.findall('.//w:p',ns):
       assert paragraph.find('w:pPr/w:bidi',ns) is not None
      for table in element.findall('.//w:tbl',ns):
       assert table.find('w:tblPr/w:bidiVisual',ns) is not None
      original=ET.fromstring(base.read(name))
      for tag in ['jc','lvlJc']:
       old=original.findall('.//w:'+tag,ns)
       # Compare explicit source alignments (inserted paragraph defaults are separate).
       expected=[{'left':'right','right':'left','start':'end','end':'start'}.get(n.get('{'+ns['w']+'}val'),n.get('{'+ns['w']+'}val')) for n in old]
       actual=[n.get('{'+ns['w']+'}val') for n in element.findall('.//w:'+tag,ns)]
       for value in expected: assert value in actual
     before=ET.fromstring(direction_and_fonts(base.read(name).decode(),locale))
     # Preserve source geometry with the explicitly required RTL mirroring.
     rtl_nodes=element.findall('.//w:bidi',ns)+element.findall('.//w:rtl',ns)
     if name in ['word/document.xml','word/styles.xml']:
      assert bool(rtl_nodes)==(locale in RTL),(locale,name,'RTL declarations')
     for font in element.findall('.//w:rFonts',ns):
      assert font.get('{'+ns['w']+'}cs')=='DejaVu Sans'
      assert font.get('{'+ns['w']+'}eastAsia')=='DejaVu Sans'
     for tag in ['pPr','tblPr','tcPr','sectPr','drawing']:
      def shape(e):
       nodes=[]
       for value in e.findall('.//w:'+tag,ns):
        value=ET.fromstring(ET.tostring(value))
        if tag=='drawing':
         # Drawing textboxes legitimately contain translated runs and substituted fonts.
         # Keep every anchor/extent/position/table/paragraph property in the comparison.
         for node in value.findall('.//w:t',ns):node.text=None
         for parent in value.iter():
          for child in list(parent):
           if child.tag in ['{'+ns['w']+'}rFonts','{'+ns['w']+'}lang','{'+ns['w']+'}rtl']:parent.remove(child)
        nodes.append(ET.tostring(value))
       return nodes
      assert shape(element)==shape(before),(locale,item['id'],name,tag)
   assert ET.fromstring(z.read('word/styles.xml')).find('.//w:lang',ns) is not None
   if item['id'] in ['letterhead','resume-two-columns']:
    assert 'example.org' in visible and words[locale]['phone'] in visible
   assert 'Century Gothic' not in ' '.join(xml)
  assert localized(layout,item['id'],locale)==file.read_bytes(),'Generation not reproducible'
print('PASS 180 source DOCX; shipped glyph coverage, RTL/layout, reproducibility and CC0 hashes')
