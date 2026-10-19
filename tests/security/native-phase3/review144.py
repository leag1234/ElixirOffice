#!/usr/bin/env python3
"""Exercise global SVG and archive/EPUB policy using public synthetic inputs."""
import base64,json,os,resource,struct,subprocess,sys,zipfile,zlib
from pathlib import Path
binary=Path(sys.argv[1]).resolve();root=Path(sys.argv[2]).resolve();root.mkdir(parents=True,exist_ok=False)
rows=[]
def bounded():
 resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
def invoke(name,mode,source,output,allowed=True,red=None):
 r=subprocess.run([str(binary),mode,str(source),str(output),"unused"],capture_output=True,text=True,timeout=45,preexec_fn=bounded)
 passed=r.returncode==(0 if allowed else 1)
 if red is not None:passed=passed and ("RED "+str(red)+"\n") in r.stdout
 rows.append(dict(name=name,passed=passed,exit=r.returncode,stdout=r.stdout[-500:],stderr=r.stderr[-500:]))
 print(("PASS " if passed else "FAIL ")+name,flush=True)
 return r
def chunk(t,b):return struct.pack(">I",len(b))+t+b+struct.pack(">I",zlib.crc32(t+b))
png=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",16,16,8,2,0,0,0))+chunk(b"IDAT",zlib.compress((b"\0"+bytes([239,17,29])*16)*16))+chunk(b"IEND",b"")
(root/"outside.png").write_bytes(png)
def svg(body):return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16">'+body+'</svg>'
definitions='<defs><rect id="r" width="16" height="16" fill="#ef111d"/><linearGradient id="g"><stop stop-color="#ef111d"/><stop offset="1" stop-color="#ef111d"/></linearGradient></defs>'
for name,body,count in [
 ("data-png",'<image width="16" height="16" href="data:image/png;base64,'+base64.b64encode(png).decode()+'"/>',256),
 ("data-jpeg",'<image width="16" height="16" href="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDlKKKK8M/Yj//Z"/>',256),
 ("local-image",'<image width="16" height="16" href="outside.png"/>',0),
 ("traversal-image",'<image width="16" height="16" href="a/../outside.png"/>',0),
 ("data-substring",'<image width="16" height="16" href="outside-data:image/png;base64,'+base64.b64encode(png).decode()+'"/>',0),
 ("fragment-use",definitions+'<use href="#r"/>',256),
 ("external-use",definitions+'<use href="external.svg#r"/>',0),
 ("fragment-fill",definitions+'<rect width="16" height="16" fill="url(#g)"/>',256),
 ("external-fill",definitions+'<rect width="16" height="16" fill="url(external.svg#g)"/>',0),
 ("external-style",definitions+'<rect width="16" height="16" style="fill:url(external.svg#g)"/>',0),
 ("external-stylesheet",definitions+'<style>rect { fill:url(external.svg#g); }</style><rect width="16" height="16"/>',0),
 ]:
 path=root/(name+".svg");path.write_text(svg(body))
 for mode in ["svg-file","svg-string"]:invoke(name+"-"+mode,mode,path,root,red=count)
for name,value,ok in [("UNC-backslash",r"\\srv\share",False),("UNC-slash","//srv/share",False),("extended-local-root",r"\\?\C:\temp",True),("posix-root","/tmp/public-fixture",True),("colon-root",str(root/"temp:public"),True)]:
 invoke(name,"absolute",value,root,ok)
def archive(name,entries,patch=None):
 path=root/(name+".zip")
 with zipfile.ZipFile(path,"w",zipfile.ZIP_STORED) as z:
  for key,value in entries:z.writestr(key,value)
 if patch:
  data=bytearray(path.read_bytes());at=0
  while True:
   at=data.find(b"PK\x01\x02",at)
   if at<0:break
   if patch=="entry":struct.pack_into("<I",data,at+24,257*1024**2)
   elif patch=="total":
    struct.pack_into("<I",data,at+24,250*1024**2);struct.pack_into("<I",data,at+20,250*1024**2)
   elif patch=="crc":struct.pack_into("<I",data,at+16,0)
   at+=4
  if patch=="crc":
   at=data.find(b"PK\x03\x04");struct.pack_into("<I",data,at+14,0)
  path.write_bytes(data)
 return path
