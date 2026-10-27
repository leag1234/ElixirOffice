# SPDX-License-Identifier: AGPL-3.0-only
"""Reject explicit unpublished updater QA provenance; never authorize publication."""
import json
import os
import stat
from pathlib import Path
import re

def reject_qa(value):
    if isinstance(value, str) and value.startswith('eo-qa-'):
        raise ValueError('QA updater trust must never be published')
    if isinstance(value, dict):
        if ("qaManifestSha256" in value or "qaIdentity" in value or value.get("neverPublish") is True
            or value.get("flavor") == "elixiroffice-update-qa"
            or value.get("name") == "elixiroffice-update-qa"
            or value.get("appId") == "org.elixiroffice.desktop.updateqa"
            or value.get("productName") == "ElixirOffice Update QA"
            or (isinstance(value.get("version"), str) and re.match(r"^0\.0\.0(?:-|$)", value["version"]))):
            raise ValueError("QA updater candidates must never be published")
        for child in value.values():
            reject_qa(child)
    elif isinstance(value, list):
        for child in value:
            reject_qa(child)

def reject_folder(folder):
    root = Path(folder)
    if any((root / n).exists() or (root / n).is_symlink() for n in ("QA-DO-NOT-PUBLISH.json", "qa")):
        raise ValueError("QA updater folder must never be published")
    for name in ("BUILD-INFO.json", "build-info.json", "package.json"):
        file = root / name
        if file.exists():
            if not file.is_file() or file.is_symlink():
                raise ValueError("QA provenance check requires regular metadata")
            fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                before = os.fstat(fd)
                if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= 4 * 1024 * 1024:
                    raise ValueError("Expected bounded regular QA provenance")
                with os.fdopen(os.dup(fd), "rb") as stream:
                    data = stream.read(4 * 1024 * 1024 + 1)
                after = os.fstat(fd)
                fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
                if len(data) != before.st_size or any(getattr(before, n) != getattr(after, n) for n in fields):
                    raise ValueError("QA provenance changed")
                reject_qa(json.loads(data))
            finally:
                os.close(fd)
    for file in root.iterdir():
        if re.search(r"(?:^|[-_])0\.0\.0(?:-rc\.[1-9][0-9]*)?(?:[-_.]|$)", file.name) or "update-qa" in file.name.lower():
            raise ValueError("QA updater artifact must never be published")
