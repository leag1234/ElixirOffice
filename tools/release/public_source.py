#!/usr/bin/env python3
"""Assemble and verify public corresponding source; never build or publish packages."""
# SPDX-License-Identifier: AGPL-3.0-only
import argparse
import gzip
import hashlib
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile
from urllib.parse import urlsplit

ROOT = "elixiroffice-desktop-source"
MAX_BLOB = 512 * 1024 * 1024
POLICY_CLASSES = {"owner_paths", "LAN", "private_fixture_name", "host_uri", "provider_key"}
ENCODING_FIELDS = ("path", "sha256", "bytes", "codec", "decoded_sha256", "decoded_bytes", "paired_path", "paired_sha256", "paired_bytes", "decodedByteEqual")
IMAGE_FIELDS = ("path", "sha256", "bytes", "codec", "git_blob", "public_origin", "public_revision", "public_baseline",
                "signature", "frames", "extension_blocks", "LZW_subblocks", "process_matches", "decoder", "decoder_version",
                "decoded_RGBA_bytes", "decoded_RGBA_sha256", "decoded_process_matches", "decoded_host_matches", "framing")
PROCESS = re.compile(rb"\b(?:MSG|REPORT)\s*\d+\b|\bSession\s+[A-Z]\b|" + b"handoff" + b"/bus|\\bseen-[A-Z]\\b|\\b(?:from|to)-[A-Z][.]md\\b")
HOST = re.compile(rb"\beo[-](?:fire|build-host)\b|\b[\w.-]+[.]ddns[.]net\b|(?:https?|ssh|wss?)://(?:fire|build-host|linux)(?:[.:/]|$)", re.I)


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def path_name(name):
    value = PurePosixPath(name)
    if not name or "\\" in name or ":" in name or value.is_absolute() or value.as_posix() != name or ".." in value.parts or any(ord(c) < 32 or ord(c) == 127 for c in name):
        raise ValueError("Unsafe source path")
    if any(p in {".git", "__pycache__"} for p in value.parts) or value.name in {"AGENTS.md", "CLAUDE.md", "task.md", "checks.md", "progress.md", ".env", "server.env", "actual.env"}:
        raise ValueError("Forbidden internal source path")
    if any(value.parts[i:i + 2] == ("docs", "handoff") for i in range(len(value.parts) - 1)):
        raise ValueError("Forbidden internal source path")
    if any(re.fullmatch(r"corpus[-_ ]?real", p, re.I) for p in value.parts):
        raise ValueError("Forbidden private source path")
    return value


