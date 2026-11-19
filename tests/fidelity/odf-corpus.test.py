# SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for the OpenDocument round-trip gate helpers (no desktop, no LibreOffice needed)."""
import json, sys, tempfile, unittest, zipfile
import xml.dom.minidom
from pathlib import Path

HERE = Path(__file__).resolve().parents[2] / 'tools/fidelity'
sys.path.insert(0, str(HERE))
import odf_corpus, odf_struct  # noqa: E402

CONTENT = ('<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
           'xmlns:xlink="http://www.w3.org/1999/xlink"><office:body><office:text>%s</office:text></office:body></office:document-content>')


def odt(path, body):
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('mimetype', 'application/vnd.oasis.opendocument.text')
        z.writestr('content.xml', CONTENT % body)


class Corpus(unittest.TestCase):
    def test_generator_writes_well_formed_documents_for_every_type(self):
        with tempfile.TemporaryDirectory() as d:
            odf_corpus.main(d)
            manifest = json.loads((Path(d) / 'manifest.json').read_text())
            self.assertEqual({m['kind'] for m in manifest}, {'t', 's', 'p'})
            self.assertGreaterEqual(len(manifest), 40)
            self.assertEqual(len({m['id'] for m in manifest}), len(manifest))
            for m in manifest:
                xml.dom.minidom.parse(str(Path(d) / m['flat']))

    def test_corpus_covers_the_requested_features(self):
        with tempfile.TemporaryDirectory() as d:
            odf_corpus.main(d)
            text = ''.join(p.read_text() for p in Path(d).glob('*.fod?'))
            for needle in ('text:tracked-changes', 'office:annotation', 'text:note-class="footnote"', 'text:table-of-content', 'math:math', 'chart:chart', 'form:checkbox',
                           'calcext:conditional-format', 'table:content-validation', 'table:data-pilot-table', 'table:database-range', 'HorizontalSplitMode', 'anim:par',
                           'presentation:notes', 'presentation:show ', 'smil:type', 'table:number-columns-spanned', 'style:master-page', 'text:section'):
                self.assertIn(needle, text, needle)


class Struct(unittest.TestCase):
    def rows(self, a, b):
        with tempfile.TemporaryDirectory() as d:
            odt(Path(d) / 'a.odt', a)
            odt(Path(d) / 'b.odt', b)
            return {(r['feature']): r['status'] for r in odf_struct.compare(odf_struct.inventory(str(Path(d) / 'a.odt')), odf_struct.inventory(str(Path(d) / 'b.odt')))}

    def test_identical_documents_keep_everything(self):
        body = '<text:p>Hello <text:a xlink:href="https://x.org">link</text:a></text:p><text:bookmark text:name="m"/>'
        r = self.rows(body, body)
        self.assertEqual(set(r.values()), {'kept'})

    def test_lost_link_and_bookmark_are_reported(self):
        r = self.rows('<text:p>Hello <text:a xlink:href="https://x.org">link</text:a></text:p><text:bookmark text:name="m"/>', '<text:p>Hello link</text:p>')
        self.assertEqual(r['bookmarks'], 'lost')
        self.assertEqual(r['hyperlinks (targets)'], 'lost')

    def test_words_are_compared_per_paragraph_not_per_span(self):
        r = self.rows('<text:p>committee</text:p>', '<text:p>commi<text:span>ttee</text:span></text:p>')
        self.assertEqual(r['words (multiset)'], 'kept')

    def test_a_dropped_line_break_changes_the_words(self):
        r = self.rows('<text:p>one<text:line-break/>two</text:p>', '<text:p>onetwo</text:p>')
        self.assertNotEqual(r['words (multiset)'], 'kept')


if __name__ == '__main__':
    unittest.main()
