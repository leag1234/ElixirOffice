#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
import sys,json,hashlib
from pathlib import Path
directory=Path(sys.argv[1]).resolve()
manifest=json.loads((directory/'desktop-manifest.json').read_text())
for name,record in manifest['files'].items():
    file=(directory/name).resolve()
    assert directory in file.parents, 'Invalid manifest path'
    assert file.stat().st_size==record['bytes'], name
    assert hashlib.sha256(file.read_bytes()).hexdigest()==record['sha256'], name
assert any(file.is_file() for file in (directory/'licenses').rglob('*')), 'Missing licences'
# Every theme gallery sprite the stylesheet references must be packaged where the stylesheet looks for it.
import re
css=directory/'web-apps/apps/presentationeditor/main/app.css'
if css.is_file():
    referenced=sorted(set(re.findall(r'sdkjs/common/Images/(themes_thumbnail[^)\s\'"]*)',css.read_text())))
    assert referenced, 'No theme gallery sprite reference found'
    for sprite in referenced:
        assert 'sdkjs/common/Images/'+sprite in manifest['files'], 'Missing theme gallery sprite '+sprite
print('PASS',len(manifest['files']),'packaged resource hashes and licences')
