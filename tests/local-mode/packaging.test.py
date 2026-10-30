#!/usr/bin/env python3
"""Exercise the deployed packaging gate with the real tracked overlay inventory."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ("x2t.js", "x2t.wasm", "x2t.js.br", "x2t.js.gz", "x2t.wasm.br", "x2t.wasm.gz")

class PackagingInventory(unittest.TestCase):
    def gate(self, mutation=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            product = root / "product"
            script = product / "tests/local-mode/packaging.py"
            script.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / "tests/local-mode/packaging.py", script)
            tools = product / "tools/wasm"
            tools.mkdir(parents=True)
            patches = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in sorted((ROOT / "tools/wasm/patches").glob("*.patch"))}
            self.assertEqual(len(patches), 11, "Current tracked overlay inventory changed")
            self.assertIn("0012-pptx-external-timing-media.patch", patches)
            if mutation == "missing":
                patches.pop("0001-fb2file-static-replace-all.patch")
            elif mutation == "extra":
                patches["9999-unapproved.patch"] = "0" * 64
            sdk = root / "sdk"
            apps = root / "apps"
            for kind, relative, selector in [
                ("full", "common/wasm-convert", "runtime-release.json"),
                ("pdf", "common/clientpdf", "pdf-runtime-release.json"),
            ]:
                service = sdk / "sdkjs" / relative
                version = "0123456789ab-abcdef012345-st"
                release = service / "runtime" / version
                release.mkdir(parents=True)
                artifacts = {}
                for name in ARTIFACTS:
                    data = (kind + name).encode()
                    (release / name).write_bytes(data)
                    artifacts[name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                manifest = {
                    "artifact_version": version, "artifacts": artifacts, "patches": patches,
                    "sources": {"patches/" + k: v for k, v in patches.items()},
                    "tools_sha256": "0" * 64, "core_commit": "1" * 40,
                    "product_commit": "2" * 40,
                    "build_flags": {"module_kind": kind, "pdf_original_append": kind == "pdf"},
                }
                raw = json.dumps(manifest).encode()
                (release / "manifest.json").write_bytes(raw)
                pin = {"artifact_version": version, "manifest_sha256": hashlib.sha256(raw).hexdigest()}
                (tools / selector).write_text(json.dumps(pin))
                if kind == "full":
                    (service / "runtime-release.json").write_text(json.dumps(pin))
                    helpers = ("api.js", "worker.js", "pdf.js")
                else:
                    (service / "runtime/current.json").write_text(json.dumps(pin))
                    helpers = ("clientpdf.js", "wasm-pdf.js", "wasm-worker.js", "wasm-fonts.js")
                for name in helpers:
                    (service / name).write_text("// public fixture helper\n")
            for editor in ("documenteditor", "spreadsheeteditor", "presentationeditor", "pdfeditor"):
                bundle = apps / "web-apps/apps" / editor / "main/app.js"
                bundle.parent.mkdir(parents=True)
                bundle.write_text("// ElixirLocal compiled bundle fixture\n")
            return subprocess.run(["python3", str(script), str(sdk), str(apps)],
                                  capture_output=True, text=True)

    def test_actual_tracked_inventory_is_accepted(self):
        result = self.gate()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_overlay_is_rejected(self):
        self.assertNotEqual(self.gate("missing").returncode, 0)

    def test_unapproved_extra_overlay_is_rejected(self):
        self.assertNotEqual(self.gate("extra").returncode, 0)

if __name__ == "__main__":
    unittest.main()
