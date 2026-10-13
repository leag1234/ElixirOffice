#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Run inside the Emscripten builder after applying the Wasm overlays to core.
import argparse, subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('core',type=Path);parser.add_argument('output',type=Path);args=parser.parse_args()
tools=Path(__file__).resolve().parents[1];args.output.mkdir(parents=True,exist_ok=True)
if 'wasmUtf8' not in (args.core/'UnicodeConverter/UnicodeConverter.cpp').read_text():
 raise SystemExit('Apply the Wasm overlays to this isolated core first')
for filename in ['UnicodeConverter.cpp','UnicodeConverter_internal_empty.cpp']:
 executable=args.output/(filename+'.js')
 subprocess.run(['em++','-std=c++17','-O1','-fms-extensions','-DEO_WASM','-D_LINUX','-DLINUX','-sUSE_ICU=1','-fwasm-exceptions','-sENVIRONMENT=node','-sINITIAL_MEMORY=64MB','-sALLOW_MEMORY_GROWTH=1','-I'+str(args.core/'UnicodeConverter'),str(args.core/'UnicodeConverter'/filename),str(args.core/'DesktopEditor/common/File.cpp'),str(tools/'bench/unicode-utf8.cpp'),'-o',str(executable)],check=True)
 subprocess.run(['node',str(executable)],check=True)
