// SPDX-License-Identifier: AGPL-3.0-only
'use strict';
const test=require('node:test'),{execFileSync}=require('node:child_process'),path=require('node:path');
test('bundled font coverage distinguishes supported scripts, missing CJK/Urdu and absent faces',()=>{
 execFileSync('python3',['-c',`import sys
from pathlib import Path
sys.path.insert(0,'tools/desktop')
from template_font_coverage import Pack
pack=Pack(Path('desktop/assets'))
assert ord('A') in pack.glyphs('DejaVu Sans')
assert ord('א') in pack.glyphs('DejaVu Sans')
assert ord('م') in pack.glyphs('DejaVu Sans')
assert ord('ລ') in pack.glyphs('DejaVu Sans')
assert ord('学') not in pack.glyphs('DejaVu Sans')
assert 0x06D2 not in pack.glyphs('DejaVu Sans')
assert not pack.glyphs('Nonexistent test font')
`],{cwd:path.resolve(__dirname,'../..'),stdio:'pipe'});
});
