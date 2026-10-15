#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Provision build-only Python libraries in the caller-owned cache."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

PIP_URL = "https://files.pythonhosted.org/packages/b7/3f/945ef7ab14dc4f9d7f40288d2df998d1837ee0888ec3659c813487572faa/pip-25.2-py3-none-any.whl"
PIP_SHA256 = "6d67a2b4e7f14d8b31b8b52648866fa717f45a1eb70e83002f4331d07e953717"
PIP_BYTES = 1752557

def clean_environment(cache, path):
    return {"HOME": str(cache / "home"), "TMPDIR": str(cache / "tmp"),
            "PATH": path, "PYTHONDONTWRITEBYTECODE": "1"}

def commands(root, cache, interpreter):
    python = cache / "python/bin/python3"
    wheel = cache / "pip/pip-25.2-py3-none-any.whl"
    return [
        [str(interpreter), "-m", "venv", "--without-pip", str(cache / "python")],
        [str(python), "-m", "pip", "--isolated", "install", "--no-index",
         "--no-deps", "--disable-pip-version-check", str(wheel)],
        [str(python), "-m", "pip", "--isolated", "install", "--cache-dir",
         str(cache / "pip"), "--disable-pip-version-check", "-r",
         str(root / "tools/desktop/requirements.txt")],
    ]

def provision(root, cache):
    if sys.version_info < (3, 9):
        raise RuntimeError("Build Python requires version 3.9 or newer")
    root = root.resolve()
    if cache.is_symlink():
        raise RuntimeError("Build cache must not be a symbolic link")
    cache = cache.resolve()
    for directory in (cache, cache / "home", cache / "tmp", cache / "pip", cache / "python"):
        if directory.is_symlink():
            raise RuntimeError("Build cache subdirectory must not be a symbolic link")
        directory.mkdir(parents=True, exist_ok=True)
    wheel = cache / "pip/pip-25.2-py3-none-any.whl"
    if wheel.is_symlink():
        raise RuntimeError("Bootstrap wheel must not be a symbolic link")
    if not wheel.exists():
        temporary = wheel.with_name(wheel.name + "." + str(os.getpid()) + ".part")
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(PIP_URL, timeout=120) as response:
                data = response.read(PIP_BYTES + 1)
            if len(data) != PIP_BYTES or hashlib.sha256(data).hexdigest() != PIP_SHA256:
                raise RuntimeError("Python bootstrap checksum mismatch")
            with temporary.open("xb") as output:
                output.write(data)
            temporary.replace(wheel)
        finally:
            temporary.unlink(missing_ok=True)
    if wheel.stat().st_size != PIP_BYTES or hashlib.sha256(wheel.read_bytes()).hexdigest() != PIP_SHA256:
        raise RuntimeError("Cached Python bootstrap checksum mismatch")
    environment = clean_environment(cache, os.environ["PATH"])
    steps = commands(root, cache, sys.executable)
    subprocess.run(steps[0], env=environment, check=True)
    # The verified wheel supplies pip only for its own offline bootstrap install.
    subprocess.run(steps[1], env={**environment, "PYTHONPATH": str(wheel)}, check=True)
    subprocess.run(steps[2], env=environment, check=True)
    check = """import json,sys;from pathlib import Path;import PIL,lxml.etree
assert Path(sys.prefix).resolve()==Path(sys.argv[1]).resolve(), 'Build interpreter escaped private venv'
assert PIL.__version__=='10.2.0', 'Unexpected Pillow build version'
assert lxml.etree.LXML_VERSION[:3]==(6,1,3), 'Unexpected lxml build version'
print(json.dumps({'prefix':sys.prefix,'Pillow':PIL.__version__,'lxml':'.'.join(map(str,lxml.etree.LXML_VERSION[:3]))}))
"""
    result = subprocess.check_output(
        [str(cache / "python/bin/python3"), "-c", check, str(cache / "python")],
        env=environment, text=True)
    record = json.loads(result)
    record["pip_bootstrap_sha256"] = PIP_SHA256
    (cache / "python-info.json").write_text(json.dumps(record, indent=2) + "\n")
    print("PASS private build Python: " + json.dumps(record), flush=True)
    return record

if __name__ == "__main__":
    provision(Path(sys.argv[1]), Path(sys.argv[2]))
