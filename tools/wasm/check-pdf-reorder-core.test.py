#!/usr/bin/env python3
"""Exercise the guard against actual old/fixed core sources and unsafe edits."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

GUARD = Path(__file__).with_name("check-pdf-reorder-core.py")
CORE = Path(os.environ["EO_CORE_REPO"])
FIXED = "39ca5772b45dacfcd17ef1ea45eea8ee5d178a32"


class ReorderCoreGuard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixed = subprocess.check_output(
            ["git", "-C", str(CORE), "show", FIXED + ":PdfFile/PdfEditor.cpp"],
            text=True)
        cls.old = subprocess.check_output(
            ["git", "-C", str(CORE), "show", FIXED + "^:PdfFile/PdfEditor.cpp"],
            text=True)

    def check_source(self, source, expected):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            if source is not None:
                (root / "PdfFile").mkdir()
                (root / "PdfFile/PdfEditor.cpp").write_text(source)
            result = subprocess.run(
                ["python3", str(GUARD), str(root)], capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, expected, result.stderr)

    def test_exact_fixed_core(self):
        self.check_source(self.fixed, True)

    def test_old_core(self):
        self.check_source(self.old, False)

    def test_comment_cannot_supply_the_fix(self):
        branch = self.fixed.split("if (bActualPos)", 1)[1].split("\n\telse", 1)[0]
        self.check_source(self.old + "\n/* if (bActualPos)" + branch + "else{ */", False)

    def test_missing_original_lookup(self):
        self.check_source(self.fixed.replace(
            "nPageIndex = pCatalog->findPage(pPageRef.first, pPageRef.second);",
            "nPageIndex = _nPageIndex;", 1), False)

    def test_missing_lookup_failure_rejection(self):
        self.check_source(self.fixed.replace(
            "if (nPageIndex < 1)\n\t\t\treturn false;",
            "if (nPageIndex < 1)\n\t\t\tnPageIndex = 1;", 1), False)

    def test_different_method_cannot_supply_the_fix(self):
        self.check_source(self.fixed.replace(
            "bool CPdfEditor::EditPage(", "bool CPdfEditor::OtherPage(", 1), False)

    def test_disabled_fix_with_active_unsafe_branch(self):
        lookup = "nPageIndex = pCatalog->findPage(pPageRef.first, pPageRef.second);"
        branch = self.fixed.split("if (bActualPos)", 1)[1].split("\n\telse", 1)[0]
        unsafe = self.fixed.replace(lookup, "nPageIndex = _nPageIndex;", 1)
        marker = "if (bActualPos)"
        self.check_source(unsafe.replace(marker,
            "#if 0\n" + marker + branch + "else{}\n#endif\n" + marker, 1), False)

    def test_later_ordinal_override(self):
        lookup = "nPageIndex = pCatalog->findPage(pPageRef.first, pPageRef.second);"
        self.check_source(self.fixed.replace(lookup,
            lookup + "\n nPageIndex = _nPageIndex;", 1), False)

    def test_missing_file(self):
        self.check_source(None, False)


if __name__ == "__main__":
    unittest.main()
