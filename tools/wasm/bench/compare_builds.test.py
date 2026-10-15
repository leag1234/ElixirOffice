#!/usr/bin/env python3
"""Ensure the normalization keeps content and reference relationships significant."""
import importlib.util
import io
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("compare_builds", Path(__file__).with_name("compare_builds.py"))
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)

def package(entries):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, content in entries:
            archive.writestr(name, content)
    return output.getvalue()

class ComparisonTest(unittest.TestCase):
    def test_archive_order_and_nested_content(self):
        a = package([("word/document.xml", "<doc>hello</doc>"), ("embedded.xlsx", package([("xl/a.xml", "<a/>")]))])
        b = package([("embedded.xlsx", package([("xl/a.xml", "<a/>")])), ("word/document.xml", "<doc>hello</doc>")])
        self.assertEqual(comparison.normalize_zip(a), comparison.normalize_zip(b))
        bad = package([("word/document.xml", "<doc>lost text</doc>")])
        self.assertNotEqual(comparison.normalize_zip(a), comparison.normalize_zip(bad))

    def test_generated_axes_preserve_relationships(self):
        a = '<chart><axId val="10"/><axId val="20"/><crossAx val="20"/></chart>'
        b = '<chart><axId val="30"/><axId val="40"/><crossAx val="40"/></chart>'
        bad = '<chart><axId val="30"/><axId val="40"/><crossAx val="30"/></chart>'
        name = "xl/charts/chart1.xml"
        self.assertEqual(comparison.normalize_xml(name, a), comparison.normalize_xml(name, b))
        self.assertNotEqual(comparison.normalize_xml(name, a), comparison.normalize_xml(name, bad))

    def test_comment_id_only(self):
        a = '<comments><comment durableId="12" text="hello"/></comments>'
        b = '<comments><comment durableId="34" text="hello"/></comments>'
        bad = '<comments><comment durableId="34" text="missing"/></comments>'
        name = "word/commentsIds.xml"
        self.assertEqual(comparison.normalize_xml(name, a), comparison.normalize_xml(name, b))
        self.assertNotEqual(comparison.normalize_xml(name, a), comparison.normalize_xml(name, bad))

if __name__ == "__main__":
    unittest.main()
