# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util
from pathlib import Path
import unittest
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("rebrand", root / "tools/rebrand/rebrand.py")
rebrand = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rebrand)

_upstream_name = 'Euro' + '-Office'

class LegalAttribution(unittest.TestCase):
    def test_exact_non_affiliation_disclaimer_is_attribution(self):
        text = (root / "tools/release/desktop-beta3-release-notes.md").read_text()
        line = next(line for line in text.splitlines() if line.startswith("ElixirOffice is not affiliated"))
        self.assertIsNotNone(rebrand.KEEP_STRICT.search(line))
    def test_requested_comparison_is_exact_and_readme_only(self):
        text = (root / "README.md").read_text()
        lines = [line for line in text.splitlines() if any(rx.fullmatch(line) for rx in rebrand.README_COMPARISON)]
        self.assertEqual(len(lines), 2)
        for line in lines:
            with self.subTest(line=line):
                changed, findings = rebrand.process_file(rebrand.PRODUCT, "README.md", line, False)
                self.assertIsNone(changed)
                self.assertEqual(findings, [])
                self.assertTrue(any("README.md" in globs and rx.fullmatch(line) for globs, rx, _ in rebrand.VISIBLE_ALLOW))
                for path, value in [("other.md", line), ("README.md", line + " Unrelated product promotion"), ("README.md", line.replace("Compared", "Compare"))]:
                    if value == line and path == "README.md":
                        continue
                    _, rejected = rebrand.process_file(rebrand.PRODUCT, path, value, False)
                    self.assertTrue(rejected, (path, value))

    def test_product_names_and_unrelated_disclaimers_are_still_reported(self):
        for line in [f"{_upstream_name} editor", f"Not affiliated: try {_upstream_name}", f"ElixirOffice uses {_upstream_name} for everything", f"ElixirOffice is not affiliated with or endorsed by Microsoft, Ascensio System SIA or the {_upstream_name} project. {_upstream_name} is great"]:
            with self.subTest(line=line):
                self.assertIsNone(rebrand.KEEP_STRICT.search(line))
if __name__ == "__main__":
    unittest.main()