def load_policy(path, expected, node="node"):
    if not re.fullmatch(r"[0-9a-f]{64}", expected or "") or digest(path) != expected:
        raise ValueError("Privacy policy fingerprint mismatch")
    value = json.loads(Path(path).read_text())
    if set(value) - {"schema", "patterns", "canonical_lan_files", "encoded_classifications", "image_classifications"} or value.get("schema") != 1 or set(value.get("patterns", {})) != POLICY_CLASSES or "canonical_lan_files" not in value:
        raise ValueError("Incomplete archive privacy policy")
    patterns = {}
    for name, pattern in value["patterns"].items():
        if not isinstance(pattern, str) or not 1 <= len(pattern) <= 4096:
            raise ValueError("Invalid archive privacy expression")
        patterns[name] = re.compile(pattern.encode(), re.I if name != "provider_key" else 0)
    allowed = value["canonical_lan_files"]
    if not isinstance(allowed, dict):
        raise ValueError("Invalid canonical fixture inventory")
    for name, sha in allowed.items():
        path_name(name)
        if not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise ValueError("Invalid canonical fixture fingerprint")
    encoded = {}
    for row in value.get("encoded_classifications", []):
        if set(row) != set(ENCODING_FIELDS) | {"approval"} or row["path"] in encoded:
            raise ValueError("Invalid exact encoded-data classification")
        path_name(row["path"]); path_name(row["paired_path"])
        if row["codec"] != "brotli" or row["decodedByteEqual"] is not True or row["paired_sha256"] != row["decoded_sha256"] or row["paired_bytes"] != row["decoded_bytes"]:
            raise ValueError("Invalid encoded-data pairing")
        if any(not re.fullmatch(r"[0-9a-f]{64}", row[key]) for key in ("sha256", "decoded_sha256")) or any(not 0 < row[key] <= MAX_BLOB for key in ("bytes", "decoded_bytes")):
            raise ValueError("Invalid encoded-data fingerprint")
        approval = row["approval"]
        if digest(approval["file"]) != approval["sha256"]:
            raise ValueError("Encoded-data classification approval changed")
        receipt = json.loads(Path(approval["file"]).read_text())
        public = {key: row[key] for key in ENCODING_FIELDS}
        if receipt.get("result") != "APPROVED_ENCODING_FALSE_POSITIVE" or receipt.get("classification") != public:
            raise ValueError("Encoded-data tuple is not approved")
        encoded[row["path"]] = public
    images = {}
    for row in value.get("image_classifications", []):
        if set(row) != set(IMAGE_FIELDS) | {"approval", "decode_proof"} or row["path"] in images or row["path"] in encoded:
            raise ValueError("Invalid exact public image classification")
        path_name(row["path"])
        if row["codec"] != "gif-lzw" or not re.fullmatch(r"[0-9a-f]{40}", row["git_blob"]) or not 0 < row["bytes"] <= MAX_BLOB or not 0 < row["frames"] <= 10000 or not 0 < row["decoded_RGBA_bytes"] <= 1024 * 1024 * 1024:
            raise ValueError("Invalid public image encoding tuple")
        public_origin(row["public_origin"])
        if any(not re.fullmatch(r"[0-9a-f]{40}", row[key]) for key in ("public_revision", "public_baseline")) or row["signature"] not in {"GIF87a", "GIF89a"} or row["decoder"] != "Pillow" or row["decoded_process_matches"] != 0 or row["decoded_host_matches"] != 0 or row["process_matches"] != 1 or not 0 < row["LZW_subblocks"] <= row["bytes"] or not 0 <= row["extension_blocks"] <= row["bytes"]:
            raise ValueError("Invalid public image provenance or structure tuple")
        if any(not re.fullmatch(r"[0-9a-f]{64}", row[key]) for key in ("sha256", "decoded_RGBA_sha256")):
            raise ValueError("Invalid public image fingerprint")
        approval = row["approval"]; decoded = row["decode_proof"]
        if digest(approval["file"]) != approval["sha256"] or digest(decoded["file"]) != decoded["sha256"]:
            raise ValueError("Public image classification evidence changed")
        receipt = json.loads(Path(approval["file"]).read_text()); proof = json.loads(Path(decoded["file"]).read_text())
        public = {key: row[key] for key in IMAGE_FIELDS}
        if receipt.get("result") != "APPROVED_PUBLIC_GIF_ENCODING_FALSE_POSITIVE" or receipt.get("classification") != public:
            raise ValueError("Public image encoding tuple is not approved")
        if proof.get("state") != "ACTUAL_GIF_ALL_FRAMES_DECODE_PASS" or proof.get("encoded_sha256") != row["sha256"] or proof.get("frames") != row["frames"] or proof.get("RGBA_bytes") != row["decoded_RGBA_bytes"] or proof.get("framed_RGBA_stream_sha256") != row["decoded_RGBA_sha256"] or proof.get("decoded_process_host_private_markers") != 0:
            raise ValueError("Public image decode proof differs from approved tuple")
        if any(proof.get(key) != row[key] for key in ("decoder", "decoder_version", "framing")):
            raise ValueError("Public image decoder or framing changed")
        images[row["path"]] = public
    if encoded and subprocess.check_output([str(node), "--version"], text=True).strip() != "v22.23.3":
        raise ValueError("Select the pinned Node22 decoder for an encoded-data classification")
    return patterns, allowed, {"rows": encoded, "images": images, "node": str(node)}


