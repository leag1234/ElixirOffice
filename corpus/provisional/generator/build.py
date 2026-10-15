# -*- coding: utf-8 -*-
"""Build the provisional corpus (generated documents) + manifest.csv.

Usage:  python3 build.py [--only t01,s03,...]
Dependencies: python-docx 1.1.2, lxml, Pillow (pip install --user python-docx Pillow).
Public documents are fetched separately by fetch_public.py (the manifest includes them).
"""
import csv
import hashlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import images  # noqa: E402
import teachers  # noqa: E402
import smallorg  # noqa: E402
import admin  # noqa: E402
import validate  # noqa: E402
from public_sources import PUBLIC  # noqa: E402

GENERATED = [
    # id, file, category, module.function
    ('t01', 'teachers/t01-fiche-fractions-cm1.docx', 'teachers', teachers.t01),
    ('t02', 'teachers/t02-evaluation-sciences-6e-grille.docx', 'teachers', teachers.t02),
    ('t03', 'teachers/t03-affiche-regles-classe-a3.docx', 'teachers', teachers.t03),
    ('t04', 'teachers/t04-sequence-histoire-cm2.docx', 'teachers', teachers.t04),
    ('t05', 'teachers/t05-lecture-adaptee-dys-ce1.docx', 'teachers', teachers.t05),
    ('t06', 'teachers/t06-conjugaison-seyes-ce2.docx', 'teachers', teachers.t06),
    ('t07', 'teachers/t07-frise-chronologique-6e.docx', 'teachers', teachers.t07),
    ('t08', 'teachers/t08-progression-maths-5e.docx', 'teachers', teachers.t08),
    ('s01', 'smallorg/s01-devis-menuiserie.docx', 'smallorg', smallorg.s01),
    ('s02', 'smallorg/s02-compte-rendu-ag-association.docx', 'smallorg', smallorg.s02),
    ('s03', 'smallorg/s03-statuts-association-loi-1901.docx', 'smallorg', smallorg.s03),
    ('s04', 'smallorg/s04-newsletter-quartier.docx', 'smallorg', smallorg.s04),
    ('s05', 'smallorg/s05-flyer-fete-quartier.docx', 'smallorg', smallorg.s05),
    ('s06', 'smallorg/s06-lettre-en-tete-association.docx', 'smallorg', smallorg.s06),
    ('s07', 'smallorg/s07-rapport-activite-2025.docx', 'smallorg', smallorg.s07),
    ('s08', 'smallorg/s08-cv-deux-colonnes.docx', 'smallorg', smallorg.s08),
    ('s09', 'smallorg/s09-convocation-ag-pouvoir.docx', 'smallorg', smallorg.s09),
    ('s10', 'smallorg/s10-bulletin-adhesion-formulaire.docx', 'smallorg', smallorg.s10),
    ('a01', 'admin/a01-courrier-mairie-revisions.docx', 'admin', admin.a01),
    ('a02', 'admin/a02-arrete-municipal-circulation.docx', 'admin', admin.a02),
    ('a03', 'admin/a03-note-de-service.docx', 'admin', admin.a03),
    ('a04', 'admin/a04-proces-verbal-revisions.docx', 'admin', admin.a04),
    ('a05', 'admin/a05-attestation.docx', 'admin', admin.a05),
    ('a06', 'admin/a06-rapport-annuel-multisection.docx', 'admin', admin.a06),
]


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def main():
    only = None
    if '--only' in sys.argv:
        only = set(sys.argv[sys.argv.index('--only') + 1].split(','))
    assets = os.path.join(HERE, 'assets')
    images.build_all(assets)
    for m in (teachers, smallorg, admin):
        m.IMG = assets
    rows = []
    failed = 0
    for did, rel, cat, fn in GENERATED:
        if only and did not in only:
            continue
        out = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        doc, meta = fn()
        doc.save(out, pages=meta.get('pages', 1))
        errs, _ = validate.validate(out)
        print('%-4s %-55s %s' % (did, rel, 'OK' if not errs else 'ERRORS'))
        for e in errs[:20]:
            print('      ' + e)
        failed += bool(errs)
        rows.append(dict(id=did, file=rel, category=cat, origin='generated', source_url='',
                         license='CC0-1.0 (contenu généré pour le projet)', retrieved='',
                         pages_estimate=meta.get('pages', 1), features=meta['features'],
                         notes=(meta.get('notes', '') + ' sha256=' + sha256(out)).strip()))
    if not only:
        for p in PUBLIC:
            path = os.path.join(ROOT, p['file'])
            note = p['notes']
            if os.path.exists(path):
                errs, _ = validate.validate(path)
                note += ' sha256=' + sha256(path)
                print('%-4s %-55s %s (public)' % (p['id'], p['file'], 'OK' if not errs else 'warnings: %d' % len(errs)))
            else:
                print('%-4s %-55s MISSING (run fetch_public.py)' % (p['id'], p['file']))
            rows.append(dict(id=p['id'], file=p['file'], category=p['category'], origin='public',
                             source_url=p['source_url'], license=p['license'], retrieved=p['retrieved'],
                             pages_estimate=p['pages'], features=p['features'], notes=note))
        rows.sort(key=lambda r: ({'teachers': 0, 'smallorg': 1, 'admin': 2}[r['category']], r['id']))
        with open(os.path.join(ROOT, 'manifest.csv'), 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=['id', 'file', 'category', 'origin', 'source_url', 'license',
                                              'retrieved', 'pages_estimate', 'features', 'notes'])
            w.writeheader()
            for r in rows:
                w.writerow(r)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
