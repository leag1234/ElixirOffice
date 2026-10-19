# SPDX-License-Identifier: AGPL-3.0-only
import sys,zipfile,xml.etree.ElementTree as E
from pathlib import Path
source,target=map(Path,sys.argv[1:3]);w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
with zipfile.ZipFile(source) as z:
 root=E.fromstring(z.read("word/document.xml"));body=root.find("{"+w+"}body");section=body.find("{"+w+"}sectPr")
 for child in list(body):body.remove(child)
 for i in range(1,301):
  p=E.SubElement(body,"{"+w+"}p")
  if i>1:E.SubElement(E.SubElement(p,"{"+w+"}pPr"),"{"+w+"}pageBreakBefore")
  t=E.SubElement(E.SubElement(p,"{"+w+"}r"),"{"+w+"}t");t.text="PUBLIC PDF EXPORT PAGE %04d. This generated document contains no private information."%i
 if section is not None:body.append(section)
 with zipfile.ZipFile(target,"w",zipfile.ZIP_DEFLATED) as output:
  for info in z.infolist():output.writestr(info,E.tostring(root,encoding="utf-8",xml_declaration=True) if info.filename=="word/document.xml" else z.read(info.filename))
print("Generated public DOCX with300 explicit pages:",target)
