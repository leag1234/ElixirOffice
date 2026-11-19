# SPDX-License-Identifier: AGPL-3.0-only
"""x2t-level regression tests for the ODT reader: comments and page style / section breaks.

The converter is the same WebAssembly module the desktop runs. The test skips unless a build is given:
  EO_X2T_JS=/path/to/x2t.js EO_NODE=/path/to/node python3 tests/fidelity/odf-comments-sections.test.py

Comments: the ODT reader must write commentRangeStart/End between the runs of a paragraph (inside a run the editor
ignores them, sees comments without a range and saves them as document-level comments, which the ODT writer drops),
and give a point comment an empty range at its position.
Document-level comments (no text range, word/commentsDocument.xml) become comments at the start of the first paragraph.
Page styles: a paragraph that switches the page style opens a "next page" section (landscape page and back); a
text:section stays a continuous section and carries its columns.
"""
import os, re, subprocess, tempfile, unittest, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / 'tools/fidelity/docx-roundtrip-x2t.mjs'
X2T = os.environ.get('EO_X2T_JS')
NODE = os.environ.get('EO_NODE', 'node')
FIX = ROOT / 'tests/fidelity/fixtures'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def convert(src, dst, f, t):
    subprocess.run([NODE, str(RUNNER), X2T, str(src), str(dst), f, t], check=True, capture_output=True)


@unittest.skipUnless(X2T and Path(X2T).exists(), 'set EO_X2T_JS to an x2t.js build to run')
class OdfCommentsAndSections(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        for name in ('comments', 'pagestyles'):
            src = FIX / ('odf-%s.odt' % name)
            convert(src, d / (name + '.docx'), '67', '65')  # what the reader produces
            convert(src, d / (name + '.bin'), '67', '8193')
            convert(d / (name + '.bin'), d / (name + '-rt.odt'), '8193', '67')  # open + save, no editor in between
        z = zipfile.ZipFile(d / 'comments.docx')
        cls.comments_doc = ET.fromstring(z.read('word/document.xml'))
        cls.comments_xml = ET.fromstring(z.read('word/comments.xml'))
        cls.sect_doc = ET.fromstring(zipfile.ZipFile(d / 'pagestyles.docx').read('word/document.xml'))
        cls.rt_content = zipfile.ZipFile(d / 'comments-rt.odt').read('content.xml').decode()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_range_markers_are_paragraph_children_not_run_children(self):
        parents = {c: p for p in self.comments_doc.iter() for c in p}
        marks = [e for e in self.comments_doc.iter() if e.tag in (W + 'commentRangeStart', W + 'commentRangeEnd')]
        self.assertEqual(len(marks), 6)  # two ranges, one point comment (empty range)
        for m in marks:
            self.assertEqual(parents[m].tag, W + 'p', 'range marker inside a run: the editor ignores it')

    def test_every_comment_is_referenced_and_kept(self):
        refs = [e.get(W + 'id') for e in self.comments_doc.iter(W + 'commentReference')]
        self.assertEqual(len(refs), 3)
        authors = [c.get(W + 'author') for c in self.comments_xml.iter(W + 'comment')]
        self.assertEqual(sorted(authors), ['Reviewer One', 'Reviewer One', 'Reviewer Two'])

    def test_document_level_comments_are_written_to_the_odt(self):
        # what the editor saves for comments without a text range (word/commentsDocument.xml)
        d = Path(self.tmp.name)
        convert(FIX / 'odf-global-comments.docx', d / 'global.odt', '65', '67')
        content = zipfile.ZipFile(d / 'global.odt').read('content.xml').decode()
        self.assertEqual(len(re.findall(r'<office:annotation ', content)), 2)
        self.assertIn('Reviewer One', content)
        self.assertIn('Point comment without a range.', content)

    def test_open_and_save_keeps_the_comments(self):
        self.assertEqual(len(re.findall(r'<office:annotation ', self.rt_content)), 3)
        self.assertIn('First comment.', self.rt_content)
        self.assertIn('Point comment without a range.', self.rt_content)

    def sections(self):
        out = []
        for s in self.sect_doc.find(W + 'body').iter(W + 'sectPr'):
            t, pg, cols = s.find(W + 'type'), s.find(W + 'pgSz'), s.find(W + 'cols')
            out.append((t.get(W + 'val') if t is not None else None, int(pg.get(W + 'w')),
                        int(cols.get(W + 'num')) if cols is not None else 1))
        return out

    def test_page_style_switches_are_next_page_sections(self):
        s = self.sections()
        self.assertEqual([x[1] for x in s][:3], [11906, 16838, 11906])  # portrait, landscape, portrait
        self.assertEqual([x[0] for x in s][:3], ['continuous', 'nextPage', 'nextPage'])

    def test_text_section_keeps_its_columns_and_stays_continuous(self):
        two = [x for x in self.sections() if x[2] == 2]
        self.assertEqual(len(two), 1)
        self.assertEqual(two[0][0], 'continuous')


if __name__ == '__main__':
    unittest.main()
