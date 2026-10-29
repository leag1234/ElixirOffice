# SPDX-License-Identifier: AGPL-3.0-only
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from differential import compare, extract_pdf, raster_metrics, text_metrics, write_html

HERE = Path(__file__).resolve().parent


def pdf(path, pages, font="Helvetica"):
    """Original test data; each page contains (x, y, literal ASCII text) lines."""
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    face = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/" + font)}))
    for lines in pages:
        page = writer.add_blank_page(width=240, height=200)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): face})})
        content = DecodedStreamObject()
        content.set_data(("\n".join(
            f"BT /F1 12 Tf {x} {y} Td ({text}) Tj ET" for x, y, text in lines)).encode("ascii"))
        page[NameObject("/Contents")] = writer._add_object(content)
    with open(path, "wb") as stream:
        writer.write(stream)


class DifferentialTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_identity_fonts_glyphs_and_raster(self):
        source = self.root / "source.pdf"
        pdf(source, [[(20, 170, "ALPHA BRAVO CHARLIE")]])
        result = compare(source, source, self.root / "report")
        self.assertEqual(result["diagnosticScore"], 100)
        self.assertEqual(result["text"]["coverage"], 1)
        self.assertEqual(result["raster"][0]["diffInk"], 0)
        self.assertEqual(result["fonts"]["reference"], {"Helvetica": 19})
        self.assertIsNone(result["text"]["firstPageDivergence"])
        self.assertTrue((self.root / "report/glyphs.json.gz").is_file())

    def test_changed_page_and_wrap_are_reported_separately(self):
        reference, candidate = self.root / "ref.pdf", self.root / "cand.pdf"
        pdf(reference, [[(20, 170, "ALPHA BRAVO")], [(20, 170, "CHARLIE DELTA")]])
        pdf(candidate, [[(20, 170, "ALPHA"), (20, 150, "BRAVO CHARLIE")], [(20, 170, "DELTA")]])
        result = text_metrics(extract_pdf(reference), extract_pdf(candidate))
        self.assertEqual(result["agreement"], 0.75)
        self.assertEqual(result["firstPageDivergence"]["word"], "charlie")
        self.assertTrue(result["firstWrapDivergence"]["referenceSameLine"])
        self.assertFalse(result["firstWrapDivergence"]["candidateSameLine"])

    def test_repeated_and_missing_words_do_not_inflate_coverage(self):
        reference, candidate = self.root / "ref.pdf", self.root / "cand.pdf"
        pdf(reference, [[(20, 170, "REPEAT REPEAT ALPHA BRAVO")]])
        pdf(candidate, [[(20, 170, "REPEAT REPEAT ALPHA")]])
        result = text_metrics(extract_pdf(reference), extract_pdf(candidate))
        self.assertEqual(result["uniqueReferenceTokens"], 2)
        self.assertEqual(result["matchedUniqueTokens"], 1)
        self.assertEqual(result["coverage"], 0.5)
        self.assertEqual(result["agreement"], 1)

    def test_extra_page_is_penalized_even_if_blank(self):
        a, b = self.root / "a.pdf", self.root / "b.pdf"
        pdf(a, [[(20, 170, "ALPHA")]])
        pdf(b, [[(20, 170, "ALPHA")], []])
        result = compare(a, b, self.root / "report")
        self.assertEqual(result["raster"][1]["status"], "missing-page")
        self.assertLess(result["diagnosticScore"], 100)

    def test_blank_documents_are_unscored(self):
        a = self.root / "blank.pdf"
        pdf(a, [[]])
        result = compare(a, a, self.root / "report")
        self.assertIsNone(result["diagnosticScore"])
        self.assertIsNone(result["text"]["coverage"])

    def test_tolerant_raster_does_not_hide_large_shift(self):
        from PIL import Image, ImageDraw
        a, b = self.root / "a.png", self.root / "b.png"
        for path, dx in ((a, 0), (b, 20)):
            image = Image.new("L", (100, 80), 255)
            ImageDraw.Draw(image).rectangle((10 + dx, 10, 20 + dx, 20), fill=0)
            image.save(path)
        result = raster_metrics(a, b, self.root / "diff.png", 100)
        self.assertGreater(result["diffInk"], 0.5)
        self.assertNotEqual(result["referenceInk"], result["candidateInk"])

    def test_rotated_pdf_is_explicitly_unsupported(self):
        from pypdf import PdfReader, PdfWriter
        a, b = self.root / "a.pdf", self.root / "b.pdf"
        pdf(a, [[(20, 170, "ALPHA")]])
        writer = PdfWriter()
        writer.add_page(PdfReader(a).pages[0].rotate(90))
        with b.open("wb") as stream:
            writer.write(stream)
        with self.assertRaisesRegex(ValueError, "Rotated"):
            extract_pdf(b)

    def test_html_escapes_untrusted_text(self):
        target = self.root / "index.html"
        write_html({"id": '<script>alert("x")</script>', "status": "failed"}, target)
        value = target.read_text()
        self.assertNotIn("<script>", value)
        self.assertIn("&lt;script&gt;", value)
        self.assertIn("Content-Security-Policy", value)

    def test_batch_failures_resume_and_denominator(self):
        a = self.root / "a.pdf"
        pdf(a, [[(20, 170, "ALPHA BRAVO")]])
        (self.root / "original.docx").write_bytes(b"Original comparison-only fixture")
        manifest = self.root / "manifest.jsonl"
        entries = [
            {"id": "exact", "input": "original.docx", "reference": "a.pdf",
             "candidate": "a.pdf", "reference_source": "synthetic-test-not-word"},
            {"id": "no-reference", "input": "original.docx"},
            {"id": "bad-pdf", "input": "original.docx", "reference": "original.docx",
             "candidate": "a.pdf"}]
        manifest.write_text("".join(json.dumps(e) + "\n" for e in entries))
        command = [sys.executable, str(HERE / "differential-batch.py"), "--compare-only",
                   "--manifest", str(manifest), "--out", str(self.root / "batch")]
        first = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertEqual(first.returncode, 2, first.stderr)
        summary = json.loads((self.root / "batch/aggregate.json").read_text())
        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["statusCounts"], {"compared": 1, "failed": 1, "missing-reference": 1})
        self.assertAlmostEqual(summary["conservativeAllCasesDiagnostic"], 100 / 3)
        result = self.root / "batch/exact/result.json"
        before = result.stat().st_mtime_ns
        second = subprocess.run(command, capture_output=True, text=True, timeout=30)
        self.assertEqual(second.returncode, 2)
        self.assertEqual(result.stat().st_mtime_ns, before, "Matching hashes must reuse receipt")
        changed = subprocess.run(command + ["--dpi", "101"], capture_output=True, text=True, timeout=30)
        self.assertEqual(changed.returncode, 2)
        self.assertNotEqual(result.stat().st_mtime_ns, before, "Changed raster config must invalidate resume")
        previous_mode = json.loads(result.read_text())["provenance"].get("fontMode")
        mode_command = command + ["--dpi", "101", "--font-mode", "system-allowed"]
        mode_run = subprocess.run(mode_command, capture_output=True, text=True, timeout=30)
        self.assertEqual(mode_run.returncode, 2, mode_run.stderr)
        current_mode = json.loads(result.read_text())["provenance"]["fontMode"]
        self.assertEqual(current_mode, "system-allowed")
        self.assertNotEqual(current_mode, previous_mode)
        cached_time = result.stat().st_mtime_ns
        image = result.parent / "candidate-1.png"
        original_image = image.read_bytes()
        image.write_bytes(b"corrupt cached image")
        repaired = subprocess.run(mode_command, capture_output=True, text=True, timeout=30)
        self.assertEqual(repaired.returncode, 2, repaired.stderr)
        self.assertNotEqual(result.stat().st_mtime_ns, cached_time)
        self.assertEqual(image.read_bytes(), original_image)

    def test_batch_csv_source_is_not_a_formula(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("batch", HERE / "differential-batch.py")
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        batch.aggregate([{"id": "safe", "status": "missing-reference",
                          "referenceSource": "=FORMULA()", "diagnosticScore": None}], self.root)
        import csv
        with (self.root / "aggregate.csv").open() as stream:
            row = next(csv.DictReader(stream))
        self.assertEqual(row["referenceSource"], "'=FORMULA()")

    def test_timeout_and_disk_budget_stop_owned_child(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("batch", HERE / "differential-batch.py")
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        with self.assertRaises(subprocess.TimeoutExpired):
            batch.bounded([sys.executable, "-c", "import time;time.sleep(20)"],
                          self.root / "timeout.log", 0.1, self.root)
        command = [sys.executable, "-c",
                   "import time;print('x'*2000000,flush=True);time.sleep(20)"]
        with self.assertRaisesRegex(OSError, "disk budget"):
            batch.bounded(command, self.root / "disk.log", 10, self.root, 1000000)

    def test_private_worker_path_is_rejected_before_read(self):
        command = [sys.executable, str(HERE / "differential-batch.py"),
                   "--worker-reference", str(self.root / "corpus-private/ref.pdf"),
                   "--worker-candidate", str(self.root / "candidate.pdf"),
                   "--out", str(self.root / "report")]
        result = subprocess.run(command, capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Private inputs are prohibited", result.stderr)
        self.assertFalse((self.root / "report").exists())

    def test_pdf_box_decimal_precision_is_not_a_full_geometry_failure(self):
        from pypdf import PdfReader, PdfWriter
        a = self.root / "base.pdf"
        pdf(a, [[(20, 170, "ALPHA")]])
        results = []
        for delta in (0.001, 1.0):
            page = PdfReader(a).pages[0]
            page.mediabox.upper_right = (240 + delta, 200)
            target = self.root / ("delta-" + str(delta) + ".pdf")
            writer = PdfWriter()
            writer.add_page(page)
            with target.open("wb") as stream:
                writer.write(stream)
            results.append(compare(a, target, self.root / ("report-" + str(delta))))
        self.assertEqual(results[0]["diagnosticScore"], 100,
                         "PDF decimal serialization precision must not remove 30 score points")
        self.assertFalse(results[0]["raster"][0]["samePageBox"])
        self.assertLess(results[1]["diagnosticScore"], 100,
                        "Real page-box change must remain visible and penalized")

    def test_partial_batch_does_not_look_complete(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location("batch", HERE / "differential-batch.py")
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        batch.aggregate([{"id": "done", "status": "compared", "diagnosticScore": 100}],
                        self.root, expected=3, state="running")
        result = json.loads((self.root / "aggregate.json").read_text())
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["processed"], 1)
        self.assertEqual(result["pending"], 2)
        self.assertEqual(result["runState"], "running")
        self.assertAlmostEqual(result["conservativeAllCasesDiagnostic"], 100 / 3)

    def test_disk_census_tolerates_atomic_rename_only(self):
        import importlib.util
        from types import SimpleNamespace
        spec = importlib.util.spec_from_file_location("batch", HERE / "differential-batch.py")
        batch = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(batch)
        def vanished():
            raise FileNotFoundError("Atomic settings rename between directory listing and stat")
        gone = SimpleNamespace(is_file=lambda: True, stat=vanished)
        present = SimpleNamespace(is_file=lambda: True, stat=lambda: SimpleNamespace(st_size=128))
        root = SimpleNamespace(rglob=lambda _: iter([gone, present]))
        self.assertEqual(batch.tree_bytes(root), 128)
        def denied():
            raise PermissionError("Must not hide inaccessible output")
        bad = SimpleNamespace(is_file=lambda: True, stat=denied)
        with self.assertRaises(PermissionError):
            batch.tree_bytes(SimpleNamespace(rglob=lambda _: iter([bad])))

    def test_pdf_page_budget(self):
        a = self.root / "two.pdf"
        pdf(a, [[], []])
        with self.assertRaisesRegex(ValueError, "page limit"):
            extract_pdf(a, max_pages=1)


if __name__ == "__main__":
    unittest.main()
