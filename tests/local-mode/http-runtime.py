# SPDX-License-Identifier: AGPL-3.0-only
from pathlib import Path
from urllib.request import Request,urlopen
import os
base=os.environ['EO_BASE']
assert ':8080' not in base
path='/example/local-assets/sdkjs/common/wasm-convert/runtime/9ee6831853aa-fd40349d310d-st/x2t.wasm'
for accepted,expected,size in [('br','br',8778766),('gzip','gzip',12876821),('identity',None,53064743),('br;q=0,gzip;q=1','gzip',12876821),('br;q=0.1,gzip;q=1','gzip',12876821),('br;q=1,gzip;q=0.1','br',8778766),('br;q=0,gzip;q=0',None,53064743)]:
 r=urlopen(Request(base+path,method='HEAD',headers={'Accept-Encoding':accepted}))
 assert r.status==200
 assert r.headers['Content-Type']=='application/wasm'
 assert r.headers['Content-Encoding']==expected,(accepted,r.headers['Content-Encoding'])
 assert int(r.headers['Content-Length'])==size
 assert 'Accept-Encoding' in r.headers['Vary']
 assert '/example/local-assets/' in r.headers['Content-Security-Policy']
print('PASS seven raw/Brotli/gzip/quality cases, wasm MIME, Vary and CSP')
