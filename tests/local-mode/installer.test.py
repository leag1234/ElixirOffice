#!/usr/bin/env python3
"""Verify full-runtime pinning and corruption rejection before installation."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

class Installation(unittest.TestCase):
    def test_pin_kind_payload_and_install(self):
        source = Path(os.environ["UPSTREAM"]) / "sdkjs/common/wasm-convert"
        names = ["x2t.js", "x2t.wasm", "x2t.js.gz", "x2t.js.br", "x2t.wasm.gz", "x2t.wasm.br"]
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            sdk = root / "sdk"
            sdk.mkdir()
            release = root / "release"
            release.mkdir()
            shutil.copy2(source / "install-runtime.py", sdk)
            artifacts = {}
            for name in names:
                data = name.encode()
                (release / name).write_bytes(data)
                artifacts[name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            version = "0123456789ab-abcdef012345-st"
            manifest = {"artifact_version": version, "build_flags": {"module_kind": "full"}, "artifacts": artifacts}
            def pin():
                raw = json.dumps(manifest).encode()
                (release / "manifest.json").write_bytes(raw)
                (sdk / "runtime-release.json").write_text(json.dumps({"artifact_version": version, "manifest_sha256": hashlib.sha256(raw).hexdigest()}))
            def run():
                return subprocess.run(["python3", str(sdk / "install-runtime.py"), str(release)], capture_output=True)
            pin()
            (release / "x2t.wasm").write_bytes(b"corrupt")
            self.assertNotEqual(run().returncode, 0)
            self.assertFalse((sdk / "runtime").exists())
            (release / "x2t.wasm").write_bytes(b"x2t.wasm")
            (release / "manifest.json").write_bytes(b"wrong manifest")
            self.assertNotEqual(run().returncode, 0)
            self.assertFalse((sdk / "runtime").exists())
            manifest["build_flags"]["module_kind"] = "pdf"
            pin()
            self.assertNotEqual(run().returncode, 0)
            self.assertFalse((sdk / "runtime").exists())
            manifest["build_flags"]["module_kind"] = "full"
            pin()
            self.assertEqual(run().returncode, 0)
            for name in names + ["manifest.json"]:
                self.assertEqual((sdk / "runtime" / version / name).read_bytes(), (release / name).read_bytes())
        actual = json.loads((source / "runtime-release.json").read_text())
        self.assertIn(actual["artifact_version"], (source / "api.js").read_text())

if __name__ == "__main__":
    unittest.main()
