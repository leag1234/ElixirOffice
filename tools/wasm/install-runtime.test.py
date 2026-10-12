#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Reject wrong module kinds and corrupted releases before installing any files."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

class InstallerTest(unittest.TestCase):
    def test_kind_hash_and_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); release=root/"release"; release.mkdir(); sdk=root/"sdk"
            artifacts={}
            for name in ("x2t.js","x2t.wasm","x2t.js.gz","x2t.js.br","x2t.wasm.gz","x2t.wasm.br"):
                data=name.encode(); (release/name).write_bytes(data)
                artifacts[name]={"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
            manifest={"artifact_version":"0123456789ab-abcdef012345-st","build_flags":{"module_kind":"full"},"artifacts":artifacts}
            def run():
                (release/"manifest.json").write_text(json.dumps(manifest))
                return subprocess.run([sys.executable,str(Path(__file__).with_name("install-runtime.py")),str(release),str(sdk)],capture_output=True,text=True)
            self.assertNotEqual(run().returncode,0)
            self.assertFalse(sdk.exists())
            manifest["build_flags"]["module_kind"]="pdf"
            (release/"x2t.wasm").write_bytes(b"tampered")
            self.assertNotEqual(run().returncode,0)
            self.assertFalse(sdk.exists())
            (release/"x2t.wasm").write_bytes(b"x2t.wasm")
            self.assertEqual(run().returncode,0)
            target=sdk/"common/clientpdf/runtime"/manifest["artifact_version"]
            self.assertEqual((target/"x2t.wasm").read_bytes(),b"x2t.wasm")
            self.assertEqual(json.loads((target.parent/"current.json").read_text()), {"artifact_version": manifest["artifact_version"]})

if __name__=="__main__":
    unittest.main()
