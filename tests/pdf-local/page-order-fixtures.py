#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Wholly synthetic five-page PDF page-identity, destination and appearance proofs."""
import argparse,importlib.util,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('preserve',Path(__file__).with_name('preservation-fixtures.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
def make(folder):
    p.make(folder)
    items=p.objects(p.base.pdf(5,True))
    pages=[5,7,9,11,13]
    for index,page in enumerate(pages):
        items[page-1]=items[page-1].replace(b'/MediaBox [0 0 612 792]',('/MediaBox [0 0 %d %d] /CropBox [%d %d %d %d]'%(612+index*10,792+index*20,index,index*2,612+index*9,792+index*18)).encode())
    info=next(i for i,obj in enumerate(items,1) if b'/Subject (Synthetic PDF fixture)' in obj)
    items[info-1]=items[info-1][:-2]+b' /Creator (Public page-order generator) >>'
    outline=next(i for i,obj in enumerate(items,1) if b'/Type /Outlines' in obj)
    first=next(i for i,obj in enumerate(items,1) if b'/Title (First public page)' in obj)
    child=len(items)+1
    items.append(('<< /Title (Last nested public page) /Parent %d 0 R /Dest [13 0 R /Fit] >>'%first).encode())
    items[first-1]=items[first-1][:-2]+(' /First %d 0 R /Last %d 0 R /Count 1 >>'%(child,child)).encode()
    items[outline-1]=items[outline-1].replace(b'/Count 1',b'/Count 2')
    link=len(items)+1
    items.append(b'<< /Type /Annot /Subtype /Link /Rect [72 690 500 740] /P 7 0 R /Dest [13 0 R /Fit] /F 4 >>')
    items[6]=items[6][:-2]+(' /Annots [%d 0 R] >>'%link).encode()
    image=len(items)+1;rgb=bytes([255,0,0])*4
    items.append(b'<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 12 >>\nstream\n'+rgb+b'\nendstream')
    content=len(items)+1;command=b'q 60 0 0 60 350 620 cm /ImPublic Do Q'
    items.append(b'<< /Length '+str(len(command)).encode()+b' >>\nstream\n'+command+b'\nendstream')
    items[10]=items[10].replace(b'>> >> /Contents',('>> /XObject << /ImPublic %d 0 R >> >> /Contents'%image).encode()).replace(b'/Contents 10 0 R',('/Contents [10 0 R %d 0 R]'%content).encode())
    metadata=len(items)+1
    xml=b'<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:description>Public page-order metadata canary</dc:description></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
    items.append(b'<< /Type /Metadata /Subtype /XML /Length '+str(len(xml)).encode()+b' >>\nstream\n'+xml+b'\nendstream')
    items[0]=items[0][:-2]+(' /Metadata %d 0 R /Lang (en) >>'%metadata).encode()
    data=p.encode(items)
    (folder/'public-page-order.pdf').write_bytes(data)
    (folder/'public-page-order-compressed.pdf').write_bytes(p.compressed(data))
    # Five leaf wrappers exercise inherited attributes through multiple Pages
    # levels. No leaf Page has Resources, MediaBox or Rotate of its own.
    nested=list(items);wrappers=[]
    for index,page in enumerate(pages):
        body=nested[page-1]
        media=re.search(rb'/MediaBox (\[[^]]*\])',body)[1]
        crop=re.search(rb'/CropBox (\[[^]]*\])',body)[1]
        body=re.sub(rb' /CropBox \[[^]]*\]',b'',body)
        body=re.sub(rb' /MediaBox \[[^]]*\]',b'',body)
        body=re.sub(rb' /Resources << /Font << /F1 3 0 R >> (?:/XObject << /ImPublic \d+ 0 R >> )?>>',b'',body)
        assert b'/Resources' not in body and b'/MediaBox' not in body
        parent=len(nested)+1;wrappers.append(parent)
        nested[page-1]=body.replace(b'/Parent 2 0 R',('/Parent %d 0 R'%parent).encode())
        nested.append(b'<< /Type /Pages /Parent PARENT /Kids ['+str(page).encode()+b' 0 R] /Count 1 /MediaBox '+media+b' /CropBox '+crop+b' /Rotate '+str(index%4*90).encode()+(' /Resources << /Font << /F1 3 0 R >> /XObject << /ImPublic %d 0 R >> /ColorSpace << /Public%d /DeviceRGB >> >> >>'%(image,index+1)).encode())
    branch_a=len(nested)+1;branch_b=branch_a+1;branch_c=branch_a+2
    def branch(kids,count,parent):
        return ('<< /Type /Pages /Parent %d 0 R /Kids [%s] /Count %d >>'%(parent,' '.join('%d 0 R'%k for k in kids),count)).encode()
    nested.extend([branch(wrappers[:2],2,2),branch([branch_c,wrappers[4]],3,2),branch(wrappers[2:4],2,branch_b)])
    for index,parent in enumerate(wrappers):
        nested[parent-1]=nested[parent-1].replace(b'PARENT',('%d 0 R'%(branch_a if index<2 else branch_c if index<4 else branch_b)).encode())
    nested[1]=('<< /Type /Pages /Kids [%d 0 R %d 0 R] /Count 5 /Resources << /Font << /F1 3 0 R >> /XObject << /ImPublic %d 0 R >> >> >>'%(branch_a,branch_b,image)).encode()
    inherited=p.encode(nested)
    (folder/'public-page-order-inherited.pdf').write_bytes(inherited)
    (folder/'public-page-order-inherited-compressed.pdf').write_bytes(p.compressed(inherited))
    names=len(nested)+1
    nested.extend([
        ('<< /Kids [%d 0 R %d 0 R] >>'%(names+1,names+2)).encode(),
        b'<< /Limits [(public-first) (public-first)] /Names [(public-first) [5 0 R /Fit]] >>',
        b'<< /Limits [(public-last) (public-last)] /Names [(public-last) [13 0 R /Fit]] >>'])
    nested[0]=nested[0][:-2]+(' /Names << /Dests %d 0 R >> >>'%names).encode()
    nested[first-1]=nested[first-1].replace(b'/Dest [5 0 R /Fit]',b'/Dest (public-first)')
    nested[child-1]=nested[child-1].replace(b'/Dest [13 0 R /Fit]',b'/Dest (public-last)')
    nested[link-1]=nested[link-1].replace(b'/Dest [13 0 R /Fit]',b'/Dest (public-last)')
    data=p.encode(nested)
    (folder/'public-page-order-nested.pdf').write_bytes(data)
    (folder/'public-page-order-nested-compressed.pdf').write_bytes(p.compressed(data))
    for name,replacement in [
        ('named-bad-page',b'3 0 R /Fit'),
        ('named-numeric-page',b'0 /Fit'),
        ('named-bad-mode',b'5 0 R /Unknown'),
    ]:
        bad=list(nested);bad[names]=bad[names].replace(b'5 0 R /Fit',replacement)
        (folder/('public-'+name+'.pdf')).write_bytes(p.encode(bad))
    bad=list(nested);bad[names-1]=('<< /Kids [%d 0 R] >>'%names).encode()
    (folder/'public-named-cycle.pdf').write_bytes(p.encode(bad))
    bad=list(nested);bad[0]=bad[0].replace(b'/Names <<',b'/Names << /JavaScript << /Names [] >>')
    (folder/'public-named-extra-tree.pdf').write_bytes(p.encode(bad))
    bad=list(items);bad[0]=bad[0][:-2]+b' /MarkInfo << /Marked true >> /StructTreeRoot << /Type /StructTreeRoot >> >>'
    (folder/'public-tagged-marker.pdf').write_bytes(p.encode(bad))
    print('Generated public five-page classic/compressed page-order fixtures with forms, annotations, nested outlines, internal link, image and XMP.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('folder',type=Path);make(parser.parse_args().folder)