for name,extra in [("dot-directory",("./",b"")),("colon-name",("part:unusual/info.txt",b"public"))]:
 path=archive(name,[("nested/safe.txt",b"PUBLIC_NESTED_FIXTURE"),extra]);out=root/name;out.mkdir()
 invoke(name,"zip",path,out)
 rows[-1]["passed"] &= (out/"nested/safe.txt").read_bytes()==b"PUBLIC_NESTED_FIXTURE"
path=archive("colon-extraction-root",[("nested/safe.txt",b"PUBLIC_NESTED_FIXTURE")]);out=root/"extract:root";out.mkdir()
invoke("colon-extraction-root","zip",path,out)
rows[-1]["passed"] &= (out/"nested/safe.txt").exists()
for name,entries in [
 ("directory-first",[("a/b/",b""),("a/b/payload",b"PUBLIC_NESTED_FIXTURE")]),
 ("directory-out-of-order",[("a/b/",b""),("a/",b""),("a/b/payload",b"PUBLIC_NESTED_FIXTURE")])]:
 path=archive(name,entries);out=root/name;out.mkdir();invoke(name,"zip",path,out)
 rows[-1]["passed"] &= (out/"a/b/payload").exists() and (out/"a/b/payload").read_bytes()==b"PUBLIC_NESTED_FIXTURE"
for name,path in [
 ("valid",archive("valid",[("payload",b"PUBLIC_ARCHIVE_FIXTURE")])),
 ("entry",archive("entry",[("payload",b"public")],"entry")),
 ("total",archive("total",[("payload" if i==0 else str(i),b"public") for i in range(5)],"total")),
 ("count",archive("count",[("payload" if i==0 else str(i),b"") for i in range(65537)])),
 ("crc",archive("crc",[("payload",b"public")],"crc")),
 ]:
 for mode in ["zip","zip-load","zip-load-memory","zip-extract-memory"]:
  out=root/(name+"-"+mode);out.mkdir()
  invoke(name+"-"+mode,mode,path,out,name=="valid")
path=root/"ratio.zip"
with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as z:z.writestr("payload",b"\0"*(4*1024**2))
for mode in ["zip","zip-load","zip-load-memory","zip-extract-memory"]:
 out=root/("ratio-"+mode);out.mkdir();invoke("ratio-"+mode,mode,path,out,False)
# Every entry is checked, including ignored unusual names and directory members.
for name,key in [("directory-crc","nested/"),("dot-crc","./"),("colon-crc","part:unusual")]:
 path=archive(name,[(key,b"public")],"crc")
 for mode in ["zip","zip-extract-memory"]:
  out=root/(name+"-"+mode);out.mkdir();invoke(name+"-"+mode,mode,path,out,False)
def epub(name,ref,spine):
 case=root/name;case.mkdir();out=case/"unpacked";out.mkdir()
 opf='<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/><item id="optional" href="'+ref+'" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="'+spine+'"/></spine></package>'
 entries={"META-INF/container.xml":'<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',"OEBPS/content.opf":opf,"OEBPS/Text/chapter.xhtml":'<html xmlns="http://www.w3.org/1999/xhtml"><head/><body><p>PUBLIC_NESTED_FIXTURE</p></body></html>'}
 path=case/"input.epub"
 with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as z:
  for key,value in entries.items():z.writestr(key,value)
 r=subprocess.run([str(binary),"epub",str(path),str(out),str(case/"output.docx")],capture_output=True,text=True,timeout=45,preexec_fn=bounded)
 ok=spine=="chapter";passed=r.returncode==(0 if ok else 1)
 if passed and ok:
  with zipfile.ZipFile(case/"output.docx") as z:passed=b"PUBLIC_NESTED_FIXTURE" in z.read("word/document.xml")
 rows.append(dict(name=name,passed=passed,exit=r.returncode,stdout=r.stdout[-500:],stderr=r.stderr[-500:]));print(("PASS " if passed else "FAIL ")+name,flush=True)
for name,ref,spine in [("unused-remote","https://public.invalid/chapter.xhtml","chapter"),("unused-outside","../../outside.xhtml","chapter"),("remote-spine","https://public.invalid/chapter.xhtml","optional"),("empty-spine","","optional"),("fragment-spine","#fragment","optional")]:
 epub(name,ref,spine)
(root/"results.json").write_text(json.dumps(rows,indent=2)+"\n")
print("REVIEW144_RESULTS",sum(x["passed"] for x in rows),len(rows))
sys.exit(0 if all(x["passed"] for x in rows) else 1)
