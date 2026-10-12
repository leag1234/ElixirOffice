#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Verify the artifacts produced by the real SDK and editor build pipelines."""
import hashlib
import json
import sys
from pathlib import Path

sdk, apps = map(Path, sys.argv[1:])
service = sdk / "sdkjs/common/wasm-convert"
pin = json.loads((service / "runtime-release.json").read_text())
release = service / "runtime" / pin["artifact_version"]
raw = (release / "manifest.json").read_bytes()
assert hashlib.sha256(raw).hexdigest() == pin["manifest_sha256"]
manifest = json.loads(raw)
for name, expected in manifest["artifacts"].items():
    data = (release / name).read_bytes()
    assert len(data) == expected["bytes"], name
    assert hashlib.sha256(data).hexdigest() == expected["sha256"], name
for name in ["api.js", "worker.js"]:
    assert (service / name).stat().st_size > 0, name
for editor in ["documenteditor", "spreadsheeteditor", "presentationeditor"]:
    bundle = apps / "web-apps/apps" / editor / "main/app.js"
    assert "ElixirLocal" in bundle.read_text(), editor
assert not (apps / "web-apps/apps/common/main/lib/elixir-local/Controller.js").exists()
print("PASS deployed pin/manifest/six artifact hashes, API/worker and all three production bundles; no raw Controller")