def gif_image_ranges(data):
    if len(data) < 14 or data[:6] not in {b"GIF87a", b"GIF89a"}:
        raise ValueError("Invalid classified GIF signature")
    position = 13 + (3 * (1 << ((data[10] & 7) + 1)) if data[10] & 128 else 0)
    ranges = []; frames = 0; extensions = 0
    def subblocks(image):
        nonlocal position
        while True:
            if position >= len(data):
                raise ValueError("Truncated classified GIF subblocks")
            size = data[position]; position += 1
            if not size:
                return
            if position + size > len(data):
                raise ValueError("Truncated classified GIF payload")
            if image:
                ranges.append((position, position + size))
            position += size
    while position < len(data):
        marker = data[position]
        if marker == 0x3b:
            if position != len(data) - 1 or not frames:
                raise ValueError("Invalid classified GIF trailer")
            return frames, ranges, extensions
        if marker == 0x21 and position + 2 <= len(data):
            position += 2; subblocks(False); extensions += 1
        elif marker == 0x2c and position + 10 <= len(data):
            flags = data[position + 9]; position += 10
            if flags & 128:
                position += 3 * (1 << ((flags & 7) + 1))
            if position >= len(data) or not 2 <= data[position] <= 8:
                raise ValueError("Invalid classified GIF image encoding")
            position += 1; subblocks(True); frames += 1
        else:
            raise ValueError("Invalid classified GIF block")
    raise ValueError("Missing classified GIF trailer")


def decode_brotli(data, expected_size, node):
    program = "const z=require('node:zlib');const fs=require('node:fs');process.stdout.write(z.brotliDecompressSync(fs.readFileSync(0),{maxOutputLength:Number(process.argv[1])}));"
    result = subprocess.run([node, "-e", program, str(expected_size)], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
    if result.returncode or len(result.stdout) != expected_size:
        raise ValueError("Encoded-data decoding failed or has the wrong size")
    return result.stdout


def privacy(name, data, policy):
    path_name(name)
    if PROCESS.search(name.encode()) or HOST.search(name.encode()) or HOST.search(data):
        raise ValueError("Archive contains internal process or operator-host markers")
    patterns, allowed = policy[:2]
    classification = None
    if PROCESS.search(data):
        config = policy[2] if len(policy) > 2 else {"rows": {}}
        classification = config["rows"].get(name) or config.get("images", {}).get(name)
        if not classification or len(data) != classification["bytes"] or hashlib.sha256(data).hexdigest() != classification["sha256"]:
            raise ValueError("Archive contains internal process or operator-host markers")
        if classification["codec"] == "brotli":
            decoded = decode_brotli(data, classification["decoded_bytes"], config["node"])
            if hashlib.sha256(decoded).hexdigest() != classification["decoded_sha256"]:
                raise ValueError("Decoded payload differs from approved encoded-data tuple")
            privacy(classification["paired_path"], decoded, (patterns, allowed))
        else:
            if hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() != classification["git_blob"]:
                raise ValueError("Classified image differs from its public Git blob")
            frames, ranges, extensions = gif_image_ranges(data)
            matches = list(PROCESS.finditer(data))
            if data[:6].decode() != classification["signature"] or frames != classification["frames"] or len(ranges) != classification["LZW_subblocks"] or extensions != classification["extension_blocks"] or len(matches) != classification["process_matches"] or any(not any(lo <= match.start() and match.end() <= hi for lo, hi in ranges) for match in matches):
                raise ValueError("Classified GIF marker is outside its encoded image subblocks")
    for label, pattern in patterns.items():
        if pattern.search(name.encode()) or pattern.search(data):
            if label == "LAN" and allowed.get(name) == hashlib.sha256(data).hexdigest():
                continue
            raise ValueError("Archive privacy rejected class " + label + " at path digest " + hashlib.sha256(name.encode()).hexdigest())
    return classification


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.PIPE)


