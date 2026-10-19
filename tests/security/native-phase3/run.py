#!/usr/bin/env python3
"""Exercise actual native ZIP/EPUB source with public synthetic fixtures."""
from pathlib import Path
import sys, os, json, zipfile, subprocess, base64
binary=Path(sys.argv[1]);root=Path(sys.argv[2]);root.mkdir(parents=True,exist_ok=False)
results=[]
def run(name,mode,entries,allowed=False,prepare=None,media=False,unsafe_media=False,unsafe_style=False):
 case=root/name;case.mkdir();out=case/"unpacked";out.mkdir();archive=case/("input."+("epub" if mode=="epub" else "zip"))
 if prepare:prepare(case)
 with zipfile.ZipFile(archive,"w",zipfile.ZIP_DEFLATED) as z:
  for path,data in entries.items():z.writestr(path,data)
 before={str(p.relative_to(case)) for p in case.rglob("*")}
 protected={p:p.read_bytes() for p in case.rglob("*") if p.is_file() and not p.is_relative_to(out) and p!=case/"converted.docx"}
 env=os.environ.copy();env.pop("ALLOW_PRIVATE_IP_ADDRESS",None)
 cmd=[str(binary),mode,str(archive),str(out),str(case/"converted.docx")]
 r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env=env,timeout=30)
 unexpected=[str(p.relative_to(case)) for p in case.rglob("*") if str(p.relative_to(case)) not in before and not p.is_relative_to(out) and p!=case/"converted.docx"]
 unchanged=all(p.exists() and p.read_bytes()==content for p,content in protected.items())
 valid=r.returncode in (0,1) and (r.returncode==0)==allowed and not unexpected and unchanged
 if allowed and mode.startswith("zip"):valid=valid and (out/("safe.txt" if mode=="zip-flat" else "nested/safe.txt")).read_text()=="PUBLIC_NESTED_FIXTURE"
 if allowed and mode=="epub":
  try:
   with zipfile.ZipFile(case/"converted.docx") as z:
    valid=valid and b"PUBLIC_NESTED_FIXTURE" in z.read("word/document.xml")
    if media:valid=valid and any(p.startswith("word/media/") and z.read(p)==pixel for p in z.namelist())
  except Exception:valid=False
 if unsafe_media or unsafe_style:
  valid=r.returncode in (0,1) and not unexpected and unchanged
  if r.returncode==0:
   try:
    with zipfile.ZipFile(case/"converted.docx") as z:
     if unsafe_media:valid=valid and not any(p.startswith("word/media/") for p in z.namelist())
     if unsafe_style:valid=valid and all(b"PUBLIC_OUTSIDE_STYLE" not in z.read(n) for n in z.namelist() if n.endswith(".xml"))
   except Exception:valid=False
 results.append(dict(name=name,pass_check=bool(valid),exit=r.returncode,unexpected=unexpected,protected_bytes_unchanged=unchanged,output=r.stdout[-400:]))
 print(("PASS " if valid else "FAIL ")+name,flush=True)
def epub(rootfile="OEBPS/content.opf",href="Text/chapter.xhtml",extra=None,body=None):
 opf='<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="'+href+'" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'
 entries={"META-INF/container.xml":'<container><rootfiles><rootfile full-path="'+rootfile+'"/></rootfiles></container>',
 "OEBPS/content.opf":opf,"OEBPS/Text/chapter.xhtml":body or '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Public fixture</title></head><body><p>PUBLIC_NESTED_FIXTURE</p></body></html>'}
 if extra:entries.update(extra)
 return entries,opf
run("zip-nested","zip",{"nested/":"","nested/safe.txt":"PUBLIC_NESTED_FIXTURE"},True)
for name,path in [("parent-directory","../escape/"),("parent-file","../escape.txt"),("terminal-parent","nested/../.."),("windows-parent","..\\escape/"),("drive-name","C:/escape.txt"),("absolute-name","/escape.txt"),("long-name","a"*5000)]:
 run("zip-"+name,"zip",{"nested/safe.txt":"PUBLIC_NESTED_FIXTURE",path:"PUBLIC_TEST"})
