#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Check public authored OOXML fixtures without consulting the AI adapter."""
from pathlib import Path
import sys,zipfile,posixpath,xml.etree.ElementTree as E
repo=Path(sys.argv[1]);out=Path(sys.argv[2])
sys.path.insert(0,str(repo/'tests/ai-slide'))
from fixtures import build,P,A
description=[{'title':'First','bullets':['Public one'],'notes':'Notes one','positions':[[100,200,300,400],[500,600,700,800]]},{'title':'Second','bullets':['Public two'],'notes':'Notes two'}]
target=out/'public.pptx';build(repo/'desktop/assets/templates/new.pptx',description,target)
with zipfile.ZipFile(target) as z:
    assert z.testzip() is None
    presentation=E.fromstring(z.read('ppt/presentation.xml'))
    assert len(presentation.find('{'+P+'}sldIdLst'))==2
    assert len(presentation.find('{'+P+'}sldMasterIdLst'))==2
    for index,item in enumerate(description,1):
        root=E.fromstring(z.read(f'ppt/slides/slide{index}.xml'))
        values=[n.text or '' for n in root.iter('{'+A+'}t')]
        assert values==[item['title'],*item['bullets']],values
        note=E.fromstring(z.read(f'ppt/notesSlides/notesSlide{index}.xml'))
        assert item['notes'] in [n.text for n in note.iter('{'+A+'}t')]
        if index==2:
            own=root.find('./{'+P+'}cSld/{'+P+'}spTree/{'+P+'}sp/{'+P+'}spPr/{'+A+'}xfrm')
            assert own is None or own.find('{'+A+'}off').get('x')!='100','Position inherited from previous authored slide'
    names=set(z.namelist())
    for name in names:
        if not name.endswith('.rels'):continue
        root=E.fromstring(z.read(name));folder=posixpath.dirname(posixpath.dirname(name))
        for node in root:
            if node.get('TargetMode')=='External':continue
            target=node.get('Target')
            resolved=target.lstrip('/') if target.startswith('/') else posixpath.normpath(folder+'/'+target)
            assert resolved.lstrip('/') in names,(name,resolved)
    theme=E.fromstring(z.read('ppt/theme/themePublicCitrus.xml'))
    assert theme.find('./{'+A+'}themeElements/{'+A+'}clrScheme/{'+A+'}accent1/{'+A+'}srgbClr').get('val')=='FF8800'
print('PASS independent OOXML, exact text, no position inheritance, closed relationships and contrasting theme')
