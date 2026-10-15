# -*- coding: utf-8 -*-
"""Download the corpus public documents from data.gouv.fr, check the sha256 digest of
the original, blank the personal metadata (dc:creator, cp:lastModifiedBy) and write the file
into teachers/ or admin/. The rest of the package is copied unchanged (part contents untouched).
Usage: python3 fetch_public.py [--cache DIR]   (a directory already holding the originals avoids the network)
"""
import hashlib
import io
import os
import re
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from public_sources import PUBLIC  # noqa: E402


def sanitize(data):
    src = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for info in src.infolist():
            blob = src.read(info.filename)
            if info.filename == 'docProps/core.xml':
                t = blob.decode('utf-8')
                t = re.sub(r'<dc:creator>.*?</dc:creator>', '<dc:creator></dc:creator>', t, flags=re.S)
                t = re.sub(r'<cp:lastModifiedBy>.*?</cp:lastModifiedBy>', '<cp:lastModifiedBy></cp:lastModifiedBy>',
                           t, flags=re.S)
                blob = t.encode('utf-8')
            zi = zipfile.ZipInfo(info.filename, info.date_time)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = info.external_attr
            z.writestr(zi, blob)
    return out.getvalue()


def main():
    cache = None
    if '--cache' in sys.argv:
        cache = sys.argv[sys.argv.index('--cache') + 1]
    ok = True
    for p in PUBLIC:
        name = p['url'].rsplit('/', 1)[1]
        data = None
        if cache:
            for cand in os.listdir(cache):
                fp = os.path.join(cache, cand)
                if os.path.isfile(fp) and hashlib.sha256(open(fp, 'rb').read()).hexdigest() == p['sha256']:
                    data = open(fp, 'rb').read()
                    break
        if data is None:
            req = urllib.request.Request(p['url'], headers={'User-Agent': 'corpus-provisoire-elixiroffice/1.0'})
            data = urllib.request.urlopen(req, timeout=60).read()
        h = hashlib.sha256(data).hexdigest()
        if h != p['sha256']:
            print('%s : DIGEST DIFFERS (%s) - file changed at the source, check licence/content' % (name, h))
            ok = False
            continue
        out = os.path.join(ROOT, p['file'])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as f:
            f.write(sanitize(data))
        print('%s -> %s' % (name, p['file']))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