run("zip-flat-nested","zip-flat",{"nested/safe.txt":"PUBLIC_NESTED_FIXTURE"},True)
for name,path in [("dot","a/b/."),("parent","a/b/..")]:
 run("zip-flat-"+name,"zip-flat",{"nested/safe.txt":"PUBLIC_NESTED_FIXTURE",path:"PUBLIC_TEST"})
run("epub-nested","epub",epub()[0],True)
for name,rootfile in [("root-parent","../outside.opf"),("root-drive","C:/outside.opf"),("root-percent","%2e%2e/outside.opf")]:
 entries,opf=epub(rootfile=rootfile)
 run("epub-"+name,"epub",entries,prepare=lambda c,o=opf:((c/"outside.opf").write_text(o),(c/"Text").mkdir(),(c/"Text/chapter.xhtml").write_text('<html><body>PUBLIC_OUTSIDE_FIXTURE</body></html>')))
for name,href in [("spine-parent","../../outside.xhtml"),("spine-percent","%2e%2e/%2e%2e/outside.xhtml"),("spine-file-url","file:///outside.xhtml")]:
 entries,_=epub(href=href)
 run("epub-"+name,"epub",entries,prepare=lambda c:(c/"outside.xhtml").write_text('<html><body>PUBLIC_OUTSIDE_FIXTURE</body></html>'))
# Deterministic, valid PNG with checked IHDR/IDAT/IEND CRCs.
pixel=base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN4Lyj7HwAFLQIdUiTa/QAAAABJRU5ErkJggg==")
body='<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Public fixture</title></head><body><p>PUBLIC_NESTED_FIXTURE</p><img src="../Images/pixel.png" width="1" height="1"/></body></html>'
entries,_=epub(extra={"OEBPS/Images/pixel.png":pixel},body=body)
run("epub-nested-image","epub",entries,True,media=True)
entries,_=epub(body=body.replace("../Images/pixel.png","../../../outside.png"))
run("epub-image-parent","epub",entries,prepare=lambda c:(c/"outside.png").write_bytes(pixel),unsafe_media=True)
cssbody='<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="../../../outside.css"/></head><body><p>PUBLIC_NESTED_FIXTURE</p></body></html>'
entries,_=epub(body=cssbody)
run("epub-stylesheet-parent","epub",entries,prepare=lambda c:(c/"outside.css").write_text("p { font-family: PUBLIC_OUTSIDE_STYLE; }"),unsafe_style=True)

def root_link(case):
 outside=case/"outside-root";outside.mkdir();(outside/"target.txt").write_text("PUBLIC_OUTSIDE_SENTINEL")
 (case/"unpacked").rmdir();(case/"unpacked").symlink_to(outside,target_is_directory=True)
def linked_destination(case,hard=False,flat=False):
 outside=case/"outside.txt";outside.write_text("PUBLIC_OUTSIDE_SENTINEL")
 target=case/"unpacked"/("safe.txt" if flat else "target.txt")
 if hard:os.link(outside,target)
 else:target.symlink_to(outside)
def linked_ancestor(case):
 outside=case/"outside-dir";outside.mkdir();(outside/"target.txt").write_text("PUBLIC_OUTSIDE_SENTINEL")
 (case/"unpacked"/"linked").symlink_to(outside,target_is_directory=True)
run("zip-linked-root","zip",{"target.txt":"PUBLIC_REPLACEMENT"},prepare=root_link)
run("zip-clear-linked-root","zip-clear",{"target.txt":"PUBLIC_REPLACEMENT"},prepare=root_link)
run("zip-clear-nested","zip-clear",{"nested/safe.txt":"PUBLIC_NESTED_FIXTURE"},True)
run("zip-clear-linked-child","zip-clear",{"nested/safe.txt":"PUBLIC_NESTED_FIXTURE"},prepare=linked_ancestor)
def existing_nested(case):
 target=case/"unpacked"/"nested";target.mkdir();(target/"safe.txt").write_text("PUBLIC_OLD_FIXTURE")
 (target/"old.txt").write_text("PUBLIC_OLD_FIXTURE")
