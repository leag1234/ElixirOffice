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
    def test_product_names_and_unrelated_disclaimers_are_still_reported(self):
        for line in [f"{_upstream_name} editor", f"Not affiliated: try {_upstream_name}", f"ElixirOffice uses {_upstream_name} for everything", f"ElixirOffice is not affiliated with or endorsed by Microsoft, Ascensio System SIA or the {_upstream_name} project. {_upstream_name} is great"]:
            with self.subTest(line=line):
                self.assertIsNone(rebrand.KEEP_STRICT.search(line))
if __name__ == "__main__":
    unittest.main()
