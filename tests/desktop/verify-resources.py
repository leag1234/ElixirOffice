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
print('PASS',len(manifest['files']),'packaged resource hashes and licences')