def public_origin(url):
    value = urlsplit(url)
    if value.scheme != "https" or not value.hostname or value.username or value.password or value.query or value.fragment:
        raise ValueError("Require a credential-free public HTTPS source origin")
    if value.hostname != "github.com" or value.port not in {None, 443} or not re.fullmatch(r"/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:[.]git)?", value.path):
        raise ValueError("Source origin must be a reviewed public GitHub repository")
    if value.hostname in {"localhost", "fire", "build-host", "linux"} or HOST.search(url.encode()):
        raise ValueError("Private source origin is forbidden")
    try:
        if not ipaddress.ip_address(value.hostname).is_global:
            raise ValueError("Private source origin is forbidden")
    except ValueError as error:
        if "forbidden" in str(error):
            raise


def snapshots(selection):
    rows = selection["repositories"]
    if not rows or len(rows) > 128 or len({r["path"] for r in rows}) != len(rows):
        raise ValueError("Invalid public source repository inventory")
    result = {}; links = {}
    for row in rows:
        prefix = row["path"]; path_name(prefix); public_origin(row["public_origin"])
        revision = row["public_revision"]
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise ValueError("Require an exact public commit")
        repo = Path(row["repository"])
        if git(repo, "rev-parse", "--is-bare-repository").strip() != b"true":
            raise ValueError("Public source must use a qualified bare export, never a private working tree")
        alternate = repo / "objects/info/alternates"
        if alternate.exists() and alternate.read_bytes().strip():
            raise ValueError("Public source export must have self-contained objects")
        qualification = row["qualification"]
        if digest(qualification["file"]) != qualification["sha256"]:
            raise ValueError("Public source qualification changed")
        proof = json.loads(Path(qualification["file"]).read_text())
        if proof.get("result") != "PASS" or not any(x["name"] == qualification["name"] and x["public_head"] == revision for x in proof["repositories"]):
            raise ValueError("Revision is not the qualified public source")
        if git(repo, "rev-parse", revision + "^{commit}").decode().strip() != revision:
            raise ValueError("Public source revision is absent")
        files = []
        for entry in git(repo, "ls-tree", "-r", "-z", revision).split(b"\0"):
            if not entry:
                continue
            meta, raw_name = entry.split(b"\t", 1); mode, kind, blob = meta.decode().split()
            relative = raw_name.decode(); name = prefix + "/" + relative; path_name(name)
            if kind == "commit":
                links[name] = blob
            elif kind == "blob" and mode in {"100644", "100755", "120000"}:
                files.append((name, mode, blob))
            else:
                raise ValueError("Unsupported source object")
        result[prefix] = (row, files)
    roots = selection["roots"]
    if not roots or len(set(roots)) != len(roots) or set(roots) != set(result) - set(links):
        raise ValueError("Source roots or nested source closure are incomplete")
    equivalences = selection.get("gitlink_equivalences", [])
    if len({row["path"] for row in equivalences}) != len(equivalences):
        raise ValueError("Duplicate nested public tree equivalence")
    used = set()
    for name, oid in links.items():
        if name not in result:
            raise ValueError("Missing exact nested corresponding-source tree")
        row = result[name][0]
        if row["public_revision"] == oid:
            continue
        mapping = next((x for x in equivalences if x["path"] == name), None)
        if not mapping or mapping["original_revision"] != oid or mapping["public_revision"] != row["public_revision"]:
            raise ValueError("Missing exact nested corresponding-source tree")
        proof = mapping["qualification"]
        if digest(proof["file"]) != proof["sha256"]:
            raise ValueError("Public tree equivalence qualification changed")
        evidence = json.loads(Path(proof["file"]).read_text())
        actual_tree = git(row["repository"], "rev-parse", row["public_revision"] + "^{tree}").decode().strip()
        expected = {"path": name, "original_revision": oid, "public_revision": row["public_revision"], "tree": actual_tree}
        if evidence.get("result") != "PASS" or any(evidence.get(key) != val for key, val in expected.items()):
            raise ValueError("Nested public tree equivalence is not qualified")
        used.add(name)
    if used != {row["path"] for row in equivalences}:
        raise ValueError("Unexpected nested public tree equivalence")
    return result


