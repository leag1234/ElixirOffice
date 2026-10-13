# SPDX-License-Identifier: AGPL-3.0-only
from urllib.request import Request,urlopen
import json,os
base=os.environ['EO_BASE']
assert ':8080' not in base
service=base+'/example/local-assets/sdkjs/common/wasm-convert/'
pin=json.load(urlopen(service+'runtime-release.json'))
release=service+'runtime/'+pin['artifact_version']+'/'
manifest=json.load(urlopen(release+'manifest.json'))
sizes={suffix:manifest['artifacts']['x2t.wasm'+suffix]['bytes'] for suffix in ['', '.br', '.gz']}
for accepted,expected,suffix in [('br','br','.br'),('gzip','gzip','.gz'),('identity',None,''),('br;q=0,gzip;q=1','gzip','.gz'),('br;q=0.1,gzip;q=1','gzip','.gz'),('br;q=1,gzip;q=0.1','br','.br'),('br;q=0,gzip;q=0',None,'')]:
 r=urlopen(Request(release+'x2t.wasm',method='HEAD',headers={'Accept-Encoding':accepted}))
 assert r.status==200
 assert r.headers['Content-Type']=='application/wasm'
 assert r.headers['Content-Encoding']==expected,(accepted,r.headers['Content-Encoding'])
 assert int(r.headers['Content-Length'])==sizes[suffix]
 assert 'Accept-Encoding' in r.headers['Vary']
 assert '/example/local-assets/' in r.headers['Content-Security-Policy']
print('PASS pinned release seven raw/Brotli/gzip/quality cases, wasm MIME, Vary and CSP')
