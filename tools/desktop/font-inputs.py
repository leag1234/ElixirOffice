#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Select licensed standard desktop fonts; keep full inputs untouched."""
import shutil, sys
from pathlib import Path

core, pack, out = map(Path, sys.argv[1:])
if out.exists():
    raise SystemExit("Choose a fresh font input directory")
# Metric-compatible office fonts, broad fallback, UI fonts and all licensed
# school/symbol additions. Full Unicode families remain an optional full set.
for name in ("liberation", "crosextra", "caladea", "dejavu", "opensans"):
    source = core / name
    if not source.is_dir():
        raise SystemExit("Missing standard font family: " + name)
    shutil.copytree(source, out / "core" / name)
# These upstream notices match the selected fonts' 1.07.4 licence records.
notice = Path(__file__).parent / "licenses/liberation-1.07.4"
for name in ("License.txt", "COPYING"):
    shutil.copy2(notice / name, out / "core/liberation" / name)
shutil.copytree(pack, out / "pack", ignore=shutil.ignore_patterns(".git"))
for source in (out / "core", out / "pack"):
    fonts = list(source.rglob("*.ttf")) + list(source.rglob("*.otf"))
    if not fonts:
        raise SystemExit("Empty standard font source")
print("PASS standard metric-compatible, school, UI and symbol font inputs")
