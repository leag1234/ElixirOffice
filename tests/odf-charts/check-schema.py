#!/usr/bin/env python3
"""Report raw ODF 1.3 validation; foreign-attribute removal is diagnostic only."""
import argparse,hashlib,json,subprocess,sys,resource
from pathlib import Path
def worker(xml,schema):
    from lxml import etree as E
    rng=E.RelaxNG(E.parse(str(schema)));root=E.parse(str(xml))
    valid=rng.validate(root);result={'rawValid':valid,'rawErrors':[str(e)for e in rng.error_log][:12]}
    removed=0
    for node in root.iter():
        key='{urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0}value-type'
        if key in node.attrib:del node.attrib[key];removed+=1
    if removed:
        result.update(diagnosticOnly=True,removedCalcextValueType=removed,diagnosticValid=rng.validate(root),diagnosticErrors=[str(e)for e in rng.error_log][:12])
    print(json.dumps(result))
def main():
    p=argparse.ArgumentParser();p.add_argument('--matrix',type=Path);p.add_argument('--schema',type=Path,required=True);p.add_argument('--output',type=Path);p.add_argument('--part',type=Path)
    a=p.parse_args()
    if a.part:worker(a.part,a.schema);return 0
    assert a.matrix and a.output
    def bound():resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
    rows=[]
    for folder in sorted(a.matrix.glob('*-package')):
        for part in ['content.xml','META-INF/manifest.xml']:
            file=folder/part;schema=a.schema/('OpenDocument-v1.3-manifest-schema.rng'if part.endswith('manifest.xml')else'OpenDocument-v1.3-schema.rng')
            r={'case':folder.name,'part':part,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
            try:
                done=subprocess.run([sys.executable,__file__,'--part',str(file),'--schema',str(schema)],capture_output=True,text=True,timeout=25,preexec_fn=bound)
                r.update(json.loads(done.stdout));r['exit']=done.returncode
            except subprocess.TimeoutExpired:r.update(rawValid=False,timeout=25)
            except Exception as e:r.update(rawValid=False,error=str(e))
            rows.append(r)
    result={'rawResult':'PASS'if rows and all(r['rawValid']for r in rows)else'FAIL','result':'PASS_EXTENDED'if rows and all(r['rawValid']or r.get('diagnosticValid',False)for r in rows)else'FAIL','parts':rows,'qualification':'ODF1.3 plus LibreOffice calcext:value-type extension gate. Raw RNG results remain separate; the only diagnostic filter removes that exact extension attribute. Any other failure remains fatal.'}
    a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'result':result['result'],'parts':len(rows),'rawFailures':sum(not r['rawValid']for r in rows)}))
    return 0 if result['result']=='PASS_EXTENDED'else 1
if __name__=='__main__':raise SystemExit(main())
