#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Prepare a pinned, checksum-validated runtime context for the image layer."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("release", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--pin", type=Path, default=here.parent / "wasm/runtime-release.json")
args = parser.parse_args()
pin = json.loads(args.pin.read_text())
manifest_bytes = (args.release / "manifest.json").read_bytes()
manifest = json.loads(manifest_bytes)
if manifest["artifact_version"] != pin["artifact_version"] or hashlib.sha256(manifest_bytes).hexdigest() != pin["manifest_sha256"]:
    raise SystemExit("runtime does not match the pinned release")
# Installer validates all six artifacts before creating any SDK directory.
subprocess.run([sys.executable, str(here.parent / "wasm/install-runtime.py"),
                str(args.release), str(args.output / "sdkjs")], check=True)
shutil.copytree(here.parent.parent / "branding/build/wasm-nginx",
                args.output / "nginx", dirs_exist_ok=True)
print("runtime image context:", args.output)
