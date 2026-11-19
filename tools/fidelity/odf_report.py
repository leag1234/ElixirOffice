#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Aggregate an odf-roundtrip run into the loss table.

usage: odf_report.py --run RUN_DIR [--baseline results.json] [--tolerance 0.03]
RUN_DIR holds: orig/<id>.<ext> (corpus copy), work/<id>/roundtrip.{json,<ext>}, render/render.json
Writes RUN_DIR/results.json, RUN_DIR/documents.csv, RUN_DIR/loss-table.md. Exit 1 on regression against the baseline.
"""
import argparse, csv, json, sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import odf_struct

# Generic differences that every LibreOffice-authored file shows (renamed automatic styles, default styles added by the
# writer, ...). They are listed apart and do not count as losses in the summary.
INFO = {'formatting properties (attr=value pairs)', 'named paragraph styles', 'named character styles', 'named cell styles', 'list formats (bullet/number per level)',
        'master pages', 'page margins', 'page sizes (mm)', 'paragraphs', 'list items', 'list nesting depth', 'row heights (mm)', 'layout placeholders (classes)',
        'gradients/dashes/markers defined', 'text boxes', 'title / creator metadata'}
# Features each synthetic document must still contain after LibreOffice normalised it; a gap means the corpus, not the app, is at fault.
EXPECT = {'c01_formulas': ['formulas (normalised text)', 'named ranges / expressions'], 'c03_condfmt': ['conditional formats'], 'c04_validation': ['data validations'],
          'c05_layout': ['frozen panes (settings)', 'merged cells', 'hidden rows', 'hidden columns', 'autofilter / database ranges'], 'c06_charts': ['charts'],
          'c07_comments': ['cell comments'], 'c08_pivot': ['pivot tables'], 'c09_multisheets': ['tab colours', 'hidden sheets'],
          'p07_transitions_anim': ['transitions', 'animation nodes'], 'p08_notes': ['speaker notes (text)'], 'p09_custom_shows': ['custom shows'],
          'w02_lists': ['list items'], 'w03_tables': ['merged cells (spans)'], 'w07_sections_columns': ['sections'], 'w08_notes': ['footnotes', 'endnotes'],
          'w09_toc': ['table of contents'], 'w11_comments': ['comments (annotations)'], 'w12_tracked': ['changed regions'], 'w13_bookmarks_links': ['bookmarks', 'hyperlinks (targets)'],
          'w14_math': ['formulas (math)'], 'w15_chart': ['charts'], 'w16_forms': ['form controls']}
ORDER = {'lost': 0, 'changed': 1, 'kept': 2, 'added': 3}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True, type=Path)
    ap.add_argument('--baseline', type=Path)
    ap.add_argument('--tolerance', type=float, default=0.03)
    ap.add_argument('--group', default='', help='label of the corpus group, for the report title')
    a = ap.parse_args()
    run = a.run
    render = json.loads((run / 'render' / 'render.json').read_text()) if (run / 'render' / 'render.json').exists() else {}
    docs, feats = {}, defaultdict(lambda: {'kept': 0, 'changed': 0, 'lost': 0, 'added': 0, 'examples': [], 'docs': {}})
    for f in sorted((run / 'orig').glob('*.od?')):
        i = f.stem
        w = run / 'work' / i
        meta = json.loads((w / 'roundtrip.json').read_text()) if (w / 'roundtrip.json').exists() else {'status': 'missing'}
        rt = next(iter(w.glob('roundtrip.od?')), None)
        d = {'id': i, 'kind': f.suffix[1:], 'status': meta.get('status'), 'error': (meta.get('error') or '')[:200], 'guardRefused': meta.get('guardRefused'),
             'objectsBefore': meta.get('originalObjects'), 'objectsAfter': meta.get('roundtripObjects'), 'writtenInPlace': meta.get('writtenInPlace'),
             'sizeOrig': f.stat().st_size, 'sizeRt': rt.stat().st_size if rt else None}
        r = render.get(i, {})
        d.update({k: r.get(k) for k in ('pagesOrig', 'pagesRt', 'meanScore', 'minScore', 'textScore', 'wordsOrig', 'wordsRt')})
        if rt:
            try:
                rows = odf_struct.compare(odf_struct.inventory(str(f)), odf_struct.inventory(str(rt)))
            except Exception as e:  # noqa: BLE001
                rows = []
                d['inventoryError'] = repr(e)[:200]
            d['features'] = {f"{x['category']}|{x['feature']}": x['status'] for x in rows}
            for x in rows:
                k = f"{x['category']}|{x['feature']}"
                ft = feats[k]
                ft[x['status']] += 1
                ft['docs'][i] = x['status']
                if x['status'] in ('lost', 'changed') and len(ft['examples']) < 3:
                    ft['examples'].append(f"{i}: {x['detail']}")
            d['lost'] = sum(1 for x in rows if x['status'] == 'lost')
            d['changed'] = sum(1 for x in rows if x['status'] == 'changed')
        docs[i] = d
    gaps = []
    for i, wanted in EXPECT.items():
        f = next(iter((run / 'orig').glob(i + '.od?')), None)
        if f:
            inv = odf_struct.inventory(str(f))
            gaps += [f'{i}: {w}' for w in wanted if not any(v for k, v in inv.items() if k.split('|')[1] == w)]
    res = {'corpusGaps': gaps, 'documents': docs, 'features': {k: {kk: vv for kk, vv in v.items()} for k, v in feats.items()}}
    (run / 'results.json').write_text(json.dumps(res, indent=1))
    with (run / 'documents.csv').open('w', newline='') as s:
        w = csv.writer(s)
        w.writerow(['id', 'kind', 'status', 'guardRefused', 'pagesOrig', 'pagesRt', 'meanScore', 'minScore', 'textScore', 'lostFeatures', 'changedFeatures'])
        for d in docs.values():
            w.writerow([d['id'], d['kind'], d['status'], d['guardRefused'], d['pagesOrig'], d['pagesRt'], d['meanScore'], d['minScore'], d['textScore'], d.get('lost'), d.get('changed')])
    lines = [f'# OpenDocument round trip {a.group}'.strip(), '', f'{len(docs)} documents; guard refusals: {sum(1 for d in docs.values() if d["guardRefused"])}; '
             f'errors: {sum(1 for d in docs.values() if d["status"] != "ok")}', '']
    if gaps:
        lines += ['Corpus gaps (the intended feature is missing from the normalised original, so it is not measured): ' + '; '.join(gaps), '']
    def table(title, keys):
        lines.extend([title, '', '| Category | Feature | Docs | Kept | Changed | Lost | Examples |', '|---|---|---|---|---|---|---|'])
        for k in keys:
            v = feats[k]
            n = v['kept'] + v['changed'] + v['lost']
            if not n:
                continue
            c, f = k.split('|')
            lines.append(f"| {c} | {f} | {n} | {v['kept']} | {v['changed']} | {v['lost']} | {'; '.join(v['examples'])[:230].replace('|', '/')} |")
        lines.append('')
    ranked = sorted(feats, key=lambda k: (-(feats[k]['lost'] * 2 + feats[k]['changed']), k))
    table('## Features (by impact)', [k for k in ranked if k.split('|')[1] not in INFO])
    table('## Generic differences (informational)', [k for k in ranked if k.split('|')[1] in INFO])
    lines += ['', '## Rendering (LibreOffice PDF, ink overlap per page)', '', '| Document | Pages | Page similarity | Worst page | Text overlap | Guard |', '|---|---|---|---|---|---|']
    for d in sorted(docs.values(), key=lambda d: (d['meanScore'] if d['meanScore'] is not None else -1)):
        lines.append(f"| {d['id']} | {d['pagesOrig']} -> {d['pagesRt']} | {d['meanScore']} | {d['minScore']} | {d['textScore']} | {'REFUSED' if d['guardRefused'] else 'ok'} |")
    (run / 'loss-table.md').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines[:4]))
    if a.baseline:
        base = json.loads(a.baseline.read_text())['documents']
        bad = []
        for i, d in docs.items():
            b = base.get(i)
            if not b:
                continue
            if d['status'] != 'ok' and b['status'] == 'ok':
                bad.append(f'{i}: round trip failed')
            if d['guardRefused'] and not b['guardRefused']:
                bad.append(f'{i}: guard now refuses')
            if d['meanScore'] is not None and b['meanScore'] is not None and d['meanScore'] < b['meanScore'] - a.tolerance:
                bad.append(f"{i}: page similarity {b['meanScore']} -> {d['meanScore']}")
            for k, st in (d.get('features') or {}).items():
                if k.split('|')[1] in INFO:
                    continue
                if ORDER.get(st, 2) < ORDER.get((b.get('features') or {}).get(k, 'kept'), 2):
                    bad.append(f'{i}: {k} {b["features"].get(k, "kept")} -> {st}')
        print('\n'.join(bad) or 'no regression against the baseline')
        sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
