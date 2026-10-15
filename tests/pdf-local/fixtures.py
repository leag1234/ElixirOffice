#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Generate wholly synthetic public PDF fixtures; no input documents are read."""
import argparse
from pathlib import Path
def pdf(pages=2, forms=True):
    objects=[]
    def add(data):
        objects.append(data.encode('ascii') if isinstance(data,str) else data)
        return len(objects)
    def stream(data,extra=''):
        data=data.encode('ascii')
        return b'<< /Length '+str(len(data)).encode()+b' '+extra.encode()+b' >>\nstream\n'+data+b'\nendstream'
    catalog=add('');parent=add('');font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    page_ids=[]
    for index in range(pages):
        content=add(stream('BT /F1 18 Tf 72 720 Td (Public PDF page '+str(index+1)+' - ElixirOffice) Tj ET'))
        page_ids.append(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+str(content)+' 0 R >>'))
    extra=''
    if forms:
        appearance=add(stream('BT /Helv 12 Tf 2 5 Td (Initial public value) Tj ET','/Type /XObject /Subtype /Form /BBox [0 0 240 25] /Resources << /Font << /Helv 3 0 R >> >>'))
        widget=add('<< /Type /Annot /Subtype /Widget /FT /Tx /T (public_name) /V (Initial public value) /DA (/Helv 12 Tf 0 g) /Rect [72 600 312 625] /F 4 /P '+str(page_ids[0])+' 0 R /AP << /N '+str(appearance)+' 0 R >> >>')
        objects[page_ids[0]-1]=objects[page_ids[0]-1][:-2]+(' /Annots ['+str(widget)+' 0 R] >>').encode()
        form=add('<< /Fields ['+str(widget)+' 0 R] /NeedAppearances false /DR << /Font << /Helv 3 0 R >> >> /DA (/Helv 12 Tf 0 g) >>')
        annotation=add('<< /Type /Annot /Subtype /Text /Rect [72 650 92 670] /P '+str(page_ids[-1])+' 0 R /Contents (Existing public annotation) /T (Public fixture author) /Name /Note /F 4 >>')
        objects[page_ids[-1]-1]=objects[page_ids[-1]-1][:-2]+(' /Annots ['+str(annotation)+' 0 R] >>').encode()
        extra=' /AcroForm '+str(form)+' 0 R'
    info=add('<< /Title (Original public title) /Author (Public fixture author) /Subject (Synthetic PDF fixture) >>')
    outline=add('');item=add('<< /Title (First public page) /Parent '+str(outline)+' 0 R /Dest ['+str(page_ids[0])+' 0 R /Fit] >>')
    objects[outline-1]=('<< /Type /Outlines /First '+str(item)+' 0 R /Last '+str(item)+' 0 R /Count 1 >>').encode()
    objects[catalog-1]=('<< /Type /Catalog /Pages 2 0 R /Outlines '+str(outline)+' 0 R'+extra+' >>').encode()
    objects[parent-1]=('<< /Type /Pages /Kids ['+' '.join(str(p)+' 0 R' for p in page_ids)+'] /Count '+str(pages)+' >>').encode()
    result=b'%PDF-1.4\n';offsets=[0]
    for index,obj in enumerate(objects,1):
        offsets.append(len(result));result+=str(index).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start=len(result);result+=('xref\n0 '+str(len(objects)+1)+'\n0000000000 65535 f \n').encode()
    result+=b''.join(('%010d 00000 n \n'%offset).encode() for offset in offsets[1:])
    result+=('trailer\n<< /Size '+str(len(objects)+1)+' /Root 1 0 R /Info '+str(info)+' 0 R >>\nstartxref\n'+str(start)+'\n%%EOF\n').encode()
    return result
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('folder',type=Path);args=parser.parse_args();args.folder.mkdir(parents=True,exist_ok=True)
    (args.folder/'public-forms.pdf').write_bytes(pdf())
    (args.folder/'public-large.pdf').write_bytes(pdf(250,False))
    print('Generated synthetic public two-page form/annotation/outline and 250-page fixtures.')

