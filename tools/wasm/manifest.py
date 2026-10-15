#!/usr/bin/env python3
"""Record reproducible build inputs and checksums for a versioned artifact set."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

def generate(output, core, tools, flags):
    artifacts = {}
    for name in ("x2t.js", "x2t.wasm", "x2t.js.br", "x2t.js.gz", "x2t.wasm.br", "x2t.wasm.gz"):
        data = (output / name).read_bytes()
        artifacts[name] = {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    revision = lambda directory: subprocess.check_output(
        ["git", "-C", str(directory), "rev-parse", "HEAD"], text=True).strip()
    patches = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
               for p in sorted((tools / "patches").glob("*.patch"))}
    sources = {str(p.relative_to(tools)): hashlib.sha256(p.read_bytes()).hexdigest()
               for p in sorted(tools.rglob("*"))
               if p.is_file() and (p.suffix in (".py", ".sh", ".patch", ".cpp", ".h", ".txt")
                                   or p.name == "Dockerfile")}
    tools_hash = hashlib.sha256(json.dumps(sources, sort_keys=True).encode()).hexdigest()
    manifest = {"schema": 1, "tools_sha256": tools_hash, "sources": sources, "core_commit": revision(core),
                "product_commit": revision(tools), "build_flags": flags,
                "patches": patches, "artifacts": artifacts}
    release_hash = hashlib.sha256(json.dumps(artifacts, sort_keys=True).encode()).hexdigest()
    manifest["artifact_version"] = (manifest["core_commit"][:12] + "-" + release_hash[:12]
                                    + "-" + flags.get("variant", "st"))
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return manifest

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("core", type=Path)
    parser.add_argument("tools", type=Path)
    parser.add_argument("--exceptions", required=True)
    parser.add_argument("--link-opt", required=True)
    parser.add_argument("--post-opt", required=True)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--image-id", required=True)
    parser.add_argument("--kind", choices=("full", "pdf"), default="full")
    args = parser.parse_args()
    generate(args.output, args.core, args.tools, {
        "exceptions": args.exceptions, "link_opt": args.link_opt,
        "post_opt": args.post_opt, "variant": args.variant,
        "module_kind": args.kind, "pdf_original_append": args.kind == "pdf", "emsdk": "5.0.4", "image_id": args.image_id,
        "build_type": "Release", "boost_opt": "-Os", "initial_memory": 67108864,
        "maximum_memory": 4294967296, "stack_size": 8388608})
