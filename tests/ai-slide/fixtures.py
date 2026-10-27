#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Author public PPTX task fixtures directly in OOXML, independently of AI tools."""
from pathlib import Path
import argparse, copy, json, posixpath, zipfile, xml.etree.ElementTree as E
P='http://schemas.openxmlformats.org/presentationml/2006/main'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PK='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
for name,uri in [('p',P),('a',A),('r',R)]:E.register_namespace(name,uri)
def xml(node):return E.tostring(node,encoding='utf-8',xml_declaration=True)
def replace_text(body,lines,size=2400):
    for p in list(body.findall('{'+A+'}p')):body.remove(p)
    for text in lines or ['']:
        p=E.SubElement(body,'{'+A+'}p')
        run=E.SubElement(p,'{'+A+'}r');E.SubElement(run,'{'+A+'}rPr',{'lang':'en-US','sz':str(size)})
        E.SubElement(run,'{'+A+'}t').text=text
        E.SubElement(p,'{'+A+'}endParaRPr',{'lang':'en-US','sz':str(size)})
def build(template,slides,out,second_theme=True):
    assert 1<=len(slides)<=10
    with zipfile.ZipFile(template) as z:parts={n:z.read(n) for n in z.namelist()}
    baseline=dict(parts)
    types=E.fromstring(parts['[Content_Types].xml'])
    def override(name,kind):
        if not any(n.get('PartName')=='/'+name for n in types):
            E.SubElement(types,'{'+CT+'}Override',{'PartName':'/'+name,'ContentType':kind})
    presentation=E.fromstring(parts['ppt/presentation.xml']);rels=E.fromstring(parts['ppt/_rels/presentation.xml.rels'])
    slide_list=presentation.find('{'+P+'}sldIdLst')
    assert slide_list is not None
    for node in list(slide_list):slide_list.remove(node)
    for node in list(rels):
        if node.get('Type','').endswith('/slide'):rels.remove(node)
    for i,description in enumerate(slides,1):
        slide=E.fromstring(baseline['ppt/slides/slide1.xml'])
        shapes=slide.findall('./{'+P+'}cSld/{'+P+'}spTree/{'+P+'}sp')
        assert len(shapes)==2
        replace_text(shapes[0].find('{'+P+'}txBody'),[description['title']],3200)
        replace_text(shapes[1].find('{'+P+'}txBody'),description.get('bullets',[]))
        for shape,position in zip(shapes,description.get('positions',[])):
            sppr=shape.find('{'+P+'}spPr');xfrm=sppr.find('{'+A+'}xfrm')
            if xfrm is None:xfrm=E.SubElement(sppr,'{'+A+'}xfrm')
            for child in list(xfrm):xfrm.remove(child)
            E.SubElement(xfrm,'{'+A+'}off',{'x':str(position[0]),'y':str(position[1])})
            E.SubElement(xfrm,'{'+A+'}ext',{'cx':str(position[2]),'cy':str(position[3])})
        name=f'ppt/slides/slide{i}.xml';parts[name]=xml(slide)
        slide_rels=E.fromstring(baseline['ppt/slides/_rels/slide1.xml.rels'])
        for node in slide_rels:
            if node.get('Type','').endswith('/notesSlide'):node.set('Target',f'../notesSlides/notesSlide{i}.xml')
        parts[f'ppt/slides/_rels/slide{i}.xml.rels']=xml(slide_rels)
        note=E.fromstring(baseline['ppt/notesSlides/notesSlide1.xml'])
        for shape in note.findall('./{'+P+'}cSld/{'+P+'}spTree/{'+P+'}sp'):
            ph=shape.find('./{'+P+'}nvSpPr/{'+P+'}nvPr/{'+P+'}ph')
            if ph is not None and ph.get('type')=='body':replace_text(shape.find('{'+P+'}txBody'),description.get('notes','').split('\n'))
        parts[f'ppt/notesSlides/notesSlide{i}.xml']=xml(note)
        note_rels=E.fromstring(baseline['ppt/notesSlides/_rels/notesSlide1.xml.rels'])
        for node in note_rels:
            if node.get('Type','').endswith('/slide'):node.set('Target',f'../slides/slide{i}.xml')
        parts[f'ppt/notesSlides/_rels/notesSlide{i}.xml.rels']=xml(note_rels)
        E.SubElement(slide_list,'{'+P+'}sldId',{'id':str(255+i),'{'+R+'}id':f'rIdPublicSlide{i}'})
        E.SubElement(rels,'{'+PK+'}Relationship',{'Id':f'rIdPublicSlide{i}','Type':R+'/slide','Target':f'slides/slide{i}.xml'})
        override(name,'application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
        override(f'ppt/notesSlides/notesSlide{i}.xml','application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml')
    if second_theme:
        master_rels=E.fromstring(parts['ppt/slideMasters/_rels/slideMaster1.xml.rels'])
        existing=[int(Path(n).stem.removeprefix('slideLayout')) for n in parts if n.startswith('ppt/slideLayouts/slideLayout') and n.endswith('.xml')]
        next_layout=max(existing)+1
        for relationship in master_rels:
            target=relationship.get('Target');kind=relationship.get('Type','')
            if kind.endswith('/slideLayout'):
                original=posixpath.normpath('ppt/slideMasters/'+target)
                new=f'ppt/slideLayouts/slideLayout{next_layout}.xml';next_layout+=1
                parts[new]=parts[original];relationship.set('Target','../slideLayouts/'+Path(new).name)
                old_rel=str(Path(original).parent/'_rels'/(Path(original).name+'.rels'))
                layout_rels=E.fromstring(parts[old_rel])
                for node in layout_rels:
                    if node.get('Type','').endswith('/slideMaster'):node.set('Target','../slideMasters/slideMaster2.xml')
                parts[str(Path(new).parent/'_rels'/(Path(new).name+'.rels'))]=xml(layout_rels)
                override(new,'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml')
            elif kind.endswith('/theme'):
                original=posixpath.normpath('ppt/slideMasters/'+target)
                theme=E.fromstring(parts[original]);theme.set('name','Public Citrus')
                colors=theme.find('./{'+A+'}themeElements/{'+A+'}clrScheme');colors.set('name','Public Citrus')
                accent=colors.find('{'+A+'}accent1')
                for node in list(accent):accent.remove(node)
                E.SubElement(accent,'{'+A+'}srgbClr',{'val':'FF8800'})
                new='ppt/theme/themePublicCitrus.xml';parts[new]=xml(theme)
                relationship.set('Target','../theme/themePublicCitrus.xml')
                override(new,'application/vnd.openxmlformats-officedocument.theme+xml')
        parts['ppt/slideMasters/slideMaster2.xml']=parts['ppt/slideMasters/slideMaster1.xml']
        parts['ppt/slideMasters/_rels/slideMaster2.xml.rels']=xml(master_rels)
        E.SubElement(presentation.find('{'+P+'}sldMasterIdLst'),'{'+P+'}sldMasterId',{'id':'2147483650','{'+R+'}id':'rIdPublicMaster2'})
        E.SubElement(rels,'{'+PK+'}Relationship',{'Id':'rIdPublicMaster2','Type':R+'/slideMaster','Target':'slideMasters/slideMaster2.xml'})
        override('ppt/slideMasters/slideMaster2.xml','application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml')
    parts['ppt/presentation.xml']=xml(presentation);parts['ppt/_rels/presentation.xml.rels']=xml(rels);parts['[Content_Types].xml']=xml(types)
    out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in parts.items():z.writestr(name,data)
    with zipfile.ZipFile(out) as z:assert z.testzip() is None
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--template',type=Path,required=True);parser.add_argument('--tasks',type=Path,required=True);parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    for task in json.loads(args.tasks.read_text()):build(args.template,task['slides'],args.out/(task['id']+'.pptx'))
