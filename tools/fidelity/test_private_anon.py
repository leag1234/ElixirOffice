#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Private corpus: no file name or title in any tool output (docs/fidelity.md).

Builds fake corpora whose file names and manifest titles carry MARKER. Checks that the marker
never appears in stdout, stderr or any output file, including on forced errors. Control runs
on a non-private corpus show that the check does see a leak.

Run: python3 tools/fidelity/test_private_anon.py
The compare.py tests need numpy and opencv: run them in the tools image, for example
  docker run --rm -v "$PWD/tools:/t:ro" eo-cpdf-tools python3 /t/fidelity/test_private_anon.py
"""
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import corpus_anon as ca  # noqa: E402

MARKER = "ZZPRIVMARK"
REL_A = f"{MARKER}-fiche-maths.docx"
REL_B = f"sub/{MARKER}-evaluation.docx"


def make_corpus(root, name):
    """Synthetic corpus: manifest.csv with the marker in the file names and titles."""
    d = os.path.join(root, name)
    os.makedirs(d)
    rows = [("id", "file", "category", "title"),
            ("t01", REL_A, "maths", f"{MARKER} titre"),
            ("t02", REL_B, "histoire", f"{MARKER} evaluation")]
    with open(os.path.join(d, "manifest.csv"), "w", encoding="utf-8", newline="") as fh:
        for row in rows:
            fh.write(",".join(row) + "\n")
    for rel in (REL_A, REL_B):
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as fh:
            fh.write(b"synthetic test document, no content")
    return d


def tree_has(path, needle):
    """True when needle (bytes) occurs in a file name or in the content of any file under path."""
    for dirpath, dirnames, filenames in os.walk(path):
        for name in dirnames + filenames:
            if needle in name.encode("utf-8"):
                return True
        for name in filenames:
            with open(os.path.join(dirpath, name), "rb") as fh:
                if needle in fh.read():
                    return True
    return False


class PrivateOutputs(unittest.TestCase):
    def setUp(self):
        # "corpus-private" in the path makes the corpus private, as on the real corpus directory.
        self.root = tempfile.mkdtemp(prefix="corpus-private-")
        self.corpus = make_corpus(self.root, "corpus")
        self.secret = os.path.join(self.root, "secret")
        with open(self.secret, "w") as fh:
            fh.write("test-secret\n")

    def convert(self, corpus, out, env_extra=None, private_flag=False):
        cmd = [sys.executable, os.path.join(HERE, "convert.py"), "--corpus", corpus, "--out", out,
               "--ds", "http://127.0.0.1:9", "--secret-file", self.secret, "--serve-host", "127.0.0.1",
               "--serve-port", "0", "--run-key", "test", "--timeout", "5"]
        if private_flag:
            cmd.append("--private")
        env = dict(os.environ, **(env_extra or {}))
        return subprocess.run(cmd, capture_output=True, text=True, env=env)

    def test_convert_private_forced_error_leaks_nothing(self):
        out = os.path.join(self.root, "out")
        p = self.convert(self.corpus, out)  # DocumentServer is unreachable: every document fails
        self.assertEqual(p.returncode, 2, p.stdout + p.stderr)
        self.assertIn("doc-", p.stderr)
        self.assertNotIn(MARKER, p.stdout + p.stderr)
        self.assertFalse(tree_has(out, MARKER.encode()), "marker found in an output file")

    def test_convert_private_by_env_leaks_nothing(self):
        out = os.path.join(self.root, "out-env")
        corpus = make_corpus(self.root, "plain")  # path without corpus-private: env switch only
        p = self.convert(corpus, out, env_extra={"EO_PRIVATE_CORPUS": "1"})
        self.assertEqual(p.returncode, 2)
        self.assertNotIn(MARKER, p.stdout + p.stderr)
        self.assertFalse(tree_has(out, MARKER.encode()))

    def test_control_non_private_shows_names(self):
        # Control: the same run without private mode must show the marker, so the test can fail.
        root = tempfile.mkdtemp(prefix="corpus-fake-")
        corpus = make_corpus(root, "corpus")
        out = os.path.join(root, "out")
        p = self.convert(corpus, out)
        self.assertEqual(p.returncode, 2)
        self.assertIn(MARKER, p.stdout + p.stderr)

    def test_guard_forced_error_leaks_nothing(self):
        code = (f"import sys; sys.path.insert(0, {HERE!r}); import corpus_anon as ca\n"
                f"docs, _ = ca.load_docs({self.corpus!r}, True)\n"
                f"def boom():\n    raise RuntimeError('cannot open ' + {REL_B!r})\n"
                "ca.guard(boom)\n")
        p = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)
        self.assertIn("RuntimeError", p.stderr)
        self.assertNotIn(MARKER, p.stdout + p.stderr)

    def test_guard_forced_error_control_shows_names(self):
        code = (f"import sys; sys.path.insert(0, {HERE!r}); import corpus_anon as ca\n"
                f"def boom():\n    raise RuntimeError('cannot open ' + {REL_B!r})\n"
                "ca.guard(boom)\n")
        p = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
        self.assertIn(MARKER, p.stderr)

    def test_load_docs_private_rows_have_only_ids(self):
        docs, _ = ca.load_docs(self.corpus, True)
        self.assertEqual([d["id"] for d in docs], [ca.anon_id(REL_A), ca.anon_id(REL_B)])
        for d in docs:
            self.assertEqual(d["file"], "")
            self.assertEqual(set(d) - {"_rel"}, {"id", "file"})
            self.assertNotIn(MARKER, repr(d["id"]))

    def test_scrubber_covers_plain_and_quoted_forms(self):
        scrub = ca.Scrubber([REL_B])
        text = f"GET /x/{urllib.parse.quote(REL_B)} {REL_B} {MARKER}-evaluation {os.path.basename(REL_B)}"
        self.assertNotIn(MARKER, scrub(text))
        self.assertIn(ca.anon_id(REL_B), scrub(text))

    def test_anon_id_is_stable_and_matches_shell_and_js(self):
        # Same vector in tools/client-pdf/test-anon.mjs and tools/fidelity/lo-convert.sh (printf | sha256sum).
        self.assertEqual(ca.anon_id("a/Fiche maths.docx"), "doc-c97d1be596")
        self.assertEqual(ca.anon_id("a\\b.docx"), ca.anon_id("a/b.docx"))

    def test_compare_private_no_marker(self):
        try:
            import compare  # noqa: F401  (needs numpy, opencv, scikit-image)
        except ImportError as e:
            self.skipTest(f"compare.py dependencies missing ({e}); run in the tools image")
        empty = os.path.join(self.root, "empty-refs")
        os.makedirs(empty)
        out = os.path.join(self.root, "run")
        cmd = [sys.executable, os.path.join(HERE, "compare.py"), "--ref-dir", empty, "--cand-dir", empty,
               "--corpus", self.corpus, "--out", out, "--private"]
        p = subprocess.run(cmd, capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("doc-", p.stderr)
        self.assertNotIn(MARKER, p.stdout + p.stderr)
        self.assertFalse(tree_has(out, MARKER.encode()) if os.path.isdir(out) else False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
