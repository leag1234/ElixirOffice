#!/usr/bin/env python3
"""Build a standalone ODF writer unit and prepare synthetic interoperability fixtures."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser()
 for name in ['cbc-core','native-build','thirdparty','native-libs','node','matrix','out']:p.add_argument('--'+name,type=Path,required=True)
 a=p.parse_args();a.out.mkdir(parents=True,exist_ok=False);commands=[]
 env={**os.environ,'LD_LIBRARY_PATH':str(a.native_libs)+':'+str(a.thirdparty/'icu/lib'),'NODE_OPTIONS':'--max-old-space-size=2048'}
 def run(cmd,name):
  commands.append(cmd);(a.out/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
  with(a.out/(name+'.log')).open('w')as log:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  if r.returncode:print((a.out/(name+'.log')).read_text()[-10000:]);raise SystemExit(r.returncode)
 flags=['c++','-std=c++17','-O0','-ffunction-sections','-fdata-sections','-fvisibility=hidden','-fvisibility-inlines-hidden','-D_LINUX','-DLINUX','-DUNICODE','-D_UNICODE','-D_FILE_OFFSET_BITS=64','-DCRYPTOPP_DISABLE_ASM','-I'+str(a.cbc_core),'-I'+str(a.thirdparty/'boost/include')]
 source=a.cbc_core/'OfficeCryptReader/source/CryptTransform.cpp'
 run([*flags,'-c',str(source),'-o',str(a.out/'writer.o')],'writer')
 run([*flags,'-c',str(HERE/'encrypt-synthetic-parts.cpp'),'-o',str(a.out/'fixture.o')],'helper')
 archive=a.native_build/'x2tlib/CryptoPPLib/libCryptoPPLib.a';binary=a.out/'encrypt-parts'
 run(['c++','-Wl,--gc-sections','-Wl,-Map='+str(a.out/'link.map'),str(a.out/'writer.o'),str(a.out/'fixture.o'),str(archive),'-L'+str(a.native_libs),'-lkernel','-lUnicodeConverter','-lpthread','-ldl','-o',str(binary)],'link')
 run(['python3',str(HERE/'prepare-libreoffice.py'),'--matrix',str(a.matrix),'--out',str(a.out/'fixtures'),'--encryptor',str(binary)],'prepare')
 run([str(a.node),str(HERE/'check-fixture-crypto.cjs'),str(a.out/'fixtures/password-encryption')],'independent')
 receipt={'cbcWriterSourceSHA256':sha(source),'cryptoppArchiveSHA256':sha(archive),'binarySHA256':sha(binary),'files':{n:sha(HERE/n)for n in ['encrypt-synthetic-parts.cpp','prepare-libreoffice.py','check-fixture-crypto.cjs','check-libreoffice.py']},'chartSourceProvenanceSHA256':sha(a.matrix.parent/'provenance.json'),'qualification':'Native chart output packaged with synthetic worksheets, then encrypted by a separate executable containing the separate CBC source. No source-branch combination or matched full/runtime export.'}
 (a.out/'provenance.json').write_text(json.dumps(receipt,indent=2)+'\n');print((a.out/'independent.log').read_text());print('OWNER_FIXTURES_PREPARED_LO_UNEXECUTED')
if __name__=='__main__':main()
