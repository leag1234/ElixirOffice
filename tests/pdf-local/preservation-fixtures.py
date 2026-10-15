#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Wholly generated public PDF policy fixtures, including empty-password RC4."""
import argparse,hashlib,re,struct,importlib.util,zlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('public_pdf',Path(__file__).with_name('fixtures.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
def objects(data):
 return [body for _,body in re.findall(rb'(\d+) 0 obj\n(.*?)\nendobj\n',data,re.S)]
def encode(items,extra=b''):
 result=b'%PDF-1.4\n';offsets=[]
 for index,body in enumerate(items,1):
  offsets.append(len(result));result+=str(index).encode()+b' 0 obj\n'+body+b'\nendobj\n'
 start=len(result)
 result+=('xref\n0 %d\n0000000000 65535 f \n'%(len(items)+1)).encode()
 result+=b''.join(('%010d 00000 n \n'%offset).encode() for offset in offsets)
 # These proof fixtures use Root1 and the generator's original Info object.
 info=next(i for i,obj in enumerate(items,1) if b'/Subject (Synthetic PDF fixture)' in obj) if not extra else None
 result+=b'trailer\n<< /Size '+str(len(items)+1).encode()+b' /Root 1 0 R'
 if info:result+=b' /Info '+str(info).encode()+b' 0 R'
 result+=extra+b' >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
 return result
def rc4(key,data):
 state=list(range(256));j=0
 for i in range(256):
  j=(j+state[i]+key[i%len(key)])%256;state[i],state[j]=state[j],state[i]
 out=bytearray();i=j=0
 for byte in data:
  i=(i+1)%256;j=(j+state[i])%256;state[i],state[j]=state[j],state[i]
  out.append(byte^state[(state[i]+state[j])%256])
 return bytes(out)
def encrypted():
 # ISO 32000 standard-security revision2, empty public user password.
 padding=bytes.fromhex('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a')
 owner=(b'public-owner'+padding)[:32];user=padding;identity=b'ElixirPublicPDF!'
 o=rc4(hashlib.md5(owner).digest()[:5],user)
 key=hashlib.md5(user+o+struct.pack('<i',-4)+identity).digest()[:5]
 u=rc4(key,padding);items=objects(base.pdf(2,False))
 for index,obj in enumerate(items,1):
  object_key=hashlib.md5(key+index.to_bytes(3,'little')+b'\0\0').digest()[:10]
  if b'\nstream\n' in obj:
   header,body=obj.split(b'\nstream\n',1);data,tail=body.rsplit(b'\nendstream',1)
   items[index-1]=header+b'\nstream\n'+rc4(object_key,data)+b'\nendstream'+tail
  else:
   items[index-1]=re.sub(rb'\(([^()]*)\)',lambda m:b'<'+rc4(object_key,m[1]).hex().encode()+b'>',obj)
 items.append(b'<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4 /O <'+o.hex().encode()+b'> /U <'+u.hex().encode()+b'> >>')
 return encode(items,b' /Encrypt '+str(len(items)).encode()+b' 0 R /ID [<'+identity.hex().encode()+b'><'+identity.hex().encode()+b'>]')

def compressed(data):
    items=objects(data);count=len(items);stream_id=count+1;xref_id=count+2
    # Stream objects remain ordinary; all dictionaries use a real ObjStm.
    packed=[(i,obj) for i,obj in enumerate(items,1) if b'\nstream\n' not in obj]
    body=b'';header=b''
    for index,obj in packed:
        header+=str(index).encode()+b' '+str(len(body)).encode()+b' ';body+=obj+b'\n'
    payload=zlib.compress(header+body)
    stream=b'<< /Type /ObjStm /N '+str(len(packed)).encode()+b' /First '+str(len(header)).encode()+b' /Length '+str(len(payload)).encode()+b' /Filter /FlateDecode >>\nstream\n'+payload+b'\nendstream'
    result=b'%PDF-1.5\n';offsets={}
    for index,obj in [(i,obj) for i,obj in enumerate(items,1) if b'\nstream\n' in obj]+[(stream_id,stream)]:
        offsets[index]=len(result);result+=str(index).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref_offset=len(result);offsets[xref_id]=xref_offset
    compressed_indexes={index:pos for pos,(index,_) in enumerate(packed)}
    entries=[bytes([0])+bytes(4)+(65535).to_bytes(2,'big')]
    for index in range(1,xref_id+1):
        if index in compressed_indexes:
            entries.append(bytes([2])+stream_id.to_bytes(4,'big')+compressed_indexes[index].to_bytes(2,'big'))
        else:
            entries.append(bytes([1])+offsets[index].to_bytes(4,'big')+bytes(2))
    payload=zlib.compress(b''.join(entries))
    info=next(i for i,obj in enumerate(items,1) if b'/Subject (Synthetic PDF fixture)' in obj)
    dictionary=b'<< /Type /XRef /Size '+str(xref_id+1).encode()+b' /Root 1 0 R /Info '+str(info).encode()+b' 0 R /W [1 4 2] /Length '+str(len(payload)).encode()+b' /Filter /FlateDecode >>'
    result+=str(xref_id).encode()+b' 0 obj\n'+dictionary+b'\nstream\n'+payload+b'\nendstream\nendobj\nstartxref\n'+str(xref_offset).encode()+b'\n%%EOF\n'
    return result

def make(folder):
 folder.mkdir(parents=True,exist_ok=True)
 regular=base.pdf().replace(b'/Subject (Synthetic PDF fixture)',b'/Subject (Synthetic PDF fixture) /Creator (Public source application) /Producer (Public source producer)');regular=encode(objects(regular));(folder/'public-forms.pdf').write_bytes(regular)
 (folder/'public-compressed.pdf').write_bytes(compressed(regular))

 items=objects(regular);first=len(items)+1
 items.extend([
 b'<< /Type /Annot /Subtype /Highlight /Rect [72 690 320 720] /QuadPoints [72 720 320 720 72 690 320 690] /P 7 0 R /Contents (Public highlight) /T (Public highlight author) /C [1 1 0] /F 4 >>',
 b'<< /Type /Annot /Subtype /Ink /Rect [72 400 220 480] /InkList [[80 410 100 450 210 470]] /P 7 0 R /Contents (Public ink) /T (Public ink author) /C [0 0 1] /F 4 >>',
 b'<< /Type /Annot /Subtype /Link /Rect [72 690 320 740] /P 5 0 R /A << /S /URI /URI (https://example.invalid/public-link) >> /F 4 >>'])
 for i,page in [(4,[first+2]),(6,[first,first+1])]:
  items[i]=re.sub(rb'/Annots \[([^]]*)\]',lambda m:b'/Annots ['+m[1]+b' '+b' '.join(str(n).encode()+b' 0 R' for n in page)+b']',items[i])
 (folder/'public-annotations-link.pdf').write_bytes(encode(items))
 (folder/'public-compressed-annotations-link.pdf').write_bytes(compressed(encode(items)))

 for name,key,value in [('public-signature-marker.pdf',b'FT',b'/Sig'),('public-unsupported-field.pdf',b'FT',b'/Btn')]:
  items=objects(regular)
  items=[obj.replace(b'/FT /Tx',b'/FT '+value) for obj in items]
  if value==b'/Sig':
   # Presence marker, not a cryptographically valid signature.
   items=[obj.replace(b'/FT /Sig',b'/FT /Sig /ByteRange [0 0 0 0]') for obj in items]
  (folder/name).write_bytes(encode(items))
  if value==b'/Sig':(folder/'public-compressed-signature-marker.pdf').write_bytes(compressed(encode(items)))
 items=objects(regular);items=[obj.replace(b'/Fields [',b'/XFA (public unsupported XFA) /Fields [') for obj in items]
 (folder/'public-xfa-marker.pdf').write_bytes(encode(items))
 items=objects(regular);items[0]=items[0][:-2]+b' /Collection << /Type /Collection >> >>'
 (folder/'public-unsupported-catalog.pdf').write_bytes(encode(items))
 (folder/'public-encrypted-empty-password.pdf').write_bytes(encrypted())
 (folder/'public-over-page-limit.pdf').write_bytes(base.pdf(2001,False))
 (folder/'public-invalid.pdf').write_bytes(b'%PDF-invalid\n')
 items=objects(regular);items=[obj.replace(b'/Subtype /Text',b'/Subtype /RichMedia') for obj in items]
 (folder/'public-unsupported-annotation.pdf').write_bytes(encode(items))
 items=objects(regular);items[0]=items[0][:-2]+b' /OpenAction << /S /JavaScript /JS (public blocked script) >> >>'
 (folder/'public-scripted.pdf').write_bytes(encode(items))
 items=objects(regular);items.append(b'<< /Linearized 1 /L 1 /N 2 /O 1 /E 1 /T 1 /H [0 0] >>')
 (folder/'public-linearized-marker.pdf').write_bytes(encode(items))
 for name,marker in [('signature',b'/Type /Sig'),('byte-range',b'/ByteRange [0 0 0 0]'),('script',b'/JS (public stream marker)'),('actions',b'/AA << >>'),('xfa',b'/XFA (public stream marker)')]:
  items=objects(regular);items.append(b'<< /Length 0 '+marker+b' >>\nstream\n\nendstream')
  (folder/('public-stream-'+name+'.pdf')).write_bytes(encode(items))
 for flags in [0,1,3]:
  items=objects(regular);items=[obj.replace(b'/Fields [',b'/SigFlags '+str(flags).encode()+b' /Fields [') for obj in items]
  (folder/('public-sigflags-'+str(flags)+'.pdf')).write_bytes(encode(items))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('folder',type=Path);make(parser.parse_args().folder)
 print('Generated public preservation-policy fixtures; signature/XFA markers are presence tests only.')