def safe_link(name, target):
    if not target or "\\" in target or ":" in target or target.startswith("/") or any(ord(c) < 32 or ord(c) == 127 for c in target):
        raise ValueError("Unsafe source symlink")
    depth = len(PurePosixPath(name).parent.parts)
    for part in PurePosixPath(target).parts:
        depth += -1 if part == ".." else 0 if part == "." else 1
        if depth < 0:
            raise ValueError("Source symlink escapes archive")


def verify_link_graph(links, names):
    for name in names:
        parts = PurePosixPath(name).parts
        if any("/".join(parts[:i]) in names for i in range(1, len(parts))):
            raise ValueError("Archive member has a file or symlink ancestor")
    for name, target in links.items():
        pending = list(PurePosixPath(name).parent.parts) + list(PurePosixPath(target).parts)
        resolved = []; followed = 0
        while pending:
            part = pending.pop(0)
            if part == "..":
                if not resolved:
                    raise ValueError("Source symlink chain escapes archive")
                resolved.pop()
            elif part != ".":
                current = "/".join(resolved + [part])
                if current in links:
                    followed += 1
                    if followed > 40:
                        raise ValueError("Source symlink chain is cyclic or too deep")
                    pending = list(PurePosixPath(links[current]).parts) + pending
                else:
                    resolved.append(part)


def selection_inputs(path, expected):
    if not path or not expected or digest(path) != expected:
        raise ValueError("Public source selection changed or is missing")
    selection = json.loads(Path(path).read_text())
    if selection.get("schema") != 1 or selection.get("public_source_selection") is not True:
        raise ValueError("Require a qualified public export source selection")
    return selection, snapshots(selection)


def public_equivalences(selection):
    result = []
    for row in selection.get("gitlink_equivalences", []):
        proof = json.loads(Path(row["qualification"]["file"]).read_text())
        result.append({"path": row["path"], "original_revision": row["original_revision"],
                       "emittedSourceRevision": row["public_revision"], "tree": proof["tree"], "exactTreeEquivalent": True})
    return result


def validate_image_sources(repos, policy):
    for row in (policy[2].get("images", {}).values() if len(policy) > 2 else []):
        prefixes = [prefix for prefix in repos if row["path"].startswith(prefix + "/")]
        if not prefixes:
            raise ValueError("Classified image has no qualified public Git source")
        prefix = max(prefixes, key=len); source = repos[prefix][0]
        if source["public_revision"] != row["public_revision"] or source["public_origin"] != row["public_origin"]:
            raise ValueError("Classified image selected public revision or origin changed")
        relative = row["path"][len(prefix) + 1:]
        baseline_blob = git(source["repository"], "rev-parse", row["public_baseline"] + ":" + relative).decode().strip()
        if baseline_blob != row["git_blob"]:
            raise ValueError("Classified image differs from the published public baseline")


