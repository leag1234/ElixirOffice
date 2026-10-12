#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""The wasm gate must reject incomplete evidence and local fallback."""
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("gate", Path(__file__).with_name("gate.py"))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class WasmGateTest(unittest.TestCase):
    def run_gate(self, backend="wasm", fallback=None, compared=True, size=100, unicode=True):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for directory, n in (("client", size), ("server", 100)):
                (root/directory).mkdir()
                (root/directory/"a.pdf").write_bytes(b"x"*n)
            stats = {"backend": backend, "totalMs": 10}
            if fallback: stats["fallbacks"] = [fallback]
            (root/"bench.json").write_text(json.dumps([{"id":"a", "client":{"stats":stats, "uploads":0}}]))
            (root/"results.json").write_text(json.dumps({"documents":[{"id":"a","pages":[{"status":"compared","ssim":1}]}] if compared else []}))
            with patch.object(gate.sys, "argv", ["gate.py",str(root),str(root/"results.json"),"--wasm"]), \
                 patch.object(gate, "pages", return_value=1), \
                 patch.object(gate, "page_text", return_value="text"), \
                 patch.object(gate, "page_words", return_value=["text"]), \
                 patch.object(gate, "fonts", return_value=[{"name":"F","emb":True,"uni":unicode}]), \
                 contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit) as exit:
                    gate.main()
                return exit.exception.code, json.loads((root/"gate.json").read_text())
    def test_success_and_negative_evidence(self):
        self.assertEqual(self.run_gate()[0], 0)
        for args in ({"backend":"js"}, {"fallback":{"reason":"worker"}}, {"compared":False}, {"size":111}, {"unicode":False}):
            code, result = self.run_gate(**args)
            self.assertEqual(code, 1, args)
            self.assertFalse(result["summary"]["pass"])
            self.assertTrue(result["failures"])

if __name__ == "__main__":
    unittest.main()
