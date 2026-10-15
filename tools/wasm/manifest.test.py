#!/usr/bin/env python3
"""Verify artifact hashes and reject incomplete releases."""
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("manifest", Path(__file__).with_name("manifest.py"))
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)

class ManifestTest(unittest.TestCase):
    def test_artifacts_and_missing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "-c", "user.name=Test",
                            "-c", "user.email=test@example.invalid", "commit",
                            "--allow-empty", "-qm", "test"], check=True)
            (root / "patches").mkdir()
            (root / "patches/0001.patch").write_bytes(b"patch")
            names = ("x2t.js", "x2t.wasm", "x2t.js.br", "x2t.js.gz", "x2t.wasm.br", "x2t.wasm.gz")
            for name in names:
                (root / name).write_bytes(name.encode())
            result = manifest.generate(root, root, root, {"exceptions": "-fwasm-exceptions"})
            self.assertEqual(result, json.loads((root / "manifest.json").read_text()))
            self.assertEqual(result["artifacts"]["x2t.wasm"]["sha256"],
                             hashlib.sha256(b"x2t.wasm").hexdigest())
            self.assertEqual(result["artifacts"]["x2t.js"]["bytes"], 6)
            self.assertEqual(result["patches"]["0001.patch"], hashlib.sha256(b"patch").hexdigest())
            (root / "x2t.js.br").unlink()
            with self.assertRaises(FileNotFoundError):
                manifest.generate(root, root, root, {})

if __name__ == "__main__":
    unittest.main()
