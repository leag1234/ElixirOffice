#!/usr/bin/env python3
"""Generate a public synthetic DOCX with hostile links and tracked formatting."""
from pathlib import Path
import json,sys,zipfile,html
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
links=["javascript:alert(1)","data:text/html,<script>alert(1)</script>","vbscript:msgbox(1)","https://example.invalid/path","ftp://example.invalid/file","mailto:person@example.invalid","tel:+1234567"]
font='<img src=x onerror="window.pwned=1"> AuditFont'
style='<svg onload="window.pwned=1"> AuditStyle'
paragraphs=[]
for i,url in enumerate(links,1):
 paragraphs.append('<w:p><w:hyperlink r:id="rId'+str(i)+'"><w:r><w:t>Link '+str(i)+'</w:t></w:r></w:hyperlink></w:p>')
paragraphs.append('<w:p><w:pPr><w:pPrChange w:id="1" w:author="Security test" w:date="2026-01-01T00:00:00Z"><w:pPr><w:pStyle w:val="AuditStyle"/></w:pPr></w:pPrChange></w:pPr><w:r><w:rPr><w:rPrChange w:id="2" w:author="Security test" w:date="2026-01-01T00:00:00Z"><w:rPr><w:rFonts w:ascii="'+html.escape(font,quote=True)+'" w:hAnsi="'+html.escape(font,quote=True)+'"/></w:rPr></w:rPrChange></w:rPr><w:t>Tracked format test</w:t></w:r></w:p>')
document='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+''.join(paragraphs)+'<w:sectPr/></w:body></w:document>'
rels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join('<Relationship Id="rId'+str(i)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="'+html.escape(url,quote=True)+'" TargetMode="External"/>' for i,url in enumerate(links,1))+'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
styles='<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="AuditStyle"><w:name w:val="'+html.escape(style,quote=True)+'"/></w:style></w:styles>'
types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
rootrels='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
with zipfile.ZipFile(out/'hostile.docx','w',zipfile.ZIP_DEFLATED) as z:
 for name,data in [('[Content_Types].xml',types),('_rels/.rels',rootrels),('word/document.xml',document),('word/_rels/document.xml.rels',rels),('word/styles.xml',styles)]:z.writestr(name,data)
(out/'expected.json').write_text(json.dumps({'links':links,'font':font,'style':style},indent=2)+'\n')
