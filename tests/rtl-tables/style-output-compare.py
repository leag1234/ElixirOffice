#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Compare complete style byte sequences and actual LTR paste/dedupe outcomes.
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser(description='Compare exact LTR style bytes and actual paste outcomes')
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--candidate', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--fixture')
parser.add_argument('--native-baseline', type=Path)
parser.add_argument('--native-candidate', type=Path)
parser.add_argument('--paste-baseline', type=Path)
parser.add_argument('--paste-candidate', type=Path)
args = parser.parse_args()
fixtures = json.loads((Path(__file__).parent / 'style-output-fixtures.json').read_text())['cases']
fixtures = [f for f in fixtures if not args.fixture or f['file'] == args.fixture]
assert fixtures, 'Fixture filter must identify a known controlled fixture'
assert bool(args.native_baseline) == bool(args.native_candidate)
assert bool(args.paste_baseline) == bool(args.paste_candidate)
sha = lambda data: hashlib.sha256(data).hexdigest()

def member(path, name='word/styles.xml'):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        return archive.read(name)

results = []
for fixture in fixtures:
    name = fixture['file']
    a, b = args.baseline / name, args.candidate / name
    checks, diagnostics = [], []
    def exact(label, left, right):
        checks.append({'name': label, 'byteIdentical': left == right,
                       'baselineBytes': len(left), 'candidateBytes': len(right),
                       'baselineSHA256': sha(left), 'candidateSHA256': sha(right)})
    for file in ['save-styles.bin', 'clipboard-styles.bin']:
        exact(file, (a / file).read_bytes(), (b / file).read_bytes())
    exact('saved DOCX word/styles.xml', member(a / 'save.docx'), member(b / 'save.docx'))
    x, y = json.loads((a / 'model.json').read_text()), json.loads((b / 'model.json').read_text())
    checks.append({'name': 'raw and actual paste style-comparator matrices',
                   'equal': x['equality'] == y['equality'], 'rows': len(x['equality'])})
    checks.append({'name': 'implicit default remains absent',
                   'equal': x['defaultDirection'] == y['defaultDirection'] == 'absent'})
    if args.native_baseline:
        exact('native clipboard DOCX word/styles.xml',
              member(args.native_baseline / name / 'clipboard.docx'),
              member(args.native_candidate / name / 'clipboard.docx'))
    if args.paste_baseline:
        left = next(r for r in json.loads((args.paste_baseline / 'results.json').read_text()) if r['fixture'] == name)
        right = next(r for r in json.loads((args.paste_candidate / 'results.json').read_text()) if r['fixture'] == name)
        checks.append({'name': 'two actual asc_PasteData outcomes/style counts',
                       'equal': left['steps'] == right['steps']})
        exact('post-paste DOCX word/styles.xml',
              member(args.paste_baseline / name / 'post-paste.docx'),
              member(args.paste_candidate / name / 'post-paste.docx'))
    # Whole payload equality is diagnostic only; this gate promises exact style bytes.
    for file in ['save.bin', 'clipboard.bin', 'save.docx']:
        left, right = (a / file).read_bytes(), (b / file).read_bytes()
        diagnostics.append({'name': file, 'wholePayloadByteIdentical': left == right,
                            'baselineSHA256': sha(left), 'candidateSHA256': sha(right)})
    results.append({'fixture': name, 'checks': checks, 'wholePayloadDiagnostics': diagnostics,
                    'status': 'PASS' if all(c.get('byteIdentical', c.get('equal')) for c in checks) else 'FAIL'})
report = {'status': 'PASS' if all(r['status'] == 'PASS' for r in results) else 'FAIL',
          'fixtures': len(results), 'checks': sum(len(r['checks']) for r in results),
          'scope': 'Complete style-table and styles.xml bytes; no XML canonicalization, ignored fields, or whole-package identity claim.',
          'results': results}
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(report['status'], report['fixtures'], report['checks'])
raise SystemExit(0 if report['status'] == 'PASS' else 1)
