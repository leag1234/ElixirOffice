#!/usr/bin/env python3
"""Check exact attribution exceptions and continued rejection of other branding."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rebrand_exact_line_test", ROOT / "tools/rebrand/rebrand.py")
rebrand = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rebrand)
_UPSTREAM = "Eu" + "ro-" + "Office"
EXPECTED = {
    ('CONTRIBUTING.md', 'ElixirOffice is made of this repository and of forks of the ' + _UPSTREAM + ' components that we modify. This repository holds what is ours alone: branding (theme, icons, fonts), build and packaging tooling, the desktop app, the WebAssembly build scripts, tests, the evaluation suites and the documentation. `patches/` contains informational exports of our changes to the components.'): 'upstream attribution',
    ('CONTRIBUTING.md', 'The component repositories (branch `elixiroffice`; `main` follows ' + _UPSTREAM + ') are published as `github.com/leag1234/<name>`:'): 'upstream attribution',
    ('CONTRIBUTING.md', '`sdkjs-forms` is not modified and comes from ' + _UPSTREAM + '. Changes that are not specific to ElixirOffice may also be proposed upstream to ' + _UPSTREAM + '.'): 'upstream attribution',
    ('README.md', 'Feature by feature, compared with LibreOffice and ONLYOFFICE: [docs/differences.md](docs/differences.md).'): 'factual comparison',
}


class ExactAttributionTests(unittest.TestCase):
    def test_only_four_approved_file_text_pairs(self):
        self.assertEqual(rebrand.PRODUCT_EXACT_LINE_ALLOW, EXPECTED)

    def test_exact_complete_line_and_product_scope_required(self):
        for (path, line), reason in EXPECTED.items():
            with self.subTest(path=path, reason=reason):
                self.assertTrue(rebrand.exact_product_line_allowed(rebrand.PRODUCT, path, line))
                for wrong_path in ("other/" + path, path.lower() + ".other", "docs/copied.md"):
                    self.assertFalse(rebrand.exact_product_line_allowed(rebrand.PRODUCT, wrong_path, line))
                self.assertFalse(rebrand.exact_product_line_allowed("web-apps", path, line))
                for changed in (" " + line, line + " ", line + " unrelated branding", line.upper()):
                    self.assertFalse(rebrand.exact_product_line_allowed(rebrand.PRODUCT, path, changed))

    def test_check_preserves_each_approved_line(self):
        for path, line in EXPECTED:
            with self.subTest(path=path):
                self.assertEqual(rebrand.process_file(rebrand.PRODUCT, path, line, False), (None, []))

    def test_rewrite_preserves_each_approved_line(self):
        for path, line in EXPECTED:
            with self.subTest(path=path):
                self.assertEqual(rebrand.process_file(rebrand.PRODUCT, path, line, True), (None, []))

    def test_same_file_new_brand_hit_still_fails(self):
        for path, line in EXPECTED:
            with self.subTest(path=path):
                _, findings = rebrand.process_file(rebrand.PRODUCT, path, line + "\n" + _UPSTREAM + " unrelated branding", False)
                self.assertTrue(findings)
                self.assertTrue(all(number == 2 for number, _ in findings))

    def test_changed_text_receives_no_line_exception(self):
        for path, line in EXPECTED:
            with self.subTest(path=path):
                changed = line + " " + _UPSTREAM + " unrelated branding"
                self.assertFalse(rebrand.exact_product_line_allowed(rebrand.PRODUCT, path, changed))
                _, findings = rebrand.process_file(rebrand.PRODUCT, path, changed, False)
                self.assertTrue(findings)

    def test_visible_comparison_exception_keeps_other_hits(self):
        path, line = next(pair for pair in EXPECTED if pair[0] == "README.md")
        with patch.object(rebrand, "tracked", return_value=[path]), patch.object(rebrand, "read_text", return_value=line):
            findings = []
            rebrand.visible_findings(".", ".", rebrand.PRODUCT, findings)
            self.assertEqual(findings, [])
        with patch.object(rebrand, "tracked", return_value=[path]), patch.object(rebrand, "read_text", return_value=line + "\nONLYOFFICE unrelated branding"):
            findings = []
            rebrand.visible_findings(".", ".", rebrand.PRODUCT, findings)
            self.assertTrue(findings)
            self.assertTrue(all(number == 2 for _, number, _ in findings))


if __name__ == "__main__":
    unittest.main()
