#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Builds tests/fixtures/pptx/sections.pptx from p01-cours-photosynthese.pptx: the slide ids get gaps (as after
deleting slides in PowerPoint) and a p14:sectionLst gives three sections: Intro (slides 1-3), Body (4-5), Wrap-up (6-8).
   python3 tests/slide-views/make_sections_fixture.py"""
import os, re, zipfile

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "../fixtures/pptx/p01-cours-photosynthese.pptx")
dst = os.path.join(here, "../fixtures/pptx/sections.pptx")
IDS = [256, 258, 259, 261, 262, 264, 265, 267]
SECTIONS = [("Intro", "{0A1B2C3D-0001-4000-8000-000000000001}", [0, 1, 2]),
            ("Body", "{0A1B2C3D-0002-4000-8000-000000000002}", [3, 4]),
            ("Wrap-up", "{0A1B2C3D-0003-4000-8000-000000000003}", [5, 6, 7])]

with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "ppt/presentation.xml":
            xml = data.decode("utf-8")
            n = [0]

            def renumber(m):
                i = n[0]; n[0] += 1
                return '<p:sldId id="%d" r:id="%s"/>' % (IDS[i], m.group(1))
            xml = re.sub(r'<p:sldId id="\d+" r:id="(rId\d+)"/>', renumber, xml)
            assert n[0] == len(IDS)
            sections = "".join('<p14:section name="%s" id="%s"><p14:sldIdLst>%s</p14:sldIdLst></p14:section>' % (
                name, guid, "".join('<p14:sldId id="%d"/>' % IDS[i] for i in idx)) for name, guid, idx in SECTIONS)
            ext = ('<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}"><p14:sectionLst '
                   'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">%s</p14:sectionLst></p:ext></p:extLst>' % sections)
            xml = xml.replace("</p:presentation>", ext + "</p:presentation>")
            data = xml.encode("utf-8")
        zout.writestr(item, data)
print("wrote", dst)
