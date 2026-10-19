#!/usr/bin/env python3
"""Verify actual product reader, DOM and canonicalization wrappers with monitored I/O."""
from pathlib import Path
import json,os,subprocess,sys
binary=Path(sys.argv[1]).resolve();root=Path(sys.argv[2]).resolve();root.mkdir(parents=True,exist_ok=False)
fixture=root/"public-root.xml"
fixture.write_text('<!DOCTYPE root [<!ENTITY ext SYSTEM "file:///public-external.txt">]><root>&ext;</root>')
modes=["reader-plain","dom-plain","dom-xinclude-not-executed","reader-memory","reader-wide","reader-buffer","reader-file","reader-restart","reader-network","reader-dtd-file","reader-dtd-network","dom-hostile","canonical-plain","canonical-hostile","nonet-root-http","nonet-root-ftp"]
rows=[]
for mode in modes:
 r=subprocess.run([str(binary),mode],capture_output=True,text=True,timeout=30,env={**os.environ,"EO_XML_WRAPPER_FILE":str(fixture)})
 row=dict(mode=mode,passed=r.returncode==0,exit=r.returncode,stdout=r.stdout,stderr=r.stderr);rows.append(row)
 print(("PASS " if row["passed"] else "FAIL ")+mode,flush=True)
(root/"results.json").write_text(json.dumps(rows,indent=2)+"\n")
sys.exit(0 if all(x["passed"] for x in rows) else 1)
