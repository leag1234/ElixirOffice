# SPDX-License-Identifier: AGPL-3.0-only
"""x2t-level regression tests for ODF save losses fixed in the core (branch eo/odf-fix-core).

The converter is the same WebAssembly module the desktop runs. The test skips unless a build is given:
  EO_X2T_JS=/path/to/x2t.js EO_NODE=/path/to/node python3 tests/fidelity/odf-x2t-fixes.test.py
It converts a small LibreOffice-written ODT to the editor format and back (what open + save do, without the editor in between)
and checks that a manual line break, the heading level and an external link with a target frame survive.
"""
import os, re, subprocess, sys, tempfile, unittest, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / 'tools/fidelity/docx-roundtrip-x2t.mjs'
X2T = os.environ.get('EO_X2T_JS')
NODE = os.environ.get('EO_NODE', 'node')
FIXTURE = ROOT / 'tests/fidelity/fixtures/odf-save-losses.odt'  # written by LibreOffice: heading 1 and 2, a line break, links


@unittest.skipUnless(X2T and Path(X2T).exists(), 'set EO_X2T_JS to an x2t.js build to run')
class OdfSaveLosses(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        (d / 'in.odt').write_bytes(FIXTURE.read_bytes())
        for args in ((d / 'in.odt', d / 'x.bin', '67', '8193'), (d / 'x.bin', d / 'out.odt', '8193', '67')):
            subprocess.run([NODE, str(RUNNER), X2T, str(args[0]), str(args[1]), args[2], args[3]], check=True, capture_output=True)
        cls.content = zipfile.ZipFile(d / 'out.odt').read('content.xml').decode()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_manual_line_break_is_kept(self):
        self.assertRegex(self.content, r'first line<text:line-break/>second line')

    def test_heading_levels_are_not_shifted(self):
        self.assertEqual(re.findall(r'<text:h [^>]*text:outline-level="(\d+)"', self.content), ['1', '2'])

    def test_external_link_with_target_frame_is_kept(self):
        self.assertIn('xlink:href="https://example.org/a?b=1"', self.content)
        self.assertNotIn('#ttps', self.content)

    def test_internal_link_still_points_at_the_bookmark(self):
        self.assertIn('xlink:href="#Mark"', self.content)


if __name__ == '__main__':
    unittest.main()
