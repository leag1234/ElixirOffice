#!/usr/bin/env python3
"""Run real bundled libxml code against synthetic positive and hostile inputs."""
import json
import os
import subprocess
import sys
from pathlib import Path

binary = Path(sys.argv[1]).resolve()
fixtures = Path(sys.argv[2]).resolve()
fixtures.mkdir(parents=True, exist_ok=False)
(fixtures / "public-external.txt").write_text("PUBLIC_EXTERNAL_SENTINEL")
(fixtures / "public-external.dtd").write_text('<!ENTITY outside "PUBLIC_EXTERNAL_SENTINEL">')
(fixtures / "public-document.xml").write_text(
    '<!DOCTYPE root [<!ENTITY ext SYSTEM "' +
    (fixtures / "public-external.txt").as_uri() + '">]><root>&ext;</root>')
modes = [
    "plain", "xxe-control", "xxe-blocked", "idref-remove", "internal-entity",
    "reader-xxe-blocked", "parameter-xxe-blocked", "file-xxe-blocked",
    "quiet-malformed", "external-subparser-control", "external-subparser-blocked",
    "ctxt-file-xxe-blocked",
]
rows = []
for mode in modes:
    result = subprocess.run([str(binary), mode], capture_output=True, text=True,
        timeout=30, env={**os.environ,
            "ASAN_OPTIONS": "detect_leaks=1:halt_on_error=1",
            "UBSAN_OPTIONS": "halt_on_error=1"})
    passed = result.returncode == 0 and not result.stdout and not result.stderr
    rows.append(dict(mode=mode, passed=passed, exit=result.returncode,
        stdout=result.stdout, stderr=result.stderr))
    print(("PASS " if passed else "FAIL ") + mode, flush=True)
(fixtures / "results.json").write_text(json.dumps(rows, indent=2) + "\n")
sys.exit(0 if all(row["passed"] for row in rows) else 1)
