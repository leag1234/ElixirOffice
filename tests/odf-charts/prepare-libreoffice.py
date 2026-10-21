#!/usr/bin/env python3
"""Package actual native chart output with small, entirely synthetic worksheets."""
from pathlib import Path
from zipfile import ZipFile,ZIP_STORED,ZIP_DEFLATED
import argparse,base64,hashlib,json,subprocess,xml.etree.ElementTree as E
NS={p:'urn:oasis:names:tc:opendocument:xmlns:'+n+':1.0'for p,n in [('office','office'),('table','table'),('chart','chart'),('text','text'),('style','style'),('draw','drawing'),('manifest','manifest')]}
NS['config']='urn:oasis:names:tc:opendocument:xmlns:config:1.0'
NS.update(svg='urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',xlink='http://www.w3.org/1999/xlink',calcext='urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0')
for p,v in NS.items():E.register_namespace(p,v)
def q(k):p,n=k.split(':');return'{'+NS[p]+'}'+n
def node(tag,attrs=None):return E.Element(q(tag),{q(k):str(v)for k,v in(attrs or{}).items()})
def child(parent,tag,attrs=None):n=node(tag,attrs);parent.append(n);return n
def xml(root):return E.tostring(root,encoding='utf-8',xml_declaration=True)
def envelope(kind):
 r=node('office:document-'+kind,{'office:version':'1.3'});body=child(r,'office:'+kind)
 if kind=='settings':
  group=child(body,'config:config-item-set',{'config:name':'synthetic-settings'})
  child(group,'config:config-item',{'config:name':'FixtureVersion','config:type':'string'}).text='1'
 return xml(r)
def parts(source,reserved):
 raw=source.read_bytes();decl=' '.join('xmlns:'+p+'="'+v+'"'for p,v in NS.items());chart=E.fromstring(('<wrap '+decl+'>').encode()+raw+b'</wrap>')[0]
 doc=node('office:document-content',{'office:version':'1.3'});styles=child(doc,'office:automatic-styles')
 names=sorted({e.get(q('chart:style-name'))for e in chart.iter()if e.get(q('chart:style-name'))})
 for name in names:child(child(styles,'style:style',{'style:name':name,'style:family':'chart'}),'style:chart-properties')
 child(doc,'office:body').append(chart)
 root=node('office:document-content',{'office:version':'1.3'});sheets=child(child(root,'office:body'),'office:spreadsheet')
 for si,name in enumerate(['local-table'if reserved else'First','Second']):
  table=child(sheets,'table:table',{'table:name':name});child(table,'table:table-column')
  for ri,value in enumerate([1,2,3]if si==0 else[11,12,13]):
   row=child(table,'table:table-row');cell=child(row,'table:table-cell',{'office:value-type':'float','office:value':value});child(cell,'text:p').text=str(value)
   if si==ri==0:
    frame=child(cell,'draw:frame',{'draw:name':'SyntheticChart','svg:width':'8cm','svg:height':'6cm','svg:x':'1cm','svg:y':'1cm','text:anchor-type':'paragraph'})
    child(frame,'draw:object',{'xlink:href':'./Object1','xlink:type':'simple','xlink:show':'embed','xlink:actuate':'onLoad'})
 data={'content.xml':xml(root),'Object1/content.xml':xml(doc)}
 for prefix in ['', 'Object1/']:
  for kind in ['styles','meta','settings']:data[prefix+kind+'.xml']=envelope(kind)
 return data
def manifest(data,encrypted=None):
 root=node('manifest:manifest',{'manifest:version':'1.3'})
 child(root,'manifest:file-entry',{'manifest:full-path':'/','manifest:media-type':'application/vnd.oasis.opendocument.spreadsheet'})
 child(root,'manifest:file-entry',{'manifest:full-path':'Object1/','manifest:media-type':'application/vnd.oasis.opendocument.chart'})
 for path,raw in sorted(data.items()):
  attrs={'manifest:full-path':path,'manifest:media-type':'text/xml'}
  m=encrypted.get(path)if encrypted else None
  if m:attrs['manifest:size']=m['plain_size']
  entry=child(root,'manifest:file-entry',attrs)
  if m:
   b64=lambda k:base64.b64encode(bytes.fromhex(m[k])).decode()
   crypt=child(entry,'manifest:encryption-data',{'manifest:checksum-type':'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0#sha256-1k','manifest:checksum':b64('checksum')})
   child(crypt,'manifest:algorithm',{'manifest:algorithm-name':'http://www.w3.org/2001/04/xmlenc#aes256-cbc','manifest:initialisation-vector':b64('iv')})
   child(crypt,'manifest:start-key-generation',{'manifest:start-key-generation-name':'http://www.w3.org/2000/09/xmldsig#sha256','manifest:key-size':'32'})
   child(crypt,'manifest:key-derivation',{'manifest:key-derivation-name':'PBKDF2','manifest:key-size':'32','manifest:iteration-count':m['spin'],'manifest:salt':b64('salt')})
 return xml(root)
def archive(path,data,meta):
 with ZipFile(path,'w')as z:
  z.writestr('mimetype','application/vnd.oasis.opendocument.spreadsheet',compress_type=ZIP_STORED)
  z.writestr('META-INF/manifest.xml',manifest(data,meta),compress_type=ZIP_DEFLATED)
  for name,raw in data.items():z.writestr(name,raw,compress_type=ZIP_STORED if meta else ZIP_DEFLATED)
def main():
 p=argparse.ArgumentParser();p.add_argument('--matrix',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--encryptor',type=Path,required=True);a=p.parse_args();a.out.mkdir(exist_ok=False,parents=True);expected=[]
 for reserved,name in [(False,'chart-plain.ods'),(True,'chart-cache-name.ods')]:
  source=a.matrix/('reserved.xml'if reserved else'bound.xml');data=parts(source,reserved);archive(a.out/name,data,None)
  expected.append({'file':name,'password':None,'sourceChartSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'series':[{'sheet':'local-table'if reserved else'First','values':[1,2,3]},{'sheet':'Second','values':[11,12,13]}]})
 clear=a.out/'password-input';clear.mkdir()
 for path,raw in parts(a.matrix/'bound.xml',False).items():f=clear/path;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(raw)
 encrypted=a.out/'password-encryption';subprocess.run([str(a.encryptor),str(clear),str(encrypted)],check=True,timeout=90)
 meta={m['path']:m for m in json.loads((encrypted/'metadata.json').read_text())};assert len(meta)==8
 archive(a.out/'chart-password.ods',{path:(encrypted/(path+'.cipher')).read_bytes()for path in meta},meta)
 expected.append({**expected[0],'file':'chart-password.ods','password':'synthetic-padding'})
 for e in expected:e['sha256']=hashlib.sha256((a.out/e['file']).read_bytes()).hexdigest()
 (a.out/'expected.json').write_text(json.dumps(expected,indent=2)+'\n')
 (a.out/'qualification.txt').write_text('Synthetic worksheets plus actual selected-source native chart output. Password package uses a standalone CBC writer as a separate executable, separate from a matched runtime. Fixed public test password only; salts/IVs random per part; root styles includes a harmless comment to exercise aligned padding. Raw ODF1.3 schema and extended-attribute diagnostics must be reported separately. Native LibreOffice acceptance is separate from fixture generation.\n')
 print('PREPARED_THREE_SYNTHETIC_ODS')
if __name__=='__main__':main()