def verify_archive(archive, policy, selection_path=None, selection_sha=None):
    observed = {}; manifest = None; total = 0; links = {}; classified = []
    with tarfile.open(archive, "r|gz") as source:
        for member in source:
            if not member.name.startswith(ROOT + "/"):
                raise ValueError("Unexpected source archive root")
            name = member.name[len(ROOT) + 1:]; path_name(name)
            if name in observed or name == "SOURCE-FILES.json" and manifest is not None:
                raise ValueError("Duplicate archive source member")
            if member.uid or member.gid or member.uname or member.gname or member.mtime:
                raise ValueError("Source archive carries operator ownership or timestamps")
            if member.issym():
                safe_link(name, member.linkname); data = member.linkname.encode(); kind = "symlink"
                links[name] = member.linkname
            elif member.isfile() and 0 <= member.size <= MAX_BLOB:
                data = source.extractfile(member).read(); kind = "file"
                if len(data) != member.size:
                    raise ValueError("Truncated archive member")
            else:
                raise ValueError("Unsupported archive member")
            if set(member.pax_headers) - {"path", "linkpath"}:
                raise ValueError("Archive has unqualified extended metadata")
            classification = privacy(name, data, policy); total += len(data)
            if classification:
                classified.append(classification)
            if name == "SOURCE-FILES.json":
                if kind != "file":
                    raise ValueError("Invalid source manifest type")
                manifest = json.loads(data)
            else:
                observed[name] = {"type": kind, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "mode": member.mode,
                                  "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()}
    if not manifest or manifest.get("schema") != 1 or observed != manifest["files"]:
        raise ValueError("Archive payload differs from its complete source manifest")
    if not manifest.get("public_repositories"):
        raise ValueError("Archive has no qualified public source provenance")
    verify_link_graph(links, set(observed) | {"SOURCE-FILES.json"})
    for row in classified:
        if row["codec"] == "brotli":
            pair = observed.get(row["paired_path"], {})
            if pair.get("sha256") != row["paired_sha256"] or pair.get("bytes") != row["paired_bytes"] or pair.get("type") != "file":
                raise ValueError("Actual archive is missing its exact decoded-data pair")
        elif observed[row["path"]]["git_blob"] != row["git_blob"]:
            raise ValueError("Actual archive differs from classified public image blob")
    allowed_classifications = list(policy[2]["rows"].values()) + list(policy[2].get("images", {}).values()) if len(policy) > 2 else []
    if sorted(classified, key=lambda x: x["path"]) != sorted(allowed_classifications, key=lambda x: x["path"]) or manifest.get("encoded_classifications", []) != classified:
        raise ValueError("Archive encoded-data classifications are incomplete or undisclosed")
    selection, repos = selection_inputs(selection_path, selection_sha)
    validate_image_sources(repos, policy)
    expected = set(); provenance = []
    for prefix, (row, entries) in sorted(repos.items()):
        provenance.append({"path": prefix, "public_revision": row["public_revision"], "public_origin": row["public_origin"], "qualification_sha256": row["qualification"]["sha256"]})
        for name, mode, blob in entries:
            actual = observed.get(name, {})
            if actual.get("git_blob") != blob or actual.get("mode") != (0o777 if mode == "120000" else int(mode, 8) & 0o777) or actual.get("type") != ("symlink" if mode == "120000" else "file"):
                raise ValueError("Actual archive differs from qualified public Git tree")
            expected.add(name)
    for row in selection["supplemental_files"]:
        if row["path"] in expected or digest(row["file"]) != row["sha256"]:
            raise ValueError("Supplemental source changed or duplicates a Git source")
        actual = observed.get(row["path"], {})
        if actual.get("sha256") != row["sha256"] or actual.get("mode") != row["mode"] or actual.get("type") != "file":
            raise ValueError("Actual supplemental source differs from pinned input")
        expected.add(row["path"])
    if expected != set(observed) or not set(selection["required_paths"]).issubset(observed):
        raise ValueError("Archive corresponding-source coverage is incomplete")
    if manifest["public_repositories"] != provenance or manifest.get("selection_sha256") != selection_sha:
        raise ValueError("Archive provenance differs from qualified source selection")
    expected_mappings = public_equivalences(selection)
    if manifest.get("gitlink_equivalences", []) != expected_mappings:
        raise ValueError("Archive nested public tree equivalence is not disclosed")
    return {"result": "PASS", "archive_bytes": Path(archive).stat().st_size, "archive_sha256": digest(archive), "files": len(observed), "uncompressed_bytes": total, "repository_count": len(manifest["public_repositories"]), "archive_payload_privacy": "PASS; every actual member scanned", "source_manifest_correspondence": "PASS", "encoded_classifications": classified}


def create_archive(selection_path, selection_sha, output, policy):
    selection, repos = selection_inputs(selection_path, selection_sha); output = Path(output)
    validate_image_sources(repos, policy)
    if output.exists() or output.is_symlink() or not output.parent.is_dir() or output.parent.is_symlink():
        raise ValueError("Use a fresh owned source archive output")
    files = {}; provenance = []; seen = set(); classified = []
    temporary = tempfile.NamedTemporaryFile(prefix=".public-source-", suffix=".part", dir=output.parent, delete=False)
    temp = Path(temporary.name)
    def add(tar, name, data, mode, kind="file"):
        if name in seen:
            raise ValueError("Duplicate source output")
        classification = privacy(name, data, policy); seen.add(name)
        if classification:
            classified.append(classification)
        info = tarfile.TarInfo(ROOT + "/" + name); info.mode = mode
        if kind == "symlink":
            safe_link(name, data.decode()); info.type = tarfile.SYMTYPE; info.linkname = data.decode()
            tar.addfile(info)
        else:
            import io
            info.size = len(data); tar.addfile(info, io.BytesIO(data))
        if name != "SOURCE-FILES.json":
            files[name] = {"type": kind, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "mode": mode,
                           "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()}
    with temporary, gzip.GzipFile(filename="", fileobj=temporary, mode="wb", compresslevel=1, mtime=0) as zipped, tarfile.open(fileobj=zipped, mode="w|") as target:
        for prefix, (row, entries) in sorted(repos.items()):
            process = subprocess.Popen(["git", "-C", row["repository"], "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                for name, mode, blob in entries:
                    process.stdin.write((blob + "\n").encode()); process.stdin.flush()
                    header = process.stdout.readline().decode().split()
                    if len(header) != 3 or header[:2] != [blob, "blob"] or not 0 <= int(header[2]) <= MAX_BLOB:
                        raise ValueError("Invalid or oversized public source blob")
                    data = process.stdout.read(int(header[2]))
                    if process.stdout.read(1) != b"\n" or hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() != blob:
                        raise ValueError("Public Git blob integrity failure")
                    add(target, name, data, 0o777 if mode == "120000" else int(mode, 8) & 0o777, "symlink" if mode == "120000" else "file")
                process.stdin.close()
                if process.wait() != 0:
                    raise ValueError("Public source Git reader failed")
            finally:
                if process.poll() is None:
                    process.terminate(); process.wait()
                for stream in (process.stdin, process.stdout, process.stderr):
                    stream.close()
            provenance.append({"path": prefix, "public_revision": row["public_revision"], "public_origin": row["public_origin"], "qualification_sha256": row["qualification"]["sha256"]})
        for row in selection["supplemental_files"]:
            source = Path(row["file"])
            if not source.is_file() or source.stat().st_size > MAX_BLOB or digest(source) != row["sha256"] or row["mode"] not in {0o644, 0o755}:
                raise ValueError("Supplemental build support fingerprint mismatch")
            add(target, row["path"], source.read_bytes(), row["mode"])
        if not set(selection["required_paths"]).issubset(files):
            raise ValueError("Required source, legal or runtime coverage is incomplete")
        manifest = {"schema": 1, "scope": "Qualified public source trees; original package sources may have declared public adaptations. No private working tree or Git history is embedded.", "public_repositories": provenance, "selection_sha256": selection_sha, "files": files,
                    "gitlink_equivalences": public_equivalences(selection), "encoded_classifications": classified}
        add(target, "SOURCE-FILES.json", (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode(), 0o644)
    result = verify_archive(temp, policy, selection_path, selection_sha)
    os.link(temp, output); temp.unlink()
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["create", "verify"])
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--policy-sha256", required=True)
    parser.add_argument("--node", default="node", help="Existing pinned Node decoder; used only by an exact reviewed encoding classification")
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--selection", required=True, type=Path)
    parser.add_argument("--selection-sha256", required=True)
    parser.add_argument("--proof", required=True, type=Path)
    args = parser.parse_args(argv)
    if args.proof.exists():
        raise ValueError("Use a fresh archive verification proof")
    policy = load_policy(args.policy, args.policy_sha256, args.node)
    if args.action == "create":
        if not args.selection or not args.selection_sha256:
            raise ValueError("Creation requires an exact qualified public selection")
        result = create_archive(args.selection, args.selection_sha256, args.archive, policy)
    else:
        result = verify_archive(args.archive, policy, args.selection, args.selection_sha256)
    result["privacy_policy_sha256"] = args.policy_sha256
    with args.proof.open("x") as proof:
        proof.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    main()
