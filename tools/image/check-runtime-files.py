#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Verify that asset deployment preserved every release byte and its pointer."""
import hashlib
import json
import sys
from pathlib import Path
release, sdk = map(Path, sys.argv[1:])
manifest = json.loads((release / "manifest.json").read_text())
runtime = sdk / "common/clientpdf/runtime"
assert json.loads((runtime / "current.json").read_text())["artifact_version"] == manifest["artifact_version"]
destination = runtime / manifest["artifact_version"]
for name, item in manifest["artifacts"].items():
    data = (destination / name).read_bytes()
    assert len(data) == item["bytes"] and hashlib.sha256(data).hexdigest() == item["sha256"], name
assert (destination / "manifest.json").read_bytes() == (release / "manifest.json").read_bytes()
print("PASS: six raw/precompressed artifacts, manifest and current pointer preserved")
