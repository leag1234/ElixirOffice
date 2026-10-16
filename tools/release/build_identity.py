# SPDX-License-Identifier: AGPL-3.0-only
"""Build allocation and fresh published-version validation. No network or publishing."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat

MAX_AGE_SECONDS = 3600
REPOSITORY = "leag1234/elixiroffice"

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def published(path, version, now=None):
    raw = Path(path).read_bytes()
    data = json.loads(raw)
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if data.get("schema") != 1 or data.get("repository") != REPOSITORY or data.get("complete") is not True:
        raise ValueError("Provide a complete published release inventory for the release repository")
    try:
        fetched = datetime.datetime.fromisoformat(data["fetched_at"].replace("Z", "+00:00"))
        if fetched.tzinfo is None: raise ValueError()
        age = (now - fetched).total_seconds()
    except (ValueError, KeyError, TypeError):
        raise ValueError("Invalid publication inventory timestamp")
    if not 0 <= age <= MAX_AGE_SECONDS:
        raise ValueError("Published versions inventory is stale or from the future; refresh it")
    versions = data.get("versions")
    if not isinstance(versions, list) or any(not isinstance(v, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?", v) for v in versions) or len(versions) != len(set(versions)):
        raise ValueError("Invalid published versions list")
    if version in versions:
        raise ValueError("Desktop version was already published; bump before packaging")
    return {"sha256":hashlib.sha256(raw).hexdigest(),"fetched_at":data["fetched_at"],"repository":REPOSITORY,"complete":True}

def ledger_path(path):
    path=Path(path).absolute()
    if path.is_symlink() or path.resolve(strict=True)!=path or not path.is_file():
        raise ValueError("Build ledger must be a canonical regular file without symlinks")
    return path

def allocation(path, identity, data=None):
    path=ledger_path(path)
    if data is None:
        data = json.loads(Path(path).read_text())
    if data.get("schema") != 1 or not isinstance(data.get("builds"), list):
        raise ValueError("Invalid build allocation ledger")
    if not isinstance(identity.get("version"),str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-rc\.[1-9][0-9]*)?",identity["version"]):
        raise ValueError("Invalid allocated application version")
    requested=identity.get("build_number")
    if isinstance(requested,bool) or not isinstance(requested,int) or not 1<=requested<=65535:
        raise ValueError("Invalid requested build number")
    numbers=[]
    for entry in data["builds"]:
        number=entry.get("build_number")
        if isinstance(number,bool) or not isinstance(number,int) or not 1<=number<=65535:
            raise ValueError("Invalid allocated build number")
        numbers.append(number)
    if numbers != sorted(set(numbers)) or identity["build_number"] <= max(numbers, default=0):
        raise ValueError("Build number must be new and monotonically increasing")
    return data

def reserve(ledger, inventory, identity):
    # Cooperating release runs serialize allocation; a crashed run consumes its number.
    ledger=ledger_path(ledger)
    descriptor=os.open(ledger.with_suffix(ledger.suffix+".lock"),os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,"a") as lock:
        if not stat.S_ISREG(os.fstat(lock.fileno()).st_mode):
            raise ValueError("Build ledger lock must be a regular file")
        fcntl.flock(lock,fcntl.LOCK_EX)
        published(inventory,identity["version"])
        ledger_path(ledger)
        descriptor=os.open(ledger,os.O_RDONLY|os.O_NOFOLLOW)
        with os.fdopen(descriptor,"rb") as source:
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                raise ValueError("Build ledger must be a regular file")
            original=source.read()
        data=allocation(ledger,identity,json.loads(original))
        data["builds"].append({"build_number":identity["build_number"],"version":identity["version"],"product_revision":identity["product_revision"]})
        temporary=ledger.with_suffix(ledger.suffix+".tmp")
        serialized=(json.dumps(data,indent=2)+"\n").encode()
        with temporary.open("xb") as f:
            f.write(serialized);f.flush();os.fsync(f.fileno())
        temporary.replace(ledger)
        directory=os.open(ledger.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(directory)
        finally:os.close(directory)
        return {"ledger_sha256_before":hashlib.sha256(original).hexdigest(),"ledger_sha256_after":hashlib.sha256(serialized).hexdigest(),"build_number":identity["build_number"],"reserved":True}

def stamp(product, identity):
    root=Path(product)/"desktop"
    package=json.loads((root/"package.json").read_text())
    if package["version"] != identity["base_version"]:
        raise ValueError("Build base version differs from selected source")
    package["version"]=identity["version"]
    package["build"]["buildNumber"]=str(identity["build_number"])
    package["build"]["buildVersion"]=identity["windows_version"]
    package["build"]["mac"].update(bundleShortVersion=identity["mac_short_version"],bundleVersion=identity["mac_bundle_version"])
    (root/"package.json").write_text(json.dumps(package,indent=2)+"\n")
    lock=json.loads((root/"package-lock.json").read_text())
    lock["version"]=lock["packages"][""]["version"]=identity["version"]
    (root/"package-lock.json").write_text(json.dumps(lock,indent=2)+"\n")
    (root/"build-info.json").write_text(json.dumps(identity,indent=2)+"\n")
