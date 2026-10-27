"""Opt-in public-only signed-update staging and finalization; never builds or signs."""
# SPDX-License-Identifier: AGPL-3.0-only
import argparse
import hashlib
import json
import importlib.util
import os
from pathlib import Path
import re
import stat
import shutil
import subprocess
import shlex

MODE = "owner-signed-v1"
TOOLS = ("tools/desktop-updates/driver-metadata.cjs",
         "tools/desktop-updates/signed-metadata.cjs", "desktop/update-metadata.cjs", "desktop/release-notice.cjs",
         "tools/desktop-updates/batch-plan.cjs", "tools/desktop-updates/batch-signing.cjs",
         "tools/desktop-updates/sign-batch.cjs", "tools/desktop-updates/signing.cjs",
         "tools/desktop-updates/signing-terminal.cjs", "desktop/update-production-trust.cjs",
         "tools/release/signed_updates.py", "tools/release/desktop_beta.py", "tools/release/qa_guard.py")
MAX_INFO = 4 * 1024 * 1024


def configuration(args):
    mode = getattr(args, "signed_updates", None)
    values = [getattr(args, "signed_update_" + n, None) for n in ("sequence", "issued_at", "expires_at")]
    if mode is None:
        if any(v is not None for v in values):
            raise ValueError("Signed update parameters require explicit --signed-updates")
        return None
    if mode != MODE or any(type(v) is not int or not 0 < v <= 2**53 - 1 for v in values):
        raise ValueError("Explicit signed update mode requires sequence, issued-at and expires-at")
    sequence, issued, expires = values
    if not 0 < expires - issued <= 90 * 86400000:
        raise ValueError("Signed metadata expiry must be within 90 days")
    return {"mode": MODE, "sequence": sequence, "issuedAt": issued, "expiresAt": expires}


def read_regular(path, limit, protected=True):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        a = os.fstat(fd)
        if not stat.S_ISREG(a.st_mode) or a.st_nlink != 1 or a.st_uid != os.getuid() or (protected and a.st_mode & 0o022) or not 0 < a.st_size <= limit:
            raise ValueError("Expected bounded, owned, non-writable regular release input")
        with os.fdopen(os.dup(fd), "rb") as stream:
            data = stream.read(limit + 1)
        b, c = os.fstat(fd), path.lstat()
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if len(data) != a.st_size or any(any(getattr(x, k) != getattr(a, k) for k in fields) for x in (b, c)):
            raise ValueError("Release input changed during verification")
        return data
    finally:
        os.close(fd)


def tool_hashes(product):
    return {n: hashlib.sha256(read_regular(Path(product) / n, 1024 * 1024, protected=False)).hexdigest() for n in TOOLS}


def bridge(operation, request, node, product):
    # Only the reviewed local public verifier executes. No candidate-supplied program.
    node = str(Path(shutil.which(node) or node).resolve(strict=True))
    command = str(Path(product) / TOOLS[0])
    env = {"PATH": str(Path(node).parent) + ":/usr/bin:/bin", "LANG": "C.UTF-8"}
    version = subprocess.run([node, "--version"], capture_output=True, text=True, env=env, timeout=15, check=True)
    if version.stdout.strip() != "v22.23.3":
        raise ValueError("Select pinned Node22.23.3")
    result = subprocess.run([node, command, operation], input=json.dumps(request),
                            capture_output=True, text=True, env=env, timeout=180)
    if result.returncode:
        raise ValueError("Signed release verification refused")
    if len(result.stdout) > MAX_INFO:
        raise ValueError("Oversized public verifier result")
    return json.loads(result.stdout)


