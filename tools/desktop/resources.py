#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Assemble manifest-verified production assets; never read documents or secrets."""
import argparse, hashlib, json, shutil, subprocess
from prune import prune
from pathlib import Path

parser=argparse.ArgumentParser()
for name in ['themes','sdk','apps','fonts','allfonts','pdf_runtime','templates','upstream','out']:
    parser.add_argument('--'+name.replace('_','-'),type=Path,required=True)
parser.add_argument('--font-source',type=Path,action='append',required=True)
parser.add_argument('--font-images',type=Path,required=True)
parser.add_argument("--font-set",choices=["standard","full"],default="standard")
args=parser.parse_args()
out=args.out.resolve()
if out.exists():
    raise SystemExit('Choose an empty output directory (remove only your own previous build explicitly)')
for editor in ['word','cell','slide']:
    for name in ['sdk-all.js','sdk-all-min.js']:
        if not (args.sdk/'sdkjs'/editor/name).is_file(): raise SystemExit('Missing production SDK bundle: '+editor+'/'+name)
out.mkdir(parents=True)
def copy(src,dst):
    if not src.exists(): raise SystemExit('Missing resource: '+str(src))
    if src.is_dir(): shutil.copytree(src,dst,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.git','.gitkeep','node_modules','*.map'))
    else: dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
catalog=json.loads((args.themes/'themes.js').read_text().split('=',1)[1].strip().rstrip(';'))
if not catalog:raise SystemExit('Empty theme catalog')
for index in range(1,len(catalog)+1):
    if not (args.themes/f'theme{index}'/'theme.bin').is_file():raise SystemExit('Incomplete themes')
copy(args.sdk/'sdkjs',out/'sdkjs')
copy(args.themes,out/'sdkjs/slide/themes')
copy(args.apps/'web-apps',out/'web-apps')
copy(args.fonts,out/'fonts')
copy(args.allfonts,out/'sdkjs/common/AllFonts.js')
copy(args.font_images,out/'sdkjs/common/Images')
for index,source in enumerate(args.font_source):
    for file in source.rglob('*'):
        if file.is_file() and any(key in file.name.upper() for key in ['LICENSE','COPYING','OFL','NOTICE']):
            copy(file,out/'licenses/fonts'/str(index)/file.relative_to(source))
copy(args.pdf_runtime,out/'sdkjs/common/clientpdf/runtime')
copy(args.upstream/'sdkjs/common/clientpdf/clientpdf.js',out/'sdkjs/common/clientpdf/clientpdf.js')
for format in ['docx','xlsx','pptx']: copy(args.templates/('new.'+format),out/'templates'/('new.'+format))
for license in ['LICENSE','AUTHORS.md','README.md']: copy(args.templates.parent.parent/license,out/'licenses/templates'/license)
for sub in ['sdkjs','web-apps','core']:
    for license in ['LICENSE','LICENSE.txt','NOTICE','NOTICE.md']:
        source=args.upstream/sub/license
        if source.exists(): copy(source,out/'licenses'/sub/license)
def verify(release,pin=None):
    raw=(release/'manifest.json').read_bytes()
    if pin and hashlib.sha256(raw).hexdigest()!=pin['manifest_sha256']: raise SystemExit('Manifest pin mismatch')
    for name,entry in json.loads(raw)['artifacts'].items():
        data=(release/name).read_bytes()
        if len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise SystemExit('Runtime mismatch: '+name)
pin=json.loads((out/'sdkjs/common/wasm-convert/runtime-release.json').read_text())
verify(out/'sdkjs/common/wasm-convert/runtime'/pin['artifact_version'],pin)
pdf=json.loads((out/'sdkjs/common/clientpdf/runtime/current.json').read_text())
verify(out/'sdkjs/common/clientpdf/runtime'/pdf['artifact_version'])
for editor in ['documenteditor','spreadsheeteditor','presentationeditor']:
    if 'ElixirLocal' not in (out/'web-apps/apps'/editor/'main/app.js').read_text():raise SystemExit('Local controller absent from production bundle')
identities={}
for name in ['sdkjs','web-apps','core','document-server-integration']:
    identities[name]=subprocess.check_output(['git','-C',str(args.upstream/name),'rev-parse','HEAD'],text=True).strip()
pruning=prune(out)
manifest={'pruning':pruning,'fontSet':args.font_set,'source':identities,'conversion':pin,'pdf':pdf,'files':{}}
for file in sorted(out.rglob('*')):
    if file.is_file():manifest['files'][str(file.relative_to(out))]={'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
(out/'desktop-manifest.json').write_text(json.dumps(manifest,sort_keys=True,indent=2)+'\n')
print('PASS production local bundles, pinned conversion/PDF releases and',len(manifest['files']),'hashed resources')
