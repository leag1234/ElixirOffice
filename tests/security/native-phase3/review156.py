#!/usr/bin/env python3
"""Check local textPath pixels, extended local roots, empty spines and CRC cleanup."""
from pathlib import Path
import json,os,subprocess,sys,zipfile,struct,re
binary=Path(sys.argv[1]).resolve();root=Path(sys.argv[2]).resolve();root.mkdir(parents=True,exist_ok=False)
rows=[]
def invoke(name,mode,source,out,allowed=True,pixels=None):
 r=subprocess.run([str(binary),mode,str(source),str(out),"unused"],capture_output=True,text=True,timeout=45)
 match=re.search(r"RED (\d+)",r.stdout);red=int(match[1]) if match else None
 passed=r.returncode==(0 if allowed else 1)
 if pixels=="positive":passed=passed and red is not None and red>0
 if pixels=="zero":passed=passed and red==0
 row=dict(name=name,passed=passed,exit=r.returncode,red=red,stdout=r.stdout,stderr=r.stderr);rows.append(row)
 print(("PASS " if passed else "FAIL ")+name,flush=True);return row
svg=lambda b:'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16">'+b+'</svg>'
plain=svg('<text x="1" y="12" font-family="DejaVu Sans" font-size="8" fill="#ef111d">A</text>')
for mode in ["svg-file","svg-string"]:
 path=root/("plain-"+mode+".svg");path.write_text(plain);invoke("plain-font-"+mode,mode,path,root,pixels="positive")
for name,href,expected in [("local","#p1","positive"),("external","external.svg#p1","zero")]:
 path=root/(name+".svg");path.write_text(svg('<defs><path id="p1" d="M1 12 L16 12"/></defs><text><textPath href="'+href+'" font-family="DejaVu Sans" font-size="8" fill="#ef111d">A</textPath></text>'))
 for mode in ["svg-textpath-file","svg-textpath-string"]:invoke(name+"-"+mode,mode,path,root,pixels=expected)
for name,value,ok in [
 ("extended-local",r"\\?\C:\public\temp",True),
 ("extended-local-long","\\\\?\\C:\\"+"\\".join(["public"]*50),True),
 ("UNC",r"\\server\share",False),
 ("extended-UNC",r"\\?\UNC\server\share",False),
 ("device",r"\\.\C:\public",False),
 ("extended-drive-relative",r"\\?\C:public",False),
 ("extended-globalroot",r"\\?\GLOBALROOT\Device\public",False)]:
 invoke(name,"absolute",value,root,ok)
for name,spine in [("empty-spine","<spine/>"),("missing-spine","")]:
 case=root/name;case.mkdir();out=case/"unpacked";out.mkdir();archive=case/"input.epub"
 entries={"META-INF/container.xml":'<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',"OEBPS/content.opf":'<package xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="Text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest>'+spine+'</package>',"OEBPS/Text/chapter.xhtml":"<html><body>PUBLIC_NESTED_FIXTURE</body></html>"}
 with zipfile.ZipFile(archive,"w") as z:
  for key,value in entries.items():z.writestr(key,value)
 r=subprocess.run([str(binary),"epub",str(archive),str(out),str(case/"output.docx")],capture_output=True,text=True,timeout=45)
 rows.append(dict(name=name,passed=r.returncode==1,exit=r.returncode,stdout=r.stdout,stderr=r.stderr));print(("PASS " if r.returncode==1 else "FAIL ")+name,flush=True)
for name,member,mode in [("CRC-partial","nested/payload","zip"),("CRC-partial-flat","nested/payload","zip-flat")]:
 case=root/name;case.mkdir();out=case/"unpacked";out.mkdir();archive=case/"input.zip"
 with zipfile.ZipFile(archive,"w") as z:z.writestr(member,b"PUBLIC_PARTIAL_SENTINEL")
 data=bytearray(archive.read_bytes());local=data.find(b"PK\x03\x04");central=data.find(b"PK\x01\x02");struct.pack_into("<I",data,local+14,0);struct.pack_into("<I",data,central+16,0);archive.write_bytes(data)
 row=invoke(name,mode,archive,out,False);partial=out/("payload" if mode=="zip-flat" else member);row["partial_exists"]=partial.exists();row["passed"] &= not partial.exists();print(("PASS " if row["passed"] else "FAIL ")+name+"-cleanup",flush=True)
(root/"results.json").write_text(json.dumps(rows,indent=2)+"\n")
print("REVIEW156_RESULTS",sum(x["passed"] for x in rows),len(rows))
sys.exit(0 if all(x["passed"] for x in rows) else 1)
