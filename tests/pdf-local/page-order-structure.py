#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Independent pypdf checks; Poppler separately verifies appearance and targets."""
import argparse,json,re
from pypdf import PdfReader
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--reference');p.add_argument('--named',action='store_true');p.add_argument('file');p.add_argument('logical');p.add_argument('--input',action='store_true')
a=p.parse_args();logical=[int(n) for n in a.logical.split(',')]
reader=PdfReader(a.file,strict=True)
depths=[]
def walk(node,depth=0):
    node=node.get_object()
    if node['/Type']=='/Pages':
        assert '/Kids' in node
        if a.input:assert node['/Kids']
        count=sum(walk(child,depth+1) for child in node['/Kids'])
        assert int(node['/Count'])==count
        return count
    assert node['/Type']=='/Page'
    depths.append(depth)
    if a.input:
        assert all(key not in node for key in ['/Resources','/MediaBox','/CropBox','/Rotate']),node
        parent=node['/Parent'].get_object()
        assert all(key in parent for key in ['/Resources','/MediaBox','/CropBox','/Rotate'])
    return 1
assert walk(reader.trailer['/Root']['/Pages'])==5
if a.input:
    assert max(depths)>=4 and min(depths)>=3,depths
    if a.named:
        tree=reader.trailer['/Root']['/Names']['/Dests']
        assert len(tree['/Kids'])==2
pages=list(reader.pages);assert len(pages)==5
page_ids=[(p.indirect_reference.idnum,p.indirect_reference.generation) for p in pages]
reference=PdfReader(a.reference,strict=True) if a.reference else None
original_ids=[(p.indirect_reference.idnum,p.indirect_reference.generation) for p in reference.pages] if reference else None
attributes=[]
for index,(page,identity) in enumerate(zip(pages,logical)):
    offset=identity-1
    if original_ids:assert page_ids[index]==original_ids[offset],(page_ids,original_ids,logical)
    assert re.search(r'Public PDF page '+str(identity)+r' - ElixirOffice',page.extract_text())
    assert list(page.mediabox)==[0,0,612+offset*10,792+offset*20]
    assert list(page.cropbox)==[offset,offset*2,612+offset*9,792+offset*18]
    assert int(page.get('/Rotate',0))%360==offset%4*90
    resources=page['/Resources']
    assert '/Public'+str(identity) in resources['/ColorSpace']
    assert resources['/Font']['/F1']['/BaseFont']=='/Helvetica'
    if identity==4:assert resources['/XObject']['/ImPublic']['/Subtype']=='/Image'
    attributes.append({'logical':identity,'pageObjectId':page_ids[index],'mediaBox':list(page.mediabox),'cropBox':list(page.cropbox),'rotate':int(page.get('/Rotate',0))%360,'resourceCanary':'/Public'+str(identity)})
destinations={}
for name,identity in ([('public-first',1),('public-last',5)] if a.named else []):
    destination=reader.named_destinations[name]
    page=reader.get_destination_page_number(destination)
    assert page==logical.index(identity),(name,page,logical)
    destinations[name]=page
link=next(x.get_object() for x in pages[logical.index(2)]['/Annots'] if x.get_object()['/Subtype']=='/Link')
destination=link['/Dest']
if isinstance(destination,list):
    ref=destination[0];link_page=page_ids.index((ref.idnum,ref.generation))
else:
    link_page=reader.get_destination_page_number(reader.named_destinations[str(destination)])
assert link_page==logical.index(5),(link_page,logical)
field=next(f.get_object() for f in reader.trailer['/Root']['/AcroForm']['/Fields'] if f.get_object().get('/T')=='public_name')
bound=field.raw_get('/P');binding=(bound.idnum,bound.generation)
assert binding==page_ids[logical.index(1)],(binding,page_ids,logical)
assert any(x.idnum==field.indirect_reference.idnum for x in pages[logical.index(1)]['/Annots'])
assert str(field['/V'])==('Initial public value' if a.input else 'G2 order public value')
result={'reader':'pypdf','inputProof':a.input,'pageTreeDepths':depths,'logical':logical,'inheritedResourcesMediaBoxRotatePreserved':True,'namedDestinations':destinations,'widgetPage':logical.index(1),'widgetPMatchesPageReference':True,'internalLinkPage':link_page,'pageObjectIdsStable':True if original_ids else None,'pageAttributes':attributes}
print(json.dumps(result))

