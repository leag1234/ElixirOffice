#!/usr/bin/env python3
"""Build and verify only synthetic fixtures against the actual ODF encryptor."""
import argparse,hashlib,json,os,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
 p=argparse.ArgumentParser()
 for name in ['core','native-libs','native-build','thirdparty','node','out']:p.add_argument('--'+name,type=Path,required=True)
 p.add_argument('--baseline',type=Path);a=p.parse_args();out=a.out.resolve();out.mkdir(parents=True,exist_ok=False)
 for name in ['tmp','home']:(out/name).mkdir()
 env={**os.environ,'LD_LIBRARY_PATH':str(a.native_libs)+':'+str(a.thirdparty/'icu/lib'),
  'TMPDIR':str(out/'tmp'),'HOME':str(out/'home'),'NODE_OPTIONS':'--max-old-space-size=2048'}
 commands=[]
 def run(cmd,name):
  commands.append(cmd);(out/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
  with(out/(name+'.log')).open('w')as log:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
  if r.returncode:
   print((out/(name+'.log')).read_text()[-16000:]);raise SystemExit(r.returncode)
 flags=['c++','-std=c++17','-O0','-ffunction-sections','-fdata-sections','-fvisibility=hidden','-fvisibility-inlines-hidden',
  '-D_LINUX','-DLINUX','-DUNICODE','-D_UNICODE','-D_FILE_OFFSET_BITS=64','-DCRYPTOPP_DISABLE_ASM',
  '-I'+str(a.core),'-I'+str(a.thirdparty/'boost/include')]
 source=a.core/'OfficeCryptReader/source/CryptTransform.cpp'
 for name,path in [('writer',source),('fixtures',HERE/'native.cpp')]:run([*flags,'-c',str(path),'-o',str(out/(name+'.o'))],name)
 archive=a.native_build/'x2tlib/CryptoPPLib/libCryptoPPLib.a';binary=out/'odf-padding'
 run(['c++','-Wl,--gc-sections','-Wl,-Map='+str(out/'link.map'),str(out/'writer.o'),str(out/'fixtures.o'),
  str(archive),'-L'+str(a.native_libs),'-lkernel','-lUnicodeConverter','-lpthread','-ldl','-o',str(binary)],'link')
 run([str(binary),str(out/'fixtures')],'generate')
 provenance={'writer_sha256':digest(source),'driver_sha256':digest(HERE/'native.cpp'),'checker_sha256':digest(HERE/'check.cjs'),
  'cryptopp_archive_sha256':digest(archive),'kernel_sha256':digest(a.native_libs/'libkernel.so'),'binary_sha256':digest(binary),
  'qualification':'Actual ODFEncryptor source compiled and linked directly; retained Crypto++/kernel dependencies; independent Node AES/DEFLATE/checksum checks; synthetic data only, not a full ODF package/runtime export.'}
 (out/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
 cmd=[str(a.node),str(HERE/'check.cjs'),str(out/'fixtures')]
 if a.baseline:cmd.append(str(a.baseline))
 run(cmd,'independent')
 print((out/'independent.log').read_text());return 0
if __name__=='__main__':raise SystemExit(main())
