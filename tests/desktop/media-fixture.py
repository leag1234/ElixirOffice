#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Generate public one-second media and embed it in a temporary presentation copy.
import base64, math, struct, subprocess, sys, wave, zipfile
from pathlib import Path
from xml.etree import ElementTree as E
source,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
video=out/'public-video.webm';audio=out/'public-audio.wav'
subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=12:d=1','-an','-c:v','libvpx','-b:v','80k',str(video)],check=True)
with wave.open(str(audio),'wb') as wav:
 wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b''.join(struct.pack('<h',int(1000*math.sin(i*2*math.pi*440/8000))) for i in range(8000)))
poster=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==')
p='http://schemas.openxmlformats.org/presentationml/2006/main';a='http://schemas.openxmlformats.org/drawingml/2006/main';r='http://schemas.openxmlformats.org/officeDocument/2006/relationships';rel='http://schemas.openxmlformats.org/package/2006/relationships';ct='http://schemas.openxmlformats.org/package/2006/content-types'
# Native media readers expect the canonical Office namespace prefixes.
for prefix,namespace in [('p',p),('a',a),('r',r),('p14','http://schemas.microsoft.com/office/powerpoint/2010/main')]:E.register_namespace(prefix,namespace)
with zipfile.ZipFile(source) as package:entries={n:package.read(n) for n in package.namelist()}
slide=E.fromstring(entries['ppt/slides/slide1.xml']);tree=slide.find('{'+p+'}cSld/{'+p+'}spTree')
rels=E.fromstring(entries['ppt/slides/_rels/slide1.xml.rels']);content=E.fromstring(entries['[Content_Types].xml'])
for index,(kind,file,mime) in enumerate([('video',video,'video/webm'),('audio',audio,'audio/wav')],900):
 mid='rIdPublicMedia'+str(index);vid='rIdPublicVideo'+str(index);pid='rIdPublicPoster'+str(index);name=file.name
 pic=E.fromstring(f'<p:pic xmlns:p="{p}" xmlns:a="{a}" xmlns:r="{r}" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:nvPicPr><p:cNvPr id="{index}" name="Public {kind}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:{kind}File r:link="{vid}"/><p:extLst><p:ext uri="{{DAA4B4D4-6D71-4841-9C94-3DE7FCFBEE64}}"><p14:media r:embed="{mid}"/></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="{pid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="{(index-899)*1000000}" y="1000000"/><a:ext cx="2000000" cy="1200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')
 tree.append(pic)
 for ident,target,type_ in [(mid,name,'http://schemas.microsoft.com/office/2007/relationships/media'),(vid,name,r+'/'+kind),(pid,'public-poster.png',r+'/image')]:E.SubElement(rels,'{'+rel+'}Relationship',Id=ident,Target='../media/'+target,Type=type_)
 entries['ppt/media/'+name]=file.read_bytes()
 extension=file.suffix[1:]
 if not any(n.get('Extension')==extension for n in content):E.SubElement(content,'{'+ct+'}Default',Extension=extension,ContentType=mime)
if not any(n.get('Extension')=='png' for n in content):E.SubElement(content,'{'+ct+'}Default',Extension='png',ContentType='image/png')
entries['ppt/media/public-poster.png']=poster
entries['ppt/slides/slide1.xml']=E.tostring(slide,encoding='utf-8',xml_declaration=True)
E.register_namespace('',rel);entries['ppt/slides/_rels/slide1.xml.rels']=E.tostring(rels,encoding='utf-8',xml_declaration=True)
E.register_namespace('',ct);entries['[Content_Types].xml']=E.tostring(content,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(out/'public-media.pptx','w',zipfile.ZIP_DEFLATED) as package:
 for name,data in entries.items():package.writestr(name,data)
print('Generated public one-second video/audio presentation', (out/'public-media.pptx').stat().st_size)