run("zip-clear-existing-nested","zip-clear",{"nested/safe.txt":"PUBLIC_NESTED_FIXTURE"},True,prepare=existing_nested)

run("zip-linked-ancestor","zip",{"linked/target.txt":"PUBLIC_REPLACEMENT"},prepare=linked_ancestor)
run("zip-hardlinked-destination","zip",{"target.txt":"PUBLIC_REPLACEMENT"},prepare=lambda c:linked_destination(c,hard=True))
run("zip-flat-linked-destination","zip-flat",{"nested/safe.txt":"PUBLIC_REPLACEMENT"},prepare=lambda c:linked_destination(c,flat=True))
run("zip-flat-hardlinked-destination","zip-flat",{"nested/safe.txt":"PUBLIC_REPLACEMENT"},prepare=lambda c:linked_destination(c,hard=True,flat=True))

for value,allowed in [("safe.txt",True),("nested image.png",True),(".. ",False),("...",False),("name.",False),("name ",False),("CON",False),("con.txt",False),("LPT1",False),("COM9.log",False),("COM1"+chr(0xB2),True),("COM"+chr(0xB2),False),("foo?bar",False)]:
 r=subprocess.run([str(binary),"win-component",value,"unused","unused"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 valid=r.returncode==(0 if allowed else 1)
 results.append(dict(name="win-component-"+value,pass_check=valid,exit=r.returncode,output=r.stdout))
 print(("PASS " if valid else "FAIL ")+"win-component-"+value,flush=True)

# URI-root references are package-root-relative, never host filesystem paths.
run("epub-package-rootfile", "epub", epub(rootfile="/OEBPS/content.opf")[0], True)
run("epub-package-spine", "epub", epub(href="/OEBPS/Text/chapter.xhtml")[0], True)
rootbody='<html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>PUBLIC_NESTED_FIXTURE</p><img src="/OEBPS/Images/pixel.png"/></body></html>'
entries,_=epub(extra={"OEBPS/Images/pixel.png":pixel},body=rootbody)
run("epub-package-root-image","epub",entries,True,media=True)
basebody='<html xmlns="http://www.w3.org/1999/xhtml"><head><base href="/OEBPS/Images/"/></head><body><p>PUBLIC_NESTED_FIXTURE</p><img src="pixel.png"/></body></html>'
entries,_=epub(extra={"OEBPS/Images/pixel.png":pixel},body=basebody)
run("epub-package-base-image","epub",entries,True,media=True)
for name,css in [
 ("css-import", '@import "../../../outside.css"; p { color: black; }'),
 ("css-url", 'p { background-image: url("../../../outside.png"); }'),
]:
 cssbody='<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="../Styles/local.css"/></head><body><p>PUBLIC_NESTED_FIXTURE</p></body></html>'
 entries,_=epub(extra={"OEBPS/Styles/local.css":css},body=cssbody)
 run("epub-"+name,"epub",entries,True,prepare=lambda c:((c/"outside.css").write_text("p { font-family: PUBLIC_OUTSIDE_STYLE; }"),(c/"outside.png").write_bytes(pixel)))
 if results[-1]["exit"]==0:
  with zipfile.ZipFile(root/("epub-"+name)/"converted.docx") as z:
   results[-1]["pass_check"] &= all(b"PUBLIC_OUTSIDE_STYLE" not in z.read(n) for n in z.namelist() if n.endswith(".xml")) and not any(n.startswith("word/media/") for n in z.namelist())

(root/"results.json").write_text(json.dumps(results,indent=2)+"\n")
passed=sum(x["pass_check"] for x in results);print("NATIVE_RESULTS",passed,len(results))
sys.exit(0 if passed==len(results) else 1)
