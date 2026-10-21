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
product = Path(__file__).resolve().parents[2]
assert pin == json.loads((product / "tools/wasm/runtime-release.json").read_text()), "full product/SDK pins diverge"
release = service / "runtime" / pin["artifact_version"]
raw = (release / "manifest.json").read_bytes()
assert hashlib.sha256(raw).hexdigest() == pin["manifest_sha256"]
manifest = json.loads(raw)
for name, expected in manifest["artifacts"].items():
    data = (release / name).read_bytes()
    assert len(data) == expected["bytes"], name
    assert hashlib.sha256(data).hexdigest() == expected["sha256"], name
pdf = sdk / "sdkjs/common/clientpdf"
pdf_pin = json.loads((Path(__file__).resolve().parents[2] / "tools/wasm/pdf-runtime-release.json").read_text())
assert json.loads((pdf / "runtime/current.json").read_text())["artifact_version"] == pdf_pin["artifact_version"]
pdf_release = pdf / "runtime" / pdf_pin["artifact_version"]
pdf_raw = (pdf_release / "manifest.json").read_bytes()
assert hashlib.sha256(pdf_raw).hexdigest() == pdf_pin["manifest_sha256"]
pdf_manifest = json.loads(pdf_raw)
assert manifest["build_flags"]["module_kind"] == "full"
assert pdf_manifest["build_flags"]["module_kind"] == "pdf"
for field in ["core_commit", "product_commit", "tools_sha256", "patches", "sources"]:
    assert manifest[field] == pdf_manifest[field], field
# Overlay numbering skips 0003; the approved inventory contains ten files.
assert len(manifest["patches"]) == 10
assert "0011-pdf-preserve-creator.patch" in manifest["patches"]
assert "0010-office-integrity-rejection.patch" in manifest["patches"]
assert pdf_manifest["build_flags"]["pdf_original_append"] is True
for name, expected in pdf_manifest["artifacts"].items():
    data = (pdf_release / name).read_bytes()
    assert len(data) == expected["bytes"] and hashlib.sha256(data).hexdigest() == expected["sha256"], name
for name in ["clientpdf.js", "wasm-pdf.js", "wasm-worker.js", "wasm-fonts.js"]:
    assert (pdf / name).stat().st_size > 0, name
for name in ["api.js", "worker.js", "pdf.js"]:
    assert (service / name).stat().st_size > 0, name
for editor in ["documenteditor", "spreadsheeteditor", "presentationeditor", "pdfeditor"]:
    bundle = apps / "web-apps/apps" / editor / "main/app.js"
    assert "ElixirLocal" in bundle.read_text(), editor
assert not (apps / "web-apps/apps/common/main/lib/elixir-local/Controller.js").exists()
print("PASS both deployed pins/manifests/artifact hashes, conversion/PDF helpers and all four production bundles (including PDF); no raw Controller")
