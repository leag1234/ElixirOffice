#!/usr/bin/env python3
"""Validate a versioned artifact set and install it into a selected SDK worktree.

No generated wasm/glue is committed. W5 will wire this into production images.
Usage: install-runtime.py RELEASE_DIR SDKJS_DIR
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

release, sdk = map(Path, sys.argv[1:])
manifest = json.loads((release / "manifest.json").read_text())
if manifest.get("build_flags", {}).get("module_kind") != "pdf":
    raise SystemExit("the browser PDF runtime requires a PDF-only manifest")
version = manifest["artifact_version"]
if not version or any(c not in "0123456789abcdef-stm" for c in version):
    raise SystemExit("invalid artifact version")
for name, item in manifest["artifacts"].items():
    if name not in ("x2t.js", "x2t.wasm", "x2t.js.gz", "x2t.js.br", "x2t.wasm.gz", "x2t.wasm.br"):
        raise SystemExit("unexpected artifact")
    data = (release / name).read_bytes()
    if len(data) != item["bytes"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
        raise SystemExit("artifact checksum mismatch")
if len(manifest["artifacts"]) != 6:
    raise SystemExit("incomplete artifact set")
destination = sdk / "common/clientpdf/runtime" / version
destination.mkdir(parents=True, exist_ok=True)
for name in (*manifest["artifacts"], "manifest.json"):
    shutil.copy2(release / name, destination / name)
pointer = destination.parent / "current.json"
temporary = pointer.with_suffix(".json.tmp")
temporary.write_text(json.dumps({"artifact_version": version}) + "\n")
temporary.replace(pointer)
print("installed", version)
