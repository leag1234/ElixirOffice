#!/usr/bin/env python3
"""Pinned manifest and artifact checks happen before image-context writes."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

class RuntimeContextTest(unittest.TestCase):
    def test_pin_artifacts_and_pointer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); release = root / "release"; release.mkdir()
            version = "0123456789ab-abcdef012345-st"
            artifacts = {}
            for name in ("x2t.js", "x2t.wasm", "x2t.js.br", "x2t.js.gz", "x2t.wasm.br", "x2t.wasm.gz"):
                data = name.encode()
                (release / name).write_bytes(data)
                artifacts[name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            manifest = {"artifact_version": version, "build_flags": {"module_kind": "pdf"}, "artifacts": artifacts}
            data = json.dumps(manifest).encode(); (release / "manifest.json").write_bytes(data)
            pin = root / "pin.json"
            pin.write_text(json.dumps({"artifact_version": version, "manifest_sha256": hashlib.sha256(data).hexdigest()}))
            output = root / "output"
            def run():
                return subprocess.run([sys.executable, str(Path(__file__).with_name("prepare-runtime.py")),
                    str(release), str(output), "--pin", str(pin)], capture_output=True)
            (release / "manifest.json").write_bytes(data + b" ")
            self.assertNotEqual(run().returncode, 0); self.assertFalse(output.exists())
            (release / "manifest.json").write_bytes(data)
            (release / "x2t.wasm").write_bytes(b"bad")
            self.assertNotEqual(run().returncode, 0); self.assertFalse(output.exists())
            (release / "x2t.wasm").write_bytes(b"x2t.wasm")
            self.assertEqual(run().returncode, 0)
            target = output / "sdkjs/common/clientpdf/runtime"
            self.assertEqual(json.loads((target / "current.json").read_text()), {"artifact_version": version})
            self.assertEqual((target / version / "x2t.wasm").read_bytes(), b"x2t.wasm")
            self.assertTrue((output / "nginx/locations.conf").is_file())
if __name__ == "__main__":
    unittest.main()
