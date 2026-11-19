#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Render original and round-tripped OpenDocument files with LibreOffice and compare the pages.

Runs inside the LibreOffice tools image (soffice, poppler, numpy, opencv).
usage: odf_render_compare.py ORIG_DIR RT_DIR OUT_DIR
  ORIG_DIR/<id>.<ext>  originals;  RT_DIR/<id>.<ext>  round-tripped copies
Writes OUT_DIR/render.json: per id {pagesOrig, pagesRt, pageScores[], meanScore, minScore}.
Score = weighted overlap of the ink density of the two pages (60 dpi, 24 px cells, 10 mm):
sum(min)/sum(max). 1.0 = identical. Also textScore = word overlap (multiset, document wide)
from pdftotext, which ignores layout shifts and tells missing text from moved text.
"""
import json, os, shutil, subprocess, sys, glob
import numpy as np
import cv2

DPI = 60
MAXPAGES = 40


def convert(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src_dir, '*.od?')))
    for f in files:
        if os.path.exists(os.path.join(out_dir, os.path.splitext(os.path.basename(f))[0] + '.pdf')):
            continue
        try:
            subprocess.run(['soffice', '--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo-profile-' + os.path.basename(out_dir),
                            '--convert-to', 'pdf', '--outdir', out_dir, f], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=240)
        except subprocess.TimeoutExpired:
            pass


def pages(pdf, prefix):
    for old in glob.glob(prefix + '-*.png'):
        os.remove(old)
    subprocess.run(['pdftoppm', '-r', str(DPI), '-gray', '-l', str(MAXPAGES), '-png', pdf, prefix], check=True)
    return sorted(glob.glob(prefix + '-*.png'))


def npages(pdf):
    out = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith('Pages:'):
            return int(line.split()[1])
    return 0


def ink(path, shape=None):
    im = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if shape and im.shape != shape:
        im = cv2.resize(im, (shape[1], shape[0]), interpolation=cv2.INTER_AREA)
    return im < 200


def score(a, b):
    """Weighted overlap of ink density on a 24 px grid: sum(min)/sum(max). 1.0 = identical."""
    k = 24
    def density(x):
        h, w = x.shape[0] // k * k, x.shape[1] // k * k
        return x[:h, :w].astype(np.float32).reshape(h // k, k, w // k, k).mean(axis=(1, 3))
    da, db = density(a), density(b)
    mx = np.maximum(da, db).sum()
    return 1.0 if mx == 0 else float(np.minimum(da, db).sum() / mx)


def words(pdf):
    import re
    from collections import Counter
    t = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True).stdout
    return Counter(re.findall(r'\w+', t.lower()))


def main(orig, rt, out):
    convert(orig, os.path.join(out, 'pdf-orig'))
    convert(rt, os.path.join(out, 'pdf-rt'))
    res = {}
    for f in sorted(glob.glob(os.path.join(orig, '*.od?'))):
        i = os.path.splitext(os.path.basename(f))[0]
        po, pr = os.path.join(out, 'pdf-orig', i + '.pdf'), os.path.join(out, 'pdf-rt', i + '.pdf')
        r = {'pagesOrig': npages(po) if os.path.exists(po) else None, 'pagesRt': npages(pr) if os.path.exists(pr) else None}
        if os.path.exists(po) and os.path.exists(pr):
            tmp = os.path.join(out, 'png')
            os.makedirs(tmp, exist_ok=True)
            A, B = pages(po, os.path.join(tmp, i + '-o')), pages(pr, os.path.join(tmp, i + '-r'))
            sc = []
            for n in range(max(len(A), len(B))):
                if n >= len(A) or n >= len(B):
                    sc.append(0.0)
                    continue
                a = ink(A[n])
                sc.append(round(score(a, ink(B[n], a.shape)), 4))
            wo, wr = words(po), words(pr)
            tot = sum((wo | wr).values())
            r['textScore'] = round(sum((wo & wr).values()) / tot, 4) if tot else 1.0
            r['wordsOrig'], r['wordsRt'] = sum(wo.values()), sum(wr.values())
            r['pageScores'] = sc
            r['meanScore'] = round(sum(sc) / len(sc), 4) if sc else None
            r['minScore'] = min(sc) if sc else None
            if r['meanScore'] is not None and r['meanScore'] >= 0.97:
                for p in glob.glob(os.path.join(tmp, i + '-*.png')):
                    os.remove(p)
        res[i] = r
    json.dump(res, open(os.path.join(out, 'render.json'), 'w'), indent=1)
    print(len(res), 'documents compared')


if __name__ == '__main__':
    main(*sys.argv[1:4])
