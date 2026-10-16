# SPDX-License-Identifier: AGPL-3.0-only
import io,sys,zipfile,tempfile,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parents[2];sys.path.insert(0,str(root/'tools/desktop'))
from template_font_coverage import Pack
from template_font_styles import styled_text
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
pack=Pack(root/'desktop/assets')
assert ord('م') in pack.glyphs('DejaVu Sans','regular')
assert ord('م') in pack.glyphs('DejaVu Sans','bold')
assert ord('م') not in pack.glyphs('DejaVu Sans','italic')
assert ord('م') not in pack.glyphs('DejaVu Sans','bold-italic')
assert ord('א') in pack.glyphs('DejaVu Sans','italic')
fonts='<w:rFonts w:ascii="DejaVu Sans" w:hAnsi="DejaVu Sans" w:eastAsia="DejaVu Sans" w:cs="DejaVu Sans"/>'
def fixture(body,styles='',defaults='',theme=None):
 output=io.BytesIO()
 with zipfile.ZipFile(output,'w') as z:
  z.writestr('word/styles.xml','<w:styles xmlns:w="'+W+'"><w:docDefaults><w:rPrDefault><w:rPr>'+fonts+defaults+'</w:rPr></w:rPrDefault></w:docDefaults>'+styles+'</w:styles>')
  z.writestr('word/document.xml','<w:document xmlns:w="'+W+'"><w:body>'+body+'</w:body></w:document>')
  if theme:z.writestr('word/theme/theme1.xml',theme)
 return output.getvalue()
def paragraph(pr='',ppr='',text='م'):
 return '<w:p><w:pPr>'+ppr+'</w:pPr><w:r><w:rPr>'+pr+'</w:rPr><w:t>'+text+'</w:t></w:r></w:p>'
def missing(data):
 with tempfile.TemporaryDirectory(prefix='eo-font-style-') as directory:
  file=Path(directory)/'public.docx';file.write_bytes(data);return pack.missing(file)
cases=[
 ('regular',fixture(paragraph()),False),
 ('doc-default italic',fixture(paragraph(),defaults='<w:iCs/>'),True),
 ('direct upright overrides default',fixture(paragraph('<w:iCs w:val="0"/>'),defaults='<w:iCs/>'),False),
 ('direct bold-italic',fixture(paragraph('<w:bCs/><w:iCs/>')),True),
 ('upright preserves bold',fixture(paragraph('<w:bCs/><w:iCs w:val="0"/>')),False),
 ('paragraph basedOn',fixture(paragraph(ppr='<w:pStyle w:val="Child"/>'),
  '<w:style w:type="paragraph" w:styleId="Base"><w:rPr><w:iCs/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Child"><w:basedOn w:val="Base"/></w:style>'),True),
 ('default paragraph',fixture(paragraph(),
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:rPr><w:iCs/></w:rPr></w:style>'),True),
 ('character style',fixture(paragraph('<w:rStyle w:val="Emphasis"/>'),
  '<w:style w:type="character" w:styleId="Emphasis"><w:rPr><w:iCs/></w:rPr></w:style>'),True),
 ('table conditional first row',fixture('<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/><w:tblLook w:firstRow="1"/></w:tblPr><w:tr><w:tc>'+paragraph()+'</w:tc></w:tr></w:tbl>',
  '<w:style w:type="table" w:styleId="Grid"><w:tblStylePr w:type="firstRow"><w:rPr><w:iCs/></w:rPr></w:tblStylePr></w:style>'),True),
 ('direct override in table',fixture('<w:tbl><w:tblPr><w:tblStyle w:val="Grid"/></w:tblPr><w:tr><w:tc>'+paragraph('<w:iCs w:val="0"/>')+'</w:tc></w:tr></w:tbl>',
  '<w:style w:type="table" w:styleId="Grid"><w:rPr><w:iCs/></w:rPr></w:style>'),False),
 ('Hebrew italic',fixture(paragraph('<w:iCs/>',text='א')),False),
 ('unknown family',fixture(paragraph('<w:rFonts w:cs="Absent test family"/>')),True),
]
for name,data,expected in cases:assert bool(missing(data))==expected,name
# A theme font must be resolved rather than silently defaulted.
theme='<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme><a:minorFont><a:latin typeface="DejaVu Sans"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>'
assert not missing(fixture(paragraph('<w:rFonts w:asciiTheme="minorHAnsi"/>',text='A'),theme=theme))
# Normalized symbols are ordinary Unicode; no private-use w:sym can escape the gate.
for kind in ['worksheet-fractions','assessment-grid','letterhead','resume-two-columns']:
 file=root/'branding/example/nodejs/public/elixir/brand/templates/ar'/(kind+'.docx')
 with zipfile.ZipFile(file) as z:
  for name in z.namelist():
   if name.startswith('word/') and name.endswith('.xml'):
    tree=ET.fromstring(z.read(name))
    assert not tree.findall('.//{'+W+'}sym'),kind
 assert not pack.missing(file),kind
print('PASS 13 face/default/basedOn/paragraph/character/table/theme cases; four upright Arabic and Unicode-symbol documents')

# Urdu and future Persian generation need the same upright Arabic-script rule.
# Hebrew and Latin text retain italics; bold must survive normalization.
from home_templates import direction_and_fonts
for locale,text in [('ar','م'),('ur','ٹ'),('fa','پ')]:
 source='<w:document xmlns:w="'+W+'"><w:body>'+paragraph('<w:b/><w:bCs/><w:i/><w:iCs/>',text=text)+'</w:body></w:document>'
 tree=ET.fromstring(direction_and_fonts(source,locale));pr=tree.find('.//{'+W+'}r/{'+W+'}rPr')
 for key in ['i','iCs']:assert pr.find('{'+W+'}'+key).get('{'+W+'}val')=='0',(locale,key)
 for key in ['b','bCs']:assert pr.find('{'+W+'}'+key).get('{'+W+'}val','1')=='1',(locale,key)
for locale,text in [('he','א'),('ur','Latin')]:
 source='<w:document xmlns:w="'+W+'"><w:body>'+paragraph('<w:i/><w:iCs/>',text=text)+'</w:body></w:document>'
 tree=ET.fromstring(direction_and_fonts(source,locale));pr=tree.find('.//{'+W+'}r/{'+W+'}rPr')
 for key in ['i','iCs']:assert pr.find('{'+W+'}'+key).get('{'+W+'}val','1')=='1',(locale,key)
print('PASS Arabic/Urdu/future Persian upright preserves bold; Hebrew/Latin italics unchanged')
