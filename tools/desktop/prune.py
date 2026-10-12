#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Trim unused desktop assets while preserving help and active editor languages."""
import json, shutil, sys
from pathlib import Path
from PIL import Image

LIMIT = 1_000_000

def prune(root):
    root = Path(root)
    report = {"removedBytes": 0, "staticHelpAnimations": 0, "removedFiles": 0}
    for relative in ("sdkjs/visio", "web-apps/apps/visioeditor", "web-apps/vendor/monaco"):
        directory = root / relative
        if directory.is_dir():
            files = [p for p in directory.rglob("*") if p.is_file()]
            report["removedBytes"] += sum(p.stat().st_size for p in files)
            report["removedFiles"] += len(files)
            shutil.rmtree(directory)
    for file in root.rglob("*_ie.js"):
        report["removedBytes"] += file.stat().st_size
        report["removedFiles"] += 1
        file.unlink()
    for file in root.rglob("*.gif"):
        if "help" not in file.relative_to(root).parts or file.stat().st_size <= LIMIT:
            continue
        before = file.stat().st_size
        with Image.open(file) as animation:
            animation.seek(0)
            frame = animation.copy()
            pixels = frame.convert("RGBA").tobytes()
        frame.save(file, format="GIF", save_all=False, optimize=True)
        with Image.open(file) as result:
            if result.n_frames != 1 or result.convert("RGBA").tobytes() != pixels:
                raise ValueError("Help first-frame verification failed: " + str(file))
        report["removedBytes"] += before - file.stat().st_size
        report["staticHelpAnimations"] += 1
    return report

if __name__ == "__main__":
    print(json.dumps(prune(sys.argv[1]), sort_keys=True))
