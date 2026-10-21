#!/usr/bin/env python3
"""Compile real chart units against explicit retained native dependency archives."""
import argparse,hashlib,json,os,shlex,subprocess,sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
SOURCES=[
    'OdfFile/Writer/Format/odf_chart_context.cpp',
    'OdfFile/Reader/Format/chart_build_oox.cpp',
    'OdfFile/Writer/Converter/ConverterChart.cpp',
    'OdfFile/Reader/Format/table_docx.cpp',
    'OdfFile/Writer/Format/odf_conversion_context.cpp',
]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    parser=argparse.ArgumentParser()
    for option in ['core','native-build','thirdparty','native-libs','out']:parser.add_argument('--'+option,required=True,type=Path)
    args=parser.parse_args();out=args.out.resolve();out.mkdir(parents=True,exist_ok=False)
    for name in ['tmp','home']:(out/name).mkdir()
    ninja_path=args.native_build/'build.ninja';ninja=ninja_path.read_text()
    block=ninja.split('build x2tlib/OdfFormatLib/CMakeFiles/OdfFormatLib.dir/odf_writer.cpp.o:')[1].split('\nbuild ')[0]
    definitions=shlex.split(next(line.split(' = ',1)[1]for line in block.splitlines()if line.startswith('  DEFINES =')))
    env={**os.environ,'LD_LIBRARY_PATH':str(args.native_libs)+':'+str(args.thirdparty/'icu/lib'),
        'TMPDIR':str(out/'tmp'),'HOME':str(out/'home'),'NODE_OPTIONS':'--max-old-space-size=2048'}
    commands=[]
    def run(command,name):
        commands.append(command);(out/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
        with(out/(name+'.log')).open('w')as log:result=subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:
            print((out/(name+'.log')).read_text()[-12000:]);raise SystemExit(result.returncode)
    flags=['c++','-std=c++17','-O0','-ffunction-sections','-fdata-sections','-fvisibility=hidden','-fvisibility-inlines-hidden',
        '-I'+str(args.core),'-I'+str(args.core/'OdfFile/Common'),'-I'+str(args.core/'UnicodeConverter'),
        '-I'+str(args.thirdparty/'icu/include'),'-I'+str(args.thirdparty/'boost/include'),*definitions]
    objects=[];source_hashes={}
    for i,source in enumerate([*(args.core/p for p in SOURCES),HERE/'native.cpp']):
        obj=out/(str(i)+'.o');run([*flags,'-c',str(source),'-o',str(obj)],'compile-'+str(i));objects.append(str(obj));source_hashes[str(source)]=sha(source)
    objects.extend(str(args.native_build/'x2tlib/CMakeFiles/x2tlib.dir/build/core-parity2'/p)for p in [
        'Common/OfficeFileFormatChecker2.cpp.o','OOXML/Base/Unit.cpp.o'])
    block=ninja.split('build x2tlib/libx2tlib.so:')[1].split('\nbuild ')[0]
    links=shlex.split(next(line.split(' = ',1)[1]for line in block.splitlines()if line.startswith('  LINK_LIBRARIES =')))
    def remap(value):
        if value.startswith('x2tlib/'):return str(args.native_build/value)
        if value.startswith('/build/3rdParty/install/'):return str(args.thirdparty/value[len('/build/3rdParty/install/'):])
        return value
    links=[remap(value)for value in links if not value.startswith('-Wl,-rpath')]
    binary=out/'charts'
    run(['c++','-Wl,--gc-sections','-Wl,--allow-multiple-definition','-Wl,-Map='+str(out/'link.map'),
        *objects,'-Wl,--start-group',*links,'-Wl,--end-group','-L'+str(args.thirdparty/'icu/lib'),'-o',str(binary)],'link')
    for header in ['OdfFile/Common/chart_cache_limits.h','OdfFile/Reader/Format/chart_build_oox.h','OdfFile/Writer/Format/odf_chart_context.h']:
        path=args.core/header
        if path.exists():source_hashes[str(path)]=sha(path)
    receipt={'sources':source_hashes,'ninja_sha256':sha(ninja_path),
        'archives':{value:sha(Path(value))for value in set(links)if value.endswith('.a')},
        'binary_sha256':sha(binary),
        'qualification':'Selected production chart units compiled first; retained native archives supply other dependencies. Duplicate-symbol selection is explicit and link.map is retained. This is source-unit qualification, not a matched full converter or Wasm runtime.'}
    (out/'provenance.json').write_text(json.dumps(receipt,indent=2)+'\n')
    run(['python3',str(HERE/'check-native.py'),'--binary',str(binary),'--output',str(out/'matrix')],'matrix')
    print((out/'matrix.log').read_text())
    return 0
if __name__=='__main__':raise SystemExit(main())