def reject_qa(folder, info):
    spec = importlib.util.spec_from_file_location("qa_guard", Path(__file__).with_name("qa_guard.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.reject_qa(info)
    if folder is not None:
        module.reject_folder(folder)


def owner_handoff(folder, receipt, node, product):
    """Public paths and pins only; the driver never opens a key or runs a signer."""
    batch = receipt["batch"]
    if (batch.get("name") != "signing-batch.json" or
        not re.fullmatch(r"[a-f0-9]{64}", batch.get("sha256", "")) or
        not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", batch.get("keyId", "")) or
        batch["keyId"].startswith("eo-qa-") or
        not re.fullmatch(r"[a-f0-9]{64}", batch.get("fingerprint", ""))):
        raise ValueError("Expected reviewed public owner handoff")
    parent = Path(folder) / ".owner-signing"
    try:
        os.mkdir(parent, 0o700)
    except FileExistsError:
        pass
    st = parent.lstat()
    if (not stat.S_ISDIR(st.st_mode) or stat.S_ISLNK(st.st_mode) or
        st.st_uid != os.getuid() or stat.S_IMODE(st.st_mode) != 0o700 or parent.resolve() != parent):
        raise ValueError("Expected owned private signature workspace")
    output = parent / batch["sha256"]
    if output.exists() or output.is_symlink():
        raise ValueError("Signature bundle already exists")
    runtime = str(Path(shutil.which(node) or node).resolve(strict=True))
    args = [runtime, str(Path(product) / "tools/desktop-updates/sign-batch.cjs"),
            "--batch", str(Path(folder) / batch["name"]), "--seal", batch["sha256"],
            "--artifacts", str(Path(folder)), "--key"]
    key_path = '"' + chr(36) + '{EO_OWNER_SIGNING_KEY:?Set owner-selected encrypted-key filepath locally}"'
    suffix = ["--key-id", batch["keyId"], "--fingerprint", batch["fingerprint"], "--output", str(output)]
    command = " ".join(shlex.quote(v) for v in args) + " " + key_path + " " + " ".join(shlex.quote(v) for v in suffix)
    handoff = Path(folder) / "OWNER-SIGNING.txt"
    fd = os.open(handoff, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(os.dup(fd), "w", encoding="utf-8") as stream:
            stream.write(command + "\n")
            stream.flush()
            os.fsync(stream.fileno())
    finally:
        os.close(fd)
    return {"command": command, "output": str(output), "batch_sha256": batch["sha256"]}


def prepare(folder, info, config, node, product):
    reject_qa(folder, info)
    for name in info["artifacts"]:
        # copy2 may retain group-writable build permissions. This owned candidate
        # is sealed before metadata is generated; file contents do not change.
        p = Path(folder) / name
        fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            s = os.fstat(fd)
            if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_nlink != 1:
                raise ValueError("Unsafe final artifact")
            os.fchmod(fd, s.st_mode & ~0o022)
        finally:
            os.close(fd)
    actual = tool_hashes(product)
    if actual != info["inputs"].get("signed_update_tools"):
        raise ValueError("Frozen public verifier changed")
    info["signed_updates"] = bridge("prepare", {"folder": str(folder), "info": info, "config": config}, node, product)
    info["signed_updates"]["owner_signing"] = owner_handoff(folder, info["signed_updates"], node, product)
    info["state"] = "awaiting-owner-signatures"


def complete(info):
    p = info["inputs"]
    return (set(p["targets"]) == {"linux", "windows", "mac"} and not p["build_only"] and
            not p.get("mac_export_only", False) and
            all(info["gates"].get(n) == "pass" for n in ("linux-six-format", "mac-six-format")))


def verify(folder, seal, public_key, key_id, fingerprint, envelopes, node, product):
    reject_qa(None, {"keyId": key_id})
    folder = Path(folder).absolute()
    if folder.resolve(strict=True) != folder or folder.stat().st_uid != os.getuid() or folder.stat().st_mode & 0o022:
        raise ValueError("Expected protected candidate directory")
    if not re.fullmatch(r"[a-f0-9]{64}", seal):
        raise ValueError("Expected independent pending BUILD-INFO SHA256")
    original = read_regular(folder / "BUILD-INFO.json", MAX_INFO)
    if hashlib.sha256(original).hexdigest() != seal:
        raise ValueError("Pending BUILD-INFO seal mismatch")
    info = json.loads(original)
    reject_qa(folder, info)
    if info.get("state") != "awaiting-owner-signatures":
        raise ValueError("Candidate is not awaiting owner signatures")
    if tool_hashes(product) != info["inputs"].get("signed_update_tools"):
        raise ValueError("Use the frozen reviewed public verifier")
    config = info["signed_updates"]["config"]
    result = bridge("verify", {"folder": str(folder), "info": info, "config": config,
                              "publicKey": str(public_key), "keyId": key_id, "fingerprint": fingerprint,
                              "envelopes": str(envelopes)}, node, product)
    # Recheck every candidate byte before staging envelopes, then seal the final
    # publication list. A partial write cannot change the pending state.
    expected = {**info["artifacts"], **{r["name"]: {"sha256": r["sha256"], "bytes": r["bytes"]} for r in result["files"]}}
    for n, r in expected.items():
        data_path = folder / n
        if n.endswith(".yml.sig.json"):
            data = read_regular(Path(envelopes) / n, 16384)
            if hashlib.sha256(data).hexdigest() != r["sha256"] or len(data) != r["bytes"]:
                raise ValueError("Verified envelope changed")
            if data_path.exists() or data_path.is_symlink():
                if read_regular(data_path, 16384) != data:
                    raise ValueError("Existing envelope differs")
            else:
                fd = os.open(data_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                try:
                    os.fchmod(fd, 0o600)
                    with os.fdopen(os.dup(fd), "wb") as stream:
                        stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                finally:
                    os.close(fd)
        else:
            # Stream large packages; retain no package-sized buffer.
            fd = os.open(data_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                s = os.fstat(fd)
                if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or s.st_uid != os.getuid() or s.st_mode & 0o022:
                    raise ValueError("Unsafe publication artifact")
                h = hashlib.sha256()
                with os.fdopen(os.dup(fd), "rb") as stream:
                    for b in iter(lambda: stream.read(1024 * 1024), b""):
                        h.update(b)
                after = os.fstat(fd)
                if s.st_size != r["bytes"] or h.hexdigest() != r["sha256"] or (s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns) != (after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):
                    raise ValueError("Publication artifact changed")
            finally:
                os.close(fd)
    if read_regular(folder / "BUILD-INFO.json", MAX_INFO) != original:
        raise ValueError("Pending BUILD-INFO changed")
    info["artifacts"] = dict(sorted(expected.items()))
    info["publication_artifacts"] = sorted(expected)
    info["signed_updates"]["verification"] = {**result, "pending_build_info_sha256": seal}
    info["state"] = "review-candidate" if complete(info) else "partial-unverified"
    checksum = "".join(r["sha256"] + "  " + n + "\n" for n,r in sorted(expected.items()))
    # Atomic replacement of owned control files; no package/build hook or upload.
    for n, data in (("SHA256SUMS", checksum), ("BUILD-INFO.json", json.dumps(info,indent=2)+"\n")):
        temp = folder / ("." + n + ".signed-tmp")
        with temp.open("x", encoding="utf-8") as stream:
            os.chmod(temp,0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp,folder/n)
    return info


def cli_parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--folder",type=Path,required=True)
    p.add_argument("--seal",required=True,help="Pending BUILD-INFO SHA256 from the independently reviewed freeze receipt")
    p.add_argument("--public-key",type=Path,required=True,help="Explicit embedded public SPKI PEM; never a feed key")
    p.add_argument("--key-id",required=True)
    p.add_argument("--fingerprint",required=True,help="Independently approved public SPKI DER SHA256")
    p.add_argument("--envelopes",type=Path,required=True)
    p.add_argument("--node",default="node")
    return p


def main(argv):
    args = cli_parser().parse_args(argv)
    info = verify(args.folder,args.seal,args.public_key,args.key_id,args.fingerprint,args.envelopes,
                  args.node,Path(__file__).resolve().parents[2])
    print(json.dumps({"state":info["state"],"publication_artifacts":info["publication_artifacts"]}))
    return 0 if info["state"] == "review-candidate" else 2
