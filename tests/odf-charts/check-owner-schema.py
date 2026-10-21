#!/usr/bin/env python3
"""Validate every owner-fixture XML part, keeping raw and calcext-only results."""
import argparse,hashlib,json,subprocess,sys,zipfile,resource
from pathlib import Path
def main():
 p=argparse.ArgumentParser();p.add_argument('--fixtures',type=Path,required=True);p.add_argument('--schema',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();parts=a.output.parent/(a.output.stem+'-parts');parts.mkdir(exist_ok=False)
 verifier=Path(__file__).with_name('check-schema.py');rows=[]
 def bound():resource.setrlimit(resource.RLIMIT_AS,(1024**3,1024**3))
 for item in json.loads((a.fixtures/'expected.json').read_text()):
  archive=a.fixtures/item['file'];assert hashlib.sha256(archive.read_bytes()).hexdigest()==item['sha256'],'Fixture hash mismatch'
  with zipfile.ZipFile(archive)as z:
   for name in z.namelist():
    if not name.endswith('.xml'):continue
    raw=z.read(name)
    if item['password']and name!='META-INF/manifest.xml':
     folder=a.fixtures/'password-encryption'
     assert raw==(folder/(name+'.cipher')).read_bytes(),'ZIP ciphertext differs from independently checked ciphertext'
     raw=(folder/(name+'.plain')).read_bytes()
    part=parts/item['file']/name;part.parent.mkdir(parents=True,exist_ok=True);part.write_bytes(raw)
    schema=a.schema/('OpenDocument-v1.3-manifest-schema.rng'if name=='META-INF/manifest.xml'else'OpenDocument-v1.3-schema.rng')
    r={'file':item['file'],'part':name,'sha256':hashlib.sha256(raw).hexdigest(),'decryptedSyntheticPart':bool(item['password']and name!='META-INF/manifest.xml')}
    try:
     done=subprocess.run([sys.executable,str(verifier),'--part',str(part),'--schema',str(schema)],capture_output=True,text=True,timeout=25,preexec_fn=bound);r.update(json.loads(done.stdout));r['exit']=done.returncode
    except subprocess.TimeoutExpired:r.update(rawValid=False,timeout=25)
    except Exception as e:r.update(rawValid=False,error=str(e))
    rows.append(r)
 result={'result':'PASS_EXTENDED'if len(rows)==27 and all(r['rawValid']or r.get('diagnosticValid',False)for r in rows)else'FAIL','rawResult':'PASS'if rows and all(r['rawValid']for r in rows)else'FAIL','parts':rows,'qualification':'Three synthetic complete ODS packages: 8 XML parts plus manifest each. Protected payloads are the exact plaintext paired with independently checked CBC ciphertext. Only calcext:value-type is filtered diagnostically; raw results remain unchanged.'}
 a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'result':result['result'],'rawResult':result['rawResult'],'parts':len(rows),'rawFailures':sum(not r['rawValid']for r in rows)}));return 0 if result['result']=='PASS_EXTENDED'else 1
if __name__=='__main__':raise SystemExit(main())
