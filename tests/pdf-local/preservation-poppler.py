#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
import argparse,json,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('root',type=Path);root=parser.parse_args().root
def inspect(file):
 info=subprocess.check_output(['pdfinfo',str(file)],text=True)
 fields={key:value.strip() for key,value in (line.split(':',1) for line in info.splitlines() if ':' in line)}
 xml=subprocess.check_output(['pdftohtml','-xml','-stdout','-i',str(file)],text=True)
 tree=ET.fromstring(xml[xml.index('<pdf2xml'):])
 return {'metadata':{key:fields.get(key) for key in ['Title','Author','Subject','Creator','Producer']},
 'pages':[{'width':p.attrib['width'],'height':p.attrib['height'],'text':[''.join(t.itertext()) for t in p.findall('text')]} for p in tree.findall('page')],
 'outline':[{'page':i.attrib.get('page'),'text':''.join(i.itertext())} for i in tree.findall('./outline/item')],'form':fields.get('Form')}
pairs=[(root/'fixtures/public-forms.pdf',root/('preserved-'+name+'.pdf'),value) for name,value in [('first','Filled public value'),('saved-again','Filled public value'),('second','Second public value'),('undo','Filled public value')]]
pairs +=[(root/'policy-fixtures'/name,root/('matrix-'+name),'Matrix public value') for name in ['public-forms.pdf','public-compressed.pdf','public-annotations-link.pdf','public-compressed-annotations-link.pdf']]
results={}
for original,output,value in pairs:
 before=inspect(original);after=inspect(output)
 checks={'pages':len(after['pages'])==len(before['pages']),
 'order':[p['text'][0] for p in after['pages']]==[p['text'][0] for p in before['pages']],
 'geometry':[(p['width'],p['height']) for p in after['pages']]==[(p['width'],p['height']) for p in before['pages']],
 'metadata':all(after['metadata'][key]==before['metadata'][key] for key in ['Title','Author','Subject','Creator']),
 'provenance':after['metadata']['Producer'].startswith('ElixirOffice/'),
 'outline':after['outline']==before['outline'],'form':after['form']==before['form'],
 'field_appearance':any(value in text for page in after['pages'] for text in page['text']),
 'original_bytes_retained':output.read_bytes().startswith(original.read_bytes())}
 results[output.name]={'checks':checks,'metadata':after['metadata']}
 assert all(checks.values()),(output.name,checks)
(root/'poppler-final.json').write_text(json.dumps(results,indent=2)+'\n')
print('PASS',len(results),'independent Poppler preservation/appearance/provenance and original-byte proofs')
